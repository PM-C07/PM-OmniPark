import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

// Test frame TF-AVV-27…41 di docs/test/cp_avvioSosta.md (OMP-61, issue #33): permesso
// obbligatorio sugli stalli riservati, formato e dimensione della foto, eliminazione del permesso
// al termine della sosta. Le transazioni della Facade vanno in commit: il database si prepara una
// volta e ogni frame usa automobilisti e veicoli propri; i frame che scrivono usano stalli propri,
// i frame di errore solo gli stalli 2, 3 e 25.

const T = new Date("2026-11-20T10:00:00+01:00");
const T_SECONDA_FACADE = new Date("2026-11-20T10:16:00+01:00");
const ISTANTE_RICARICA = new Date("2026-11-20T08:00:00+01:00");
const ISTANTE_RILEVAZIONE = T; // COD-23: entro 60 s da T (RF_IOT_2)
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";
const STALLI_PORTATI_A_OCCUPATO = [2, 14, 24, 25, 30];

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

// --- Foto di prova (§3), generate in memoria ---

function conFirma(firma: number[], n: number): Buffer {
  const foto = Buffer.alloc(n, 0x00);
  Buffer.from(firma).copy(foto);
  return foto;
}

// JPEG(n): FF D8 FF E0 seguiti da byte 00 fino a n byte in tutto.
function jpeg(n: number): Buffer {
  return conFirma([0xff, 0xd8, 0xff, 0xe0], n);
}

// PNG(n): 89 50 4E 47 0D 0A 1A 0A seguiti da byte 00 fino a n byte in tutto.
function png(n: number): Buffer {
  return conFirma([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], n);
}

// GIF: «GIF89a» seguito da byte 00 fino a 1024 byte.
function gif(): Buffer {
  return conFirma([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 1024);
}

// Firma JPEG incompleta: FF D8 00 seguiti da byte 00 fino a 1024 byte.
function firmaJpegIncompleta(): Buffer {
  return conFirma([0xff, 0xd8, 0x00], 1024);
}

// Firma PNG troncata: i soli 7 byte 89 50 4E 47 0D 0A 1A.
function firmaPngTroncata(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]);
}

function fotoVuota(): Buffer {
  return Buffer.alloc(0);
}

