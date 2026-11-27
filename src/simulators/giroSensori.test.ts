import { describe, expect, it } from "vitest";
import { inviiAGiro, type Invio } from "./giroSensori.ts";

// Test frame TF-SIM-01…04 di docs/test/cp_simulatoreSensori.md (COD-23, OMP-64).

/** Generatore di prova (§3): restituisce in ordine i valori dati e riparte dall'inizio. */
function casualeDiProva(...valori: number[]): () => number {
  let i = 0;
  return () => {
    const valore = valori[i % valori.length];
    i += 1;
    return valore;
  };
}

/** Legge i primi `n` invii senza esaurire l'iterabile. */
function primi(invii: Iterable<Invio>, n: number): Invio[] {
  const letti: Invio[] = [];
  if (n <= 0) {
    return letti;
  }
  for (const invio of invii) {
    letti.push(invio);
    if (letti.length >= n) {
      break;
    }
  }
  return letti;
}

describe("COD-23 · cp_simulatoreSensori · invii a giro", () => {
  it("RF_IOT_2 · TF-SIM-01 · tre stalli, sette invii → 1, 2, 3, 1, 2, 3, 1", () => {
    const invii = Array.from(inviiAGiro([1, 2, 3], 7, 1000, casualeDiProva(0.2)));

    expect(invii).toHaveLength(7);
    expect(invii.map((invio) => invio.stallo)).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect(invii.map((invio) => invio.etichetta)).toEqual([
      "casuale-1",
      "casuale-2",
      "casuale-3",
      "casuale-4",
      "casuale-5",
      "casuale-6",
      "casuale-7",
    ]);
  });

  it("COD_23 · TF-SIM-02 · primo invio e invii successivi → attesa 0, poi l'intervallo", () => {
    const invii = Array.from(inviiAGiro([1, 2, 3], 4, 1500, casualeDiProva(0.2)));

    expect(invii.map((invio) => invio.attesaMs)).toEqual([0, 1500, 1500, 1500]);
  });

  it("COD_23 · TF-SIM-03 · valori casuali 0,2, 0,7 e 0,5 → presenza true, false, false", () => {
    const invii = Array.from(inviiAGiro([4, 5], 3, 1000, casualeDiProva(0.2, 0.7, 0.5)));

    expect(invii.map((invio) => invio.presenza)).toEqual([true, false, false]);
  });

  it("COD_23 · TF-SIM-04 · quante 0, letti i primi 8 invii → 1, 2, 3, 1, 2, 3, 1, 2", () => {
    const invii = primi(inviiAGiro([1, 2, 3], 0, 1000, casualeDiProva(0.2)), 8);

    expect(invii.map((invio) => invio.stallo)).toEqual([1, 2, 3, 1, 2, 3, 1, 2]);
  });
});
