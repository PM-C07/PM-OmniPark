import { describe, expect, it } from "vitest";
import {
  dimensioniRidotte,
  richiedePermesso,
  testoDichiarazione,
  verificaFotoPermesso,
} from "./permesso.ts";

// Specifica: docs/test/cp_avvioInterfaccia.md (TF-AVVUI-38…57)

const FOTO_VUOTA = "Scatta o scegli la foto del permesso esposto.";
const FORMATO_NON_AMMESSO = "La foto deve essere un'immagine JPEG o PNG.";
const FOTO_TROPPO_GRANDE = "La foto supera 2 MB: scegline una più leggera.";

describe("passaggio del permesso nell'avvio della sosta (cp_avvioInterfaccia)", () => {
  it("RF_SOSTA_5 · TF-AVVUI-38 · stallo per persone con disabilità → permesso richiesto", () => {
    expect(richiedePermesso("DISABILI")).toBe(true);
  });

  it("RF_SOSTA_5 · TF-AVVUI-39 · stallo rosa → permesso richiesto", () => {
    expect(richiedePermesso("ROSA")).toBe(true);
  });

  it("VD_8 · TF-AVVUI-40 · stallo a pagamento → permesso non richiesto", () => {
    expect(richiedePermesso("ORDINARIO_A_PAGAMENTO")).toBe(false);
  });

  it("ISSUE_33 · TF-AVVUI-41 · tipo non riconosciuto → permesso non richiesto", () => {
    expect(richiedePermesso("CARICO_SCARICO")).toBe(false);
  });

  it("RF_SOSTA_5 · TF-AVVUI-42 · stallo per persone con disabilità → dichiarazione del contrassegno", () => {
    expect(testoDichiarazione("DISABILI")).toBe(
      "Dichiaro di esporre sul veicolo il contrassegno per persone con disabilità.",
    );
  });

  it("RF_SOSTA_5 · TF-AVVUI-43 · stallo rosa → dichiarazione del permesso rosa", () => {
    expect(testoDichiarazione("ROSA")).toBe("Dichiaro di esporre sul veicolo il permesso rosa.");
  });

  it("VD_8 · TF-AVVUI-44 · stallo a pagamento → nessuna dichiarazione (null)", () => {
    expect(testoDichiarazione("ORDINARIO_A_PAGAMENTO")).toBe(null);
  });

  it("RF_SOSTA_5 · TF-AVVUI-45 · JPEG entro il limite → nessun errore (null)", () => {
    expect(verificaFotoPermesso({ tipo: "image/jpeg", dimensione: 350_000 })).toBe(null);
  });

  it("RF_SOSTA_5 · TF-AVVUI-46 · PNG entro il limite → nessun errore (null)", () => {
    expect(verificaFotoPermesso({ tipo: "image/png", dimensione: 1_000_000 })).toBe(null);
  });

  it("ISSUE_33 · TF-AVVUI-47 · JPEG di esattamente 2 MB → nessun errore (null)", () => {
    expect(verificaFotoPermesso({ tipo: "image/jpeg", dimensione: 2_097_152 })).toBe(null);
  });

  it("RF_SOSTA_5 · TF-AVVUI-48 · foto vuota → messaggio della foto mancante", () => {
    expect(verificaFotoPermesso({ tipo: "image/jpeg", dimensione: 0 })).toBe(FOTO_VUOTA);
  });

  it("ISSUE_33 · TF-AVVUI-49 · foto HEIC → messaggio del formato", () => {
    expect(verificaFotoPermesso({ tipo: "image/heic", dimensione: 900_000 })).toBe(
      FORMATO_NON_AMMESSO,
    );
  });

  it("ISSUE_33 · TF-AVVUI-50 · foto GIF → messaggio del formato", () => {
    expect(verificaFotoPermesso({ tipo: "image/gif", dimensione: 40_000 })).toBe(
      FORMATO_NON_AMMESSO,
    );
  });

  it("ISSUE_33 · TF-AVVUI-51 · PNG oltre 2 MB → messaggio della dimensione", () => {
    expect(verificaFotoPermesso({ tipo: "image/png", dimensione: 2_097_153 })).toBe(
      FOTO_TROPPO_GRANDE,
    );
  });

  it("ISSUE_33 · TF-AVVUI-52 · GIF oltre 2 MB → messaggio del formato (prima il formato)", () => {
    expect(verificaFotoPermesso({ tipo: "image/gif", dimensione: 3_000_000 })).toBe(
      FORMATO_NON_AMMESSO,
    );
  });

  it("ISSUE_33 · TF-AVVUI-53 · orizzontale oltre 1600 → 1600 × 1200", () => {
    expect(dimensioniRidotte(4032, 3024)).toEqual({ larghezza: 1600, altezza: 1200 });
  });

  it("ISSUE_33 · TF-AVVUI-54 · verticale oltre 1600 → 1200 × 1600", () => {
    expect(dimensioniRidotte(3000, 4000)).toEqual({ larghezza: 1200, altezza: 1600 });
  });

  it("ISSUE_33 · TF-AVVUI-55 · lato maggiore uguale a 1600 → invariate", () => {
    expect(dimensioniRidotte(1600, 900)).toEqual({ larghezza: 1600, altezza: 900 });
  });

  it("ISSUE_33 · TF-AVVUI-56 · entro il limite → invariate (mai ingrandite)", () => {
    expect(dimensioniRidotte(800, 600)).toEqual({ larghezza: 800, altezza: 600 });
  });

  it("ISSUE_33 · TF-AVVUI-57 · proporzioni estreme → 320 × 1600", () => {
    expect(dimensioniRidotte(1000, 5000)).toEqual({ larghezza: 320, altezza: 1600 });
  });
});