describe("OMP-61 · cp_avvioSosta · permesso", () => {
  let hashPassword: string;

  // --- Ambiente (§3) ---

  function facadeConOrologio(adesso: Date): FacadeGestioneSoste {
    const pool = poolDiTest();
    const orologio = { adesso: () => adesso };
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

  function facade(): FacadeGestioneSoste {
    return facadeConOrologio(T);
  }

  // Seconda Facade (solo TF-AVV-40, 41): orologio fisso alle 10:16.
  function secondaFacade(): FacadeGestioneSoste {
    return facadeConOrologio(T_SECONDA_FACADE);
  }

  function gestioneStalli() {
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [osservatoreGestioneSoste],
    });
  }

  async function portaAOccupato(stallo: number): Promise<void> {
    const stato = await gestioneStalli().registraRilevazione({
      stallo,
      presenza: true,
      dataOra: ISTANTE_RILEVAZIONE,
    });
    expect(stato).toBe("OCCUPATO");
  }

  beforeAll(async () => {
    await preparaDatabaseDiTest();
    hashPassword = await calcolaHashPassword("parola-di-prova-lunga");
    for (const stallo of STALLI_PORTATI_A_OCCUPATO) {
      await portaAOccupato(stallo);
    }
  });

  // COD-23 (RF_IOT_2): rilevazioni recenti rispetto all'orologio dei test, prima di ogni frame
  // perché TF-AVV-40 e 41 le portano alle 10:16 (§3).
  beforeEach(async () => {
    await rilevazioniAllIstante(poolDiTest(), T);
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  type Prova = { id: number; wallet: number; veicolo: number; targa: string };

  // Automobilista P<n>: email permesso.<n>@test.example, wallet, ricarica e veicolo PM0<nn>AA.
  async function automobilista(n: number, opzioni: { saldo?: number } = {}): Promise<Prova> {
    const pool = poolDiTest();
    const targa = `PM0${String(n).padStart(2, "0")}AA`;
    const saldo = opzioni.saldo ?? 1000;
    const id = await creaAutomobilista(pool, {
      email: `permesso.${n}@test.example`,
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

  function richiesta(
    p: Prova,
    stallo: number,
    durata: number,
    altro: Partial<RichiestaDiAvvio> = {},
  ): RichiestaDiAvvio {
    return { automobilista: p.id, stallo, targa: p.targa, durata, ...altro };
  }

  function permesso(foto: Buffer): Partial<RichiestaDiAvvio> {
    return { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: foto };
  }

  // --- Verifiche (§3) ---

  type Istantanea = {
    saldo: number;
    movimenti: Awaited<ReturnType<typeof movimenti>>;
    stallo: { stato: StatoStallo; occupazioneRilevata: unknown };
    sostaSuStallo: Sosta | null;
  };

  async function istantanea(p: Prova, stallo: number): Promise<Istantanea> {
    const pool = poolDiTest();
    const wallet = await trovaWalletDiAutomobilista(pool, p.id);
    expect(wallet).not.toBeNull();
    const s = await trovaStallo(pool, stallo);
    expect(s).not.toBeNull();
    return {
      saldo: wallet!.saldo,
      movimenti: await movimenti(pool, p.wallet),
      stallo: { stato: s!.stato, occupazioneRilevata: s!.occupazioneRilevata },
      sostaSuStallo: await sostaAttivaSuStallo(pool, stallo),
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

  // Nessuna scrittura (`N`): wallet, sosta attiva del veicolo, stallo e sosta attiva sullo stallo.
  async function verificaNessunaScrittura(
    p: Prova,
    prima: Istantanea,
    stallo: number,
    statoAtteso: StatoStallo,
  ): Promise<void> {
    const pool = poolDiTest();
    expect((await trovaWalletDiAutomobilista(pool, p.id))!.saldo).toBe(prima.saldo);
    expect(await movimenti(pool, p.wallet)).toEqual(prima.movimenti);
    expect(await sostaAttivaPerVeicolo(pool, p.veicolo)).toBeNull();
    const s = await trovaStallo(pool, stallo);
    expect(s).not.toBeNull();
    expect(s!.stato).toBe(statoAtteso);
    expect({ stato: s!.stato, occupazioneRilevata: s!.occupazioneRilevata }).toEqual(prima.stallo);
    expect(await sostaAttivaSuStallo(pool, stallo)).toEqual(prima.sostaSuStallo);
  }

  async function avvioRifiutato(
    p: Prova,
    r: RichiestaDiAvvio,
    codice: CodiceErroreGestioneSoste,
    statoAtteso: StatoStallo,
  ): Promise<void> {
    const prima = await istantanea(p, r.stallo);
    await rifiutato(facade().avviaSosta(r), codice);
    await verificaNessunaScrittura(p, prima, r.stallo, statoAtteso);
  }

  // Avvio riuscito (`OK`); con `foto` la sosta ha la dichiarazione e la foto uguale byte per byte.
  async function avvioRiuscito(
    p: Prova,
    r: RichiestaDiAvvio,
    atteso: {
      importo: number;
      pagamento: Pagamento;
      scadenza: string;
      saldo: number;
      foto?: Buffer;
    },
  ): Promise<SostaAvviata> {
    const pool = poolDiTest();
    const prima = await istantanea(p, r.stallo);

    const risultato = await facade().avviaSosta(r);

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
    if (atteso.foto) {
      expect(sosta!.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
      expect(sosta!.fotoDelPermesso).not.toBeNull();
      expect(sosta!.fotoDelPermesso!.length).toBe(atteso.foto.length);
      expect(Buffer.compare(sosta!.fotoDelPermesso!, atteso.foto)).toBe(0);
    } else {
      expect(sosta!.dichiarazioneDiPermesso).toBeNull();
      expect(sosta!.fotoDelPermesso).toBeNull();
    }

    const stallo = await trovaStallo(pool, r.stallo);
    expect(stallo!.stato).toBe("NON_DISPONIBILE");
    expect(stallo!.occupazioneRilevata).toEqual(prima.stallo.occupazioneRilevata);

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
    return risultato;
  }

  async function leggiSosta(id: number): Promise<Sosta> {
    const s = await trovaSosta(poolDiTest(), id);
    expect(s).not.toBeNull();
    return s!;
  }

  async function statoStallo(id: number): Promise<StatoStallo> {
    const s = await trovaStallo(poolDiTest(), id);
    expect(s).not.toBeNull();
    return s!.stato;
  }

  // --- Avvii riusciti ---

  it("RF_SOSTA_5 · TF-AVV-27 · stallo disabili con permesso completo PNG e saldo 0 → OK GRATUITA, foto PNG salvata, nessun movimento", async () => {
    const p = await automobilista(27, { saldo: 0 });
    await avvioRiuscito(p, richiesta(p, 14, 60, permesso(png(1024))), {
      importo: 0,
      pagamento: "GRATUITA",
      scadenza: "11:00",
      saldo: 0,
      foto: png(1024),
    });
  });

  it("VD_10 · TF-AVV-28 · stallo rosa con permesso completo PNG → OK importo 150, PAGATA, foto PNG salvata, saldo 850", async () => {
    const p = await automobilista(28);
    await avvioRiuscito(p, richiesta(p, 15, 60, permesso(png(1024))), {
      importo: 150,
      pagamento: "PAGATA",
      scadenza: "11:00",
      saldo: 850,
      foto: png(1024),
    });
  });

  it("SCHEMA · TF-AVV-29 · stallo disabili con foto JPEG di esattamente 2 MB → OK GRATUITA, foto di 2 097 152 byte salvata", async () => {
    const p = await automobilista(29, { saldo: 0 });
    const foto = jpeg(2097152);
    expect(foto.length).toBe(2097152);
    await avvioRiuscito(p, richiesta(p, 30, 60, permesso(foto)), {
      importo: 0,
      pagamento: "GRATUITA",
      scadenza: "11:00",
      saldo: 0,
      foto: jpeg(2097152),
    });
  });

  // --- Errori ---

  it("RF_SOSTA_5 · TF-AVV-30 · stallo rosa con la sola dichiarazione → PERMESSO_MANCANTE", async () => {
    const p = await automobilista(30);
    await avvioRifiutato(
      p,
      richiesta(p, 25, 60, { dichiarazioneDiPermesso: DICHIARAZIONE }),
      "PERMESSO_MANCANTE",
      "OCCUPATO",
    );
  });

  it("RF_SOSTA_5 · TF-AVV-31 · stallo disabili con la sola foto JPEG → PERMESSO_MANCANTE", async () => {
    const p = await automobilista(31);
    await avvioRifiutato(
      p,
      richiesta(p, 2, 60, { fotoDelPermesso: jpeg(1024) }),
      "PERMESSO_MANCANTE",
      "OCCUPATO",
    );
  });

  it("RF_SOSTA_5 · TF-AVV-32 · stallo disabili con dichiarazione e foto vuota → PERMESSO_MANCANTE", async () => {
    const p = await automobilista(32);
    await avvioRifiutato(
      p,
      richiesta(p, 2, 60, permesso(fotoVuota())),
      "PERMESSO_MANCANTE",
      "OCCUPATO",
    );
  });

  it("ISSUE_33 · TF-AVV-33 · stallo disabili con foto GIF → PERMESSO_NON_VALIDO", async () => {
    const p = await automobilista(33);
    await avvioRifiutato(
      p,
      richiesta(p, 2, 60, permesso(gif())),
      "PERMESSO_NON_VALIDO",
      "OCCUPATO",
    );
  });

  it("ISSUE_33 · TF-AVV-34 · stallo rosa con foto con firma JPEG incompleta → PERMESSO_NON_VALIDO", async () => {
    const p = await automobilista(34);
    await avvioRifiutato(
      p,
      richiesta(p, 25, 60, permesso(firmaJpegIncompleta())),
      "PERMESSO_NON_VALIDO",
      "OCCUPATO",
    );
  });

  it("ISSUE_33 · TF-AVV-35 · stallo rosa con foto con firma PNG troncata → PERMESSO_NON_VALIDO", async () => {
    const p = await automobilista(35);
    await avvioRifiutato(
      p,
      richiesta(p, 25, 60, permesso(firmaPngTroncata())),
      "PERMESSO_NON_VALIDO",
      "OCCUPATO",
    );
  });

  it("SCHEMA · TF-AVV-36 · stallo rosa con foto oltre 2 MB → PERMESSO_NON_VALIDO", async () => {
    const p = await automobilista(36);
    await avvioRifiutato(
      p,
      richiesta(p, 25, 60, permesso(jpeg(2097153))),
      "PERMESSO_NON_VALIDO",
      "OCCUPATO",
    );
  });

  it("ISSUE_33 · TF-AVV-37 · stallo disabili con la sola foto GIF, senza dichiarazione → PERMESSO_MANCANTE (primo controllo violato)", async () => {
    const p = await automobilista(37);
    await avvioRifiutato(
      p,
      richiesta(p, 2, 60, { fotoDelPermesso: gif() }),
      "PERMESSO_MANCANTE",
      "OCCUPATO",
    );
  });

  it("VD_8 · TF-AVV-38 · stallo a pagamento con la sola dichiarazione → PERMESSO_NON_PREVISTO", async () => {
    const p = await automobilista(38);
    await avvioRifiutato(
      p,
      richiesta(p, 3, 60, { dichiarazioneDiPermesso: DICHIARAZIONE }),
      "PERMESSO_NON_PREVISTO",
      "OCCUPATO",
    );
  });

  it("RF_WALLET_2 · TF-AVV-39 · stallo rosa con permesso completo e saldo insufficiente → CREDITO_INSUFFICIENTE", async () => {
    const p = await automobilista(39, { saldo: 50 });

    await avvioRifiutato(
      p,
      richiesta(p, 25, 60, permesso(jpeg(1024))),
      "CREDITO_INSUFFICIENTE",
      "OCCUPATO",
    );

    const pool = poolDiTest();
    expect((await trovaWalletDiAutomobilista(pool, p.id))!.saldo).toBe(50);
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

  // --- Fine della sosta con permesso ---

  it("NRF_LEG_2 · TF-AVV-40 · scadenza poi uscita del veicolo → SCADUTA con permesso, poi TERMINATA con dichiarazione e foto eliminate", async () => {
    const p = await automobilista(40, { saldo: 0 });
    const avviata = await avvioRiuscito(p, richiesta(p, 24, 15, permesso(jpeg(1024))), {
      importo: 0,
      pagamento: "GRATUITA",
      scadenza: "10:15",
      saldo: 0,
      foto: jpeg(1024),
    });

    await rilevazioniAllIstante(poolDiTest(), T_SECONDA_FACADE); // COD-23 (§3)
    await secondaFacade().sosteDellAutomobilista(p.id);

    const scaduta = await leggiSosta(avviata.sosta);
    expect(scaduta.stato).toBe("SCADUTA");
    expect(scaduta.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
    expect(scaduta.fotoDelPermesso).not.toBeNull();
    expect(Buffer.compare(scaduta.fotoDelPermesso!, jpeg(1024))).toBe(0);
    expect(await statoStallo(24)).toBe("OCCUPATO");

    expect(
      await gestioneStalli().registraRilevazione({
        stallo: 24,
        presenza: false,
        dataOra: new Date("2026-11-20T10:17:00+01:00"),
      }),
    ).toBe("LIBERO");

    expect(await statoStallo(24)).toBe("LIBERO");
    const terminata = await leggiSosta(avviata.sosta);
    expect(terminata.stato).toBe("TERMINATA");
    expect(terminata.dichiarazioneDiPermesso).toBeNull();
    expect(terminata.fotoDelPermesso).toBeNull();
  });

  it("NRF_LEG_2 · TF-AVV-41 · uscita del veicolo durante la sosta poi scadenza → resta ATTIVA con permesso, poi TERMINATA con dichiarazione e foto eliminate", async () => {
    const p = await automobilista(41);
    const avviata = await avvioRiuscito(p, richiesta(p, 4, 15, permesso(jpeg(1024))), {
      importo: 25,
      pagamento: "PAGATA",
      scadenza: "10:15",
      saldo: 975,
      foto: jpeg(1024),
    });

    expect(
      await gestioneStalli().registraRilevazione({
        stallo: 4,
        presenza: false,
        dataOra: new Date("2026-11-20T10:05:00+01:00"),
      }),
    ).toBe("NON_DISPONIBILE");

    expect(await statoStallo(4)).toBe("NON_DISPONIBILE");
    const attiva = await leggiSosta(avviata.sosta);
    expect(attiva.stato).toBe("ATTIVA");
    expect(attiva.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
    expect(attiva.fotoDelPermesso).not.toBeNull();
    expect(Buffer.compare(attiva.fotoDelPermesso!, jpeg(1024))).toBe(0);

    await rilevazioniAllIstante(poolDiTest(), T_SECONDA_FACADE); // COD-23 (§3)
    await secondaFacade().sosteDellAutomobilista(p.id);

    expect(await statoStallo(4)).toBe("LIBERO");
    const terminata = await leggiSosta(avviata.sosta);
    expect(terminata.stato).toBe("TERMINATA");
    expect(terminata.dichiarazioneDiPermesso).toBeNull();
    expect(terminata.fotoDelPermesso).toBeNull();
    expect((await trovaWalletDiAutomobilista(poolDiTest(), p.id))!.saldo).toBe(975);
  });
});
