import { describe, expect, it } from "vitest";
import {
  CAMPI_PROLUNGAMENTO,
  disponibilitaProlungamento,
  messaggioProlungata,
  opzioniProlungamento,
  tempoAggiuntivoProposto,
  tempoDisponibile,
} from "./prolungamento.ts";
import { interpretaRisposta } from "./risposteApi.ts";

// Specifica: docs/test/cp_prolungamentoInterfaccia.md (TF-PROUI-01…21)

const AV = "2026-11-20T08:42:00.000Z";
const SC60 = "2026-11-20T09:42:00.000Z";
const SC70 = "2026-11-20T09:52:00.000Z";
const SC130 = "2026-11-20T10:52:00.000Z";
const SC175 = "2026-11-20T11:37:00.000Z";
const SC180 = "2026-11-20T11:42:00.000Z";
const SC60s = "2026-11-20T09:42:30.000Z";

function erroreApi(codice: string, messaggio: string) {
  return { errore: { codice, messaggio } };
}

describe("logica del prolungamento nell'interfaccia (cp_prolungamentoInterfaccia)", () => {
  it("RF_SOSTA_2 · TF-PROUI-01 · 60 minuti su 180 → 120 minuti disponibili", () => {
    expect(tempoDisponibile(180, AV, SC60)).toBe(120);
  });

  it("RF_SOSTA_2 · TF-PROUI-02 · 175 minuti su 180 → 5 minuti disponibili", () => {
    expect(tempoDisponibile(180, AV, SC175)).toBe(5);
  });

  it("RF_SOSTA_2 · TF-PROUI-03 · durata massima già raggiunta → 0 minuti disponibili", () => {
    expect(tempoDisponibile(180, AV, SC180)).toBe(0);
  });

  it("RF_SOSTA_2 · TF-PROUI-04 · durata attuale di 60 minuti e 30 secondi su 120 → 59 minuti (per difetto)", () => {
    expect(tempoDisponibile(120, AV, SC60s)).toBe(59);
  });

  it("RF_SOSTA_2 · TF-PROUI-05 · 120 minuti disponibili → multipli di 15 fino a 120", () => {
    expect(opzioniProlungamento(180, AV, SC60)).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
  });

  it("RF_SOSTA_2 · TF-PROUI-06 · 50 minuti disponibili → 50 come ultima opzione", () => {
    expect(opzioniProlungamento(120, AV, SC70)).toEqual([15, 30, 45, 50]);
  });

  it("RF_SOSTA_2 · TF-PROUI-07 · nessun minuto prolungabile → nessuna opzione", () => {
    expect(opzioniProlungamento(180, AV, SC175)).toEqual([]);
  });

  it("ISSUE_33 · TF-PROUI-08 · 120 minuti disponibili → proposti 60", () => {
    expect(tempoAggiuntivoProposto(180, AV, SC60)).toBe(60);
  });

  it("ISSUE_33 · TF-PROUI-09 · 50 minuti disponibili → proposti 50", () => {
    expect(tempoAggiuntivoProposto(180, AV, SC130)).toBe(50);
  });

  it("ISSUE_33 · TF-PROUI-10 · meno di 15 minuti disponibili → nessuna proposta (null)", () => {
    expect(tempoAggiuntivoProposto(180, AV, SC175)).toBe(null);
  });

  it("RF_SOSTA_2 · TF-PROUI-11 · ATTIVA con opzioni → disponibile", () => {
    expect(disponibilitaProlungamento("ATTIVA", [15, 30])).toEqual({ disponibile: true });
  });

  it("RF_SOSTA_2 · TF-PROUI-12 · ATTIVA senza opzioni → non disponibile con il motivo della durata massima", () => {
    expect(disponibilitaProlungamento("ATTIVA", [])).toEqual({
      disponibile: false,
      motivo:
        "La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo.",
    });
  });

  it("RF_SOSTA_2 · TF-PROUI-13 · SCADUTA → non disponibile con il motivo della scadenza", () => {
    expect(disponibilitaProlungamento("SCADUTA", [15, 30])).toEqual({
      disponibile: false,
      motivo: "La sosta è scaduta e non si può prolungare: puoi avviarne una nuova.",
    });
  });

  it("ISSUE_33 · TF-PROUI-14 · altro stato → non disponibile con il motivo generico", () => {
    expect(disponibilitaProlungamento("TERMINATA", [15])).toEqual({
      disponibile: false,
      motivo: "La sosta non si può prolungare.",
    });
  });

  it("RF_SOSTA_2 · TF-PROUI-15 · 200 con la sosta prolungata → successo con il corpo", () => {
    const corpo = { sosta: 41, orarioDiScadenza: "2026-11-20T10:42:00.000Z", importo: 150 };
    expect(interpretaRisposta(200, corpo, CAMPI_PROLUNGAMENTO)).toEqual({
      esito: "successo",
      dati: corpo,
    });
  });

  it("RF_WALLET_2 · TF-PROUI-16 · CREDITO_INSUFFICIENTE → errore sul campo credito", () => {
    const msg = "Credito insufficiente: ricarica il wallet per prolungare la sosta.";
    expect(
      interpretaRisposta(409, erroreApi("CREDITO_INSUFFICIENTE", msg), CAMPI_PROLUNGAMENTO),
    ).toEqual({ esito: "errore", campo: "credito", messaggio: msg });
  });

  it("RF_SOSTA_2 · TF-PROUI-17 · DURATA_OLTRE_IL_MASSIMO → errore sul campo tempo con i minuti disponibili", () => {
    const msg =
      "Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 120 minuti.";
    expect(
      interpretaRisposta(422, erroreApi("DURATA_OLTRE_IL_MASSIMO", msg), CAMPI_PROLUNGAMENTO),
    ).toEqual({ esito: "errore", campo: "tempo", messaggio: msg });
  });

  it("ISSUE_33 · TF-PROUI-18 · DURATA_NON_VALIDA → errore sul campo tempo", () => {
    const msg = "Il tempo aggiuntivo deve essere di almeno 15 minuti.";
    expect(
      interpretaRisposta(422, erroreApi("DURATA_NON_VALIDA", msg), CAMPI_PROLUNGAMENTO),
    ).toEqual({ esito: "errore", campo: "tempo", messaggio: msg });
  });

  it("RF_SOSTA_2 · TF-PROUI-19 · SOSTA_SCADUTA → errore sul campo generale", () => {
    const msg = "La sosta è scaduta e non si può prolungare: puoi avviarne una nuova.";
    expect(interpretaRisposta(409, erroreApi("SOSTA_SCADUTA", msg), CAMPI_PROLUNGAMENTO)).toEqual({
      esito: "errore",
      campo: "generale",
      messaggio: msg,
    });
  });

  it("NRF_SIC_1 · TF-PROUI-20 · 401 SESSIONE_NON_VALIDA → sessione scaduta", () => {
    const msg = "La sessione è scaduta: accedi di nuovo.";
    expect(
      interpretaRisposta(401, erroreApi("SESSIONE_NON_VALIDA", msg), CAMPI_PROLUNGAMENTO),
    ).toEqual({ esito: "sessioneScaduta" });
  });

  it('RF_SOSTA_2 · TF-PROUI-21 · nuova scadenza 10:42 UTC → "Sosta prolungata: scade alle 11:42."', () => {
    expect(messaggioProlungata("2026-11-20T10:42:00.000Z")).toBe(
      "Sosta prolungata: scade alle 11:42.",
    );
  });
});
