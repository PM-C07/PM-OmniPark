import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trovaStallo, type OccupazioneRilevata } from "../../persistence/accessoDati/stalliTariffe";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione";
import {
  creaSosta,
  impostaSostaScaduta,
  terminaSosteScaduteDelloStallo,
  trovaSosta,
} from "../../persistence/accessoDati/walletSoste";
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

// Test frame TF-SOS-01…15 di docs/test/cp_statoPerLaSosta.md (OMP-43).

const ISTANTE_PROVA = new Date("2026-11-20T09:00:00+01:00");
const AVVIO_SOSTA = new Date("2026-11-20T08:00:00+01:00");
const SCADENZA_SOSTA = new Date("2026-11-20T09:00:00+01:00");
const STALLO_INESISTENTE = 999999;

type Notifica = { etichetta: string; evento: StalloLiberato };

describe("OMP-43 · cp_statoPerLaSosta", () => {
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
    occupazione?: OccupazioneRilevata,
  ): Promise<void> {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    expect(stallo!.stato).toBe(stato);
    if (occupazione !== undefined) {
      expect(stallo!.occupazioneRilevata).toBe(occupazione);
    }
  }

  // Stallo NON_DISPONIBILE con nessun veicolo (§3).
  async function nonDisponibileSenzaVeicolo(id: number): Promise<void> {
    const preparazione = facadeCon([]);
    await preparazione.impostaNonDisponibile(id);
    const stato = await preparazione.registraRilevazione({
      stallo: id,
      presenza: false,
      dataOra: ISTANTE_PROVA,
    });
    expect(stato).toBe("NON_DISPONIBILE");
  }

  // --- Test frame ---

  it("RF_SOSTA_1 · TF-SOS-01 · stato e tariffa di uno stallo esistente → stallo 14 Disabili, Libero, tariffa 1", async () => {
    const facade = facadeCon([registro([])]);

    const risultato = await facade.statoETariffa(14);

    expect(risultato).toEqual({
      stallo: 14,
      tipoDiStallo: "DISABILI",
      stato: "LIBERO",
      tariffa: {
        costoOrario: 150,
        orarioInizioVigenza: "08:00:00",
        orarioFineVigenza: "20:00:00",
        durataMassima: 180,
      },
    });
  });

  it("RF_SOSTA_1 · TF-SOS-02 · stato e tariffa di uno stallo inesistente → STALLO_INESISTENTE", async () => {
    const facade = facadeCon([registro([])]);

    await rifiutato(facade.statoETariffa(STALLO_INESISTENTE), "STALLO_INESISTENTE");
  });

  it("RF_SOSTA_6 · TF-SOS-03 · Non disponibile da Occupato → Non disponibile, occupazione invariata, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await facade.impostaNonDisponibile(17);

    await verificaStallo(17, "NON_DISPONIBILE", "VEICOLO_PRESENTE");
    expect(notifiche).toEqual([]);
  });

  it("RF_SOSTA_1 · TF-SOS-04 · Non disponibile da Libero → STALLO_NON_OCCUPATO", async () => {
    const facade = facadeCon([registro([])]);

    await rifiutato(facade.impostaNonDisponibile(16), "STALLO_NON_OCCUPATO");
    await verificaStallo(16, "LIBERO");
  });

  it("RF_SOSTA_1 · TF-SOS-05 · Non disponibile da già Non disponibile → STALLO_NON_OCCUPATO", async () => {
    const facade = facadeCon([registro([])]);
    await facade.impostaNonDisponibile(18);

    await rifiutato(facade.impostaNonDisponibile(18), "STALLO_NON_OCCUPATO");
    await verificaStallo(18, "NON_DISPONIBILE");
  });

  it("RF_SOSTA_1 · TF-SOS-06 · Non disponibile da Sconosciuto → STALLO_NON_OCCUPATO", async () => {
    const facade = facadeCon([registro([])]);

    await rifiutato(facade.impostaNonDisponibile(13), "STALLO_NON_OCCUPATO");
    await verificaStallo(13, "SCONOSCIUTO");
  });

  it("RF_SOSTA_1 · TF-SOS-07 · Non disponibile su stallo inesistente → STALLO_INESISTENTE", async () => {
    const facade = facadeCon([registro([])]);

    await rifiutato(facade.impostaNonDisponibile(STALLO_INESISTENTE), "STALLO_INESISTENTE");
  });

  it("ISSUE_7 · TF-SOS-08 · Non disponibile con l'esecutore di una transazione confermata → Non disponibile dentro e dopo il commit", async () => {
    const facade = facadeCon([registro([])]);

    const statoDentro = await eseguiInTransazione(async (client) => {
      await facade.impostaNonDisponibile(19, client);
      const letto = await facade.statoETariffa(19, client);
      return letto.stato;
    }, poolDiTest());

    expect(statoDentro).toBe("NON_DISPONIBILE");
    await verificaStallo(19, "NON_DISPONIBILE");
  });

  it("ISSUE_7 · TF-SOS-09 · Non disponibile con l'esecutore di una transazione annullata → annulla rilanciato, stallo resta Occupato", async () => {
    const facade = facadeCon([registro([])]);

    let ottenuto: unknown;
    try {
      await eseguiInTransazione(async (client) => {
        await facade.impostaNonDisponibile(20, client);
        throw new Error("annulla");
      }, poolDiTest());
    } catch (errore) {
      ottenuto = errore;
    }

    expect(ottenuto).toBeInstanceOf(Error);
    expect((ottenuto as Error).message).toBe("annulla");
    await verificaStallo(20, "OCCUPATO");
  });

  it("RF_SOSTA_6 · TF-SOS-10 · ripristino da Non disponibile con veicolo presente → Occupato, nessuna notifica", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);
    await facade.impostaNonDisponibile(21);

    const stato = await facade.ripristinaStatoRilevato(21);

    expect(stato).toBe("OCCUPATO");
    await verificaStallo(21, "OCCUPATO", "VEICOLO_PRESENTE");
    expect(notifiche).toEqual([]);
  });

  it("RF_SOSTA_6 · TF-SOS-11 · ripristino da Non disponibile con nessun veicolo → Libero e una notifica", async () => {
    await nonDisponibileSenzaVeicolo(23);
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    const stato = await facade.ripristinaStatoRilevato(23);

    expect(stato).toBe("LIBERO");
    await verificaStallo(23, "LIBERO", "NESSUN_VEICOLO");
    expect(notifiche).toEqual([{ etichetta: "registro", evento: { stallo: 23 } }]);
  });

  it("RF_SOSTA_6 · TF-SOS-12 · ripristino da Occupato → STALLO_NON_IMPEGNATO", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(facade.ripristinaStatoRilevato(26), "STALLO_NON_IMPEGNATO");
    await verificaStallo(26, "OCCUPATO");
    expect(notifiche).toEqual([]);
  });

  it("RF_SOSTA_6 · TF-SOS-13 · ripristino su stallo inesistente → STALLO_INESISTENTE", async () => {
    const notifiche: Notifica[] = [];
    const facade = facadeCon([registro(notifiche)]);

    await rifiutato(facade.ripristinaStatoRilevato(STALLO_INESISTENTE), "STALLO_INESISTENTE");
    expect(notifiche).toEqual([]);
  });

  it("ISSUE_7 · TF-SOS-14 · ripristino con registro poi osservatore guasto → errore del guasto, stallo resta Non disponibile", async () => {
    await nonDisponibileSenzaVeicolo(29);
    const facade = facadeCon([registro([]), guasto()]);

    await erroreDelGuasto(facade.ripristinaStatoRilevato(29));
    await verificaStallo(29, "NON_DISPONIBILE", "NESSUN_VEICOLO");
  });

  it("VD_11 · TF-SOS-15 · scadenza con Gestione soste nella transazione esterna → Libero, sosta Terminata", async () => {
    const sostaId = await creaSosta(poolDiTest(), {
      automobilistaId: 7,
      veicoloId: 1,
      stalloId: 3,
      orarioDiAvvio: AVVIO_SOSTA,
      orarioDiScadenza: SCADENZA_SOSTA,
      pagamento: "PAGATA",
    });
    await nonDisponibileSenzaVeicolo(3);
    const facade = facadeCon([gestioneSoste()]);

    const stato = await eseguiInTransazione(async (client) => {
      await impostaSostaScaduta(client, sostaId);
      return facade.ripristinaStatoRilevato(3, client);
    }, poolDiTest());

    expect(stato).toBe("LIBERO");
    await verificaStallo(3, "LIBERO");
    const sosta = await trovaSosta(poolDiTest(), sostaId);
    expect(sosta?.stato).toBe("TERMINATA");
  });
});
