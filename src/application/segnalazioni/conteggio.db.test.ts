import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeWallet } from "../wallet/facade";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeSegnalazioni,
  ErroreSegnalazioni,
  type CodiceErroreSegnalazioni,
  type FacadeSegnalazioni,
} from "./facade";

// Test frame TF-PAN-10, 11 di docs/test/cp_panoramicaEnti.md (OMP-62).

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const ENTE_GRAGNANO = 1;
const INESISTENTE = 999999;

describe("OMP-62 · cp_panoramicaEnti · contaSegnalazioniAperte", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  function facade(): FacadeSegnalazioni {
    const pool = poolDiTest();
    const wallet = creaFacadeWallet({
      pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
      pool,
      orologio,
    });
    const gestioneSoste = creaFacadeGestioneSoste({ wallet, pool, orologio });
    return creaFacadeSegnalazioni({ gestioneSoste, pool, orologio });
  }

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: CodiceErroreSegnalazioni,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreSegnalazioni);
    expect((ottenuto as ErroreSegnalazioni).codice).toBe(codice);
  }

  it("RF_ADM_1 · TF-PAN-10 · ente con segnalazioni Aperta e Presa in carico → 4", async () => {
    expect(await facade().contaSegnalazioniAperte(ENTE_GRAGNANO)).toBe(4);
  });

  it("RF_ADM_1 · TF-PAN-11 · ente inesistente → ENTE_INESISTENTE", async () => {
    await rifiutato(facade().contaSegnalazioniAperte(INESISTENTE), "ENTE_INESISTENTE");
  });
});
