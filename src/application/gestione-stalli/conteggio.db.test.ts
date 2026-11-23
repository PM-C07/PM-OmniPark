import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { creaEnteDiProva } from "../../persistence/test/datiDiProva";
import {
  creaFacadeGestioneStalli,
  ErroreGestioneStalli,
  type CodiceErroreGestioneStalli,
  type FacadeGestioneStalli,
} from "./facade";

// Test frame TF-CON-01…04 di docs/test/cp_conteggio.md (OMP-43).

const ENTE_GRAGNANO = 1;
const ENTE_BARONISSI = 3;
const ENTE_INESISTENTE = 999999;

describe("OMP-43 · cp_conteggio", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  function facade(): FacadeGestioneStalli {
    return creaFacadeGestioneStalli({ pool: poolDiTest() });
  }

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

  it("RF_ADM_1 · TF-CON-01 · ente con stalli in più aree (Gragnano, anche Sconosciuti) → 21", async () => {
    expect(await facade().contaStalliGestiti(ENTE_GRAGNANO)).toBe(21);
  });

  it("RF_ADM_1 · TF-CON-02 · ente con stalli in una sola area (Baronissi) → 3", async () => {
    expect(await facade().contaStalliGestiti(ENTE_BARONISSI)).toBe(3);
  });

  it("RF_ADM_1 · TF-CON-03 · ente senza stalli → 0", async () => {
    const ente = await creaEnteDiProva(poolDiTest(), "Ente di prova senza stalli");

    expect(await facade().contaStalliGestiti(ente)).toBe(0);
  });

  it("RF_ADM_1 · TF-CON-04 · ente inesistente → ENTE_INESISTENTE", async () => {
    await rifiutato(facade().contaStalliGestiti(ENTE_INESISTENTE), "ENTE_INESISTENTE");
  });
});
