// Cookie di sessione e controllo di sessione, ruolo ed ente per le route API (OMP-48, NRF_SIC_1).
// La sessione è quella di Utenti e accessi: il cookie contiene il token, il database solo il suo
// hash. Il cookie si legge dalla Request (non da next/headers), così gli handler si testano con
// una Request reale.
import {
  DURATA_SESSIONE_MS,
  ErroreUtentiAccessi,
  type FacadeUtentiAccessi,
  type Operazione,
  type UtenteAutorizzato,
} from "../../application/utenti-accessi/facade.ts";
import { componiSottosistemi } from "../_composizione.ts";
import { ErroreApi } from "./_errori.ts";
import { leggiId } from "./_http.ts";

export const NOME_COOKIE_SESSIONE = "omnipark_sessione";

const ATTRIBUTI_COOKIE = "HttpOnly; Secure; SameSite=Lax; Path=/";

/** Il valore del cookie di sessione nell'intestazione cookie, oppure null. */
export function leggiTokenDiSessione(richiesta: Request): string | null {
  const intestazione = richiesta.headers.get("cookie");
  if (!intestazione) {
    return null;
  }
  for (const parte of intestazione.split(";")) {
    const separatore = parte.indexOf("=");
    if (separatore < 0) {
      continue;
    }
    if (parte.slice(0, separatore).trim() === NOME_COOKIE_SESSIONE) {
      const valore = parte.slice(separatore + 1).trim();
      try {
        return valore === "" ? null : decodeURIComponent(valore);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Set-Cookie della sessione aperta: httpOnly, Secure, SameSite=Lax, durata 8 ore. */
export function cookieDiSessione(token: string): string {
  const maxAge = Math.floor(DURATA_SESSIONE_MS / 1000);
  return `${NOME_COOKIE_SESSIONE}=${encodeURIComponent(token)}; ${ATTRIBUTI_COOKIE}; Max-Age=${maxAge}`;
}

/** Set-Cookie che cancella il cookie di sessione. */
export function cookieCancellato(): string {
  return `${NOME_COOKIE_SESSIONE}=; ${ATTRIBUTI_COOKIE}; Max-Age=0`;
}

/**
 * Controlla sessione, ruolo ed ente tramite Utenti e accessi e restituisce l'utente autorizzato;
 * altrimenti lancia l'errore di dominio (SESSIONE_NON_VALIDA, RUOLO_NON_AMMESSO, ENTE_NON_AMMESSO).
 * `ente`: null se l'operazione non riguarda un ente; undefined per usare l'ente della sessione
 * (operazioni dell'Ausiliario senza ente indicato nella richiesta).
 */
export async function richiediSessione(
  richiesta: Request,
  operazione: Operazione,
  ente?: number | null,
  utentiAccessi: FacadeUtentiAccessi = componiSottosistemi().utentiAccessi,
): Promise<UtenteAutorizzato> {
  const token = leggiTokenDiSessione(richiesta);
  if (token === null) {
    throw new ErroreUtentiAccessi("SESSIONE_NON_VALIDA");
  }
  const enteRichiesto =
    ente === undefined ? (await utentiAccessi.utenteDellaSessione(token)).enteId : ente;
  return utentiAccessi.verificaAutorizzazione(token, operazione, enteRichiesto);
}

/**
 * Sessione per le operazioni dell'Ausiliario con il parametro facoltativo `ente`: assente → ente
 * della sessione; un id valido → quell'ente. Con un valore non valido controlla comunque la
 * sessione (senza sessione la risposta resta 401) e poi lancia RICHIESTA_NON_VALIDA.
 */
export async function richiediSessioneDellAusiliario(
  richiesta: Request,
  operazione: Operazione,
  utentiAccessi: FacadeUtentiAccessi,
): Promise<UtenteAutorizzato & { enteId: number }> {
  const grezzo = new URL(richiesta.url).searchParams.get("ente");
  const ente = grezzo === null ? undefined : leggiId(grezzo);
  if (ente === null) {
    await richiediSessione(richiesta, operazione, undefined, utentiAccessi);
    throw new ErroreApi("RICHIESTA_NON_VALIDA");
  }
  const utente = await richiediSessione(richiesta, operazione, ente, utentiAccessi);
  // Le operazioni dell'Ausiliario hanno sempre un ente: verificaAutorizzazione lo ha già confrontato.
  if (utente.enteId === null) {
    throw new ErroreUtentiAccessi("RUOLO_NON_AMMESSO");
  }
  return { ...utente, enteId: utente.enteId };
}
