// Facade del sottosistema Wallet: l'unico punto usato dagli altri sottosistemi.
import type { Pool, PoolClient } from "pg";
import { ottieniPool } from "../../persistence/db.ts";
import type { MovimentoDelWallet } from "../../persistence/accessoDati/walletSoste.ts";
import type { PagamentoSimulato } from "../../simulators/pagamento/pagamentoSimulato.ts";
import { orologioDiSistema, type Orologio } from "../orologio.ts";
import { addebita } from "./addebito.ts";
import { movimenti, saldo, type ContestoWallet, type MovimentoDellaCronologia } from "./conto.ts";
import { ricarica } from "./ricarica.ts";

export { LIMITE_MOVIMENTI } from "./conto.ts";
export { ErroreWallet, type CodiceErroreWallet } from "./errori.ts";
export { TAGLI_RICARICA } from "./ricarica.ts";
export type { MovimentoDelWallet, MovimentoDellaCronologia };

export type FacadeWallet = {
  saldo(automobilista: number): Promise<number>;
  /** Cronologia dal più recente, al massimo LIMITE_MOVIMENTI movimenti (RF_WALLET_3). */
  movimenti(automobilista: number): Promise<MovimentoDellaCronologia[]>;
  /** Restituisce il saldo aggiornato. */
  ricarica(automobilista: number, importo: number): Promise<number>;
  /** Lavora nella transazione del chiamante; con importo 0 restituisce null. */
  addebita(
    client: PoolClient,
    automobilista: number,
    importo: number,
    sosta: number,
  ): Promise<MovimentoDelWallet | null>;
};

/** Il servizio di pagamento arriva dall'esterno: il Wallet ne conosce solo l'interfaccia (DG_10). */
export function creaFacadeWallet(dipendenze: {
  pagamento: PagamentoSimulato;
  pool?: Pool;
  orologio?: Orologio;
}): FacadeWallet {
  const contesto: ContestoWallet = {
    pool: dipendenze.pool ?? ottieniPool(),
    orologio: dipendenze.orologio ?? orologioDiSistema,
    pagamento: dipendenze.pagamento,
  };
  return {
    saldo: (automobilista) => saldo(contesto, automobilista),
    movimenti: (automobilista) => movimenti(contesto, automobilista),
    ricarica: (automobilista, importo) => ricarica(contesto, automobilista, importo),
    addebita: (client, automobilista, importo, sosta) =>
      addebita(client, contesto, automobilista, importo, sosta),
  };
}
