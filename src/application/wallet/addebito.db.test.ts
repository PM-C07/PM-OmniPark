import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { interroga } from "../../persistence/accessoDati/esecutore";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  creaSosta,
  creaWallet,
  movimenti,
  registraRicarica,
} from "../../persistence/accessoDati/walletSoste";
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
  type CodiceErroreWallet,
  type FacadeWallet,
} from "./facade";

// Test frame TF-01…10 di docs/test/cp_addebito.md (OMP-44). Ogni frame riparte dal dataset,
// prepara il saldo iniziale di 1000 con una ricarica e crea la sosta prevista dalle sue scelte;
// le transazioni sono confermate davvero.

const ISTANTE_PREPARAZIONE = new Date("2026-11-20T08:00:00+01:00");
const ISTANTE = new Date("2026-11-20T09:00:00+01:00");
const UN_ORA_DOPO = new Date("2026-11-20T10:00:00+01:00");
const STALLO = 16;
const STALLO_DISABILI = 14;
const TARGA = "ZW401AA";
const TARGA_ALTRO_AUTOMOBILISTA = "ZW402AA";
const EMAIL = "addebito@test.example";
const EMAIL_ALTRO_AUTOMOBILISTA = "addebito.altro@test.example";
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";
const FOTO_DEL_PERMESSO = Buffer.alloc(1024, 1);
const SALDO_INIZIALE = 1000;

type Scenario = { automobilista: number; wallet: number; veicolo: number; ricarica: number };

