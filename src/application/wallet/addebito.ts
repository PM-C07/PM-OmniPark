// Servizio Addebito: addebito di una sosta sul wallet (RF_WALLET_2, UC_SOSTA_1, UC_SOSTA_2).
import type { PoolClient } from "pg";
import { ErroreDominio } from "../../persistence/accessoDati/errori.ts";
import {
  addebita as registraAddebito,
  trovaSosta,
  trovaWalletDiAutomobilista,
  type MovimentoDelWallet,
} from "../../persistence/accessoDati/walletSoste.ts";
import type { ContestoWallet } from "./conto.ts";
import { ErroreWallet } from "./errori.ts";

/**
 * Addebita l'importo nella transazione del chiamante, che resta l'unico a confermarla o annullarla.
 * La sosta deve già esistere. Con importo 0 non registra alcun movimento e restituisce null.
 * Gli importi non validi sono fermati prima di ogni query: un vincolo violato renderebbe
 * inutilizzabile la transazione del chiamante.
 */
export async function addebita(
  client: PoolClient,
  contesto: ContestoWallet,
  automobilista: number,
  importo: number,
  sosta: number,
): Promise<MovimentoDelWallet | null> {
  if (!Number.isSafeInteger(importo) || importo < 0) {
    throw new ErroreWallet("IMPORTO_NON_VALIDO");
  }
  if (importo === 0) {
    return null;
  }

  const wallet = await trovaWalletDiAutomobilista(client, automobilista);
  if (!wallet) {
    throw new ErroreWallet("WALLET_NON_TROVATO");
  }
  const sostaDaAddebitare = await trovaSosta(client, sosta);
  if (
    !sostaDaAddebitare ||
    sostaDaAddebitare.automobilistaId !== automobilista ||
    sostaDaAddebitare.pagamento === "GRATUITA"
  ) {
    throw new ErroreWallet("SOSTA_NON_ADDEBITABILE");
  }

  try {
    // Il blocco della riga del wallet e il controllo del saldo sono nella persistenza.
    return await registraAddebito(client, {
      walletVirtualeId: wallet.id,
      sostaId: sosta,
      importo,
      dataEOra: contesto.orologio.adesso(),
    });
  } catch (errore) {
    if (errore instanceof ErroreDominio && errore.codice === "SALDO_INSUFFICIENTE") {
      throw new ErroreWallet("CREDITO_INSUFFICIENTE", { cause: errore });
    }
    if (errore instanceof ErroreDominio && errore.codice === "WALLET_INESISTENTE") {
      throw new ErroreWallet("WALLET_NON_TROVATO", { cause: errore });
    }
    throw errore;
  }
}
