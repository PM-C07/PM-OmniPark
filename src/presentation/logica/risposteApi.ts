// Interpretazione delle risposte delle API nell'interfaccia (OMP-57, docs/test/cp_risposteApi.md):
// successo, errore di dominio accanto al campo, sessione scaduta (ritorno a /accesso).
// Nessuna dipendenza da React né dai sottosistemi.

export type EsitoRisposta =
  | { esito: "successo"; dati: unknown }
  | { esito: "errore"; campo: string; messaggio: string }
  | { esito: "sessioneScaduta" };

const MESSAGGIO_GENERICO = "Si è verificato un errore. Riprova più tardi.";
const MESSAGGIO_RETE = "Impossibile contattare il server. Controlla la connessione e riprova.";

export const CAMPI_REGISTRAZIONE: Readonly<Record<string, string>> = {
  EMAIL_NON_VALIDA: "email",
  EMAIL_GIA_REGISTRATA: "email",
  PASSWORD_TROPPO_CORTA: "password",
  TARGA_NON_VALIDA: "targa",
};

/** Credenziali errate e account disattivato vanno sull'avviso generale (UC_AUTH_4 2.a1). */
export const CAMPI_ACCESSO: Readonly<Record<string, string>> = {};

export const CAMPI_AGGIUNTA_TARGA: Readonly<Record<string, string>> = {
  TARGA_NON_VALIDA: "targa",
  TARGA_GIA_PRESENTE: "targa",
};

export const CAMPI_RIMOZIONE_TARGA: Readonly<Record<string, string>> = {
  ULTIMA_TARGA: "riga",
  TARGA_CON_SOSTA_ATTIVA: "riga",
  TARGA_NON_PRESENTE: "riga",
};

function erroreDiDominio(corpo: unknown): { codice: string; messaggio: string } | null {
  const errore = (corpo as { errore?: unknown } | null)?.errore as
    { codice?: unknown; messaggio?: unknown } | undefined;
  if (
    typeof errore?.codice === "string" &&
    errore.codice !== "" &&
    typeof errore.messaggio === "string" &&
    errore.messaggio !== ""
  ) {
    return { codice: errore.codice, messaggio: errore.messaggio };
  }
  return null;
}

export function interpretaRisposta(
  status: number,
  corpo: unknown,
  campiPerCodice: Readonly<Record<string, string>>,
): EsitoRisposta {
  if (status >= 200 && status <= 299) {
    return { esito: "successo", dati: corpo };
  }
  const errore = erroreDiDominio(corpo);
  if (errore?.codice === "SESSIONE_NON_VALIDA") {
    return { esito: "sessioneScaduta" };
  }
  if (errore) {
    const campo = Object.hasOwn(campiPerCodice, errore.codice)
      ? campiPerCodice[errore.codice]
      : "generale";
    return { esito: "errore", campo, messaggio: errore.messaggio };
  }
  return { esito: "errore", campo: "generale", messaggio: MESSAGGIO_GENERICO };
}

export function erroreDiRete(): EsitoRisposta {
  return { esito: "errore", campo: "generale", messaggio: MESSAGGIO_RETE };
}

/** Esegue la richiesta e ne interpreta la risposta; un errore di rete diventa un esito. */
export async function chiamaApi(
  url: string,
  opzioni: RequestInit,
  campiPerCodice: Readonly<Record<string, string>>,
): Promise<EsitoRisposta> {
  let risposta: Response;
  try {
    risposta = await fetch(url, { ...opzioni, credentials: "same-origin" });
  } catch {
    return erroreDiRete();
  }
  const testo = await risposta.text().catch(() => "");
  let corpo: unknown = null;
  if (testo !== "") {
    try {
      corpo = JSON.parse(testo);
    } catch {
      corpo = testo;
    }
  }
  return interpretaRisposta(risposta.status, corpo, campiPerCodice);
}
