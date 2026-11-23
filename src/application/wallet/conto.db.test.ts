import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  addebita as registraAddebito,
  creaSosta,
  creaWallet,
  registraRicarica,
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import { calcolaHashPassword } from "../utenti-accessi/crittografia";
import { creaFacadeWallet, ErroreWallet, type FacadeWallet } from "./facade";

// Test frame TF-01…04 di docs/test/cp_saldo.md (OMP-44).

const ISTANTE = new Date("2026-11-20T09:00:00+01:00");
const UN_ORA_DOPO = new Date("2026-11-20T10:00:00+01:00");
const STALLO = 16;
const AUTOMOBILISTA_INESISTENTE = 999999;

describe("OMP-44 · cp_saldo", () => {
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

  async function creaProfiloConWallet(
    email: string,
  ): Promise<{ automobilista: number; wallet: number }> {
    const automobilista = await creaAutomobilista(poolDiTest(), { email, hashPassword });
    const wallet = await creaWallet(poolDiTest(), automobilista);
    return { automobilista, wallet };
  }

  async function ricarica(wallet: number, importo: number): Promise<void> {
    await registraRicarica(poolDiTest(), {
      walletVirtualeId: wallet,
      importo,
      dataEOra: ISTANTE,
    });
  }

  it("RF_WALLET_1 · TF-01 · wallet presente senza movimenti → saldo 0", async () => {
    const { automobilista } = await creaProfiloConWallet("saldo.tf01@test.example");

    expect(await facade.saldo(automobilista)).toBe(0);
  });

  it("RF_WALLET_1 · TF-02 · wallet con sole ricariche → saldo uguale alla somma delle ricariche", async () => {
    const { automobilista, wallet } = await creaProfiloConWallet("saldo.tf02@test.example");
    await ricarica(wallet, 500);
    await ricarica(wallet, 2000);

    expect(await facade.saldo(automobilista)).toBe(2500);
  });

  it("RF_WALLET_1 · TF-03 · wallet con ricariche e addebiti → saldo uguale alle ricariche meno gli addebiti", async () => {
    const { automobilista, wallet } = await creaProfiloConWallet("saldo.tf03@test.example");
    const veicolo = await trovaOCreaVeicolo(poolDiTest(), "ZW301AA");
    await associaVeicolo(poolDiTest(), automobilista, veicolo);
    const sosta = await creaSosta(poolDiTest(), {
      automobilistaId: automobilista,
      veicoloId: veicolo,
      stalloId: STALLO,
      orarioDiAvvio: ISTANTE,
      orarioDiScadenza: UN_ORA_DOPO,
      pagamento: "PAGATA",
    });
    await ricarica(wallet, 1000);
    await ricarica(wallet, 500);
    await eseguiInTransazione(async (client) => {
      await registraAddebito(client, {
        walletVirtualeId: wallet,
        sostaId: sosta,
        importo: 300,
        dataEOra: ISTANTE,
      });
      await registraAddebito(client, {
        walletVirtualeId: wallet,
        sostaId: sosta,
        importo: 200,
        dataEOra: ISTANTE,
      });
    }, poolDiTest());

    expect(await facade.saldo(automobilista)).toBe(1000);
  });

  it("RF_WALLET_1 · TF-04 · automobilista inesistente → WALLET_NON_TROVATO", async () => {
    let ottenuto: unknown;
    try {
      await facade.saldo(AUTOMOBILISTA_INESISTENTE);
    } catch (errore) {
      ottenuto = errore;
    }

    expect(ottenuto).toBeInstanceOf(ErroreWallet);
    expect((ottenuto as ErroreWallet).codice).toBe("WALLET_NON_TROVATO");
  });
});
