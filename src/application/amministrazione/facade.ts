// Facade del sottosistema Amministrazione (OMP-62): panoramica degli enti (UC_ADM_1, SD_ADM_1).
// Legge da Gestione stalli, Gestione soste e Segnalazioni tramite le loro Facade; la gestione degli
// account degli Ausiliari (UC_ADM_2) è un servizio di Utenti e accessi.
import type { Pool } from "pg";
import { ottieniPool } from "../../persistence/db.ts";
import type { FacadeGestioneSoste } from "../gestione-soste/facade.ts";
import type { FacadeGestioneStalli } from "../gestione-stalli/facade.ts";
import type { FacadeSegnalazioni } from "../segnalazioni/facade.ts";
import {
  enti,
  riepilogo,
  type ContestoAmministrazione,
  type Ente,
  type RiepilogoDellEnte,
} from "./panoramica.ts";

export { ErroreAmministrazione, type CodiceErroreAmministrazione } from "./errori.ts";
export type { Ente, RiepilogoDellEnte };

export type FacadeAmministrazione = {
  enti(): Promise<Ente[]>;
  riepilogo(ente: number): Promise<RiepilogoDellEnte>;
};

/** Le Facade usate arrivano già composte (Gestione soste richiede il Wallet). */
export function creaFacadeAmministrazione(dipendenze: {
  gestioneStalli: FacadeGestioneStalli;
  gestioneSoste: FacadeGestioneSoste;
  segnalazioni: FacadeSegnalazioni;
  pool?: Pool;
}): FacadeAmministrazione {
  const contesto: ContestoAmministrazione = {
    pool: dipendenze.pool ?? ottieniPool(),
    gestioneStalli: dipendenze.gestioneStalli,
    gestioneSoste: dipendenze.gestioneSoste,
    segnalazioni: dipendenze.segnalazioni,
  };
  return {
    enti: () => enti(contesto),
    riepilogo: (ente) => riepilogo(contesto, ente),
  };
}
