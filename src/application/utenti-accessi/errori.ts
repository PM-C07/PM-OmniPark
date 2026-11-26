// Errori di dominio del sottosistema Utenti e accessi, con i codici delle specifiche
// docs/test/cp_registraAutomobilista.md, cp_accedi.md, cp_targhe.md, cp_verificaAutorizzazione.md e
// cp_gestioneAusiliari.md.

export type CodiceErroreUtentiAccessi =
  | "EMAIL_GIA_REGISTRATA"
  | "EMAIL_NON_VALIDA"
  | "PASSWORD_TROPPO_CORTA"
  | "TARGA_NON_VALIDA"
  | "CREDENZIALI_NON_VALIDE"
  | "ACCOUNT_DISATTIVATO"
  | "SESSIONE_NON_VALIDA"
  | "TARGA_GIA_PRESENTE"
  | "ULTIMA_TARGA"
  | "TARGA_NON_PRESENTE"
  | "TARGA_CON_SOSTA_ATTIVA"
  | "RUOLO_NON_AMMESSO"
  | "ENTE_NON_AMMESSO"
  // Gestione degli Ausiliari (OMP-62, docs/test/cp_gestioneAusiliari.md)
  | "DATI_INCOMPLETI"
  | "ENTE_INESISTENTE"
  | "AUSILIARIO_INESISTENTE"
  | "AUSILIARIO_GIA_DISATTIVATO"
  | "AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO"
  | "CAMBIO_ENTE_NON_CONSENTITO";

const MESSAGGI: Readonly<Record<CodiceErroreUtentiAccessi, string>> = {
  EMAIL_GIA_REGISTRATA: "L'email è già registrata.",
  EMAIL_NON_VALIDA: "L'email non è valida.",
  PASSWORD_TROPPO_CORTA: "La password deve avere almeno 8 caratteri.",
  TARGA_NON_VALIDA: "La targa non è valida.",
  CREDENZIALI_NON_VALIDE: "Email o password non corrette.",
  ACCOUNT_DISATTIVATO: "L'account è stato disattivato.",
  SESSIONE_NON_VALIDA: "La sessione non è valida. Accedi di nuovo.",
  TARGA_GIA_PRESENTE: "La targa è già nel profilo.",
  ULTIMA_TARGA: "Non puoi rimuovere l'unica targa del profilo.",
  TARGA_NON_PRESENTE: "La targa non è nel profilo.",
  TARGA_CON_SOSTA_ATTIVA: "Non puoi rimuovere una targa con una sosta attiva.",
  RUOLO_NON_AMMESSO: "Il tuo ruolo non consente questa operazione.",
  ENTE_NON_AMMESSO: "Non puoi operare sui dati di questo ente.",
  DATI_INCOMPLETI: "Compila tutti i dati richiesti.",
  ENTE_INESISTENTE: "L'ente indicato non esiste.",
  AUSILIARIO_INESISTENTE: "L'Ausiliario del Traffico non esiste.",
  AUSILIARIO_GIA_DISATTIVATO: "L'account dell'Ausiliario è già disattivato.",
  AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO:
    "L'Ausiliario ha segnalazioni prese in carico: potrai disattivarlo dopo che le avrà chiuse.",
  CAMBIO_ENTE_NON_CONSENTITO:
    "L'Ausiliario ha segnalazioni prese in carico: potrai cambiargli l'ente dopo che le avrà chiuse.",
};

export class ErroreUtentiAccessi extends Error {
  readonly codice: CodiceErroreUtentiAccessi;

  constructor(codice: CodiceErroreUtentiAccessi, opzioni?: { cause?: unknown }) {
    super(MESSAGGI[codice], opzioni);
    this.name = "ErroreUtentiAccessi";
    this.codice = codice;
  }
}
