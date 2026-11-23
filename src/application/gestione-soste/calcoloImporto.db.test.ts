import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeWallet } from "../wallet/facade";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeGestioneSoste,
  ErroreGestioneSoste,
  type CodiceErroreGestioneSoste,
  type FacadeGestioneSoste,
  type ImportoDellaSosta,
} from "./facade";

// Test frame TF-CAL-01…18 di docs/test/cp_calcoloImporto.md (OMP-45).

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const INESISTENTE = 999999;

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-45 · cp_calcoloImporto", () => {
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
      wallet: creaFacadeWallet({
        pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
        pool,
        orologio,
      }),
      pool,
      orologio,
    });
  }

  // --- Verifiche ---

  function verifica(
    risultato: ImportoDellaSosta,
    importo: number,
    pagamento: "PAGATA" | "GRATUITA",
    scadenza?: string,
  ): void {
    expect(risultato.importo).toBe(importo);
    expect(risultato.pagamento).toBe(pagamento);
    if (scadenza !== undefined) {
      expect(risultato.orarioDiScadenza.getTime()).toBe(ora(scadenza).getTime());
    }
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

  // --- Tipo di stallo × durata ---

  it("RF_WALLET_2 · TF-CAL-01 · a pagamento, 15 minuti, importo esatto → 25, PAGATA, scadenza 10:15", async () => {
    verifica(await facade().calcolaImporto(5, 15), 25, "PAGATA", "10:15");
  });

  it("RF_WALLET_2 · TF-CAL-02 · a pagamento, durata intermedia → 225, PAGATA, scadenza 11:30", async () => {
    verifica(await facade().calcolaImporto(16, 90), 225, "PAGATA", "11:30");
  });

  it("RF_SOSTA_1 · TF-CAL-03 · a pagamento, durata massima → 450, PAGATA, scadenza 13:00", async () => {
    verifica(await facade().calcolaImporto(16, 180), 450, "PAGATA", "13:00");
  });

  it("VD_10 · TF-CAL-04 · disabili, 15 minuti → 0, GRATUITA, scadenza 10:15", async () => {
    verifica(await facade().calcolaImporto(14, 15), 0, "GRATUITA", "10:15");
  });

  it("VD_10 · TF-CAL-05 · disabili, durata intermedia → 0, GRATUITA, scadenza 11:30", async () => {
    verifica(await facade().calcolaImporto(14, 90), 0, "GRATUITA", "11:30");
  });

  it("VD_10 · TF-CAL-06 · disabili, durata massima → 0, GRATUITA, scadenza 13:00", async () => {
    verifica(await facade().calcolaImporto(14, 180), 0, "GRATUITA", "13:00");
  });

  it("VD_10 · TF-CAL-07 · rosa, 15 minuti → 25, PAGATA, scadenza 10:15", async () => {
    verifica(await facade().calcolaImporto(4, 15), 25, "PAGATA", "10:15");
  });

  it("VD_10 · TF-CAL-08 · rosa, durata intermedia → 225, PAGATA, scadenza 11:30", async () => {
    verifica(await facade().calcolaImporto(15, 90), 225, "PAGATA", "11:30");
  });

  it("VD_10 · TF-CAL-09 · rosa, durata massima → 450, PAGATA, scadenza 13:00", async () => {
    verifica(await facade().calcolaImporto(15, 180), 450, "PAGATA", "13:00");
  });

  it("RF_SOSTA_1 · TF-CAL-10 · a pagamento, massima della tariffa 4 → 320, PAGATA, scadenza 14:00", async () => {
    verifica(await facade().calcolaImporto(28, 240), 320, "PAGATA", "14:00");
  });

  // --- Arrotondamento [single] ---

  it("ISSUE_9 · TF-CAL-11 · 150 × 15 / 60 = 37,5, metà esatta → 38, PAGATA", async () => {
    verifica(await facade().calcolaImporto(16, 15), 38, "PAGATA");
  });

  it("ISSUE_9 · TF-CAL-12 · 80 × 20 / 60 = 26,67, per eccesso → 27, PAGATA", async () => {
    verifica(await facade().calcolaImporto(28, 20), 27, "PAGATA");
  });

  it("ISSUE_9 · TF-CAL-13 · 80 × 25 / 60 = 33,33, per difetto → 33, PAGATA", async () => {
    verifica(await facade().calcolaImporto(28, 25), 33, "PAGATA");
  });

  // --- Errori ---

  it("ISSUE_9 · TF-CAL-14 · durata di 14 minuti, sotto il minimo → DURATA_NON_VALIDA", async () => {
    await rifiutato(facade().calcolaImporto(16, 14), "DURATA_NON_VALIDA");
  });

  it("RF_SOSTA_1 · TF-CAL-15 · durata oltre la massima della tariffa → DURATA_NON_VALIDA", async () => {
    await rifiutato(facade().calcolaImporto(16, 181), "DURATA_NON_VALIDA");
  });

  it("VD_9 · TF-CAL-16 · disabili oltre la durata massima → DURATA_NON_VALIDA", async () => {
    await rifiutato(facade().calcolaImporto(14, 181), "DURATA_NON_VALIDA");
  });

  it("ISSUE_9 · TF-CAL-17 · durata non intera → DURATA_NON_VALIDA", async () => {
    await rifiutato(facade().calcolaImporto(16, 30.5), "DURATA_NON_VALIDA");
  });

  it("RF_SOSTA_1 · TF-CAL-18 · stallo inesistente → STALLO_INESISTENTE", async () => {
    await rifiutato(facade().calcolaImporto(INESISTENTE, 60), "STALLO_INESISTENTE");
  });
});
