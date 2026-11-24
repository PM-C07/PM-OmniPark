import { describe, expect, it } from "vitest";
import { formattaEuro, formattaOra } from "./importi.ts";

describe("formato di importi e orari (cp_formatoImporti)", () => {
  it("RF_WALLET_2 · TF-FMT-01 · 0 centesimi → 0,00 €", () => {
    expect(formattaEuro(0)).toBe("0,00 €");
  });

  it("RF_WALLET_2 · TF-FMT-02 · 5 centesimi → 0,05 €", () => {
    expect(formattaEuro(5)).toBe("0,05 €");
  });

  it("RF_WALLET_2 · TF-FMT-03 · 300 centesimi → 3,00 €", () => {
    expect(formattaEuro(300)).toBe("3,00 €");
  });

  it("ISSUE_29 · TF-FMT-04 · 123456 centesimi, quattro cifre intere → 1234,56 €", () => {
    expect(formattaEuro(123456)).toBe("1234,56 €");
  });

  it("ISSUE_29 · TF-FMT-05 · 12345678 centesimi, separatore delle migliaia → 123.456,78 €", () => {
    expect(formattaEuro(12345678)).toBe("123.456,78 €");
  });

  it("RF_SOSTA_1 · TF-FMT-06 · istante ISO in ora solare → 10:42", () => {
    expect(formattaOra("2026-11-20T09:42:00.000Z")).toBe("10:42");
  });

  it("RF_SOSTA_1 · TF-FMT-07 · istante ISO in ora legale → 10:05", () => {
    expect(formattaOra("2026-07-20T08:05:00.000Z")).toBe("10:05");
  });

  it("RF_SOSTA_1 · TF-FMT-08 · dopo la mezzanotte di Roma, prima in UTC → 00:30", () => {
    expect(formattaOra("2026-11-20T23:30:00.000Z")).toBe("00:30");
  });

  it("RF_SOSTA_1 · TF-FMT-09 · Date invece della stringa → 10:42", () => {
    expect(formattaOra(new Date("2026-11-20T09:42:00.000Z"))).toBe("10:42");
  });
});
