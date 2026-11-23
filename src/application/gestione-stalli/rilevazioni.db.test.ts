import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trovaStallo, type OccupazioneRilevata } from "../../persistence/accessoDati/stalliTariffe";
import {
  creaSosta,
  impostaSostaScaduta,
  terminaSosteScaduteDelloStallo,
  trovaSosta,
} from "../../persistence/accessoDati/walletSoste";
import { creaPool } from "../../persistence/db";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import {
  creaFacadeGestioneStalli,
  ErroreGestioneStalli,
  type CodiceErroreGestioneStalli,
  type FacadeGestioneStalli,
  type OsservatoreStalli,
  type StalloLiberato,
  type StatoStallo,
} from "./facade";

// Test frame TF-RIL-01…24 di docs/test/cp_rilevazioni.md (OMP-43).

const ISTANTE_DATASET = new Date("2026-11-15T08:00:00+01:00");
const ISTANTE_PROVA = new Date("2026-11-20T09:00:00+01:00");
const ISTANTE_SOSTA = new Date("2026-11-20T10:20:00+01:00");
const AVVIO_SOSTA = new Date("2026-11-20T09:00:00+01:00");
const SCADENZA_SOSTA = new Date("2026-11-20T10:00:00+01:00");
const STALLO_INESISTENTE = 999999;

type Notifica = { etichetta: string; evento: StalloLiberato };

