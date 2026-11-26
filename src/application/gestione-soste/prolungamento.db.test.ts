import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scadenzaRaggiunta } from "../allineamento-temporale/allineamento";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { creaFacadeWallet } from "../wallet/facade";
import { trovaStallo, type StatoStallo } from "../../persistence/accessoDati/stalliTariffe";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  creaSosta,
  creaWallet,
  impostaSostaScaduta,
  movimenti,
  registraRicarica,
  trovaSosta,
  trovaWalletDiAutomobilista,
  type MovimentoDelWallet,
  type Pagamento,
  type Sosta,
  type StatoSosta,
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeGestioneSoste,
  ErroreGestioneSoste,
  osservatoreGestioneSoste,
  type FacadeGestioneSoste,
} from "./facade";

// Test frame TF-PRO-01…19 di docs/test/cp_prolungamento.md (OMP-61): TF-PRO-01…17 del sotto-task
// 1, TF-PRO-18, 19 del blocco A dei sotto-task 2–5. Le transazioni della Facade vanno in commit: il
// database si prepara una volta e ogni frame usa stalli, automobilisti e veicoli propri.

const T = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => T };
const ISTANTE_RICARICA = new Date("2026-11-20T08:00:00+01:00");
const ISTANTE_RILEVAZIONE = new Date("2026-11-20T09:00:00+01:00");
const ISTANTE_ALLINEAMENTO = new Date("2026-11-20T10:45:00+01:00");
const INESISTENTE = 999999;
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";
const FOTO = Buffer.alloc(1024, 0xff);

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-61 · cp_prolungamento", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
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

  type Prova = { id: number; wallet: number; veicolo: number };

  // Automobilista P<suffisso>: email prolunga.<suffisso>@test.example, wallet, ricarica e veicolo.
  async function automobilista(
    suffisso: string,
    opzioni: { targa?: string; saldo?: number } = {},
  ): Promise<Prova> {
    const pool = poolDiTest();
    const targa = opzioni.targa ?? `PR0${suffisso.padStart(2, "0")}AA`;
    const saldo = opzioni.saldo ?? 1000;
    const id = await creaAutomobilista(pool, {
      email: `prolunga.${suffisso}@test.example`,
      hashPassword: "hash-di-prova",
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
    return { id, wallet, veicolo };
  }

  async function portaAOccupato(stallo: number): Promise<void> {
    const stato = await gestioneStalli().registraRilevazione({
      stallo,
      presenza: true,
      dataOra: ISTANTE_RILEVAZIONE,
    });
    expect(stato).toBe("OCCUPATO");
  }

  type OpzioniSosta = {
    avvio?: string;
    scadenza?: string;
    scaduta?: boolean;
    pagamento?: Pagamento;
    permesso?: boolean;
  };

  // Sosta S di P<n>: dalle 09:30 alle 10:30, PAGATA, stallo Non disponibile; «scaduta» la porta a
  // SCADUTA e lascia lo stallo com'è.
  async function sosta(p: Prova, stallo: number, opzioni: OpzioniSosta = {}): Promise<number> {
    const pool = poolDiTest();
    const id = await creaSosta(pool, {
      automobilistaId: p.id,
      veicoloId: p.veicolo,
      stalloId: stallo,
      orarioDiAvvio: ora(opzioni.avvio ?? "09:30"),
      orarioDiScadenza: ora(opzioni.scadenza ?? "10:30"),
      pagamento: opzioni.pagamento ?? "PAGATA",
      ...(opzioni.permesso
        ? { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: FOTO }
        : {}),
    });
    if (opzioni.scaduta) {
      expect(await impostaSostaScaduta(pool, id)).toBe(true);
    } else {
      await gestioneStalli().impostaNonDisponibile(stallo);
    }
    return id;
  }

  // --- Verifiche (§3) ---

  type StatoWallet = { saldo: number; movimenti: MovimentoDelWallet[] };

  async function statoWallet(automobilistaId: number, walletId: number): Promise<StatoWallet> {
    const pool = poolDiTest();
    const wallet = await trovaWalletDiAutomobilista(pool, automobilistaId);
    expect(wallet).not.toBeNull();
    return { saldo: wallet!.saldo, movimenti: await movimenti(pool, walletId) };
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

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: string,
  ): Promise<ErroreGestioneSoste & { tempoDisponibile?: number }> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreGestioneSoste);
    const errore = ottenuto as ErroreGestioneSoste & { tempoDisponibile?: number };
    expect(errore.codice).toBe(codice);
    return errore;
  }

  // Nessun effetto (`N`): sosta, wallet e stallo come nella preparazione.
  async function prolungamentoRifiutato(
    p: Prova,
    sostaId: number,
    stallo: number,
    tempoAggiuntivo: number,
    codice: string,
    atteso: { stato: StatoSosta; scadenza: string; statoStallo: StatoStallo },
  ) {
    const sostaPrima = await leggiSosta(sostaId);
    expect(sostaPrima.stato).toBe(atteso.stato);
    expect(sostaPrima.orarioDiScadenza.getTime()).toBe(ora(atteso.scadenza).getTime());
    expect(await statoStallo(stallo)).toBe(atteso.statoStallo);
    const walletPrima = await statoWallet(p.id, p.wallet);

    const errore = await rifiutato(facade().prolungaSosta(p.id, sostaId, tempoAggiuntivo), codice);

    expect(await leggiSosta(sostaId)).toEqual(sostaPrima);
    expect(await statoStallo(stallo)).toBe(atteso.statoStallo);
    expect(await statoWallet(p.id, p.wallet)).toEqual(walletPrima);
    return errore;
  }

  // Prolungamento riuscito (`OK`).
  async function prolungamentoRiuscito(
    p: Prova,
    sostaId: number,
    stallo: number,
    tempoAggiuntivo: number,
    atteso: { importo: number; scadenza: string; saldo: number },
  ): Promise<void> {
    const sostaPrima = await leggiSosta(sostaId);
    const walletPrima = await statoWallet(p.id, p.wallet);

    const risultato = await facade().prolungaSosta(p.id, sostaId, tempoAggiuntivo);

    expect(risultato.sosta).toBe(sostaId);
    expect(risultato.orarioDiScadenza.getTime()).toBe(ora(atteso.scadenza).getTime());
    expect(risultato.importo).toBe(atteso.importo);

    const dopo = await leggiSosta(sostaId);
    expect(dopo.stato).toBe("ATTIVA");
    expect(dopo.orarioDiScadenza.getTime()).toBe(ora(atteso.scadenza).getTime());
    expect({ ...dopo, orarioDiScadenza: null }).toEqual({ ...sostaPrima, orarioDiScadenza: null });
    expect(await statoStallo(stallo)).toBe("NON_DISPONIBILE");

    const walletDopo = await statoWallet(p.id, p.wallet);
    expect(walletDopo.saldo).toBe(atteso.saldo);
    const idPrima = new Set(walletPrima.movimenti.map((m) => m.id));
    const nuovi = walletDopo.movimenti.filter((m) => !idPrima.has(m.id));
    if (atteso.importo > 0) {
      expect(walletDopo.saldo).toBe(walletPrima.saldo - atteso.importo);
      expect(nuovi).toHaveLength(1);
      expect(nuovi[0].tipoDiMovimento).toBe("ADDEBITO");
      expect(nuovi[0].importo).toBe(atteso.importo);
      expect(nuovi[0].sostaId).toBe(sostaId);
      expect(nuovi[0].dataEOra.getTime()).toBe(T.getTime());
    } else {
      expect(walletDopo.saldo).toBe(walletPrima.saldo);
      expect(nuovi).toHaveLength(0);
    }
  }

  // --- Prolungamenti riusciti ---

  it("RF_SOSTA_2 · TF-PRO-01 · stallo a pagamento, +60 → OK importo 150, scadenza 11:30, saldo 850", async () => {
    const p = await automobilista("1");
    const s = await sosta(p, 3);
    await prolungamentoRiuscito(p, s, 3, 60, { importo: 150, scadenza: "11:30", saldo: 850 });
  });

  it("RF_SOSTA_2 · TF-PRO-02 · durata totale uguale al massimo (180) → OK importo 300, scadenza 12:30, saldo 700", async () => {
    const p = await automobilista("2");
    const s = await sosta(p, 7);
    await prolungamentoRiuscito(p, s, 7, 120, { importo: 300, scadenza: "12:30", saldo: 700 });
  });

  // --- Errori ---

  it("RF_SOSTA_2 · TF-PRO-03 · durata totale oltre il massimo → DURATA_OLTRE_IL_MASSIMO, tempoDisponibile 120", async () => {
    const p = await automobilista("3");
    const s = await sosta(p, 8);
    const errore = await prolungamentoRifiutato(p, s, 8, 121, "DURATA_OLTRE_IL_MASSIMO", {
      stato: "ATTIVA",
      scadenza: "10:30",
      statoStallo: "NON_DISPONIBILE",
    });
    expect(errore.tempoDisponibile).toBe(120);
  });

  it("RF_SOSTA_2 · TF-PRO-04 · sosta Scaduta → SOSTA_SCADUTA", async () => {
    const p = await automobilista("4");
    const s = await sosta(p, 11, { avvio: "08:00", scadenza: "09:00", scaduta: true });
    await prolungamentoRifiutato(p, s, 11, 30, "SOSTA_SCADUTA", {
      stato: "SCADUTA",
      scadenza: "09:00",
      statoStallo: "OCCUPATO",
    });
  });

  it("RF_SOSTA_2 · TF-PRO-05 · sosta Terminata del dataset → SOSTA_TERMINATA", async () => {
    const pool = poolDiTest();
    const sostaPrima = await leggiSosta(1);
    expect(sostaPrima.stato).toBe("TERMINATA");
    expect(sostaPrima.orarioDiScadenza.getTime()).toBe(
      new Date("2026-10-31T10:00:00+01:00").getTime(),
    );
    const walletPrima = await statoWallet(8, 2);
    expect(walletPrima.saldo).toBe(600);
    const stalloPrima = await statoStallo(10);

    await rifiutato(facade().prolungaSosta(8, 1, 30), "SOSTA_TERMINATA");

    expect(await trovaSosta(pool, 1)).toEqual(sostaPrima);
    expect(await statoWallet(8, 2)).toEqual(walletPrima);
    expect(await statoStallo(10)).toBe(stalloPrima);
  });

  it("RF_SOSTA_7 · TF-PRO-06 · sosta Attiva con scadenza raggiunta non ancora allineata → SOSTA_SCADUTA, sosta Scaduta, stallo Occupato", async () => {
    const p = await automobilista("6");
    const s = await sosta(p, 12, { avvio: "09:00", scadenza: "10:00" });
    const sostaPrima = await leggiSosta(s);
    expect(sostaPrima.stato).toBe("ATTIVA");
    expect(await statoStallo(12)).toBe("NON_DISPONIBILE");
    const walletPrima = await statoWallet(p.id, p.wallet);

    await rifiutato(facade().prolungaSosta(p.id, s, 30), "SOSTA_SCADUTA");

    const dopo = await leggiSosta(s);
    expect(dopo.stato).toBe("SCADUTA");
    expect(dopo.orarioDiScadenza.getTime()).toBe(ora("10:00").getTime());
    expect(await statoStallo(12)).toBe("OCCUPATO");
    const walletDopo = await statoWallet(p.id, p.wallet);
    expect(walletDopo).toEqual(walletPrima);
    expect(walletDopo.saldo).toBe(1000);
  });

  it("RF_SOSTA_2 · TF-PRO-07 · sosta di un altro Automobilista → SOSTA_INESISTENTE", async () => {
    const p = await automobilista("7");
    const altro = await automobilista("7b", { targa: "PR007BB" });
    const s = await sosta(altro, 17);
    const sostaPrima = await leggiSosta(s);
    expect(sostaPrima.stato).toBe("ATTIVA");
    expect(sostaPrima.orarioDiScadenza.getTime()).toBe(ora("10:30").getTime());
    const walletP = await statoWallet(p.id, p.wallet);
    const walletAltro = await statoWallet(altro.id, altro.wallet);

    await rifiutato(facade().prolungaSosta(p.id, s, 30), "SOSTA_INESISTENTE");

    expect(await leggiSosta(s)).toEqual(sostaPrima);
    expect(await statoStallo(17)).toBe("NON_DISPONIBILE");
    expect(await statoWallet(p.id, p.wallet)).toEqual(walletP);
    expect(await statoWallet(altro.id, altro.wallet)).toEqual(walletAltro);
  });

  it("ISSUE_33 · TF-PRO-08 · sosta inesistente → SOSTA_INESISTENTE", async () => {
    const p = await automobilista("8");
    const walletPrima = await statoWallet(p.id, p.wallet);

    await rifiutato(facade().prolungaSosta(p.id, INESISTENTE, 30), "SOSTA_INESISTENTE");

    const dopo = await statoWallet(p.id, p.wallet);
    expect(dopo).toEqual(walletPrima);
    expect(dopo.saldo).toBe(1000);
    expect(dopo.movimenti).toHaveLength(1);
    expect(dopo.movimenti[0].tipoDiMovimento).toBe("RICARICA");
  });

  it("RF_WALLET_2 · TF-PRO-09 · credito insufficiente → CREDITO_INSUFFICIENTE", async () => {
    const p = await automobilista("9", { saldo: 100 });
    const s = await sosta(p, 18);
    await prolungamentoRifiutato(p, s, 18, 60, "CREDITO_INSUFFICIENTE", {
      stato: "ATTIVA",
      scadenza: "10:30",
      statoStallo: "NON_DISPONIBILE",
    });
    const dopo = await statoWallet(p.id, p.wallet);
    expect(dopo.saldo).toBe(100);
    expect(dopo.movimenti).toHaveLength(1);
    expect(dopo.movimenti[0].tipoDiMovimento).toBe("RICARICA");
  });

  it("ISSUE_33 · TF-PRO-10 · tempo aggiuntivo inferiore a 15 minuti → DURATA_NON_VALIDA", async () => {
    const p = await automobilista("10");
    const s = await sosta(p, 19);
    await prolungamentoRifiutato(p, s, 19, 14, "DURATA_NON_VALIDA", {
      stato: "ATTIVA",
      scadenza: "10:30",
      statoStallo: "NON_DISPONIBILE",
    });
  });

  it("ISSUE_33 · TF-PRO-11 · tempo aggiuntivo non intero → DURATA_NON_VALIDA", async () => {
    const p = await automobilista("11");
    const s = await sosta(p, 20);
    await prolungamentoRifiutato(p, s, 20, 30.5, "DURATA_NON_VALIDA", {
      stato: "ATTIVA",
      scadenza: "10:30",
      statoStallo: "NON_DISPONIBILE",
    });
  });

  // --- Tipo di stallo ---

  it("VD_10 · TF-PRO-12 · stallo rosa, +60 → OK importo 150, PAGATA invariato, scadenza 11:30, saldo 850", async () => {
    const p = await automobilista("12");
    const s = await sosta(p, 15);
    await prolungamentoRiuscito(p, s, 15, 60, { importo: 150, scadenza: "11:30", saldo: 850 });
    expect((await leggiSosta(s)).pagamento).toBe("PAGATA");
  });

  it("VD_10 · TF-PRO-13 · stallo disabili, sosta GRATUITA con saldo 0 → OK importo 0, GRATUITA e permesso invariati, nessun movimento", async () => {
    const p = await automobilista("13", { saldo: 0 });
    await portaAOccupato(14);
    const s = await sosta(p, 14, { pagamento: "GRATUITA", permesso: true });

    await prolungamentoRiuscito(p, s, 14, 60, { importo: 0, scadenza: "11:30", saldo: 0 });

    const dopo = await leggiSosta(s);
    expect(dopo.pagamento).toBe("GRATUITA");
    expect(dopo.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
    expect(dopo.fotoDelPermesso).not.toBeNull();
    expect(Buffer.compare(dopo.fotoDelPermesso!, FOTO)).toBe(0);
    expect(await movimenti(poolDiTest(), p.wallet)).toHaveLength(0);
  });

  // --- Concorrenza ---

  it("RF_SOSTA_2 · TF-PRO-14 · due prolungamenti simultanei della stessa sosta → entrambi OK, scadenza 12:30, due addebiti da 150, saldo 700", async () => {
    const p = await automobilista("14");
    const s = await sosta(p, 21);
    const walletPrima = await statoWallet(p.id, p.wallet);

    const esiti = await Promise.allSettled([
      facade().prolungaSosta(p.id, s, 60),
      facade().prolungaSosta(p.id, s, 60),
    ]);

    for (const e of esiti) {
      expect(e.status).toBe("fulfilled");
    }
    const risultati = esiti.map(
      (e) =>
        (e as PromiseFulfilledResult<{ sosta: number; orarioDiScadenza: Date; importo: number }>)
          .value,
    );
    for (const r of risultati) {
      expect(r.sosta).toBe(s);
      expect(r.importo).toBe(150);
    }
    expect(risultati.map((r) => r.orarioDiScadenza.getTime()).sort((a, b) => a - b)).toEqual([
      ora("11:30").getTime(),
      ora("12:30").getTime(),
    ]);

    const dopo = await leggiSosta(s);
    expect(dopo.stato).toBe("ATTIVA");
    expect(dopo.orarioDiScadenza.getTime()).toBe(ora("12:30").getTime());
    expect(await statoStallo(21)).toBe("NON_DISPONIBILE");

    const walletDopo = await statoWallet(p.id, p.wallet);
    expect(walletDopo.saldo).toBe(700);
    const idPrima = new Set(walletPrima.movimenti.map((m) => m.id));
    const nuovi = walletDopo.movimenti.filter((m) => !idPrima.has(m.id));
    expect(nuovi).toHaveLength(2);
    for (const m of nuovi) {
      expect(m.tipoDiMovimento).toBe("ADDEBITO");
      expect(m.importo).toBe(150);
      expect(m.sostaId).toBe(s);
    }
  });

  // --- Scadenza condizionata ---

  it("RF_SOSTA_7 · TF-PRO-15 · allineamento che aveva letto la sosta prima del prolungamento → GIA_ALLINEATA, sosta Attiva con scadenza 11:00", async () => {
    const p = await automobilista("15");
    const s = await sosta(p, 23);

    await prolungamentoRiuscito(p, s, 23, 30, { importo: 50, scadenza: "11:00", saldo: 950 });

    const esito = await scadenzaRaggiunta(
      {
        pool: poolDiTest(),
        orologio: { adesso: () => ISTANTE_ALLINEAMENTO },
        gestioneStalli: gestioneStalli(),
      },
      s,
    );

    expect(esito).toBe("GIA_ALLINEATA");
    const dopo = await leggiSosta(s);
    expect(dopo.stato).toBe("ATTIVA");
    expect(dopo.orarioDiScadenza.getTime()).toBe(ora("11:00").getTime());
    expect(await statoStallo(23)).toBe("NON_DISPONIBILE");
  });

  // --- Calcolo senza scritture ---

  it("RF_SOSTA_2 · TF-PRO-16 · calcolaImportoDelProlungamento +30 → importo 50, scadenza 11:00, nessuna scrittura", async () => {
    const p = await automobilista("16");
    const s = await sosta(p, 26);
    const sostaPrima = await leggiSosta(s);
    const walletPrima = await statoWallet(p.id, p.wallet);

    const risultato = await facade().calcolaImportoDelProlungamento(p.id, s, 30);

    expect(risultato.importo).toBe(50);
    expect(risultato.orarioDiScadenza.getTime()).toBe(ora("11:00").getTime());
    const dopo = await leggiSosta(s);
    expect(dopo).toEqual(sostaPrima);
    expect(dopo.stato).toBe("ATTIVA");
    expect(dopo.orarioDiScadenza.getTime()).toBe(ora("10:30").getTime());
    const walletDopo = await statoWallet(p.id, p.wallet);
    expect(walletDopo).toEqual(walletPrima);
    expect(walletDopo.saldo).toBe(1000);
    expect(await statoStallo(26)).toBe("NON_DISPONIBILE");
  });

  // --- Tempo disponibile sotto il minimo ---

  it("RF_SOSTA_2 · TF-PRO-17 · oltre il massimo con meno di 15 minuti disponibili → DURATA_OLTRE_IL_MASSIMO, tempoDisponibile 10", async () => {
    const p = await automobilista("17");
    const s = await sosta(p, 29, { avvio: "09:30", scadenza: "13:20" });
    const errore = await prolungamentoRifiutato(p, s, 29, 15, "DURATA_OLTRE_IL_MASSIMO", {
      stato: "ATTIVA",
      scadenza: "13:20",
      statoStallo: "NON_DISPONIBILE",
    });
    expect(errore.tempoDisponibile).toBe(10);
  });

  // --- Messaggio con il tempo disponibile ---

  it("RF_SOSTA_2 · TF-PRO-18 · stallo rosa, +61 oltre il massimo (120) → DURATA_OLTRE_IL_MASSIMO, tempoDisponibile 60 nel messaggio", async () => {
    const p = await automobilista("18");
    const s = await sosta(p, 4);
    const errore = await prolungamentoRifiutato(p, s, 4, 61, "DURATA_OLTRE_IL_MASSIMO", {
      stato: "ATTIVA",
      scadenza: "10:30",
      statoStallo: "NON_DISPONIBILE",
    });
    expect(errore.tempoDisponibile).toBe(60);
    expect(errore.message).toBe(
      "Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 60 minuti.",
    );
  });

  it("RF_SOSTA_2 · TF-PRO-19 · +15 con 10 minuti disponibili → DURATA_OLTRE_IL_MASSIMO, messaggio di sosta non più prolungabile", async () => {
    const p = await automobilista("19");
    await portaAOccupato(27);
    const s = await sosta(p, 27, { avvio: "09:30", scadenza: "11:20" });
    const errore = await prolungamentoRifiutato(p, s, 27, 15, "DURATA_OLTRE_IL_MASSIMO", {
      stato: "ATTIVA",
      scadenza: "11:20",
      statoStallo: "NON_DISPONIBILE",
    });
    expect(errore.tempoDisponibile).toBe(10);
    expect(errore.message).toBe(
      "La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo.",
    );
  });
});
