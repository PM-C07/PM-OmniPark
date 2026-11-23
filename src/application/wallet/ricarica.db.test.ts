import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { interroga } from "../../persistence/accessoDati/esecutore";
import { creaAutomobilista } from "../../persistence/accessoDati/utentiEntiVeicoli";
import { creaWallet, movimenti, registraRicarica } from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import type {
  EsitoPagamento,
  PagamentoSimulato,
} from "../../simulators/pagamento/pagamentoSimulato";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import { calcolaHashPassword } from "../utenti-accessi/crittografia";
import { creaFacadeWallet, ErroreWallet, type CodiceErroreWallet } from "./facade";

// Test frame TF-01…07 di docs/test/cp_ricarica.md (OMP-44). Ogni wallet parte da una ricarica
// iniziale, così «saldo aumentato» e «saldo invariato» si verificano su un saldo diverso da zero.

const ISTANTE_PREPARAZIONE = new Date("2026-11-20T08:00:00+01:00");
const ISTANTE = new Date("2026-11-20T09:00:00+01:00");
const SALDO_INIZIALE = 1000;
const AUTOMOBILISTA_INESISTENTE = 999999;

function simulatore(automobilistiDiProva: string[] = []): SimulatorePagamento {
  return new SimulatorePagamento({ sogliaMassima: 10000, automobilistiDiProva, latenzaMs: 0 });
}

// Conta le richieste e delega al simulatore reale.
class PagamentoConConteggio implements PagamentoSimulato {
  chiamate = 0;
  private readonly reale = simulatore();

  autorizzaPagamento(automobilista: string, importo: number): Promise<EsitoPagamento> {
    this.chiamate += 1;
    return this.reale.autorizzaPagamento(automobilista, importo);
  }
}

function facadeCon(pagamento: PagamentoSimulato) {
  return creaFacadeWallet({ pagamento, pool: poolDiTest(), orologio: { adesso: () => ISTANTE } });
}

describe("OMP-44 · cp_ricarica", () => {
  let hashPassword: string;

  beforeAll(async () => {
    hashPassword = await calcolaHashPassword("parola-di-prova-lunga");
  });

  beforeEach(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await preparaDatabaseDiTest();
    await chiudiDatabaseDiTest();
  });

  async function creaProfilo(
    email: string,
  ): Promise<{ automobilista: number; wallet: number; movimentoIniziale: number }> {
    const automobilista = await creaAutomobilista(poolDiTest(), { email, hashPassword });
    const wallet = await creaWallet(poolDiTest(), automobilista);
    const iniziale = await registraRicarica(poolDiTest(), {
      walletVirtualeId: wallet,
      importo: SALDO_INIZIALE,
      dataEOra: ISTANTE_PREPARAZIONE,
    });
    return { automobilista, wallet, movimentoIniziale: iniziale.id };
  }

  async function saldoRegistrato(wallet: number): Promise<number> {
    const risultato = await interroga<{ saldo: string }>(
      poolDiTest(),
      "SELECT saldo FROM saldo_wallet_virtuale WHERE wallet_virtuale_id = $1",
      [wallet],
    );
    expect(risultato.rows).toHaveLength(1);
    return Number(risultato.rows[0].saldo);
  }

  async function numeroMovimentiTotale(): Promise<number> {
    const risultato = await interroga<{ n: string }>(
      poolDiTest(),
      "SELECT count(*) AS n FROM movimento_del_wallet",
    );
    return Number(risultato.rows[0].n);
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

  async function verificaRicaricaRiuscita(email: string, importo: number): Promise<void> {
    const { automobilista, wallet, movimentoIniziale } = await creaProfilo(email);

    const saldo = await facadeCon(simulatore()).ricarica(automobilista, importo);

    expect(saldo).toBe(SALDO_INIZIALE + importo);
    expect(await saldoRegistrato(wallet)).toBe(SALDO_INIZIALE + importo);
    const nuovi = (await movimenti(poolDiTest(), wallet)).filter((m) => m.id !== movimentoIniziale);
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0]).toMatchObject({
      walletVirtualeId: wallet,
      tipoDiMovimento: "RICARICA",
      importo,
      sostaId: null,
    });
  }

  async function verificaImportoNonPrevisto(email: string, importo: number): Promise<void> {
    const { automobilista, wallet } = await creaProfilo(email);
    const pagamento = new PagamentoConConteggio();

    await rifiutato(facadeCon(pagamento).ricarica(automobilista, importo), "IMPORTO_NON_PREVISTO");

    expect(pagamento.chiamate).toBe(0);
    expect(await movimenti(poolDiTest(), wallet)).toHaveLength(1);
    expect(await saldoRegistrato(wallet)).toBe(SALDO_INIZIALE);
  }

  it("RF_WALLET_1 · TF-01 · ricarica 500 approvata → un movimento da 500, saldo +500", async () => {
    await verificaRicaricaRiuscita("ricarica.tf01@test.example", 500);
  });

  it("RF_WALLET_1 · TF-02 · ricarica 1000 approvata → un movimento da 1000, saldo +1000", async () => {
    await verificaRicaricaRiuscita("ricarica.tf02@test.example", 1000);
  });

  it("RF_WALLET_1 · TF-03 · ricarica 2000 approvata → un movimento da 2000, saldo +2000", async () => {
    await verificaRicaricaRiuscita("ricarica.tf03@test.example", 2000);
  });

  it("RF_WALLET_1 · TF-04 · importo 1500 → IMPORTO_NON_PREVISTO, nessun movimento, pagamento non richiesto", async () => {
    await verificaImportoNonPrevisto("ricarica.tf04@test.example", 1500);
  });

  it("RF_WALLET_1 · TF-05 · importo 0 → IMPORTO_NON_PREVISTO, nessun movimento, pagamento non richiesto", async () => {
    await verificaImportoNonPrevisto("ricarica.tf05@test.example", 0);
  });

  it("RF_WALLET_1 · TF-06 · pagamento rifiutato → PAGAMENTO_RIFIUTATO, nessun movimento, saldo invariato", async () => {
    const { automobilista, wallet } = await creaProfilo("ricarica.tf06@test.example");
    const facade = facadeCon(simulatore([String(automobilista)]));

    await rifiutato(facade.ricarica(automobilista, 500), "PAGAMENTO_RIFIUTATO");

    expect(await movimenti(poolDiTest(), wallet)).toHaveLength(1);
    expect(await saldoRegistrato(wallet)).toBe(SALDO_INIZIALE);
  });

  it("RF_WALLET_1 · TF-07 · automobilista inesistente → WALLET_NON_TROVATO, nessun movimento", async () => {
    const movimentiPrima = await numeroMovimentiTotale();

    await rifiutato(
      facadeCon(simulatore()).ricarica(AUTOMOBILISTA_INESISTENTE, 500),
      "WALLET_NON_TROVATO",
    );

    expect(await numeroMovimentiTotale()).toBe(movimentiPrima);
  });
});
