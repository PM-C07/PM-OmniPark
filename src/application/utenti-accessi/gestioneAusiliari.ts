// Servizio Gestione degli Ausiliari (control :ControlloAccountAusiliari, UC_ADM_2, SD_ADM_2,
// RF_ADM_2; OMP-62, docs/test/cp_gestioneAusiliari.md): elenco per ente, creazione con password
// iniziale, modifica dei dati di UC_ADM_2 e disattivazione al posto dell'eliminazione.
// Le prese in carico si controllano sulla persistenza (metodo segnalazioniPreseInCarico() dell'entity
// Ausiliario, SD_ADM_2 3.a1.5), senza chiamare Segnalazioni, che dipende da Utenti e accessi.
import { ErroreDominio } from "../../persistence/accessoDati/errori.ts";
import type { Esecutore } from "../../persistence/accessoDati/esecutore.ts";
import { contaSegnalazioniPreseInCarico } from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import {
  aggiornaAusiliario as aggiornaAusiliarioNelDatabase,
  ausiliari,
  bloccaAusiliario,
  creaAusiliario as creaAusiliarioNelDatabase,
  disattivaAusiliario as disattivaAusiliarioNelDatabase,
  eliminaSessioniUtente,
  enti,
  trovaAusiliario,
  trovaUtentePerEmail,
  type Ausiliario,
} from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  FORMATO_EMAIL,
  LUNGHEZZA_MINIMA_PASSWORD,
  type ContestoUtentiAccessi,
} from "./autenticazione.ts";
import { calcolaHashPassword } from "./crittografia.ts";
import { ErroreUtentiAccessi } from "./errori.ts";

export type AusiliarioConEnte = Ausiliario & { ente: string };

export type DatiAusiliario = {
  nome: string;
  cognome: string;
  email: string;
  ente: number | null;
};

export type DatiNuovoAusiliario = DatiAusiliario & { password: string };

type DatiNormalizzati = { nome: string; cognome: string; email: string; ente: number };

/** SD_ADM_2 6.1 verificaCompletezza e formato dell'email (UC_ADM_2 6.a1). */
function verificaDati(dati: DatiAusiliario, password?: string): DatiNormalizzati {
  const nome = typeof dati.nome === "string" ? dati.nome.trim() : "";
  const cognome = typeof dati.cognome === "string" ? dati.cognome.trim() : "";
  const email = typeof dati.email === "string" ? dati.email : "";
  if (
    nome === "" ||
    cognome === "" ||
    email === "" ||
    password === "" ||
    dati.ente === null ||
    dati.ente === undefined
  ) {
    throw new ErroreUtentiAccessi("DATI_INCOMPLETI");
  }
  if (!FORMATO_EMAIL.test(email)) {
    throw new ErroreUtentiAccessi("EMAIL_NON_VALIDA");
  }
  if (password !== undefined && [...password].length < LUNGHEZZA_MINIMA_PASSWORD) {
    throw new ErroreUtentiAccessi("PASSWORD_TROPPO_CORTA");
  }
  return { nome, cognome, email, ente: dati.ente };
}

/** SD_ADM_2 6.2 emailRegistrata: l'email è libera o appartiene all'Ausiliario stesso. */
async function verificaEmailLibera(es: Esecutore, email: string, ausiliario?: number) {
  const utente = await trovaUtentePerEmail(es, email);
  if (utente && utente.id !== ausiliario) {
    throw new ErroreUtentiAccessi("EMAIL_GIA_REGISTRATA");
  }
}

async function verificaEnte(es: Esecutore, ente: number) {
  const esiste =
    Number.isSafeInteger(ente) && ente > 0 && (await enti(es)).some((e) => e.id === ente);
  if (!esiste) {
    throw new ErroreUtentiAccessi("ENTE_INESISTENTE");
  }
}

/** Traduce gli errori dei vincoli dello schema in caso di richieste concorrenti. */
function errorePersistenza(errore: unknown): never {
  if (errore instanceof ErroreDominio) {
    if (errore.codice === "EMAIL_GIA_REGISTRATA") {
      throw new ErroreUtentiAccessi("EMAIL_GIA_REGISTRATA", { cause: errore });
    }
    if (errore.codice === "RIFERIMENTO_INESISTENTE") {
      throw new ErroreUtentiAccessi("ENTE_INESISTENTE", { cause: errore });
    }
  }
  throw errore;
}

async function ausiliarioConEnte(es: Esecutore, id: number): Promise<AusiliarioConEnte> {
  const trovato = await trovaAusiliario(es, id);
  if (!trovato) {
    throw new ErroreUtentiAccessi("AUSILIARIO_INESISTENTE");
  }
  const ente = (await enti(es)).find((e) => e.id === trovato.enteId);
  return { ...trovato, ente: ente?.nome ?? "" };
}

