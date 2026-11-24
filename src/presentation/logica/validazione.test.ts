import { describe, expect, it } from "vitest";
import {
  normalizzaTarga,
  validaAccesso,
  validaEmail,
  validaPasswordAccesso,
  validaPasswordNuova,
  validaRegistrazione,
  validaTarga,
} from "./validazione.ts";

const MSG_EMAIL_VUOTA = "Inserisci l'email.";
const MSG_EMAIL_NON_VALIDA = "L'email non è valida.";
const MSG_PASSWORD_VUOTA = "Inserisci la password.";
const MSG_PASSWORD_CORTA = "La password deve avere almeno 8 caratteri.";
const MSG_TARGA_VUOTA = "Inserisci la targa.";
const MSG_TARGA_NON_VALIDA = "La targa non è valida: usa il formato AB123CD.";

describe("validazione dei campi dei form", () => {
  it("RF_AUTH_1 · TF-VAL-01 · email valida → null", () => {
    expect(validaEmail("elena.bianchi@omnipark.example")).toBe(null);
  });

  it(`RF_AUTH_1 · TF-VAL-02 · email vuota → ${MSG_EMAIL_VUOTA}`, () => {
    expect(validaEmail("")).toBe(MSG_EMAIL_VUOTA);
  });

  it(`RF_AUTH_1 · TF-VAL-03 · email senza @ → ${MSG_EMAIL_NON_VALIDA}`, () => {
    expect(validaEmail("elena.bianchi")).toBe(MSG_EMAIL_NON_VALIDA);
  });

  it(`RF_AUTH_1 · TF-VAL-04 · email con uno spazio → ${MSG_EMAIL_NON_VALIDA}`, () => {
    expect(validaEmail("elena bianchi@omnipark.example")).toBe(MSG_EMAIL_NON_VALIDA);
  });

  it("RF_AUTH_1 · TF-VAL-05 · password nuova di esattamente 8 caratteri → null", () => {
    expect(validaPasswordNuova("abcdefgh")).toBe(null);
  });

  it("RF_AUTH_1 · TF-VAL-06 · password nuova di 8 caratteri accentati → null", () => {
    expect(validaPasswordNuova("àèìòùàèì")).toBe(null);
  });

  it(`RF_AUTH_1 · TF-VAL-07 · password nuova di 7 caratteri → ${MSG_PASSWORD_CORTA}`, () => {
    expect(validaPasswordNuova("abcdefg")).toBe(MSG_PASSWORD_CORTA);
  });

  it(`RF_AUTH_1 · TF-VAL-08 · password nuova vuota → ${MSG_PASSWORD_VUOTA}`, () => {
    expect(validaPasswordNuova("")).toBe(MSG_PASSWORD_VUOTA);
  });

  it("RF_AUTH_4 · TF-VAL-09 · password di accesso non vuota più corta di 8 caratteri → null", () => {
    expect(validaPasswordAccesso("abc")).toBe(null);
  });

  it(`RF_AUTH_4 · TF-VAL-10 · password di accesso vuota → ${MSG_PASSWORD_VUOTA}`, () => {
    expect(validaPasswordAccesso("")).toBe(MSG_PASSWORD_VUOTA);
  });

  it("RF_AUTH_5 · TF-VAL-11 · targa AB123CD → valida", () => {
    expect(validaTarga("AB123CD")).toBe(null);
  });

  it("RF_AUTH_5 · TF-VAL-12 · normalizzazione di targa con minuscole e spazi → AB123CD", () => {
    expect(normalizzaTarga("ab 123 cd")).toBe("AB123CD");
  });

  it("RF_AUTH_5 · TF-VAL-13 · normalizzazione di targa con spazi all'inizio e alla fine → AB123CD", () => {
    expect(normalizzaTarga("  ab123cd  ")).toBe("AB123CD");
  });

  it("RF_AUTH_5 · TF-VAL-14 · targa con minuscole e spazi → valida", () => {
    expect(validaTarga("ab 123 cd")).toBe(null);
  });

  it(`RF_AUTH_5 · TF-VAL-15 · targa con un trattino → ${MSG_TARGA_NON_VALIDA}`, () => {
    expect(validaTarga("AB-123-CD")).toBe(MSG_TARGA_NON_VALIDA);
  });

  it(`RF_AUTH_5 · TF-VAL-16 · targa con due cifre → ${MSG_TARGA_NON_VALIDA}`, () => {
    expect(validaTarga("AB12CD")).toBe(MSG_TARGA_NON_VALIDA);
  });

  it(`RF_AUTH_5 · TF-VAL-17 · targa con quattro cifre → ${MSG_TARGA_NON_VALIDA}`, () => {
    expect(validaTarga("AB1234CD")).toBe(MSG_TARGA_NON_VALIDA);
  });

  it(`RF_AUTH_5 · TF-VAL-18 · targa di soli spazi → ${MSG_TARGA_VUOTA}`, () => {
    expect(validaTarga("   ")).toBe(MSG_TARGA_VUOTA);
  });

  it("RF_AUTH_1 · TF-VAL-19 · registrazione con tutti i campi validi → nessun errore", () => {
    expect(
      validaRegistrazione({
        email: "elena.bianchi@omnipark.example",
        password: "abcdefgh",
        targa: "ef 456 gh",
      }),
    ).toEqual({});
  });

  it("RF_AUTH_1 · TF-VAL-20 · registrazione con tutti i campi non validi → un messaggio per campo", () => {
    expect(validaRegistrazione({ email: "elena", password: "corta", targa: "12-AB" })).toEqual({
      email: MSG_EMAIL_NON_VALIDA,
      password: MSG_PASSWORD_CORTA,
      targa: MSG_TARGA_NON_VALIDA,
    });
  });

  it("RF_AUTH_4 · TF-VAL-21 · accesso con tutti i campi validi → nessun errore", () => {
    expect(validaAccesso({ email: "marco.rossi@omnipark.example", password: "x" })).toEqual({});
  });

  it("RF_AUTH_4 · TF-VAL-22 · accesso con email e password vuote → un messaggio per campo", () => {
    expect(validaAccesso({ email: "", password: "" })).toEqual({
      email: MSG_EMAIL_VUOTA,
      password: MSG_PASSWORD_VUOTA,
    });
  });

  it("RF_AUTH_4 · TF-VAL-23 · accesso con email non valida → solo errore sull'email", () => {
    expect(validaAccesso({ email: "marco.rossi", password: "x" })).toEqual({
      email: MSG_EMAIL_NON_VALIDA,
    });
  });
});
