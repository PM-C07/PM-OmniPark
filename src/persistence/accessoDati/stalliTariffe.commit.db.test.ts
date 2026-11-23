import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chiudiDatabaseDiTest, poolDiTest, preparaDatabaseDiTest } from "../test/databaseDiTest";
import {
  bloccaStallo,
  impostaStatoStalloSe,
  registraRilevazione,
  trovaStallo,
} from "./stalliTariffe";

// Test frame TF-STA-40 di docs/test/cp_persistenza_stalli_tariffe.md (OMP-43): una rilevazione
// che libera lo stallo e un aggiornamento condizionato concorrente, con commit veri.

const STALLO = 17;
const ISTANTE_DI_PROVA = new Date("2026-11-20T09:00:00+01:00");
const ATTESA_MS = 300;

const IN_ATTESA = Symbol("in attesa");

function attendi(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

describe("OMP-43 · TCS persistenza · aggiornamento condizionato con commit", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await preparaDatabaseDiTest();
    await chiudiDatabaseDiTest();
  });

  it("RF_SOSTA_6 · TF-STA-40 · liberazione concorrente confermata prima dell'aggiornamento condizionato → B false, stallo 17 LIBERO con NESSUN_VEICOLO", async () => {
    const pool = poolDiTest();
    let a: PoolClient | undefined;
    let b: PoolClient | undefined;
    try {
      a = await pool.connect();
      b = await pool.connect();
      const clientA = a;
      const clientB = b;

      // A: blocca lo stallo e registra la liberazione senza confermare.
      await clientA.query("BEGIN");
      const bloccato = await bloccaStallo(clientA, STALLO);
      expect(bloccato).toMatchObject({ stato: "OCCUPATO" });
      expect(
        await registraRilevazione(clientA, STALLO, {
          occupazioneRilevata: "NESSUN_VEICOLO",
          dataEOra: ISTANTE_DI_PROVA,
          stato: "LIBERO",
        }),
      ).toBe(true);

      // B: aggiornamento condizionato, che deve restare in attesa del blocco di A.
      await clientB.query("BEGIN");
      const esitoB = impostaStatoStalloSe(clientB, STALLO, "OCCUPATO", "NON_DISPONIBILE");
      esitoB.catch(() => undefined);
      const primaDelCommit = await Promise.race([esitoB, attendi(ATTESA_MS).then(() => IN_ATTESA)]);
      expect(primaDelCommit).toBe(IN_ATTESA);

      await clientA.query("COMMIT");
      expect(await esitoB).toBe(false);
      await clientB.query("COMMIT");

      const stallo = await trovaStallo(pool, STALLO);
      expect(stallo).toMatchObject({ stato: "LIBERO", occupazioneRilevata: "NESSUN_VEICOLO" });
    } finally {
      for (const client of [a, b]) {
        if (client) {
          await client.query("ROLLBACK").catch(() => undefined);
          client.release();
        }
      }
    }
  });
});
