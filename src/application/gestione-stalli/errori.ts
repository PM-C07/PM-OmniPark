// Errori di dominio del sottosistema Gestione stalli, con i codici delle specifiche
// docs/test/cp_rilevazioni.md, cp_mappa.md, cp_statoPerLaSosta.md e cp_conteggio.md.

export type CodiceErroreGestioneStalli =
  | "STALLO_INESISTENTE"
  | "RILEVAZIONE_INCOMPLETA"
  | "RILEVAZIONE_SUPERATA"
  | "RILEVAZIONE_NON_VALIDA"
  | "STALLO_NON_OCCUPATO"
  | "STALLO_NON_IMPEGNATO"
  | "ZONA_NON_VALIDA"
  | "ISTANTE_NON_VALIDO"
  | "ENTE_INESISTENTE";

const MESSAGGI: Readonly<Record<CodiceErroreGestioneStalli, string>> = {
  STALLO_INESISTENTE: "Lo stallo non esiste.",
  RILEVAZIONE_INCOMPLETA: "La rilevazione è incompleta: servono stallo, presenza, data e ora.",
  RILEVAZIONE_SUPERATA: "La rilevazione è precedente all'ultima registrata per lo stallo.",
  RILEVAZIONE_NON_VALIDA: "La data e ora della rilevazione è successiva all'istante corrente.",
  STALLO_NON_OCCUPATO: "Lo stallo non risulta occupato: la sosta non si può avviare.",
  STALLO_NON_IMPEGNATO: "Lo stallo non è impegnato da una sosta.",
  ZONA_NON_VALIDA: "La zona della mappa non è valida.",
  ISTANTE_NON_VALIDO: "L'istante indicato non è valido.",
  ENTE_INESISTENTE: "L'ente non esiste.",
};

export class ErroreGestioneStalli extends Error {
  readonly codice: CodiceErroreGestioneStalli;

  constructor(codice: CodiceErroreGestioneStalli, opzioni?: { cause?: unknown }) {
    super(MESSAGGI[codice], opzioni);
    this.name = "ErroreGestioneStalli";
    this.codice = codice;
  }
}
