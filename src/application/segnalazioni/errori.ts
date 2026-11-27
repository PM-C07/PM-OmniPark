// Errori di dominio del sottosistema Segnalazioni, con i codici delle specifiche
// docs/test/cp_riscontroAnpr.md, cp_segnalazioniEnte.md, cp_chiusuraSegnalazione.md e
// cp_panoramicaEnti.md, cp_presaInCarico.md, cp_statoDelPagamento.md e cp_verificaPermesso.md.

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
  | "ENTE_INESISTENTE"
  | "SEGNALAZIONE_NON_PRESA_IN_CARICO"
  | "SOSTA_INESISTENTE"
  | "SOSTA_NON_ATTIVA"
  | "NESSUN_PERMESSO_DA_VERIFICARE"
  | "VERIFICA_GIA_REGISTRATA"
  | "ESITO_VERIFICA_NON_VALIDO";

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
  SEGNALAZIONE_NON_PRESA_IN_CARICO: "Prendi in carico la segnalazione prima di continuare.",
  SOSTA_INESISTENTE: "La sosta non esiste.",
  SOSTA_NON_ATTIVA: "La sosta non è più attiva: non c'è più nulla da verificare.",
  NESSUN_PERMESSO_DA_VERIFICARE: "Per questa sosta non c'è un permesso da verificare.",
  VERIFICA_GIA_REGISTRATA:
    "L'esito della verifica di questa sosta è già registrato: vale il primo.",
  ESITO_VERIFICA_NON_VALIDO: "Indica l'esito della verifica: conforme o non conforme.",
};

export class ErroreSegnalazioni extends Error {
  readonly codice: CodiceErroreSegnalazioni;

  constructor(codice: CodiceErroreSegnalazioni, opzioni?: { cause?: unknown }) {
    super(MESSAGGI[codice], opzioni);
    this.name = "ErroreSegnalazioni";
    this.codice = codice;
  }
}
