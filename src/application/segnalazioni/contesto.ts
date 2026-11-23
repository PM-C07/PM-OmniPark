// Contesto del sottosistema Segnalazioni: le dipendenze arrivano alla Facade quando la si crea,
// senza stato globale. Gli altri sottosistemi si usano solo tramite le loro Facade.
import type { Pool } from "pg";
import type { FacadeGestioneSoste } from "../gestione-soste/facade.ts";
import type { FacadeGestioneStalli } from "../gestione-stalli/facade.ts";
import type { Orologio } from "../orologio.ts";
import type { FacadeUtentiAccessi } from "../utenti-accessi/facade.ts";

export type ContestoSegnalazioni = {
  pool: Pool;
  orologio: Orologio;
  gestioneSoste: FacadeGestioneSoste;
  gestioneStalli: FacadeGestioneStalli;
  utentiAccessi: FacadeUtentiAccessi;
};