function idValido(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

/** SD_ADM_2 2.1 ausiliariPerEnte: tutti gli Ausiliari, per ente, cognome, nome e id. */
export function ausiliariPerEnte(contesto: ContestoUtentiAccessi): Promise<AusiliarioConEnte[]> {
  return ausiliari(contesto.pool);
}

/**
 * SD_ADM_2 7.1 <<create>>: Ausiliario ATTIVO con la password iniziale (stesso hash della
 * registrazione) e l'associazione «gestisce l'account di» con l'Amministratore.
 */
export async function creaAusiliario(
  contesto: ContestoUtentiAccessi,
  amministratore: number,
  dati: DatiNuovoAusiliario,
): Promise<AusiliarioConEnte> {
  const { pool } = contesto;
  const password = typeof dati.password === "string" ? dati.password : "";
  const validi = verificaDati(dati, password);
  await verificaEmailLibera(pool, validi.email);
  await verificaEnte(pool, validi.ente);

  // L'hash è lento: si calcola prima di aprire la transazione.
  const hashPassword = await calcolaHashPassword(password);
  try {
    return await eseguiInTransazione(async (client) => {
      const id = await creaAusiliarioNelDatabase(client, {
        email: validi.email,
        hashPassword,
        nome: validi.nome,
        cognome: validi.cognome,
        enteId: validi.ente,
        amministratoreId: amministratore,
      });
      return ausiliarioConEnte(client, id);
    }, pool);
  } catch (errore) {
    return errorePersistenza(errore);
  }
}

/**
 * SD_ADM_2 7.1 aggiorna: nome, cognome, email ed ente; né stato né password. Il cambio di ente è
 * rifiutato se l'Ausiliario ha segnalazioni prese in carico (VD_18, decisione D2 di OMP-62).
 */
export async function aggiornaAusiliario(
  contesto: ContestoUtentiAccessi,
  ausiliario: number,
  dati: DatiAusiliario,
): Promise<AusiliarioConEnte> {
  const { pool } = contesto;
  if (!idValido(ausiliario)) {
    throw new ErroreUtentiAccessi("AUSILIARIO_INESISTENTE");
  }
  try {
    return await eseguiInTransazione(async (client) => {
      if ((await bloccaAusiliario(client, ausiliario)) === null) {
        throw new ErroreUtentiAccessi("AUSILIARIO_INESISTENTE");
      }
      const validi = verificaDati(dati);
      await verificaEmailLibera(client, validi.email, ausiliario);
      await verificaEnte(client, validi.ente);
      const attuale = await ausiliarioConEnte(client, ausiliario);
      if (
        attuale.enteId !== validi.ente &&
        (await contaSegnalazioniPreseInCarico(client, ausiliario)) > 0
      ) {
        throw new ErroreUtentiAccessi("CAMBIO_ENTE_NON_CONSENTITO");
      }
      await aggiornaAusiliarioNelDatabase(client, ausiliario, {
        email: validi.email,
        nome: validi.nome,
        cognome: validi.cognome,
        enteId: validi.ente,
      });
      return ausiliarioConEnte(client, ausiliario);
    }, pool);
  } catch (errore) {
    return errorePersistenza(errore);
  }
}

/**
 * SD_ADM_2 3.a1.5–3.a1.6: disattiva l'account se non ha segnalazioni prese in carico (VD_19) e ne
 * chiude le sessioni, in un'unica transazione con la riga dell'Ausiliario bloccata. Segnalazioni
 * e verifiche restano. COD-22: la presa in carico dovrà leggere la stessa riga con FOR SHARE e
 * verificare ATTIVO nella sua transazione.
 */
export async function disattivaAusiliario(
  contesto: ContestoUtentiAccessi,
  ausiliario: number,
): Promise<AusiliarioConEnte> {
  if (!idValido(ausiliario)) {
    throw new ErroreUtentiAccessi("AUSILIARIO_INESISTENTE");
  }
  return eseguiInTransazione(async (client) => {
    const stato = await bloccaAusiliario(client, ausiliario);
    if (stato === null) {
      throw new ErroreUtentiAccessi("AUSILIARIO_INESISTENTE");
    }
    if (stato === "DISATTIVATO") {
      throw new ErroreUtentiAccessi("AUSILIARIO_GIA_DISATTIVATO");
    }
    if ((await contaSegnalazioniPreseInCarico(client, ausiliario)) > 0) {
      throw new ErroreUtentiAccessi("AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO");
    }
    await disattivaAusiliarioNelDatabase(client, ausiliario);
    await eliminaSessioniUtente(client, ausiliario);
    return ausiliarioConEnte(client, ausiliario);
  }, contesto.pool);
}
