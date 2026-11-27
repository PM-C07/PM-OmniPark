import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { calcolaHashPassword } from "../utenti-accessi/crittografia";
import { creaFacadeWallet } from "../wallet/facade";
import { interroga } from "../../persistence/accessoDati/esecutore";
import { trovaStallo, type StatoStallo } from "../../persistence/accessoDati/stalliTariffe";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  creaSosta,
  creaWallet,
  movimenti,
  registraRicarica,
  sostaAttivaPerVeicolo,
  sostaAttivaSuStallo,
  trovaSosta,
  trovaWalletDiAutomobilista,
  type Sosta,
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { rilevazioniAllIstante } from "../../persistence/test/datiDiProva";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeGestioneSoste,
  ErroreGestioneSoste,
  osservatoreGestioneSoste,
  type CodiceErroreGestioneSoste,
  type FacadeGestioneSoste,
  type Pagamento,
  type RichiestaDiAvvio,
  type SostaAvviata,
} from "./facade";

// Test frame TF-AVV-01…26 di docs/test/cp_avvioSosta.md (OMP-45); con la OMP-61 TF-AVV-06 e 22
// hanno cambiato esito e le foto di prova sono JPEG (§3). TF-AVV-27…41 sono in
// avvio.permesso.db.test.ts. Le transazioni della Facade vanno in commit: il database si prepara
// una volta e ogni frame usa stalli, automobilisti e veicoli propri.

const T = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => T };
const ISTANTE_RICARICA = new Date("2026-11-20T08:00:00+01:00");
const ISTANTE_RILEVAZIONE = T; // COD-23: entro 60 s da T (RF_IOT_2)
const INESISTENTE = 999999;
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";

// JPEG(n) di §3: i byte FF D8 FF E0 seguiti da byte 00 fino a n byte in tutto.
function jpeg(n: number): Buffer {
  const foto = Buffer.alloc(n, 0x00);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(foto);
  return foto;
}

