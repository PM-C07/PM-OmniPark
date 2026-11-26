// Tabella unica codice di dominio → status HTTP per le route API (OMP-48, issue #27): 401 sessione,
// 403 ruolo o ente, 404 risorsa inesistente, 409 conflitto di stato, 422 dati non validi.
// Il tipo Record impone uno status per ogni codice di ogni Facade: un codice nuovo senza status fa
// fallire la compilazione. Le route dei simulatori (OMP-47) mantengono la loro traduzione.
import {
  ErroreAmministrazione,
  type CodiceErroreAmministrazione,
} from "../../application/amministrazione/facade.ts";
import {
  ErroreGestioneSoste,
  type CodiceErroreGestioneSoste,
} from "../../application/gestione-soste/facade.ts";
import {
  ErroreGestioneStalli,
  type CodiceErroreGestioneStalli,
} from "../../application/gestione-stalli/facade.ts";
import {
  ErroreSegnalazioni,
  type CodiceErroreSegnalazioni,
} from "../../application/segnalazioni/facade.ts";
import {
  ErroreUtentiAccessi,
  type CodiceErroreUtentiAccessi,
} from "../../application/utenti-accessi/facade.ts";
import { ErroreWallet, type CodiceErroreWallet } from "../../application/wallet/facade.ts";
import { unstable_rethrow } from "next/navigation";
import { rispostaErrore, rispostaErroreImprevisto } from "./_http.ts";

/** Codici propri delle API: richiesta malformata (corpo, parametri, id nel percorso). */
export type CodiceErroreApi = "RICHIESTA_NON_VALIDA";

const MESSAGGI_API: Readonly<Record<CodiceErroreApi, string>> = {
  RICHIESTA_NON_VALIDA: "La richiesta non è valida: controlla i dati inviati.",
};

export class ErroreApi extends Error {
  readonly codice: CodiceErroreApi;

  constructor(codice: CodiceErroreApi) {
    super(MESSAGGI_API[codice]);
    this.name = "ErroreApi";
    this.codice = codice;
  }
}

export type CodiceErrore =
  | CodiceErroreUtentiAccessi
  | CodiceErroreGestioneStalli
  | CodiceErroreWallet
  | CodiceErroreGestioneSoste
  | CodiceErroreSegnalazioni
  | CodiceErroreAmministrazione
  | CodiceErroreApi;

export const STATUS_PER_CODICE: Readonly<Record<CodiceErrore, 401 | 403 | 404 | 409 | 422>> = {
  // 401: sessione o credenziali
  SESSIONE_NON_VALIDA: 401,
  CREDENZIALI_NON_VALIDE: 401,
  // 403: ruolo, ente o account
  RUOLO_NON_AMMESSO: 403,
  ENTE_NON_AMMESSO: 403,
  ACCOUNT_DISATTIVATO: 403,
  AUSILIARIO_NON_ATTIVO: 403,
  // 404: risorsa inesistente
  STALLO_INESISTENTE: 404,
  TARGA_NON_PRESENTE: 404,
  WALLET_NON_TROVATO: 404,
  SEGNALAZIONE_INESISTENTE: 404,
  ENTE_INESISTENTE: 404,
  AUSILIARIO_INESISTENTE: 404,
  // 409: conflitto di stato
  EMAIL_GIA_REGISTRATA: 409,
  TARGA_GIA_PRESENTE: 409,
  ULTIMA_TARGA: 409,
  TARGA_CON_SOSTA_ATTIVA: 409,
  STALLO_NON_OCCUPATO: 409,
  STALLO_NON_IMPEGNATO: 409,
  SOSTA_GIA_ATTIVA: 409,
  STALLO_CON_SOSTA_ATTIVA: 409,
  CREDITO_INSUFFICIENTE: 409,
  PAGAMENTO_RIFIUTATO: 409,
  SOSTA_NON_ADDEBITABILE: 409,
  RILEVAZIONE_SUPERATA: 409,
  SEGNALAZIONE_GIA_CHIUSA: 409,
  SEGNALAZIONE_PRESA_DA_ALTRI: 409,
  AUSILIARIO_GIA_DISATTIVATO: 409,
  AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO: 409,
  CAMBIO_ENTE_NON_CONSENTITO: 409,
  // 422: dati non validi
  EMAIL_NON_VALIDA: 422,
  PASSWORD_TROPPO_CORTA: 422,
  TARGA_NON_VALIDA: 422,
  TARGA_NON_NEL_PROFILO: 422,
  DURATA_NON_VALIDA: 422,
  PERMESSO_MANCANTE: 422,
  PERMESSO_NON_VALIDO: 422,
  PERMESSO_NON_PREVISTO: 422,
  IMPORTO_NON_PREVISTO: 422,
  IMPORTO_NON_VALIDO: 422,
  ZONA_NON_VALIDA: 422,
  ISTANTE_NON_VALIDO: 422,
  RILEVAZIONE_INCOMPLETA: 422,
  RILEVAZIONE_NON_VALIDA: 422,
  LETTURA_INCOMPLETA: 422,
  LETTURA_NON_VALIDA: 422,
  ESITO_NON_VALIDO: 422,
  DATI_INCOMPLETI: 422,
  RICHIESTA_NON_VALIDA: 422,
};

const CLASSI_DI_DOMINIO = [
  ErroreUtentiAccessi,
  ErroreGestioneStalli,
  ErroreWallet,
  ErroreGestioneSoste,
  ErroreSegnalazioni,
  ErroreAmministrazione,
  ErroreApi,
] as const;

/**
 * Traduce un errore in risposta: un errore di dominio con il suo codice, il messaggio della Facade
 * e lo status della tabella; qualsiasi altro errore in 503 (database) o 500, senza dettagli.
 */
export function rispostaDaErrore(errore: unknown): Response {
  if (CLASSI_DI_DOMINIO.some((Classe) => errore instanceof Classe)) {
    const { codice, message } = errore as { codice: CodiceErrore; message: string };
    if (Object.hasOwn(STATUS_PER_CODICE, codice)) {
      return rispostaErrore(STATUS_PER_CODICE[codice], codice, message);
    }
  }
  return rispostaErroreImprevisto(errore);
}

/**
 * Esegue il corpo di una route e traduce qualsiasi errore con la tabella comune. Le eccezioni
 * interne di Next.js (per esempio l'interruzione del prerendering quando la route legge la
 * richiesta) tornano a Next.js con unstable_rethrow; fuori da Next.js non ha effetti.
 */
export async function eseguiRoute(corpo: () => Promise<Response>): Promise<Response> {
  try {
    return await corpo();
  } catch (errore) {
    unstable_rethrow(errore);
    return rispostaDaErrore(errore);
  }
}
