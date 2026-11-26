// Test dei calcoli della misura di NRF_PER_3 e dei dati delle esecuzioni (OMP-60). Esiti attesi dal
// piano approvato: mediana con la media dei due centrali, percentile per rango più vicino,
// abbinamento con la prima comparsa dopo l'invio e prima dell'invio successivo sullo stesso stallo.
import { describe, expect, it } from "vitest";
import {
  centesimiDa,
  nellaFasciaAPagamento,
  pianoDiVariazioni,
  presenzaOpposta,
  primoStalloSenzaSosta,
  targaAnpr,
  targaDiProva,
} from "./dati.ts";
import {
  abbinaComparse,
  massimo,
  mediana,
  percentile,
  sostituisciSezione,
  type Invio,
} from "./statistiche.ts";

describe("statistiche", () => {
  it("massimo", () => {
    expect(massimo([300, 1200, 900])).toBe(1200);
  });

  it("mediana con un numero dispari di valori", () => {
    expect(mediana([900, 100, 500])).toBe(500);
  });

  it("mediana con un numero pari di valori → media dei due centrali", () => {
    expect(mediana([100, 400, 200, 300])).toBe(250);
  });

  it("95° percentile per rango più vicino su 33 valori → 32° valore", () => {
    const valori = Array.from({ length: 33 }, (_, i) => (i + 1) * 10);
    expect(percentile(valori, 95)).toBe(320);
  });

  it("95° percentile su 20 valori → 19° valore", () => {
    const valori = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(percentile(valori, 95)).toBe(19);
  });

  it.each([
    ["massimo", () => massimo([])],
    ["mediana", () => mediana([])],
    ["percentile", () => percentile([], 95)],
  ])("%s senza valori → errore", (_nome, calcolo) => {
    expect(calcolo).toThrow();
  });
});

describe("abbinaComparse", () => {
  const invii: Invio[] = [
    { indice: 1, stallo: 16, inviatoIl: 1000, etichettaAttesa: "16 Occupato" },
    { indice: 2, stallo: 3, inviatoIl: 4000, etichettaAttesa: "3 Libero" },
    { indice: 3, stallo: 16, inviatoIl: 10000, etichettaAttesa: "16 Libero" },
    { indice: 4, stallo: 3, inviatoIl: 13000, etichettaAttesa: null },
  ];

  it("prima comparsa dell'etichetta attesa dopo l'invio", () => {
    const risultato = abbinaComparse(
      invii,
      [
        { etichetta: "16 Occupato", t: 900 }, // prima dell'invio: non conta
        { etichetta: "16 Occupato", t: 2200 },
        { etichetta: "16 Occupato", t: 3100 },
        { etichetta: "3 Libero", t: 5500 },
        { etichetta: "16 Libero", t: 11800 },
      ],
      10_000,
    );
    expect(risultato).toEqual([
      { indice: 1, stallo: 16, ritardoMs: 1200 },
      { indice: 2, stallo: 3, ritardoMs: 1500 },
      { indice: 3, stallo: 16, ritardoMs: 1800 },
    ]);
  });

  it("comparsa dopo l'invio successivo sullo stesso stallo → non comparsa", () => {
    const risultato = abbinaComparse(
      invii.slice(0, 3),
      [{ etichetta: "16 Occupato", t: 10500 }],
      20_000,
    );
    expect(risultato[0]).toEqual({ indice: 1, stallo: 16, ritardoMs: null });
  });

  it("comparsa oltre il limite → non comparsa", () => {
    const risultato = abbinaComparse([invii[1]], [{ etichetta: "3 Libero", t: 15000 }], 10_000);
    expect(risultato).toEqual([{ indice: 2, stallo: 3, ritardoMs: null }]);
  });

  it("invio non misurabile → escluso", () => {
    expect(abbinaComparse([invii[3]], [], 10_000)).toEqual([]);
  });
});