describe("OMP-44 · cp_addebito", () => {
  let facade: FacadeWallet;
  let hashPassword: string;
  let scenario: Scenario;

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
    scenario = await preparaScenario();
  });

  afterAll(async () => {
    await preparaDatabaseDiTest();
    await chiudiDatabaseDiTest();
  });

  async function preparaScenario(): Promise<Scenario> {
    const pool = poolDiTest();
    const automobilista = await creaAutomobilista(pool, { email: EMAIL, hashPassword });
    const wallet = await creaWallet(pool, automobilista);
    const ricarica = await registraRicarica(pool, {
      walletVirtualeId: wallet,
      importo: SALDO_INIZIALE,
      dataEOra: ISTANTE_PREPARAZIONE,
    });
    const veicolo = await trovaOCreaVeicolo(pool, TARGA);
    await associaVeicolo(pool, automobilista, veicolo);
    return { automobilista, wallet, veicolo, ricarica: ricarica.id };
  }

  function creaSostaPagata(): Promise<number> {
    return creaSosta(poolDiTest(), {
      automobilistaId: scenario.automobilista,
      veicoloId: scenario.veicolo,
      stalloId: STALLO,
      orarioDiAvvio: ISTANTE,
      orarioDiScadenza: UN_ORA_DOPO,
      pagamento: "PAGATA",
    });
  }

  async function creaSostaDiUnAltroAutomobilista(): Promise<number> {
    const pool = poolDiTest();
    const altro = await creaAutomobilista(pool, {
      email: EMAIL_ALTRO_AUTOMOBILISTA,
      hashPassword,
    });
    const veicolo = await trovaOCreaVeicolo(pool, TARGA_ALTRO_AUTOMOBILISTA);
    await associaVeicolo(pool, altro, veicolo);
    return creaSosta(pool, {
      automobilistaId: altro,
      veicoloId: veicolo,
      stalloId: STALLO,
      orarioDiAvvio: ISTANTE,
      orarioDiScadenza: UN_ORA_DOPO,
      pagamento: "PAGATA",
    });
  }

  function creaSostaGratuita(): Promise<number> {
    return creaSosta(poolDiTest(), {
      automobilistaId: scenario.automobilista,
      veicoloId: scenario.veicolo,
      stalloId: STALLO_DISABILI,
      orarioDiAvvio: ISTANTE,
      orarioDiScadenza: UN_ORA_DOPO,
      pagamento: "GRATUITA",
      dichiarazioneDiPermesso: DICHIARAZIONE,
      fotoDelPermesso: FOTO_DEL_PERMESSO,
    });
  }

  function addebitoConfermato(importo: number, sosta: number) {
    return eseguiInTransazione(
      (client) => facade.addebita(client, scenario.automobilista, importo, sosta),
      poolDiTest(),
    );
  }

  // Avvia insieme due transazioni su connessioni distinte; quella che ottiene per prima il blocco
  // resta aperta 500 ms dopo l'addebito prima del commit, così l'altra si sovrappone.
  function dueAddebitiSimultanei(importo: number, sosta: number) {
    let bloccoGiaOttenuto = false;
    const transazione = () =>
      eseguiInTransazione(async (client) => {
        const movimento = await facade.addebita(client, scenario.automobilista, importo, sosta);
        if (!bloccoGiaOttenuto) {
          bloccoGiaOttenuto = true;
          await interroga(client, "SELECT pg_sleep(0.5)");
        }
        return movimento;
      }, poolDiTest());
    return Promise.allSettled([transazione(), transazione()]);
  }

  async function saldoRegistrato(): Promise<number> {
    const risultato = await interroga<{ saldo: string }>(
      poolDiTest(),
      "SELECT saldo FROM saldo_wallet_virtuale WHERE wallet_virtuale_id = $1",
      [scenario.wallet],
    );
    expect(risultato.rows).toHaveLength(1);
    return Number(risultato.rows[0].saldo);
  }

  async function addebitiRegistrati() {
    const elenco = await movimenti(poolDiTest(), scenario.wallet);
    return elenco.filter((m) => m.id !== scenario.ricarica);
  }

  async function rifiutato(operazione: Promise<unknown>, codice: CodiceErroreWallet) {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreWallet);
    expect((ottenuto as ErroreWallet).codice).toBe(codice);
  }

  async function verificaUnAddebito(importo: number, sosta: number): Promise<void> {
    const nuovi = await addebitiRegistrati();
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0]).toMatchObject({
      walletVirtualeId: scenario.wallet,
      tipoDiMovimento: "ADDEBITO",
      importo,
      sostaId: sosta,
    });
  }

  async function verificaNessunMovimento(): Promise<void> {
    expect(await addebitiRegistrati()).toHaveLength(0);
    expect(await saldoRegistrato()).toBe(SALDO_INIZIALE);
  }

  it("RF_WALLET_2 · TF-01 · saldo 1000, importo 300, confermata → addebito registrato, saldo 700", async () => {
    const sosta = await creaSostaPagata();

    const movimento = await addebitoConfermato(300, sosta);

    expect(movimento).toMatchObject({ tipoDiMovimento: "ADDEBITO", importo: 300 });
    await verificaUnAddebito(300, sosta);
    expect(await saldoRegistrato()).toBe(700);
  });

  it("RF_WALLET_2 · TF-02 · saldo 1000, importo 1000, confermata → addebito registrato, saldo 0", async () => {
    const sosta = await creaSostaPagata();

    const movimento = await addebitoConfermato(1000, sosta);

    expect(movimento).toMatchObject({ tipoDiMovimento: "ADDEBITO", importo: 1000 });
    await verificaUnAddebito(1000, sosta);
    expect(await saldoRegistrato()).toBe(0);
  });

  it("RF_WALLET_2 · TF-03 · saldo 1000, importo 1500 → CREDITO_INSUFFICIENTE, nessun movimento, saldo 1000", async () => {
    const sosta = await creaSostaPagata();

    await rifiutato(addebitoConfermato(1500, sosta), "CREDITO_INSUFFICIENTE");

    await verificaNessunMovimento();
  });

  it("RF_WALLET_2 · TF-04 · importo 0, confermata → nessun movimento, saldo 1000", async () => {
    const sosta = await creaSostaPagata();

    const movimento = await addebitoConfermato(0, sosta);

    expect(movimento).toBeNull();
    await verificaNessunMovimento();
  });

  it("RF_WALLET_2 · TF-05 · importo -100 → IMPORTO_NON_VALIDO, nessun movimento", async () => {
    const sosta = await creaSostaPagata();

    await rifiutato(addebitoConfermato(-100, sosta), "IMPORTO_NON_VALIDO");

    await verificaNessunMovimento();
  });

  it("RF_WALLET_2 · TF-06 · importo 300, transazione annullata dal chiamante → nessun movimento, saldo 1000", async () => {
    const sosta = await creaSostaPagata();
    const messaggio = "annullamento del chiamante";

    await expect(
      eseguiInTransazione(async (client) => {
        await facade.addebita(client, scenario.automobilista, 300, sosta);
        throw new Error(messaggio);
      }, poolDiTest()),
    ).rejects.toThrow(messaggio);

    await verificaNessunMovimento();
  });

  it("RF_WALLET_2 · TF-07 · due addebiti simultanei di 700 su saldo 1000 → uno registrato, l'altro CREDITO_INSUFFICIENTE, saldo 300", async () => {
    const sosta = await creaSostaPagata();

    const esiti = await dueAddebitiSimultanei(700, sosta);

    const riusciti = esiti.filter((e) => e.status === "fulfilled");
    const falliti = esiti.filter((e): e is PromiseRejectedResult => e.status === "rejected");
    expect(riusciti).toHaveLength(1);
    expect(falliti).toHaveLength(1);
    expect(falliti[0].reason).toBeInstanceOf(ErroreWallet);
    expect((falliti[0].reason as ErroreWallet).codice).toBe("CREDITO_INSUFFICIENTE");
    await verificaUnAddebito(700, sosta);
    const saldoFinale = await saldoRegistrato();
    expect(saldoFinale).toBeGreaterThanOrEqual(0);
    expect(saldoFinale).toBe(300);
  });

  it("RF_WALLET_2 · TF-08 · due addebiti simultanei di 400 su saldo 1000 → entrambi registrati, saldo 200", async () => {
    const sosta = await creaSostaPagata();

    const esiti = await dueAddebitiSimultanei(400, sosta);

    expect(esiti.map((e) => e.status)).toEqual(["fulfilled", "fulfilled"]);
    const nuovi = await addebitiRegistrati();
    expect(nuovi).toHaveLength(2);
    for (const movimento of nuovi) {
      expect(movimento).toMatchObject({
        tipoDiMovimento: "ADDEBITO",
        importo: 400,
        sostaId: sosta,
      });
    }
    expect(await saldoRegistrato()).toBe(200);
  });

  it("RF_WALLET_2 · TF-09 · importo 300, sosta di un altro Automobilista → SOSTA_NON_ADDEBITABILE, nessun movimento, saldo 1000", async () => {
    const sosta = await creaSostaDiUnAltroAutomobilista();

    await rifiutato(addebitoConfermato(300, sosta), "SOSTA_NON_ADDEBITABILE");

    await verificaNessunMovimento();
  });

  it("RF_WALLET_2 · TF-10 · importo 300, sosta GRATUITA → SOSTA_NON_ADDEBITABILE, nessun movimento, saldo 1000", async () => {
    const sosta = await creaSostaGratuita();

    await rifiutato(addebitoConfermato(300, sosta), "SOSTA_NON_ADDEBITABILE");

    await verificaNessunMovimento();
  });
});
