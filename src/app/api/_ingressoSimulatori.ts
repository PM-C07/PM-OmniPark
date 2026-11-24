// Controlli comuni agli ingressi dei simulatori: token, corpo JSON, data e ora, risposte di errore.
// Lettura della richiesta e risposte sono in _http.ts (OMP-48); qui restano il token e la
// traduzione propria degli ingressi, invariata per i simulatori.
import { timingSafeEqual } from "node:crypto";
import {
  impronta,
  rispostaErrore,
  rispostaErroreImprevisto as rispostaErroreImprevistoComune,
} from "./_http.ts";

export { leggiCorpoJson, leggiDataOra, rispostaErrore } from "./_http.ts";

/** Confronto a tempo costante: le impronte hanno sempre la stessa lunghezza. */
export function tokenValido(richiesta: Request): boolean {
  const atteso = process.env.SIMULATORE_TOKEN;
  const ricevuto = richiesta.headers.get("x-simulatore-token");
  if (!atteso || ricevuto === null) {
    return false;
  }
  return timingSafeEqual(impronta(ricevuto), impronta(atteso));
}

export function rispostaTokenNonValido(): Response {
  return rispostaErrore(401, "TOKEN_NON_VALIDO", "Il token del simulatore non è valido.");
}

/** Errori non di dominio: il log riporta solo il tipo, mai dettagli della connessione. */
export function rispostaErroreImprevisto(errore: unknown): Response {
  return rispostaErroreImprevistoComune(errore, "nell'ingresso dei simulatori");
}
