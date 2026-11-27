// Servizio Conto: saldo del wallet, calcolato dai movimenti registrati (RF_WALLET_1), e cronologia
// dei movimenti (RF_WALLET_3, UC_WALLET_3, SD_WALLET_3).
import type { Pool } from "pg";
import {
  movimenti as movimentiDelWallet,
  trovaWalletDiAutomobilista,
  type MovimentoDelWallet,
} from "../../persistence/accessoDati/walletSoste.ts";
import type { Orologio } from "../orologio.ts";
import type { PagamentoSimulato } from "../../simulators/pagamento/pagamentoSimulato.ts";
import { ErroreWallet } from "./errori.ts";

export type ContestoWallet = { pool: Pool; orologio: Orologio; pagamento: PagamentoSimulato };

export async function saldo(contesto: ContestoWallet, automobilista: number): Promise<number> {
  const wallet = await trovaWalletDiAutomobilista(contesto.pool, automobilista);
  if (!wallet) {
    throw new ErroreWallet("WALLET_NON_TROVATO");
  }
  return wallet.saldo;
}

/** Movimenti mostrati nella cronologia al massimo: gli ultimi (issue #45, senza paginazione). */
export const LIMITE_MOVIMENTI = 50;

/**
 * Movimento della cronologia (UC_WALLET_3 passo 2): per gli addebiti la sosta con targa e stallo
 * (sostaETarga() di SD_WALLET_3), null per le ricariche. Il tipo è quello del class diagram: un
 * prolungamento è un altro addebito della stessa sosta.
 */
export type MovimentoDellaCronologia = {
  id: number;
  tipoDiMovimento: MovimentoDelWallet["tipoDiMovimento"];
  importo: number;
  dataEOra: Date;
  sosta: { id: number; targa: string; numeroStallo: number; area: string } | null;
};

/** Gli ultimi LIMITE_MOVIMENTI movimenti dell'automobilista, dal più recente. */
export async function movimenti(
  contesto: ContestoWallet,
  automobilista: number,
): Promise<MovimentoDellaCronologia[]> {
  const wallet = await trovaWalletDiAutomobilista(contesto.pool, automobilista);
  if (!wallet) {
    throw new ErroreWallet("WALLET_NON_TROVATO");
  }
  const elenco = await movimentiDelWallet(contesto.pool, wallet.id, LIMITE_MOVIMENTI);
  return elenco.map((m) => ({
    id: m.id,
    tipoDiMovimento: m.tipoDiMovimento,
    importo: m.importo,
    dataEOra: m.dataEOra,
    sosta:
      m.sostaId !== null && m.targa !== null && m.numeroStallo !== null && m.area !== null
        ? { id: m.sostaId, targa: m.targa, numeroStallo: m.numeroStallo, area: m.area }
        : null,
  }));
}
