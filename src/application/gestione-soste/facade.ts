// Facade del sottosistema Gestione soste: l'unico punto usato dagli altri sottosistemi.
import type { Pool } from "pg";
import { ottieniPool } from "../../persistence/db.ts";
import type { Pagamento, Sosta, StatoSosta } from "../../persistence/accessoDati/walletSoste.ts";
import { creaAllineamentoTemporale } from "../allineamento-temporale/allineamento.ts";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade.ts";
import { orologioDiSistema, type Orologio } from "../orologio.ts";
import { creaFacadeUtentiAccessi, type FacadeUtentiAccessi } from "../utenti-accessi/facade.ts";
import type { FacadeWallet } from "../wallet/facade.ts";
import { avviaSosta, type RichiestaDiAvvio, type SostaAvviata } from "./avvio.ts";
import { calcolaImporto, type ImportoDellaSosta } from "./calcoloImporto.ts";
import { contaSosteAttive, sostaInCorso, sosteDellAutomobilista } from "./consultazione.ts";
import type { ContestoGestioneSoste } from "./contesto.ts";
import { osservatoreGestioneSoste } from "./fineSosta.ts";

export { ErroreGestioneSoste, type CodiceErroreGestioneSoste } from "./errori.ts";
export { osservatoreGestioneSoste };
export type { ImportoDellaSosta, Pagamento, RichiestaDiAvvio, Sosta, SostaAvviata, StatoSosta };

export type FacadeGestioneSoste = {
  // Calcolo dell'importo (SD_SOSTA_1 3.2)
  calcolaImporto(stallo: number, durata: number): Promise<ImportoDellaSosta>;
  // Avvio (UC_SOSTA_1, SD_SOSTA_1)
  avviaSosta(richiesta: RichiestaDiAvvio): Promise<SostaAvviata>;
  // Consultazione
  sostaInCorso(stallo: number): Promise<Sosta | null>;
  contaSosteAttive(ente: number): Promise<number>;
  sosteDellAutomobilista(automobilista: number): Promise<Sosta[]>;
};

/**
 * Compone le dipendenze: Gestione stalli con l'osservatore di Gestione soste e l'allineamento
 * temporale sopra di essa. Il Wallet arriva già costruito perché richiede il pagamento simulato.
 * Il Wallet e Gestione soste vanno creati con lo stesso orologio.
 */
export function creaFacadeGestioneSoste(dipendenze: {
  wallet: FacadeWallet;
  pool?: Pool;
  orologio?: Orologio;
  utentiAccessi?: FacadeUtentiAccessi;
}): FacadeGestioneSoste {
  const pool = dipendenze.pool ?? ottieniPool();
  const orologio = dipendenze.orologio ?? orologioDiSistema;
  const gestioneStalli = creaFacadeGestioneStalli({
    pool,
    osservatori: [osservatoreGestioneSoste],
  });
  const contesto: ContestoGestioneSoste = {
    pool,
    orologio,
    gestioneStalli,
    utentiAccessi: dipendenze.utentiAccessi ?? creaFacadeUtentiAccessi({ pool, orologio }),
    wallet: dipendenze.wallet,
    allineamento: creaAllineamentoTemporale({ gestioneStalli, pool, orologio }),
  };
  return {
    calcolaImporto: (stallo, durata) => calcolaImporto(contesto, stallo, durata),
    avviaSosta: (richiesta) => avviaSosta(contesto, richiesta),
    sostaInCorso: (stallo) => sostaInCorso(contesto, stallo),
    contaSosteAttive: (ente) => contaSosteAttive(contesto, ente),
    sosteDellAutomobilista: (automobilista) => sosteDellAutomobilista(contesto, automobilista),
  };
}