describe("sostituisciSezione", () => {
  it("sezione presente → sostituita, il resto invariato", () => {
    const testo = "# Misure\n\n<!-- a -->\nvecchio\n<!-- /a -->\n\n<!-- b -->\nb\n<!-- /b -->\n";
    expect(sostituisciSezione(testo, "a", ["nuovo"])).toBe(
      "# Misure\n\n<!-- a -->\nnuovo\n<!-- /a -->\n\n<!-- b -->\nb\n<!-- /b -->\n",
    );
  });

  it("sezione assente → aggiunta in fondo", () => {
    expect(sostituisciSezione("# Misure\n", "per3", ["x"])).toBe(
      "# Misure\n\n<!-- per3 -->\nx\n<!-- /per3 -->\n",
    );
  });
});

describe("dati delle esecuzioni", () => {
  it("targa di prova nel formato AB123CD con la Z iniziale", () => {
    for (let i = 0; i < 50; i++) {
      expect(targaDiProva()).toMatch(/^Z[A-Z]\d{3}[A-Z]{2}$/);
    }
  });

  it("targa ANPR solo lettere maiuscole e cifre", () => {
    expect(targaAnpr("mf3k9a1b2", "a")).toBe("E2EMF3K9A1B2A");
  });

  it("primo candidato senza sosta, nell'ordine dei candidati", () => {
    const stalli = [
      { id: 18, stato: "OCCUPATO" },
      { id: 17, stato: "NON_DISPONIBILE" },
      { id: 19, stato: "LIBERO" },
    ];
    expect(primoStalloSenzaSosta(stalli)?.id).toBe(18);
  });

  it("tutti i candidati Non disponibili → null", () => {
    expect(primoStalloSenzaSosta([{ id: 17, stato: "NON_DISPONIBILE" }], [17])).toBeNull();
  });

  it.each([
    ["OCCUPATO", false],
    ["LIBERO", true],
    ["SCONOSCIUTO", true],
  ])("presenza opposta a %s → %s", (stato, atteso) => {
    expect(presenzaOpposta(stato)).toBe(atteso);
  });

  it("piano di variazioni a turno, ciascuna verso lo stato opposto all'ultimo", () => {
    const piano = pianoDiVariazioni(
      [
        { id: 1, stato: "LIBERO" },
        { id: 16, stato: "OCCUPATO" },
      ],
      5,
      3000,
    );
    expect(piano).toEqual([
      { stallo: 1, presenza: true, statoAtteso: "OCCUPATO", attesaMs: 0 },
      { stallo: 16, presenza: false, statoAtteso: "LIBERO", attesaMs: 3000 },
      { stallo: 1, presenza: false, statoAtteso: "LIBERO", attesaMs: 3000 },
      { stallo: 16, presenza: true, statoAtteso: "OCCUPATO", attesaMs: 3000 },
      { stallo: 1, presenza: true, statoAtteso: "OCCUPATO", attesaMs: 3000 },
    ]);
  });

  it("piano senza stalli → errore", () => {
    expect(() => pianoDiVariazioni([], 3, 1000)).toThrow();
  });

  it.each([
    ["2026-11-24T07:00:00Z", true], // 08:00 a Roma
    ["2026-11-24T06:59:00Z", false], // 07:59
    ["2026-11-24T18:45:00Z", true], // 19:45
    ["2026-11-24T18:46:00Z", false], // 19:46
    ["2026-07-01T06:30:00Z", true], // 08:30, ora legale
  ])("fascia a pagamento alle %s → %s", (istante, atteso) => {
    expect(nellaFasciaAPagamento(new Date(istante))).toBe(atteso);
  });

  it.each([
    ["Conferma e paga (1,50 €)", 150],
    ["Saldo 0,00 €", 0],
    ["1.234,05 €", 123405],
  ])("centesimi da «%s» → %i", (testo, atteso) => {
    expect(centesimiDa(testo)).toBe(atteso);
  });
});
