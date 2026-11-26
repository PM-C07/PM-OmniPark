// Errori di dominio del sottosistema Segnalazioni, con i codici delle specifiche
// docs/test/cp_riscontroAnpr.md, cp_segnalazioniEnte.md, cp_chiusuraSegnalazione.md e
// cp_panoramicaEnti.md.

export type CodiceErroreSegnalazioni =
  | "LETTURA_INCOMPLETA"
  | "TARGA_NON_VALIDA"
  | "LETTURA_NON_VALIDA"
  | "STALLO_INESISTENTE"
  | "AUSILIARIO_NON_ATTIVO"
  | "ENTE_NON_AMMESSO"
  | "ISTANTE_NON_VALIDO"
  | "SEGNALAZIONE_INESISTENTE"
  | "ESITO_NON_VALIDO"
  | "SEGNALAZIONE_GIA_CHIUSA"
  | "SEGNALAZIONE_PRESA_DA_ALTRI"
  | "ENTE_INESISTENTE";

const MESSAGGI: Readonly<Record<CodiceErroreSegnalazioni, string>> = {
  LETTURA_INCOMPLETA: "La lettura è incompleta: servono targa, stallo, data e ora.",
  TARGA_NON_VALIDA: "La targa letta non è valida.",
  LETTURA_NON_VALIDA: "La data e ora della lettura è successiva all'istante corrente.",
  STALLO_INESISTENTE: "Lo stallo non esiste.",
  AUSILIARIO_NON_ATTIVO: "L'operazione è riservata agli Ausiliari del Traffico attivi.",
  ENTE_NON_AMMESSO: "Non puoi operare sulle segnalazioni di questo ente.",
  ISTANTE_NON_VALIDO: "L'istante indicato non è valido.",
  SEGNALAZIONE_INESISTENTE: "La segnalazione non esiste.",
  ESITO_NON_VALIDO: "Indica l'esito: sosta irregolare accertata o non confermata.",
  SEGNALAZIONE_GIA_CHIUSA: "La segnalazione è già chiusa.",
  SEGNALAZIONE_PRESA_DA_ALTRI: "La segnalazione è presa in carico da un altro Ausiliario.",
  ENTE_INESISTENTE: "L'ente indicato non esiste.",
};

export class ErroreSegnalazioni extends Error {
  readonly codice: CodiceErroreSegnalazioni;

  constructor(codice: CodiceErroreSegnalazioni, opzioni?: { cause?: unknown }) {
    super(MESSAGGI[codice], opzioni);
    this.name = "ErroreSegnalazioni";
    this.codice = codice;
  }
}
