import { describe, expect, it } from "vitest";
import { confermaVisibile, scartoOrologio, statoMostrato, tempoRimanente } from "./sostaInCorso.ts";

const S = Date.parse("2026-11-20T10:42:00.000Z");
const A = Date.parse("2026-11-20T09:00:00.000Z");

describe("sosta in corso nell'interfaccia (cp_sostaInCorso)", () => {
  it("RF_SOSTA_7 · TF-SIC-01 · più di un'ora, 1 h 5 min → 1 h 05 min", () => {
    expect(tempoRimanente(S, S - 3_900_000)).toEqual({
      secondi: 3900,
      scaduta: false,
      testo: "1 h 05 min",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-02 · più di un'ora, esattamente 2 h → 2 h 00 min", () => {
    expect(tempoRimanente(S, S - 7_200_000)).toEqual({
      secondi: 7200,
      scaduta: false,
      testo: "2 h 00 min",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-03 · meno di un'ora, 270 s → 4 min 30 s", () => {
    expect(tempoRimanente(S, S - 270_000)).toEqual({
      secondi: 270,
      scaduta: false,
      testo: "4 min 30 s",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-04 · meno di un'ora, 65 s → 1 min 05 s", () => {
    expect(tempoRimanente(S, S - 65_000)).toEqual({
      secondi: 65,
      scaduta: false,
      testo: "1 min 05 s",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-05 · meno di un minuto, 45 s → 45 s", () => {
    expect(tempoRimanente(S, S - 45_000)).toEqual({
      secondi: 45,
      scaduta: false,
      testo: "45 s",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-06 · meno di un secondo, 400 ms → 1 s", () => {
    expect(tempoRimanente(S, S - 400)).toEqual({
      secondi: 1,
      scaduta: false,
      testo: "1 s",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-07 · scadenza raggiunta, zero → Scaduta", () => {
    expect(tempoRimanente(S, S)).toEqual({
      secondi: 0,
      scaduta: true,
      testo: "Scaduta",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-08 · scadenza superata di 5 s → Scaduta", () => {
    expect(tempoRimanente(S, S + 5_000)).toEqual({
      secondi: 0,
      scaduta: true,
      testo: "Scaduta",
    });
  });

  it("RF_SOSTA_7 · TF-SIC-09 · ATTIVA non scaduta → ATTIVA", () => {
    expect(statoMostrato("ATTIVA", false)).toBe("ATTIVA");
  });

  it("RF_SOSTA_7 · TF-SIC-10 · ATTIVA con timer a zero → SCADUTA", () => {
    expect(statoMostrato("ATTIVA", true)).toBe("SCADUTA");
  });

  it("RF_SOSTA_7 · TF-SIC-11 · SCADUTA dal server → SCADUTA", () => {
    expect(statoMostrato("SCADUTA", false)).toBe("SCADUTA");
  });

  it("ISSUE_29 · TF-SIC-12 · dispositivo indietro di 10 s → 10000", () => {
    expect(scartoOrologio("Fri, 20 Nov 2026 09:00:10 GMT", A, A + 1_000)).toBe(10000);
  });

  it("ISSUE_29 · TF-SIC-13 · dispositivo avanti di 29,6 s → -29600", () => {
    expect(scartoOrologio("Fri, 20 Nov 2026 09:00:00 GMT", A + 30_000, A + 30_200)).toBe(-29600);
  });

  it("ISSUE_29 · TF-SIC-14 · intestazione Date assente → 0", () => {
    expect(scartoOrologio(null, A, A + 1_000)).toBe(0);
  });

  it("ISSUE_29 · TF-SIC-15 · intestazione Date non leggibile → 0", () => {
    expect(scartoOrologio("ieri", A, A + 1_000)).toBe(0);
  });

  it("ISSUE_33 · TF-SIC-16 · nessuna conferma → messaggio non visibile", () => {
    expect(
      confermaVisibile(
        null,
        [{ id: 41, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }],
        A,
      ),
    ).toBe(false);
  });

  it("RF_SOSTA_1 · TF-SIC-17 · sosta confermata ATTIVA con tempo rimanente → messaggio visibile", () => {
    expect(
      confermaVisibile(
        41,
        [{ id: 41, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }],
        A,
      ),
    ).toBe(true);
  });

  it("RF_SOSTA_7 · TF-SIC-18 · sosta confermata ATTIVA con il timer a zero → messaggio non visibile", () => {
    expect(
      confermaVisibile(
        41,
        [{ id: 41, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }],
        S,
      ),
    ).toBe(false);
  });

  it("RF_SOSTA_7 · TF-SIC-19 · sosta confermata SCADUTA dal server → messaggio non visibile", () => {
    expect(
      confermaVisibile(
        41,
        [{ id: 41, stato: "SCADUTA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }],
        A,
      ),
    ).toBe(false);
  });

  it("ISSUE_33 · TF-SIC-20 · sosta confermata non ancora letta → messaggio visibile", () => {
    expect(confermaVisibile(41, [], A)).toBe(true);
  });

  it("ISSUE_33 · TF-SIC-21 · conferma di una sosta diversa da quelle lette → messaggio visibile", () => {
    expect(
      confermaVisibile(
        41,
        [{ id: 40, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }],
        A,
      ),
    ).toBe(true);
  });
});