const FOTO = jpeg(1024);
const FOTO_TROPPO_GRANDE = jpeg(2097153);

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-45 · cp_avvioSosta", () => {
  let hashPassword: string;

  beforeAll(async () => {
    await preparaDatabaseDiTest();
    // COD-23 (RF_IOT_2): rilevazioni recenti rispetto all'orologio dei test (§3).
    await rilevazioniAllIstante(poolDiTest(), T);
    hashPassword = await calcolaHashPassword("parola-di-prova-lunga");
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§3) ---

  function facade(): FacadeGestioneSoste {
    const pool = poolDiTest();
    return creaFacadeGestioneSoste({
      pool,
      orologio,
      wallet: creaFacadeWallet({
        pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
        pool,
        orologio,
      }),
    });
  }

  function gestioneStalli() {
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [osservatoreGestioneSoste],
    });
  }

  type Prova = { id: number; wallet: number; veicolo: number; targa: string };

  // Automobilista P<suffisso>: email avvio.<suffisso>@test.example, wallet, ricarica e veicolo.
  async function automobilista(
    suffisso: string,
    opzioni: { targa?: string; saldo?: number } = {},
  ): Promise<Prova> {
    const pool = poolDiTest();
    const targa = opzioni.targa ?? `AV0${suffisso.padStart(2, "0")}AA`;
    const saldo = opzioni.saldo ?? 1000;
    const id = await creaAutomobilista(pool, {
      email: `avvio.${suffisso}@test.example`,
      hashPassword,
    });
    const wallet = await creaWallet(pool, id);
    if (saldo > 0) {
      await registraRicarica(pool, {
        walletVirtualeId: wallet,
        importo: saldo,
        dataEOra: ISTANTE_RICARICA,
      });
    }
    const veicolo = await trovaOCreaVeicolo(pool, targa);
    await associaVeicolo(pool, id, veicolo);
    return { id, wallet, veicolo, targa };
  }

  async function portaAOccupato(stallo: number): Promise<void> {
    const stato = await gestioneStalli().registraRilevazione({
      stallo,
      presenza: true,
      dataOra: ISTANTE_RILEVAZIONE,
    });
    expect(stato).toBe("OCCUPATO");
  }

  async function sostaPreesistente(
    p: Prova,
    stallo: number,
    avvio: string,
    scadenza: string,
    nonDisponibile: boolean,
  ): Promise<number> {
    const id = await creaSosta(poolDiTest(), {
      automobilistaId: p.id,
      veicoloId: p.veicolo,
      stalloId: stallo,
      orarioDiAvvio: ora(avvio),
      orarioDiScadenza: ora(scadenza),
      pagamento: "PAGATA",
    });
    if (nonDisponibile) {
      await gestioneStalli().impostaNonDisponibile(stallo);
    }
    return id;
  }

  function richiesta(
    p: Prova,
    stallo: number,
    durata: number,
    altro: Partial<RichiestaDiAvvio> = {},
  ): RichiestaDiAvvio {
    return { automobilista: p.id, stallo, targa: p.targa, durata, ...altro };
  }

  // --- Verifiche (§3) ---

  type Istantanea = {
    saldo: number;
    movimenti: Awaited<ReturnType<typeof movimenti>>;
    stallo: { stato: StatoStallo; occupazioneRilevata: unknown } | null;
    sostaSuStallo: Sosta | null;
  };

  async function istantanea(p: Prova, stallo: number | null): Promise<Istantanea> {
    const pool = poolDiTest();
    const wallet = await trovaWalletDiAutomobilista(pool, p.id);
    expect(wallet).not.toBeNull();
    let datiStallo: Istantanea["stallo"] = null;
    let sostaSuStallo: Sosta | null = null;
    if (stallo !== null) {
      const s = await trovaStallo(pool, stallo);
      expect(s).not.toBeNull();
      datiStallo = { stato: s!.stato, occupazioneRilevata: s!.occupazioneRilevata };
      sostaSuStallo = await sostaAttivaSuStallo(pool, stallo);
    }
    return {
      saldo: wallet!.saldo,
      movimenti: await movimenti(pool, p.wallet),
      stallo: datiStallo,
      sostaSuStallo,
    };
  }

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: CodiceErroreGestioneSoste,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreGestioneSoste);
    expect((ottenuto as ErroreGestioneSoste).codice).toBe(codice);
  }

  async function verificaWalletInvariato(p: Prova, prima: Istantanea): Promise<void> {
    const pool = poolDiTest();
    expect((await trovaWalletDiAutomobilista(pool, p.id))!.saldo).toBe(prima.saldo);
    expect(await movimenti(pool, p.wallet)).toEqual(prima.movimenti);
  }

  // Nessuna scrittura (`N`): wallet, sosta attiva del veicolo, stallo e sosta attiva sullo stallo.
  async function verificaNessunaScrittura(
    p: Prova,
    prima: Istantanea,
    stallo: number | null,
    statoAtteso: StatoStallo | null,
    sostaAttivaDelVeicolo: Sosta | null = null,
  ): Promise<void> {
    const pool = poolDiTest();
    await verificaWalletInvariato(p, prima);
    expect(await sostaAttivaPerVeicolo(pool, p.veicolo)).toEqual(sostaAttivaDelVeicolo);
    if (stallo !== null) {
      const s = await trovaStallo(pool, stallo);
      expect(s).not.toBeNull();
      expect(s!.stato).toBe(statoAtteso);
      expect({ stato: s!.stato, occupazioneRilevata: s!.occupazioneRilevata }).toEqual(
        prima.stallo,
      );
      expect(await sostaAttivaSuStallo(pool, stallo)).toEqual(prima.sostaSuStallo);
    }
  }

  // Avvio riuscito (`OK`).
  async function verificaAvvio(
    p: Prova,
    prima: Istantanea,
    r: RichiestaDiAvvio,
    risultato: SostaAvviata,
    atteso: {
      importo: number;
      pagamento: Pagamento;
      scadenza: string;
      saldo: number;
      permesso?: boolean;
    },
  ): Promise<void> {
    const pool = poolDiTest();
    expect(risultato.orarioDiAvvio.getTime()).toBe(T.getTime());
    expect(risultato.orarioDiScadenza.getTime()).toBe(ora(atteso.scadenza).getTime());
    expect(risultato.importo).toBe(atteso.importo);
    expect(risultato.pagamento).toBe(atteso.pagamento);

    const sosta = await trovaSosta(pool, risultato.sosta);
    expect(sosta).not.toBeNull();
    expect(sosta!.stato).toBe("ATTIVA");
    expect(sosta!.automobilistaId).toBe(p.id);
    expect(sosta!.veicoloId).toBe(p.veicolo);
    expect(sosta!.stalloId).toBe(r.stallo);
    expect(sosta!.orarioDiAvvio.getTime()).toBe(T.getTime());
    expect(sosta!.orarioDiScadenza.getTime()).toBe(ora(atteso.scadenza).getTime());
    expect(sosta!.pagamento).toBe(atteso.pagamento);
    if (atteso.permesso) {
      expect(sosta!.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
      expect(sosta!.fotoDelPermesso).not.toBeNull();
      expect(Buffer.compare(sosta!.fotoDelPermesso!, FOTO)).toBe(0);
    } else {
      expect(sosta!.dichiarazioneDiPermesso).toBeNull();
      expect(sosta!.fotoDelPermesso).toBeNull();
    }

    const stallo = await trovaStallo(pool, r.stallo);
    expect(stallo!.stato).toBe("NON_DISPONIBILE");
    expect(stallo!.occupazioneRilevata).toEqual(prima.stallo!.occupazioneRilevata);

    const saldo = (await trovaWalletDiAutomobilista(pool, p.id))!.saldo;
    expect(saldo).toBe(atteso.saldo);
    const dopo = await movimenti(pool, p.wallet);
    const idPrima = new Set(prima.movimenti.map((m) => m.id));
    const nuovi = dopo.filter((m) => !idPrima.has(m.id));
    if (atteso.pagamento === "PAGATA") {
      expect(saldo).toBe(prima.saldo - atteso.importo);
      expect(nuovi).toHaveLength(1);
      expect(nuovi[0].tipoDiMovimento).toBe("ADDEBITO");
      expect(nuovi[0].importo).toBe(atteso.importo);
      expect(nuovi[0].sostaId).toBe(risultato.sosta);
      expect(nuovi[0].dataEOra.getTime()).toBe(T.getTime());
    } else {
      expect(saldo).toBe(prima.saldo);
      expect(nuovi).toHaveLength(0);
    }
  }

  async function avvioRiuscito(
    p: Prova,
    r: RichiestaDiAvvio,
    atteso: Parameters<typeof verificaAvvio>[4],
  ): Promise<SostaAvviata> {
    const prima = await istantanea(p, r.stallo);
    const risultato = await facade().avviaSosta(r);
    await verificaAvvio(p, prima, r, risultato, atteso);
    return risultato;
  }

  async function avvioRifiutato(
    p: Prova,
    r: RichiestaDiAvvio,
    codice: CodiceErroreGestioneSoste,
    statoAtteso: StatoStallo | null,
  ): Promise<void> {
    const stallo = statoAtteso === null ? null : r.stallo;
    const prima = await istantanea(p, stallo);
    await rifiutato(facade().avviaSosta(r), codice);
    await verificaNessunaScrittura(p, prima, stallo, statoAtteso);
  }

  // --- Avvii riusciti ---

  it("RF_SOSTA_1 · TF-AVV-01 · stallo a pagamento, durata 15 → OK importo 25, saldo 975", async () => {
    const p = await automobilista("1");
    await avvioRiuscito(p, richiesta(p, 23, 15), {
      importo: 25,
      pagamento: "PAGATA",
      scadenza: "10:15",
      saldo: 975,
    });
  });

  it("RF_WALLET_2 · TF-AVV-02 · stallo a pagamento, durata intermedia 90 → OK importo 225, saldo 775", async () => {
    const p = await automobilista("2");
    await avvioRiuscito(p, richiesta(p, 3, 90), {
      importo: 225,
      pagamento: "PAGATA",
      scadenza: "11:30",
      saldo: 775,
    });
  });

  it("RF_SOSTA_1 · TF-AVV-03 · stallo a pagamento, durata massima 180 → OK importo 450, saldo 550", async () => {
    const p = await automobilista("3");
    await avvioRiuscito(p, richiesta(p, 7, 180), {
      importo: 450,
      pagamento: "PAGATA",
      scadenza: "13:00",
      saldo: 550,
    });
  });

  it("RF_WALLET_2 · TF-AVV-04 · saldo uguale all'importo → OK importo 450, saldo 0", async () => {
    const p = await automobilista("4", { saldo: 450 });
    await avvioRiuscito(p, richiesta(p, 8, 180), {
      importo: 450,
      pagamento: "PAGATA",
      scadenza: "13:00",
      saldo: 0,
    });
  });

  it("VD_10 · TF-AVV-05 · stallo disabili con permesso completo e saldo 0 → OK GRATUITA, nessun movimento", async () => {
    const p = await automobilista("5", { saldo: 0 });
    await portaAOccupato(14);
    await avvioRiuscito(
      p,
      richiesta(p, 14, 180, { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: FOTO }),
      { importo: 0, pagamento: "GRATUITA", scadenza: "13:00", saldo: 0, permesso: true },
    );
  });

  it("RF_SOSTA_5 · TF-AVV-06 · stallo rosa senza permesso → PERMESSO_MANCANTE", async () => {
    const p = await automobilista("6");
    await avvioRifiutato(p, richiesta(p, 15, 60), "PERMESSO_MANCANTE", "OCCUPATO");
  });

  it("RF_SOSTA_5 · TF-AVV-07 · stallo rosa con permesso completo → OK importo 100, permesso salvato, saldo 900", async () => {
    const p = await automobilista("7");
    await avvioRiuscito(
      p,
      richiesta(p, 4, 60, { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: FOTO }),
      { importo: 100, pagamento: "PAGATA", scadenza: "11:00", saldo: 900, permesso: true },
    );
  });

  it("RF_SOSTA_7 · TF-AVV-08 · targa con sosta attiva già scaduta non allineata → OK sullo stallo 12, sosta precedente Scaduta, stallo 11 Occupato", async () => {
    const p = await automobilista("8");
    const precedente = await sostaPreesistente(p, 11, "08:30", "09:30", true);

    await avvioRiuscito(p, richiesta(p, 12, 60), {
      importo: 150,
      pagamento: "PAGATA",
      scadenza: "11:00",
      saldo: 850,
    });

    const pool = poolDiTest();
    expect((await trovaSosta(pool, precedente))!.stato).toBe("SCADUTA");
    expect((await trovaStallo(pool, 11))!.stato).toBe("OCCUPATO");
  });

  // --- Errori ---

  it("VD_3 · TF-AVV-09 · targa di un altro Automobilista → TARGA_NON_NEL_PROFILO", async () => {
    const p = await automobilista("9");
    await avvioRifiutato(
      p,
      richiesta(p, 17, 60, { targa: "EF456GH" }),
      "TARGA_NON_NEL_PROFILO",
      "OCCUPATO",
    );
  });

  it("RF_SOSTA_1 · TF-AVV-10 · targa con una sosta attiva → SOSTA_GIA_ATTIVA", async () => {
    const p = await automobilista("10");
    const esistente = await sostaPreesistente(p, 18, "09:00", "12:00", true);
    const pool = poolDiTest();
    const sostaPrima = await trovaSosta(pool, esistente);
    const prima = await istantanea(p, 19);

    await rifiutato(facade().avviaSosta(richiesta(p, 19, 60)), "SOSTA_GIA_ATTIVA");

    await verificaNessunaScrittura(p, prima, 19, "OCCUPATO", sostaPrima);
    expect(await trovaSosta(pool, esistente)).toEqual(sostaPrima);
    expect(sostaPrima!.stato).toBe("ATTIVA");
    expect(await sostaAttivaSuStallo(pool, 19)).toBeNull();
  });

  it("RF_SOSTA_1 · TF-AVV-11 · stallo Libero → STALLO_NON_OCCUPATO", async () => {
    const p = await automobilista("11");
    await avvioRifiutato(p, richiesta(p, 16, 60), "STALLO_NON_OCCUPATO", "LIBERO");
  });

  it("RF_SOSTA_6 · TF-AVV-12 · stallo Non disponibile per la sosta di un altro → STALLO_NON_OCCUPATO", async () => {
    const p = await automobilista("12");
    const altro = await automobilista("12b", { targa: "AV012BB" });
    const sostaAltro = await sostaPreesistente(altro, 20, "09:00", "12:00", true);

    await avvioRifiutato(p, richiesta(p, 20, 60), "STALLO_NON_OCCUPATO", "NON_DISPONIBILE");

    expect((await trovaSosta(poolDiTest(), sostaAltro))!.stato).toBe("ATTIVA");
  });

  it("RF_SOSTA_1 · TF-AVV-13 · stallo Sconosciuto → STALLO_NON_OCCUPATO", async () => {
    const p = await automobilista("13");
    await avvioRifiutato(p, richiesta(p, 13, 60), "STALLO_NON_OCCUPATO", "SCONOSCIUTO");
  });

  it("RF_SOSTA_1 · TF-AVV-14 · stallo inesistente → STALLO_INESISTENTE", async () => {
    const p = await automobilista("14");
    await avvioRifiutato(p, richiesta(p, INESISTENTE, 60), "STALLO_INESISTENTE", null);
  });

  it("ISSUE_9 · TF-AVV-15 · durata inferiore a 15 minuti → DURATA_NON_VALIDA", async () => {
    const p = await automobilista("15");
    await avvioRifiutato(p, richiesta(p, 21, 14), "DURATA_NON_VALIDA", "OCCUPATO");
  });

  it("RF_SOSTA_1 · TF-AVV-16 · durata oltre il massimo → DURATA_NON_VALIDA", async () => {
    const p = await automobilista("16");
    await avvioRifiutato(p, richiesta(p, 26, 121), "DURATA_NON_VALIDA", "OCCUPATO");
  });

  it("ISSUE_9 · TF-AVV-17 · durata non intera → DURATA_NON_VALIDA", async () => {
    const p = await automobilista("17");
    await portaAOccupato(22);
    await avvioRifiutato(p, richiesta(p, 22, 30.5), "DURATA_NON_VALIDA", "OCCUPATO");
  });

  it("RF_WALLET_2 · TF-AVV-18 · saldo insufficiente → CREDITO_INSUFFICIENTE", async () => {
    const p = await automobilista("18", { saldo: 300 });

    await avvioRifiutato(p, richiesta(p, 29, 240), "CREDITO_INSUFFICIENTE", "OCCUPATO");

    const pool = poolDiTest();
    expect((await trovaWalletDiAutomobilista(pool, p.id))!.saldo).toBe(300);
    const elenco = await movimenti(pool, p.wallet);
    expect(elenco).toHaveLength(1);
    expect(elenco[0].tipoDiMovimento).toBe("RICARICA");
    const soste = await interroga<{ n: number }>(
      pool,
      "SELECT count(*)::int AS n FROM sosta WHERE veicolo_id = $1",
      [p.veicolo],
    );
    expect(soste.rows[0].n).toBe(0);
  });

  it("VD_10 · TF-AVV-19 · stallo disabili senza permesso → PERMESSO_MANCANTE", async () => {
    const p = await automobilista("19");
    await portaAOccupato(24);
    await avvioRifiutato(p, richiesta(p, 24, 60), "PERMESSO_MANCANTE", "OCCUPATO");
  });

  it("VD_10 · TF-AVV-20 · stallo disabili con dichiarazione vuota → PERMESSO_MANCANTE", async () => {
    const p = await automobilista("20");
    await portaAOccupato(30);
    await avvioRifiutato(
      p,
      richiesta(p, 30, 60, { dichiarazioneDiPermesso: "   ", fotoDelPermesso: FOTO }),
      "PERMESSO_MANCANTE",
      "OCCUPATO",
    );
  });

  it("SCHEMA · TF-AVV-21 · stallo disabili con foto oltre 2 MB → PERMESSO_NON_VALIDO", async () => {
    const p = await automobilista("21");
    await portaAOccupato(2);
    await avvioRifiutato(
      p,
      richiesta(p, 2, 60, {
        dichiarazioneDiPermesso: DICHIARAZIONE,
        fotoDelPermesso: FOTO_TROPPO_GRANDE,
      }),
      "PERMESSO_NON_VALIDO",
      "OCCUPATO",
    );
  });

  it("RF_SOSTA_5 · TF-AVV-22 · stallo rosa con la sola foto → PERMESSO_MANCANTE", async () => {
    const p = await automobilista("22");
    await portaAOccupato(25);
    await avvioRifiutato(
      p,
      richiesta(p, 25, 60, { fotoDelPermesso: FOTO }),
      "PERMESSO_MANCANTE",
      "OCCUPATO",
    );
  });

  it("VD_8 · TF-AVV-23 · permesso su stallo a pagamento → PERMESSO_NON_PREVISTO", async () => {
    const p = await automobilista("23");
    await portaAOccupato(1);
    await avvioRifiutato(
      p,
      richiesta(p, 1, 60, { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: FOTO }),
      "PERMESSO_NON_PREVISTO",
      "OCCUPATO",
    );
  });

  it("ISSUE_9 · TF-AVV-24 · stallo Occupato con una sosta attiva (dati incoerenti) → STALLO_CON_SOSTA_ATTIVA", async () => {
    const p = await automobilista("24");
    const altro = await automobilista("24b", { targa: "AV024BB" });
    await portaAOccupato(10);
    const sostaAltro = await sostaPreesistente(altro, 10, "09:00", "12:00", false);

    await avvioRifiutato(p, richiesta(p, 10, 60), "STALLO_CON_SOSTA_ATTIVA", "OCCUPATO");

    expect((await trovaSosta(poolDiTest(), sostaAltro))!.stato).toBe("ATTIVA");
  });

  // --- Concorrenza ---

  it("ISSUE_9 · TF-AVV-25 · due avvii simultanei sullo stesso stallo → uno OK, l'altro STALLO_NON_OCCUPATO o STALLO_CON_SOSTA_ATTIVA", async () => {
    const a = await automobilista("25");
    const b = await automobilista("25b", { targa: "AV025BB" });
    await portaAOccupato(9);
    const ra = richiesta(a, 9, 60);
    const rb = richiesta(b, 9, 60);
    const primaA = await istantanea(a, 9);
    const primaB = await istantanea(b, 9);

    const [esitoA, esitoB] = await Promise.allSettled([
      facade().avviaSosta(ra),
      facade().avviaSosta(rb),
    ]);

    const riusciti = [esitoA, esitoB].filter((e) => e.status === "fulfilled");
    expect(riusciti).toHaveLength(1);
    const vinceA = esitoA.status === "fulfilled";
    const [vincitore, primaV, rV, esitoV] = vinceA
      ? [a, primaA, ra, esitoA]
      : [b, primaB, rb, esitoB];
    const [perdente, primaP, esitoP] = vinceA ? [b, primaB, esitoB] : [a, primaA, esitoA];

    const risultato = (esitoV as PromiseFulfilledResult<SostaAvviata>).value;
    await verificaAvvio(vincitore, primaV, rV, risultato, {
      importo: 150,
      pagamento: "PAGATA",
      scadenza: "11:00",
      saldo: 850,
    });

    expect(esitoP.status).toBe("rejected");
    const errore = (esitoP as PromiseRejectedResult).reason;
    expect(errore).toBeInstanceOf(ErroreGestioneSoste);
    expect(["STALLO_NON_OCCUPATO", "STALLO_CON_SOSTA_ATTIVA"]).toContain(
      (errore as ErroreGestioneSoste).codice,
    );
    await verificaWalletInvariato(perdente, primaP);
    const pool = poolDiTest();
    expect((await trovaWalletDiAutomobilista(pool, perdente.id))!.saldo).toBe(1000);
    const elenco = await movimenti(pool, perdente.wallet);
    expect(elenco).toHaveLength(1);
    expect(elenco[0].tipoDiMovimento).toBe("RICARICA");
    expect(await sostaAttivaPerVeicolo(pool, perdente.veicolo)).toBeNull();

    expect((await sostaAttivaSuStallo(pool, 9))?.id).toBe(risultato.sosta);
    expect((await trovaStallo(pool, 9))!.stato).toBe("NON_DISPONIBILE");
  });

  // --- Normalizzazione della targa ---

  it("VD_3 · TF-AVV-26 · targa del profilo in minuscolo e con uno spazio → OK sul veicolo AV026AA, importo 100, saldo 900", async () => {
    const p = await automobilista("26");
    expect(p.targa).toBe("AV026AA");
    await portaAOccupato(27);

    await avvioRiuscito(p, richiesta(p, 27, 60, { targa: "av026 aa" }), {
      importo: 100,
      pagamento: "PAGATA",
      scadenza: "11:00",
      saldo: 900,
    });
  });
});
