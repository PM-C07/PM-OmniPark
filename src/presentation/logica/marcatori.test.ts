import { describe, expect, it } from "vitest";
import { DIMENSIONE_MARCATORE, separaMarcatori, type PuntoMarcatore } from "./marcatori.ts";

// Specifica: docs/test/cp_mappaInterfaccia.md (TF-MARC-01…09)

const TOLLERANZA = 1e-9;

function P(id: number, x: number, y: number): PuntoMarcatore {
  return { id, x, y };
}

// Stessi id nello stesso ordine, coordinate entro la tolleranza di §3.
function attendiPunti(risultato: readonly PuntoMarcatore[], attesi: readonly PuntoMarcatore[]) {
  expect(risultato.map((punto) => punto.id)).toEqual(attesi.map((punto) => punto.id));
  risultato.forEach((punto, i) => {
    expect(Math.abs(punto.x - attesi[i].x)).toBeLessThanOrEqual(TOLLERANZA);
    expect(Math.abs(punto.y - attesi[i].y)).toBeLessThanOrEqual(TOLLERANZA);
  });
}

// «distanze ≥ 36»: ogni coppia del risultato dista almeno 36 − 1e-9.
function attendiDistanze(risultato: readonly PuntoMarcatore[], distanzaMinima: number) {
  for (let i = 0; i < risultato.length; i++) {
    for (let j = i + 1; j < risultato.length; j++) {
      const distanza = Math.hypot(risultato[i].x - risultato[j].x, risultato[i].y - risultato[j].y);
      expect(distanza).toBeGreaterThanOrEqual(distanzaMinima - TOLLERANZA);
    }
  }
}

describe("separazione dei marker sovrapposti (cp_mappaInterfaccia)", () => {
  it("ISSUE_33 · TF-MARC-01 · nessun punto → []", () => {
    expect(separaMarcatori([], 36)).toEqual([]);
  });

  it("ISSUE_33 · TF-MARC-02 · un punto → invariato", () => {
    attendiPunti(separaMarcatori([P(1, 10, 20)], 36), [P(1, 10, 20)]);
  });

  it("ISSUE_33 · TF-MARC-03 · due punti a distanza maggiore del minimo → invariati", () => {
    attendiPunti(separaMarcatori([P(1, 0, 0), P(2, 40, 0)], 36), [P(1, 0, 0), P(2, 40, 0)]);
  });

  it("ISSUE_33 · TF-MARC-04 · due punti a distanza uguale al minimo → invariati", () => {
    attendiPunti(separaMarcatori([P(1, 0, 0), P(2, 0, 36)], 36), [P(1, 0, 0), P(2, 0, 36)]);
  });

  it("NRF_USA_2 · TF-MARC-05 · due punti sovrapposti → affiancati attorno al baricentro", () => {
    attendiPunti(separaMarcatori([P(1, 0, 0), P(2, 0, 6)], 36), [P(1, -18, 3), P(2, 18, 3)]);
  });

  it("NRF_USA_2 · TF-MARC-06 · cinque punti allineati a 6 px e un punto isolato → griglia 3 × 2, isolato fermo", () => {
    const risultato = separaMarcatori(
      [
        P(17, 100, 124),
        P(18, 100, 118),
        P(19, 100, 112),
        P(20, 100, 106),
        P(21, 100, 100),
        P(1, 300, 300),
      ],
      36,
    );
    attendiPunti(risultato, [
      P(17, 100, 130),
      P(18, 64, 130),
      P(19, 136, 94),
      P(20, 100, 94),
      P(21, 64, 94),
      P(1, 300, 300),
    ]);
    attendiDistanze(risultato, 36);
  });

  it("ISSUE_33 · TF-MARC-07 · punti coincidenti → affiancati in ordine di id", () => {
    attendiPunti(separaMarcatori([P(2, 50, 50), P(1, 50, 50)], 36), [P(2, 68, 50), P(1, 32, 50)]);
  });

  it("ISSUE_33 · TF-MARC-08 · gruppo che, disposto, copre un marker vicino → gruppi uniti", () => {
    const risultato = separaMarcatori([P(1, 0, 0), P(2, 0, 6), P(3, 50, 3)], 36);
    attendiPunti(risultato, [P(1, -4 / 3, -15), P(2, -4 / 3, 21), P(3, 104 / 3, -15)]);
    attendiDistanze(risultato, 36);
  });

  it("ISSUE_33 · TF-MARC-09 · lato dei marker della mappa → 36", () => {
    expect(DIMENSIONE_MARCATORE).toBe(36);
  });
});
