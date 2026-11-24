// Punto unico di composizione delle Facade per le route API e per src/proxy.ts (OMP-48, DG_10).
// Le Facade si creano a ogni richiesta, senza stato globale: il pool nasce alla prima chiamata di
// ottieniPool(), non all'import del modulo. Il servizio di pagamento si crea solo qui.
import {
  creaFacadeGestioneSoste,
  osservatoreGestioneSoste,
} from "../application/gestione-soste/facade.ts";
import { creaFacadeGestioneStalli } from "../application/gestione-stalli/facade.ts";
import { orologioDiSistema } from "../application/orologio.ts";
import { creaFacadeSegnalazioni } from "../application/segnalazioni/facade.ts";
import { creaFacadeUtentiAccessi } from "../application/utenti-accessi/facade.ts";
import { creaFacadeWallet } from "../application/wallet/facade.ts";
import { ottieniPool } from "../persistence/db.ts";
import { SimulatorePagamento } from "../simulators/pagamento/simulatorePagamento.ts";

export type Sottosistemi = {
  utentiAccessi: ReturnType<typeof creaFacadeUtentiAccessi>;
  gestioneStalli: ReturnType<typeof creaFacadeGestioneStalli>;
  wallet: ReturnType<typeof creaFacadeWallet>;
  gestioneSoste: ReturnType<typeof creaFacadeGestioneSoste>;
  segnalazioni: ReturnType<typeof creaFacadeSegnalazioni>;
};

export function componiSottosistemi(): Sottosistemi {
  const pool = ottieniPool();
  const orologio = orologioDiSistema;
  const utentiAccessi = creaFacadeUtentiAccessi({ pool, orologio });
  const wallet = creaFacadeWallet({ pagamento: new SimulatorePagamento(), pool, orologio });
  const gestioneSoste = creaFacadeGestioneSoste({ wallet, pool, orologio, utentiAccessi });
  return {
    utentiAccessi,
    gestioneStalli: creaFacadeGestioneStalli({
      pool,
      orologio,
      osservatori: [osservatoreGestioneSoste],
    }),
    wallet,
    gestioneSoste,
    segnalazioni: creaFacadeSegnalazioni({ gestioneSoste, pool, orologio, utentiAccessi }),
  };
}
