import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  annullaTransazioneDiTest,
  chiudiDatabaseDiTest,
  iniziaTransazioneDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../test/databaseDiTest";
import { interroga } from "./esecutore";
import { istanteDelDatabase } from "./istante";

// Test frame TF-BASE-48 e 49 di docs/test/cp_persistenza_base.md §7 (OMP-48): istante del database
// letto fuori transazione (pool) e dentro una transazione (client), annullata alla fine.

describe("OMP-48 · TCS base della persistenza · istante del database", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  it("NRF_PER_3 · TF-BASE-48 · istanteDelDatabase(pool) due volte di seguito → due Date valide, la seconda non precede la prima", async () => {
    const primo = await istanteDelDatabase(poolDiTest());
    const secondo = await istanteDelDatabase(poolDiTest());

    expect(primo).toBeInstanceOf(Date);
    expect(secondo).toBeInstanceOf(Date);
    expect(Number.isNaN(primo.getTime())).toBe(false);
    expect(Number.isNaN(secondo.getTime())).toBe(false);
    expect(secondo.getTime()).toBeGreaterThanOrEqual(primo.getTime());
  });

  it("ISSUE_27 · TF-BASE-49 · istanteDelDatabase(client) due volte nella stessa transazione con pg_sleep(0.05) in mezzo → istanti uguali", async () => {
    const client = await iniziaTransazioneDiTest();
    try {
      const primo = await istanteDelDatabase(client);
      await interroga(client, "SELECT pg_sleep(0.05)");
      const secondo = await istanteDelDatabase(client);

      expect(primo).toBeInstanceOf(Date);
      expect(Number.isNaN(primo.getTime())).toBe(false);
      expect(secondo.getTime()).toBe(primo.getTime());
    } finally {
      await annullaTransazioneDiTest();
    }
  });
});
