import { describe, expect, it } from "vitest";
import {
  CAMPI_ACCESSO,
  CAMPI_AGGIUNTA_TARGA,
  CAMPI_REGISTRAZIONE,
  CAMPI_RIMOZIONE_TARGA,
  erroreDiRete,
  interpretaRisposta,
} from "./risposteApi.ts";

const MSG_GENERICO = "Si è verificato un errore. Riprova più tardi.";
const MSG_RETE = "Impossibile contattare il server. Controlla la connessione e riprova.";

function erroreApi(codice: string, messaggio: string) {
  return { errore: { codice, messaggio } };
}

describe("interpretazione delle risposte delle API", () => {
  it("RF_AUTH_4 · TF-RAP-01 · 200 con i dati dell'utente → successo con il corpo", () => {
    const corpo = { utente: { id: 8, ruolo: "AUTOMOBILISTA", ente: null } };
    expect(interpretaRisposta(200, corpo, CAMPI_ACCESSO)).toEqual({
      esito: "successo",
      dati: corpo,
    });
  });

  it("RF_AUTH_5 · TF-RAP-02 · 201 con le targhe aggiornate → successo con il corpo", () => {
    const corpo = { targhe: [{ veicolo: 3, targa: "MN234PQ" }] };
    expect(interpretaRisposta(201, corpo, CAMPI_AGGIUNTA_TARGA)).toEqual({
      esito: "successo",
      dati: corpo,
    });
  });

  it("RF_AUTH_4 · TF-RAP-03 · 204 senza corpo → successo con dati null", () => {
    expect(interpretaRisposta(204, null, CAMPI_ACCESSO)).toEqual({
      esito: "successo",
      dati: null,
    });
  });

  it("RF_AUTH_1 · TF-RAP-04 · EMAIL_GIA_REGISTRATA nella registrazione → campo email", () => {
    const corpo = erroreApi("EMAIL_GIA_REGISTRATA", "L'email è già registrata.");
    expect(interpretaRisposta(409, corpo, CAMPI_REGISTRAZIONE)).toEqual({
      esito: "errore",
      campo: "email",
      messaggio: "L'email è già registrata.",
    });
  });

  it("RF_AUTH_1 · TF-RAP-05 · EMAIL_NON_VALIDA nella registrazione → campo email", () => {
    const msg = "L'indirizzo email non è valido.";
    expect(
      interpretaRisposta(422, erroreApi("EMAIL_NON_VALIDA", msg), CAMPI_REGISTRAZIONE),
    ).toEqual({ esito: "errore", campo: "email", messaggio: msg });
  });

  it("RF_AUTH_1 · TF-RAP-06 · PASSWORD_TROPPO_CORTA nella registrazione → campo password", () => {
    const msg = "La password deve avere almeno 8 caratteri.";
    expect(
      interpretaRisposta(422, erroreApi("PASSWORD_TROPPO_CORTA", msg), CAMPI_REGISTRAZIONE),
    ).toEqual({ esito: "errore", campo: "password", messaggio: msg });
  });

  it("RF_AUTH_1 · TF-RAP-07 · TARGA_NON_VALIDA nella registrazione → campo targa", () => {
    const msg = "La targa non è valida: usa il formato AB123CD.";
    expect(
      interpretaRisposta(422, erroreApi("TARGA_NON_VALIDA", msg), CAMPI_REGISTRAZIONE),
    ).toEqual({ esito: "errore", campo: "targa", messaggio: msg });
  });

  it("ISSUE_28 · TF-RAP-08 · RICHIESTA_NON_VALIDA nella registrazione → campo generale", () => {
    const msg = "La richiesta non è valida.";
    expect(
      interpretaRisposta(422, erroreApi("RICHIESTA_NON_VALIDA", msg), CAMPI_REGISTRAZIONE),
    ).toEqual({ esito: "errore", campo: "generale", messaggio: msg });
  });

  it("RF_AUTH_4 · TF-RAP-09 · 401 CREDENZIALI_NON_VALIDE nell'accesso → campo generale, non sessione scaduta", () => {
    const corpo = erroreApi("CREDENZIALI_NON_VALIDE", "Email o password non corrette.");
    expect(interpretaRisposta(401, corpo, CAMPI_ACCESSO)).toEqual({
      esito: "errore",
      campo: "generale",
      messaggio: "Email o password non corrette.",
    });
  });

  it("RF_AUTH_4 · TF-RAP-10 · 403 ACCOUNT_DISATTIVATO nell'accesso → campo generale", () => {
    const msg = "L'account è disattivato.";
    expect(interpretaRisposta(403, erroreApi("ACCOUNT_DISATTIVATO", msg), CAMPI_ACCESSO)).toEqual({
      esito: "errore",
      campo: "generale",
      messaggio: msg,
    });
  });

  it("NRF_SIC_1 · TF-RAP-11 · 401 SESSIONE_NON_VALIDA → sessioneScaduta", () => {
    const msg = "La sessione non è valida. Accedi di nuovo.";
    expect(
      interpretaRisposta(401, erroreApi("SESSIONE_NON_VALIDA", msg), CAMPI_AGGIUNTA_TARGA),
    ).toEqual({ esito: "sessioneScaduta" });
  });

  it("RF_AUTH_5 · TF-RAP-12 · TARGA_GIA_PRESENTE nell'aggiunta → campo targa", () => {
    const msg = "La targa è già presente nel profilo.";
    expect(
      interpretaRisposta(409, erroreApi("TARGA_GIA_PRESENTE", msg), CAMPI_AGGIUNTA_TARGA),
    ).toEqual({ esito: "errore", campo: "targa", messaggio: msg });
  });

  it("RF_AUTH_5 · TF-RAP-13 · TARGA_NON_VALIDA nell'aggiunta → campo targa", () => {
    const msg = "La targa non è valida: usa il formato AB123CD.";
    expect(
      interpretaRisposta(422, erroreApi("TARGA_NON_VALIDA", msg), CAMPI_AGGIUNTA_TARGA),
    ).toEqual({ esito: "errore", campo: "targa", messaggio: msg });
  });

  it("RF_AUTH_5 · TF-RAP-14 · ULTIMA_TARGA nella rimozione → campo riga", () => {
    const msg = "Non puoi rimuovere l'unica targa del profilo.";
    expect(interpretaRisposta(409, erroreApi("ULTIMA_TARGA", msg), CAMPI_RIMOZIONE_TARGA)).toEqual({
      esito: "errore",
      campo: "riga",
      messaggio: msg,
    });
  });

  it("RF_AUTH_5 · TF-RAP-15 · TARGA_CON_SOSTA_ATTIVA nella rimozione → campo riga", () => {
    const msg = "La targa ha una sosta attiva e non può essere rimossa.";
    expect(
      interpretaRisposta(409, erroreApi("TARGA_CON_SOSTA_ATTIVA", msg), CAMPI_RIMOZIONE_TARGA),
    ).toEqual({ esito: "errore", campo: "riga", messaggio: msg });
  });

  it("ISSUE_28 · TF-RAP-16 · 500 ERRORE_INTERNO → campo generale con il messaggio del server", () => {
    expect(
      interpretaRisposta(500, erroreApi("ERRORE_INTERNO", MSG_GENERICO), CAMPI_ACCESSO),
    ).toEqual({ esito: "errore", campo: "generale", messaggio: MSG_GENERICO });
  });

  it("ISSUE_28 · TF-RAP-17 · 502 con corpo non riconosciuto → campo generale con messaggio generico", () => {
    expect(interpretaRisposta(502, "<html>Bad gateway</html>", CAMPI_ACCESSO)).toEqual({
      esito: "errore",
      campo: "generale",
      messaggio: MSG_GENERICO,
    });
  });

  it("ISSUE_28 · TF-RAP-18 · richiesta non arrivata al server → campo generale con messaggio di rete", () => {
    expect(erroreDiRete()).toEqual({
      esito: "errore",
      campo: "generale",
      messaggio: MSG_RETE,
    });
  });

  it("ISSUE_28 · TF-RAP-19 · TARGA_NON_PRESENTE nella rimozione → accanto alla targa (riga)", () => {
    const msg = "La targa non è presente nel profilo.";
    expect(
      interpretaRisposta(404, erroreApi("TARGA_NON_PRESENTE", msg), CAMPI_RIMOZIONE_TARGA),
    ).toEqual({ esito: "errore", campo: "riga", messaggio: msg });
  });
});
