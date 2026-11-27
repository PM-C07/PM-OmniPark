// Facade del sottosistema Segnalazioni: l'unico punto usato dagli altri sottosistemi.
import type { Pool } from "pg";
import { ottieniPool } from "../../persistence/db.ts";
import type {
  Esito,
  Motivo,
  SegnalazioneMappa,
  StatoSegnalazione,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { osservatoreGestioneSoste, type FacadeGestioneSoste } from "../gestione-soste/facade.ts";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade.ts";
import { orologioDiSistema, type Orologio } from "../orologio.ts";
import { creaFacadeUtentiAccessi, type FacadeUtentiAccessi } from "../utenti-accessi/facade.ts";
import { chiudi } from "./chiusura.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";
import { contaSegnalazioniAperte } from "./conteggio.ts";
import { prendiInCarico } from "./presaInCarico.ts";
import { statoDelPagamento, type StatoDelPagamento } from "./statoDelPagamento.ts";
import { elaboraLettura, type EsitoRiscontro, type Lettura } from "./riscontro.ts";
import {
  fotografiaSegnalazioni,
  segnalazioniModificateDopo,
  segnalazioniNonChiuse,
  variazioniDopo,
} from "./segnalazioniEnte.ts";

export { ErroreSegnalazioni, type CodiceErroreSegnalazioni } from "./errori.ts";
export type {
  Esito,
  EsitoRiscontro,
  Lettura,
  Motivo,
  SegnalazioneMappa,
  StatoDelPagamento,
  StatoSegnalazione,
};

export type FacadeSegnalazioni = {
  // Riscontro ANPR (UC_ANPR_1, SD_ANPR_1)
  elaboraLettura(lettura: Lettura): Promise<EsitoRiscontro>;
  // Segnalazioni dell'ente (UC_OP_1, SD_OP_1)
  segnalazioniNonChiuse(ausiliario: number, ente: number): Promise<SegnalazioneMappa[]>;
  segnalazioniModificateDopo(
    ausiliario: number,
    ente: number,
    istante: Date,
  ): Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date | null }>;
  // Cursore del database e margine di 5 s (OMP-48, usate dalle API)
  fotografiaSegnalazioni(
    ausiliario: number,
    ente: number,
  ): Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date }>;
  variazioniDopo(
    ausiliario: number,
    ente: number,
    cursore: Date,
  ): Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date }>;
  // Chiusura con esito (UC_OP_4, SD_OP_4)
  chiudi(ausiliario: number, segnalazione: number, esito: Esito): Promise<void>;
  // Conteggio per la panoramica degli enti (RF_ADM_1, SD_ADM_1 4.2): Aperta e Presa in carico
  contaSegnalazioniAperte(ente: number): Promise<number>;
  // Presa in carico (UC_OP_2) e stato del pagamento (UC_OP_3), OMP-63
  prendiInCarico(ausiliario: number, segnalazione: number): Promise<SegnalazioneMappa>;
  statoDelPagamento(ausiliario: number, segnalazione: number): Promise<StatoDelPagamento>;
};

/**
 * Gestione soste arriva già composta (richiede il Wallet). Gestione stalli, usata solo per
 * l'esistenza dello stallo, si crea con l'osservatore di Gestione soste come nelle altre
 * composizioni. Segnalazioni e Gestione soste vanno creati con lo stesso orologio.
 */
export function creaFacadeSegnalazioni(dipendenze: {
  gestioneSoste: FacadeGestioneSoste;
  pool?: Pool;
  orologio?: Orologio;
  utentiAccessi?: FacadeUtentiAccessi;
}): FacadeSegnalazioni {
  const pool = dipendenze.pool ?? ottieniPool();
  const orologio = dipendenze.orologio ?? orologioDiSistema;
  const contesto: ContestoSegnalazioni = {
    pool,
    orologio,
    gestioneSoste: dipendenze.gestioneSoste,
    gestioneStalli: creaFacadeGestioneStalli({ pool, osservatori: [osservatoreGestioneSoste] }),
    utentiAccessi: dipendenze.utentiAccessi ?? creaFacadeUtentiAccessi({ pool, orologio }),
  };
  return {
    elaboraLettura: (lettura) => elaboraLettura(contesto, lettura),
    segnalazioniNonChiuse: (ausiliario, ente) => segnalazioniNonChiuse(contesto, ausiliario, ente),
    segnalazioniModificateDopo: (ausiliario, ente, istante) =>
      segnalazioniModificateDopo(contesto, ausiliario, ente, istante),
    fotografiaSegnalazioni: (ausiliario, ente) =>
      fotografiaSegnalazioni(contesto, ausiliario, ente),
    variazioniDopo: (ausiliario, ente, cursore) =>
      variazioniDopo(contesto, ausiliario, ente, cursore),
    chiudi: (ausiliario, segnalazione, esito) => chiudi(contesto, ausiliario, segnalazione, esito),
    contaSegnalazioniAperte: (ente) => contaSegnalazioniAperte(contesto, ente),
    prendiInCarico: (ausiliario, segnalazione) => prendiInCarico(contesto, ausiliario, segnalazione),
    statoDelPagamento: (ausiliario, segnalazione) =>
      statoDelPagamento(contesto, ausiliario, segnalazione),
  };
}
