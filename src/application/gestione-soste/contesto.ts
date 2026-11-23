// Contesto del sottosistema Gestione soste: le dipendenze arrivano alla Facade quando la si crea,
// senza stato globale. Gli altri sottosistemi si usano solo tramite le loro Facade.
import type { Pool } from "pg";
import type { AllineamentoTemporale } from "../allineamento-temporale/allineamento.ts";
import type { FacadeGestioneStalli } from "../gestione-stalli/facade.ts";
import type { Orologio } from "../orologio.ts";
import type { FacadeUtentiAccessi } from "../utenti-accessi/facade.ts";
import type { FacadeWallet } from "../wallet/facade.ts";

export type ContestoGestioneSoste = {
  pool: Pool;
  orologio: Orologio;
  gestioneStalli: FacadeGestioneStalli;
  utentiAccessi: FacadeUtentiAccessi;
  wallet: FacadeWallet;
  allineamento: AllineamentoTemporale;
};
