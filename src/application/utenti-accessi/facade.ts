// Facade del sottosistema Utenti e accessi: l'unico punto usato dagli altri sottosistemi.
import type { Pool } from "pg";
import { ottieniPool } from "../../persistence/db.ts";
import type { Ausiliario, Ruolo } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import { orologioDiSistema, type Orologio } from "../orologio.ts";
import {
  accedi,
  esci,
  registraAutomobilista,
  type ContestoUtentiAccessi,
  type SessioneAperta,
} from "./autenticazione.ts";
import {
  ausiliariDellEntePreposto,
  trovaAusiliarioDelTraffico,
  utenteDellaSessione,
  verificaAutorizzazione,
  type Operazione,
  type UtenteAutorizzato,
} from "./autorizzazione.ts";
import { aggiungiTarga, rimuoviTarga, targhe } from "./targhe.ts";

export { DURATA_SESSIONE_MS } from "./autenticazione.ts";
export { ErroreUtentiAccessi, type CodiceErroreUtentiAccessi } from "./errori.ts";
/** Forma normalizzata della targa (maiuscole, senza spazi), per gli altri sottosistemi. */
export { normalizzaTarga } from "./targa.ts";
export type { Ausiliario, Operazione, Ruolo, SessioneAperta, UtenteAutorizzato };

export type FacadeUtentiAccessi = {
  registraAutomobilista(email: string, password: string, targa: string): Promise<SessioneAperta>;
  accedi(email: string, password: string): Promise<SessioneAperta>;
  esci(sessione: string): Promise<void>;
  /** Targhe del profilo, ordinate per targa; [] se l'automobilista non esiste. */
  targhe(automobilista: number): Promise<{ veicolo: number; targa: string }[]>;
  aggiungiTarga(automobilista: number, targa: string): Promise<void>;
  rimuoviTarga(automobilista: number, targa: string): Promise<void>;
  verificaAutorizzazione(
    sessione: string,
    operazione: Operazione,
    ente: number | null,
  ): Promise<UtenteAutorizzato>;
  /** Utente di una sessione valida, senza controllo dell'operazione (OMP-48). */
  utenteDellaSessione(sessione: string): Promise<UtenteAutorizzato>;
  ausiliariDellEntePreposto(ente: number): Promise<Ausiliario[]>;
  /** Ausiliario con ente e stato dell'account; null se l'id non è di un Ausiliario (OMP-46). */
  trovaAusiliario(ausiliario: number): Promise<Ausiliario | null>;
};

export function creaFacadeUtentiAccessi(
  dipendenze: { pool?: Pool; orologio?: Orologio } = {},
): FacadeUtentiAccessi {
  const contesto: ContestoUtentiAccessi = {
    pool: dipendenze.pool ?? ottieniPool(),
    orologio: dipendenze.orologio ?? orologioDiSistema,
  };
  return {
    registraAutomobilista: (email, password, targa) =>
      registraAutomobilista(contesto, email, password, targa),
    accedi: (email, password) => accedi(contesto, email, password),
    esci: (sessione) => esci(contesto, sessione),
    targhe: (automobilista) => targhe(contesto, automobilista),
    aggiungiTarga: (automobilista, targa) => aggiungiTarga(contesto, automobilista, targa),
    rimuoviTarga: (automobilista, targa) => rimuoviTarga(contesto, automobilista, targa),
    verificaAutorizzazione: (sessione, operazione, ente) =>
      verificaAutorizzazione(contesto, sessione, operazione, ente),
    utenteDellaSessione: (sessione) => utenteDellaSessione(contesto, sessione),
    ausiliariDellEntePreposto: (ente) => ausiliariDellEntePreposto(contesto, ente),
    trovaAusiliario: (ausiliario) => trovaAusiliarioDelTraffico(contesto, ausiliario),
  };
}
