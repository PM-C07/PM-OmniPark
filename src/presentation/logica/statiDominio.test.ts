import { describe, expect, it } from "vitest";
import { descriviStato } from "./statiDominio.ts";

describe("descriviStato", () => {
  it("RF_STALLI_1 · TF-STA-UI-01 · stallo LIBERO → Libero, verde", () => {
    expect(descriviStato("stallo", "LIBERO")).toEqual({ testo: "Libero", tono: "verde" });
  });

  it("RF_STALLI_1 · TF-STA-UI-02 · stallo OCCUPATO → Occupato, rosso", () => {
    expect(descriviStato("stallo", "OCCUPATO")).toEqual({ testo: "Occupato", tono: "rosso" });
  });

  it("RF_STALLI_1 · TF-STA-UI-03 · stallo NON_DISPONIBILE → Non disponibile, arancione", () => {
    expect(descriviStato("stallo", "NON_DISPONIBILE")).toEqual({
      testo: "Non disponibile",
      tono: "arancione",
    });
  });

  it("RF_STALLI_1 · TF-STA-UI-04 · stallo SCONOSCIUTO → Sconosciuto, grigio", () => {
    expect(descriviStato("stallo", "SCONOSCIUTO")).toEqual({
      testo: "Sconosciuto",
      tono: "grigio",
    });
  });

  it("ISSUE_28 · TF-STA-UI-05 · sosta ATTIVA → Attiva, verde", () => {
    expect(descriviStato("sosta", "ATTIVA")).toEqual({ testo: "Attiva", tono: "verde" });
  });

  it("ISSUE_28 · TF-STA-UI-06 · sosta SCADUTA → Scaduta, arancione", () => {
    expect(descriviStato("sosta", "SCADUTA")).toEqual({ testo: "Scaduta", tono: "arancione" });
  });

  it("ISSUE_28 · TF-STA-UI-07 · sosta TERMINATA → Terminata, grigio", () => {
    expect(descriviStato("sosta", "TERMINATA")).toEqual({ testo: "Terminata", tono: "grigio" });
  });

  it("RF_OP_1 · TF-STA-UI-08 · segnalazione APERTA → Aperta, rosso", () => {
    expect(descriviStato("segnalazione", "APERTA")).toEqual({ testo: "Aperta", tono: "rosso" });
  });

  it("RF_OP_1 · TF-STA-UI-09 · segnalazione PRESA_IN_CARICO → Presa in carico, blu", () => {
    expect(descriviStato("segnalazione", "PRESA_IN_CARICO")).toEqual({
      testo: "Presa in carico",
      tono: "blu",
    });
  });

  it("RF_OP_1 · TF-STA-UI-10 · segnalazione CHIUSA → Chiusa, grigio", () => {
    expect(descriviStato("segnalazione", "CHIUSA")).toEqual({ testo: "Chiusa", tono: "grigio" });
  });

  it("NRF_USA_1 · TF-STA-UI-11 · stallo con stato ATTIVA non previsto → Stato non riconosciuto, grigio", () => {
    expect(descriviStato("stallo", "ATTIVA")).toEqual({
      testo: "Stato non riconosciuto",
      tono: "grigio",
    });
  });

  it("NRF_USA_1 · TF-STA-UI-12 · segnalazione con stato vuoto → Stato non riconosciuto, grigio", () => {
    expect(descriviStato("segnalazione", "")).toEqual({
      testo: "Stato non riconosciuto",
      tono: "grigio",
    });
  });

  it("RF_ADM_2 · TF-STA-UI-13 · account ATTIVO → Attivo, verde", () => {
    expect(descriviStato("account", "ATTIVO")).toEqual({ testo: "Attivo", tono: "verde" });
  });

  it("RF_ADM_2 · TF-STA-UI-14 · account DISATTIVATO → Disattivato, grigio", () => {
    expect(descriviStato("account", "DISATTIVATO")).toEqual({
      testo: "Disattivato",
      tono: "grigio",
    });
  });

  it("NRF_USA_1 · TF-STA-UI-15 · account con stato APERTA non previsto → Stato non riconosciuto, grigio", () => {
    expect(descriviStato("account", "APERTA")).toEqual({
      testo: "Stato non riconosciuto",
      tono: "grigio",
    });
  });
});