describe("OMP-43 · cp_rilevazioni", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Osservatori di prova (§3) ---

  function registro(notifiche: Notifica[], etichetta = "registro"): OsservatoreStalli {
    return {
      async terminaSosta(evento: StalloLiberato): Promise<void> {
        notifiche.push({ etichetta, evento: { ...evento } });
      },
    };
  }

  function lettore(letture: (StatoStallo | null)[]): OsservatoreStalli {
    return {
      async terminaSosta(evento: StalloLiberato, esecutore: PoolClient): Promise<void> {
        const stallo = await trovaStallo(esecutore, evento.stallo);
        letture.push(stallo ? stallo.stato : null);
      },
    };
  }

  function gestioneSoste(): OsservatoreStalli {
    return {
      async terminaSosta(evento: StalloLiberato, esecutore: PoolClient): Promise<void> {
        await terminaSosteScaduteDelloStallo(esecutore, evento.stallo);
      },
    };
  }

  function guasto(): OsservatoreStalli {
    return {
      async terminaSosta(): Promise<void> {
        throw new Error("osservatore guasto");
      },
    };
  }

  function facadeCon(osservatori: readonly OsservatoreStalli[]): FacadeGestioneStalli {
    return creaFacadeGestioneStalli({ pool: poolDiTest(), osservatori });
  }

  // --- Verifiche ---

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: CodiceErroreGestioneStalli,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreGestioneStalli);
    expect((ottenuto as ErroreGestioneStalli).codice).toBe(codice);
  }

  async function erroreDelGuasto(operazione: Promise<unknown>): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(Error);
    expect(ottenuto).not.toBeInstanceOf(ErroreGestioneStalli);
    expect((ottenuto as Error).message).toBe("osservatore guasto");
  }

  async function verificaStallo(
    id: number,
    stato: StatoStallo,
    occupazione: OccupazioneRilevata,
    ultimaRilevazione: Date,
  ): Promise<void> {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    expect(stallo!.stato).toBe(stato);
    expect(stallo!.occupazioneRilevata).toBe(occupazione);
    expect(stallo!.dataEOraUltimaRilevazione?.getTime()).toBe(ultimaRilevazione.getTime());
  }

  async function sostaScadutaSu(
    stalloId: number,
    automobilistaId: number,
    veicoloId: number,
  ): Promise<number> {
    const id = await creaSosta(poolDiTest(), {
      automobilistaId,
      veicoloId,
      stalloId,
      orarioDiAvvio: AVVIO_SOSTA,
      orarioDiScadenza: SCADENZA_SOSTA,
      pagamento: "PAGATA",
    });
    expect(await impostaSostaScaduta(poolDiTest(), id)).toBe(true);
    return id;
  }

  // --- Test frame ---

  it("RF_IOT_1 · TF-RIL-01 · stallo Libero, veicolo presente → Occupato, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.registraRilevazione({
      stallo: 1,
      presenza: true,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("OCCUPATO");
    await verificaStallo(1, "OCCUPATO", "VEICOLO_PRESENTE", ISTANTE_PROVA);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-02 · stallo Libero, nessun veicolo → Libero, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.registraRilevazione({
      stallo: 2,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("LIBERO");
    await verificaStallo(2, "LIBERO", "NESSUN_VEICOLO", ISTANTE_PROVA);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-03 · stallo Occupato, veicolo presente → Occupato, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.registraRilevazione({
      stallo: 3,
      presenza: true,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("OCCUPATO");
    await verificaStallo(3, "OCCUPATO", "VEICOLO_PRESENTE", ISTANTE_PROVA);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-04 · stallo Occupato, nessun veicolo → Libero e notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.registraRilevazione({
      stallo: 4,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("LIBERO");
    await verificaStallo(4, "LIBERO", "NESSUN_VEICOLO", ISTANTE_PROVA);
    expect(notifiche).toEqual([{ etichetta: "registro", evento: { stallo: 4 } }]);
  });

  it("RF_SOSTA_6 · TF-RIL-05 · stallo Non disponibile, veicolo presente → resta Non disponibile, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);
    await facade.impostaNonDisponibile(7);

    const stato = await facade.registraRilevazione({
      stallo: 7,
      presenza: true,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("NON_DISPONIBILE");
    await verificaStallo(7, "NON_DISPONIBILE", "VEICOLO_PRESENTE", ISTANTE_PROVA);
    expect(notifiche).toEqual([]);
  });

  it("VD_20 · TF-RIL-06 · stallo Non disponibile, nessun veicolo → resta Non disponibile, occupazione conservata, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);
    await facade.impostaNonDisponibile(8);

    const stato = await facade.registraRilevazione({
      stallo: 8,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("NON_DISPONIBILE");
    await verificaStallo(8, "NON_DISPONIBILE", "NESSUN_VEICOLO", ISTANTE_PROVA);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-07 · stallo Sconosciuto, veicolo presente → Occupato, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.registraRilevazione({
      stallo: 13,
      presenza: true,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("OCCUPATO");
    await verificaStallo(13, "OCCUPATO", "VEICOLO_PRESENTE", ISTANTE_PROVA);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-08 · stallo Sconosciuto mai rilevato, nessun veicolo → Libero e notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.registraRilevazione({
      stallo: 25,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("LIBERO");
    await verificaStallo(25, "LIBERO", "NESSUN_VEICOLO", ISTANTE_PROVA);
    expect(notifiche).toEqual([{ etichetta: "registro", evento: { stallo: 25 } }]);
  });

  it("RF_IOT_1 · TF-RIL-09 · stallo inesistente → STALLO_INESISTENTE", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(
      facade.registraRilevazione({
        stallo: STALLO_INESISTENTE,
        presenza: true,
        dataOra: ISTANTE_PROVA,
      }),
      "STALLO_INESISTENTE",
    );
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-10 · stallo mancante → RILEVAZIONE_INCOMPLETA", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(
      facade.registraRilevazione({ presenza: true, dataOra: ISTANTE_PROVA }),
      "RILEVAZIONE_INCOMPLETA",
    );
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-11 · presenza mancante → RILEVAZIONE_INCOMPLETA", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(
      facade.registraRilevazione({ stallo: 5, presenza: null, dataOra: ISTANTE_PROVA }),
      "RILEVAZIONE_INCOMPLETA",
    );
    await verificaStallo(5, "LIBERO", "NESSUN_VEICOLO", ISTANTE_DATASET);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-12 · data e ora mancante → RILEVAZIONE_INCOMPLETA", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(
      facade.registraRilevazione({ stallo: 5, presenza: true }),
      "RILEVAZIONE_INCOMPLETA",
    );
    await verificaStallo(5, "LIBERO", "NESSUN_VEICOLO", ISTANTE_DATASET);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-13 · data e ora non valida → RILEVAZIONE_INCOMPLETA", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(
      facade.registraRilevazione({ stallo: 5, presenza: true, dataOra: new Date(NaN) }),
      "RILEVAZIONE_INCOMPLETA",
    );
    await verificaStallo(5, "LIBERO", "NESSUN_VEICOLO", ISTANTE_DATASET);
    expect(notifiche).toEqual([]);
  });

  it("ISSUE_7 · TF-RIL-14 · data e ora precedente all'ultima rilevazione → RILEVAZIONE_SUPERATA", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(
      facade.registraRilevazione({
        stallo: 6,
        presenza: true,
        dataOra: new Date("2026-11-15T07:59:59+01:00"),
      }),
      "RILEVAZIONE_SUPERATA",
    );
    await verificaStallo(6, "LIBERO", "NESSUN_VEICOLO", ISTANTE_DATASET);
    expect(notifiche).toEqual([]);
  });

  it("ISSUE_7 · TF-RIL-15 · data e ora uguale all'ultima rilevazione → accettata, Occupato", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.registraRilevazione({
      stallo: 9,
      presenza: true,
      dataOra: new Date("2026-11-15T08:00:00+01:00"),
    });

    expect(stato).toBe("OCCUPATO");
    await verificaStallo(9, "OCCUPATO", "VEICOLO_PRESENTE", ISTANTE_DATASET);
  });

  it("ISSUE_7 · TF-RIL-16 · liberazione senza osservatori → Libero, senza errori", async () => {
    const facade = facadeCon([]);

    const stato = await facade.registraRilevazione({
      stallo: 11,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("LIBERO");
  });

  it("ISSUE_7 · TF-RIL-17 · liberazione con due osservatori → Libero, notificati in ordine", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche, "primo"), registro(notifiche, "secondo")]);

    const stato = await facade.registraRilevazione({
      stallo: 12,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("LIBERO");
    expect(notifiche).toEqual([
      { etichetta: "primo", evento: { stallo: 12 } },
      { etichetta: "secondo", evento: { stallo: 12 } },
    ]);
  });

  it("ISSUE_7 · TF-RIL-18 · osservatore guasto dopo il registro → errore del guasto, stallo invariato", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche), guasto()]);

    await erroreDelGuasto(
      facade.registraRilevazione({ stallo: 15, presenza: false, dataOra: ISTANTE_PROVA }),
    );
    await verificaStallo(15, "OCCUPATO", "VEICOLO_PRESENTE", ISTANTE_DATASET);
  });

  it("ISSUE_7 · TF-RIL-19 · osservatore lettore con l'esecutore ricevuto → Libero, legge Libero", async () => {
    const letture: (StatoStallo | null)[] = [];
    const facade = facadeCon([lettore(letture)]);

    const stato = await facade.registraRilevazione({
      stallo: 17,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });

    expect(stato).toBe("LIBERO");
    expect(letture).toEqual(["LIBERO"]);
  });

  it("VD_11 · TF-RIL-20 · liberazione con sosta Scaduta e Gestione soste → Libero, sosta Terminata", async () => {
    const sostaId = await sostaScadutaSu(18, 7, 1);
    const facade = facadeCon([gestioneSoste()]);

    const stato = await facade.registraRilevazione({
      stallo: 18,
      presenza: false,
      dataOra: ISTANTE_SOSTA,
    });

    expect(stato).toBe("LIBERO");
    const sosta = await trovaSosta(poolDiTest(), sostaId);
    expect(sosta?.stato).toBe("TERMINATA");
  });

  it("ISSUE_7 · TF-RIL-21 · Gestione soste poi guasto → errore del guasto, stallo invariato, sosta resta Scaduta", async () => {
    const sostaId = await sostaScadutaSu(19, 8, 3);
    const facade = facadeCon([gestioneSoste(), guasto()]);

    await erroreDelGuasto(
      facade.registraRilevazione({ stallo: 19, presenza: false, dataOra: ISTANTE_SOSTA }),
    );
    await verificaStallo(19, "OCCUPATO", "VEICOLO_PRESENTE", ISTANTE_DATASET);
    const sosta = await trovaSosta(poolDiTest(), sostaId);
    expect(sosta?.stato).toBe("SCADUTA");
  });

  it("RF_IOT_1 · TF-RIL-22 · presenza e data e ora mancanti insieme → RILEVAZIONE_INCOMPLETA", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(
      facade.registraRilevazione({ stallo: 5, presenza: null, dataOra: null }),
      "RILEVAZIONE_INCOMPLETA",
    );
    await verificaStallo(5, "LIBERO", "NESSUN_VEICOLO", ISTANTE_DATASET);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_1 · TF-RIL-23 · stallo 0 (non intero positivo) → STALLO_INESISTENTE senza query", async () => {
    const notifiche: Notifica[] = [];
    const pool = creaPool("postgresql://prova@127.0.0.1:1/omnipark_test");
    try {
      const facade = creaFacadeGestioneStalli({ pool, osservatori: [registro(notifiche)] });

      await rifiutato(
        facade.registraRilevazione({ stallo: 0, presenza: true, dataOra: ISTANTE_PROVA }),
        "STALLO_INESISTENTE",
      );
      expect(notifiche).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  it("RF_IOT_1 · TF-RIL-24 · stallo 1.5 (non intero positivo) → STALLO_INESISTENTE senza query", async () => {
    const notifiche: Notifica[] = [];
    const pool = creaPool("postgresql://prova@127.0.0.1:1/omnipark_test");
    try {
      const facade = creaFacadeGestioneStalli({ pool, osservatori: [registro(notifiche)] });

      await rifiutato(
        facade.registraRilevazione({ stallo: 1.5, presenza: true, dataOra: ISTANTE_PROVA }),
        "STALLO_INESISTENTE",
      );
      expect(notifiche).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
