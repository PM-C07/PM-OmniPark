import { describe, expect, it } from "vitest";
import {
  CAMPI_ESITO_VERIFICA,
  descriviPermesso,
  rispostaAllEsito,
  type PermessoDellElenco,
} from "./permessiDaVerificare.ts";
import { interpretaRisposta } from "./risposteApi.ts";

// Test frame TF-PERUI-01…07 di docs/test/cp_permessiInterfaccia.md (OMP-63, parte B).

// Messaggi delle API (§3, src/application/segnalazioni/errori.ts).
const GIA_REGISTRATA = "L'esito della verifica di questa sosta è già registrato: vale il primo.";
const NON_ATTIVA = "La sosta non è più attiva: non c'è più nulla da verificare.";

/** Permesso di prova `P(numeroStallo, tipoDiStallo, targa)` (§3). */
function P(numeroStallo: number, tipoDiStallo: string, targa: string): PermessoDellElenco {
  return {
    sostaId: 1,
    stalloId: 15,
    numeroStallo,
    tipoDiStallo,
    latitudine: 40.68829,
    longitudine: 14.52214,
    targa,
    dichiarazioneDiPermesso: "Dichiaro di esporre il permesso previsto per lo stallo",
  } as PermessoDellElenco;
}

describe("OMP-63 · cp_permessiInterfaccia", () => {
  // ---- Descrizione nell'elenco ----

  it('RF_OP_2 · TF-PERUI-01 · permesso su stallo n. 2 ROSA, targa AB123CD → "Stallo n. 2 rosa · targa AB123CD"', () => {
    expect(descriviPermesso(P(2, "ROSA", "AB123CD"))).toBe("Stallo n. 2 rosa · targa AB123CD");
  });

  it('RF_OP_2 · TF-PERUI-02 · permesso su stallo n. 1 DISABILI, targa IJ789KL → "Stallo n. 1 per persone con disabilità · targa IJ789KL"', () => {
    expect(descriviPermesso(P(1, "DISABILI", "IJ789KL"))).toBe(
      "Stallo n. 1 per persone con disabilità · targa IJ789KL",
    );
  });

  // ---- Risposta all'esito ----

  it("RF_OP_5 · TF-PERUI-03 · esito CONFORME registrato, segnalazione null → registrato, «Esito registrato: permesso conforme.»", () => {
    const esito = interpretaRisposta(
      200,
      { verifica: 3, segnalazione: null },
      CAMPI_ESITO_VERIFICA,
    );

    expect(rispostaAllEsito(esito, "CONFORME")).toEqual({
      tipo: "registrato",
      messaggio: "Esito registrato: permesso conforme.",
    });
  });

  it("RF_OP_5 · TF-PERUI-04 · esito NON_CONFORME registrato con segnalazione 7 → registrato, messaggio della sosta irregolare accertata già chiusa", () => {
    const esito = interpretaRisposta(200, { verifica: 3, segnalazione: 7 }, CAMPI_ESITO_VERIFICA);

    expect(rispostaAllEsito(esito, "NON_CONFORME")).toEqual({
      tipo: "registrato",
      messaggio:
        "Esito registrato: permesso non conforme. È stata registrata una segnalazione di sosta irregolare accertata, già chiusa.",
    });
  });

  it("ISSUE_40 · TF-PERUI-05 · 409 VERIFICA_GIA_REGISTRATA su CONFORME → nonDisponibile con il messaggio della API", () => {
    const esito = interpretaRisposta(
      409,
      { errore: { codice: "VERIFICA_GIA_REGISTRATA", messaggio: GIA_REGISTRATA } },
      CAMPI_ESITO_VERIFICA,
    );

    expect(rispostaAllEsito(esito, "CONFORME")).toEqual({
      tipo: "nonDisponibile",
      messaggio: GIA_REGISTRATA,
    });
  });

  it("ISSUE_40 · TF-PERUI-06 · 409 SOSTA_NON_ATTIVA su NON_CONFORME → nonDisponibile con il messaggio della API", () => {
    const esito = interpretaRisposta(
      409,
      { errore: { codice: "SOSTA_NON_ATTIVA", messaggio: NON_ATTIVA } },
      CAMPI_ESITO_VERIFICA,
    );

    expect(rispostaAllEsito(esito, "NON_CONFORME")).toEqual({
      tipo: "nonDisponibile",
      messaggio: NON_ATTIVA,
    });
  });

  it("ISSUE_40 · TF-PERUI-07 · 401 SESSIONE_NON_VALIDA su CONFORME → sessioneScaduta", () => {
    const esito = interpretaRisposta(
      401,
      { errore: { codice: "SESSIONE_NON_VALIDA", messaggio: "Sessione scaduta." } },
      CAMPI_ESITO_VERIFICA,
    );

    expect(rispostaAllEsito(esito, "CONFORME")).toEqual({ tipo: "sessioneScaduta" });
  });
});
