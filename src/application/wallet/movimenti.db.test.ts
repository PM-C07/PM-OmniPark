import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creaAutomobilista } from "../../persistence/accessoDati/utentiEntiVeicoli";
import { creaWallet, registraRicarica } from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import { calcolaHashPassword } from "../utenti-accessi/crittografia";
import {
  creaFacadeWallet,
  ErroreWallet,
  type FacadeWallet,
  type MovimentoDellaCronologia,
} from "./facade";

// Test frame TF-CRON-01…05 di docs/test/cp_movimenti.md (OMP-65).

const ISTANTE = new Date("2026-11-20T09:00:00+01:00");
const UN_MINUTO_MS = 60_000;
const MARCO_ROSSI = 8;
const AUTOMOBILISTA_INESISTENTE = 999999;

/** Movimento con la data in millisecondi, per confrontare le date con getTime(). */
type MovimentoConfrontabile = Omit<MovimentoDellaCronologia, "dataEOra"> & { dataEOra: number };

function confrontabile(movimento: MovimentoDellaCronologia): MovimentoConfrontabile {
  return { ...movimento, dataEOra: movimento.dataEOra.getTime() };
}

function istante(iso: string): number {
  return new Date(iso).getTime();
}

describe("OMP-65 · cp_movimenti", () => {
  let facade: FacadeWallet;
  let hashPassword: string;

  beforeAll(async () => {
    hashPassword = await calcolaHashPassword("parola-di-prova-lunga");
  });

  beforeEach(async () => {
    await preparaDatabaseDiTest();
    facade = creaFacadeWallet({
      pagamento: new SimulatorePagamento({
        sogliaMassima: 10000,
        automobilistiDiProva: [],
        latenzaMs: 0,
      }),
      pool: poolDiTest(),
      orologio: { adesso: () => ISTANTE },
    });
  });

  afterAll(async () => {
    await preparaDatabaseDiTest();
    await chiudiDatabaseDiTest();
  });

  /** Automobilista nuovo (§3): nasce con il wallet e senza movimenti. */
  async function creaProfiloConWallet(
    email: string,
  ): Promise<{ automobilista: number; wallet: number }> {
    const automobilista = await creaAutomobilista(poolDiTest(), { email, hashPassword });
    const wallet = await creaWallet(poolDiTest(), automobilista);
    return { automobilista, wallet };
  }

  /** Ricarica di preparazione (§3), con l'importo e l'istante indicati. */
  async function ricarica(wallet: number, importo: number, dataEOra: Date): Promise<void> {
    await registraRicarica(poolDiTest(), { walletVirtualeId: wallet, importo, dataEOra });
  }

  it("RF_WALLET_3 · TF-CRON-01 · movimenti di Marco Rossi con ricariche, addebiti e un prolungamento → 6 movimenti dal più recente con sosta, targa e stallo degli addebiti", async () => {
    const ottenuti = await facade.movimenti(MARCO_ROSSI);

    expect(ottenuti.map(confrontabile)).toEqual([
      {
        id: 6,
        tipoDiMovimento: "ADDEBITO",
        importo: 300,
        dataEOra: istante("2026-11-09T16:00:00+01:00"),
        sosta: { id: 9, targa: "MN234PQ", numeroStallo: 102, area: "Via Roma" },
      },
      {
        id: 5,
        tipoDiMovimento: "ADDEBITO",
        importo: 150,
        dataEOra: istante("2026-11-02T10:20:00+01:00"),
        sosta: { id: 2, targa: "MN234PQ", numeroStallo: 102, area: "Via Roma" },
      },
      {
        id: 4,
        tipoDiMovimento: "RICARICA",
        importo: 1000,
        dataEOra: istante("2026-11-02T10:18:00+01:00"),
        sosta: null,
      },
      {
        id: 3,
        tipoDiMovimento: "ADDEBITO",
        importo: 300,
        dataEOra: istante("2026-11-02T08:42:00+01:00"),
        sosta: { id: 2, targa: "MN234PQ", numeroStallo: 102, area: "Via Roma" },
      },
      {
        id: 2,
        tipoDiMovimento: "ADDEBITO",
        importo: 150,
        dataEOra: istante("2026-10-31T09:00:00+01:00"),
        sosta: { id: 1, targa: "MN234PQ", numeroStallo: 101, area: "Via Roma" },
      },
      {
        id: 1,
        tipoDiMovimento: "RICARICA",
        importo: 500,
        dataEOra: istante("2026-10-31T08:30:00+01:00"),
        sosta: null,
      },
    ]);
  });

  it("RF_WALLET_3 · TF-CRON-02 · wallet senza movimenti → elenco vuoto", async () => {
    const { automobilista } = await creaProfiloConWallet("movimenti.tf02@test.example");

    expect(await facade.movimenti(automobilista)).toEqual([]);
  });

  it("ISSUE_45 · TF-CRON-03 · automobilista nuovo con una ricarica e movimenti di altri wallet nel dataset → solo la sua ricarica", async () => {
    const { automobilista, wallet } = await creaProfiloConWallet("movimenti.tf03@test.example");
    await ricarica(wallet, 1000, new Date("2026-11-20T09:00:00+01:00"));

    const ottenuti = await facade.movimenti(automobilista);

    expect(ottenuti).toHaveLength(1);
    expect(confrontabile(ottenuti[0])).toEqual({
      id: expect.any(Number),
      tipoDiMovimento: "RICARICA",
      importo: 1000,
      dataEOra: istante("2026-11-20T09:00:00+01:00"),
      sosta: null,
    });
  });

  it("ISSUE_45 · TF-CRON-04 · 51 ricariche → i 50 movimenti più recenti, senza la ricarica delle 09:00", async () => {
    const { automobilista, wallet } = await creaProfiloConWallet("movimenti.tf04@test.example");
    const base = new Date("2026-11-20T09:00:00+01:00").getTime();
    for (let i = 0; i <= 50; i++) {
      await ricarica(wallet, 500, new Date(base + i * UN_MINUTO_MS));
    }

    const ottenuti = await facade.movimenti(automobilista);

    expect(ottenuti).toHaveLength(50);
    const date = ottenuti.map((m) => m.dataEOra.getTime());
    expect(date[0]).toBe(istante("2026-11-20T09:50:00+01:00"));
    expect(date[49]).toBe(istante("2026-11-20T09:01:00+01:00"));
    for (let i = 1; i < date.length; i++) {
      expect(date[i]).toBeLessThan(date[i - 1]);
    }
    expect(date).not.toContain(base);
    for (const movimento of ottenuti) {
      expect(movimento.tipoDiMovimento).toBe("RICARICA");
      expect(movimento.importo).toBe(500);
      expect(movimento.sosta).toBeNull();
    }
  });

  it("RF_WALLET_3 · TF-CRON-05 · automobilista inesistente → WALLET_NON_TROVATO", async () => {
    let ottenuto: unknown;
    try {
      await facade.movimenti(AUTOMOBILISTA_INESISTENTE);
    } catch (errore) {
      ottenuto = errore;
    }

    expect(ottenuto).toBeInstanceOf(ErroreWallet);
    expect((ottenuto as ErroreWallet).codice).toBe("WALLET_NON_TROVATO");
  });
});
