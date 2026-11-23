// Servizio Ricarica: ricarica simulata del wallet (RF_WALLET_1, UC_WALLET_1, SD_WALLET_1).
import {
  registraRicarica,
  trovaWalletDiAutomobilista,
} from "../../persistence/accessoDati/walletSoste.ts";
import { saldo, type ContestoWallet } from "./conto.ts";
import { ErroreWallet } from "./errori.ts";

/** Tagli di ricarica previsti da UC_WALLET_1, in centesimi. */
export const TAGLI_RICARICA: readonly number[] = [500, 1000, 2000];

/**
 * Registra la ricarica solo se il pagamento è approvato e restituisce il saldo aggiornato.
 * L'autorizzazione avviene fuori da ogni transazione: la latenza del circuito non occupa una
 * connessione al database.
 */
export async function ricarica(
  contesto: ContestoWallet,
  automobilista: number,
  importo: number,
): Promise<number> {
  if (!TAGLI_RICARICA.includes(importo)) {
    throw new ErroreWallet("IMPORTO_NON_PREVISTO");
  }
  const wallet = await trovaWalletDiAutomobilista(contesto.pool, automobilista);
  if (!wallet) {
    throw new ErroreWallet("WALLET_NON_TROVATO");
  }
  const esito = await contesto.pagamento.autorizzaPagamento(String(automobilista), importo);
  if (esito !== "APPROVATO") {
    throw new ErroreWallet("PAGAMENTO_RIFIUTATO");
  }
  await registraRicarica(contesto.pool, {
    walletVirtualeId: wallet.id,
    importo,
    dataEOra: contesto.orologio.adesso(),
  });
  return saldo(contesto, automobilista);
}
