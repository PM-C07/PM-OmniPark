// Errori di dominio del sottosistema Gestione soste, con i codici delle specifiche
// docs/test/cp_calcoloImporto.md, cp_avvioSosta.md e cp_consultazione.md.

export type CodiceErroreGestioneSoste =
  | "TARGA_NON_NEL_PROFILO"
  | "STALLO_INESISTENTE"
  | "STALLO_NON_OCCUPATO"
  | "SOSTA_GIA_ATTIVA"
  | "STALLO_CON_SOSTA_ATTIVA"
  | "DURATA_NON_VALIDA"
  | "PERMESSO_MANCANTE"
  | "PERMESSO_NON_VALIDO"
  | "PERMESSO_NON_PREVISTO"
  | "CREDITO_INSUFFICIENTE"
  | "ENTE_INESISTENTE";

const MESSAGGI: Readonly<Record<CodiceErroreGestioneSoste, string>> = {
  TARGA_NON_NEL_PROFILO: "La targa non è tra quelle del tuo profilo.",
  STALLO_INESISTENTE: "Lo stallo non esiste.",
  STALLO_NON_OCCUPATO: "Lo stallo non risulta occupato: la sosta non si può avviare.",
  SOSTA_GIA_ATTIVA: "Per questa targa c'è già una sosta attiva.",
  STALLO_CON_SOSTA_ATTIVA: "Sullo stallo c'è già una sosta attiva.",
  DURATA_NON_VALIDA: "La durata deve essere tra 15 minuti e la durata massima dello stallo.",
  PERMESSO_MANCANTE: "Per questo stallo servono la dichiarazione e la foto del permesso.",
  PERMESSO_NON_VALIDO: "La dichiarazione o la foto del permesso non sono valide.",
  PERMESSO_NON_PREVISTO: "Questo stallo non richiede un permesso.",
  CREDITO_INSUFFICIENTE: "Il credito del wallet non è sufficiente.",
  ENTE_INESISTENTE: "L'ente non esiste.",
};

export class ErroreGestioneSoste extends Error {
  readonly codice: CodiceErroreGestioneSoste;

  constructor(codice: CodiceErroreGestioneSoste, opzioni?: { cause?: unknown }) {
    super(MESSAGGI[codice], opzioni);
    this.name = "ErroreGestioneSoste";
    this.codice = codice;
  }
}
