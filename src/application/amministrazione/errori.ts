// Errori di dominio del sottosistema Amministrazione, con i codici di docs/test/cp_panoramicaEnti.md.

export type CodiceErroreAmministrazione = "ENTE_INESISTENTE";

const MESSAGGI: Readonly<Record<CodiceErroreAmministrazione, string>> = {
  ENTE_INESISTENTE: "L'ente indicato non esiste.",
};

export class ErroreAmministrazione extends Error {
  readonly codice: CodiceErroreAmministrazione;

  constructor(codice: CodiceErroreAmministrazione, opzioni?: { cause?: unknown }) {
    super(MESSAGGI[codice], opzioni);
    this.name = "ErroreAmministrazione";
    this.codice = codice;
  }
}
