// Servizio Conto: saldo del wallet, calcolato dai movimenti registrati (RF_WALLET_1).
import type { Pool } from "pg";
import { trovaWalletDiAutomobilista } from "../../persistence/accessoDati/walletSoste.ts";
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
