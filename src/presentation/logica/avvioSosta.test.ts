import { describe, expect, it } from "vitest";
import {
  CAMPI_AVVIO_SOSTA,
  condizioniDelloStallo,
  creditoSufficiente,
  disponibilitaAvvio,
  durataPredefinita,
  etichettaConferma,
  etichettaDurata,
  opzioniDurata,
  richiestaDiAvvio,
} from "./avvioSosta.ts";
import { interpretaRisposta } from "./risposteApi.ts";

const MOTIVO_LIBERO =
  "Lo stallo risulta libero: la sosta si avvia quando il sensore rileva il veicolo.";
const MOTIVO_NON_DISPONIBILE = "Sullo stallo c'è già una sosta in corso.";
const MOTIVO_SCONOSCIUTO = "Lo stato dello stallo non è affidabile: la sosta non si può avviare.";
const MOTIVO_GENERICO = "La sosta non si può avviare su questo stallo.";

const BYTE_J = [0xff, 0xd8, 0xff, 0xe0];
const BYTE_P = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const J = new Blob([new Uint8Array(BYTE_J)], { type: "image/jpeg" });
const P = new Blob([new Uint8Array(BYTE_P)], { type: "image/png" });
const D = "Dichiaro di esporre sul veicolo il permesso rosa.";

function erroreApi(codice: string, messaggio: string) {
  return { errore: { codice, messaggio } };
}

describe("logica dell'avvio della sosta nell'interfaccia", () => {
  it("RF_SOSTA_1 · TF-AVVUI-01 · stallo Occupato a pagamento → disponibile", () => {
    expect(disponibilitaAvvio("OCCUPATO", "ORDINARIO_A_PAGAMENTO")).toEqual({ disponibile: true });
  });

  it("RF_SOSTA_5 · TF-AVVUI-02 · stallo Occupato rosa → disponibile", () => {
    expect(disponibilitaAvvio("OCCUPATO", "ROSA")).toEqual({ disponibile: true });
  });

  it("RF_SOSTA_5 · TF-AVVUI-03 · stallo Occupato per disabili → disponibile", () => {
    expect(disponibilitaAvvio("OCCUPATO", "DISABILI")).toEqual({ disponibile: true });
  });

  it("RF_SOSTA_1 · TF-AVVUI-04 · stallo Libero → non disponibile con il motivo", () => {
    expect(disponibilitaAvvio("LIBERO", "ORDINARIO_A_PAGAMENTO")).toEqual({
      disponibile: false,
      motivo: MOTIVO_LIBERO,
    });
  });

  it("RF_SOSTA_1 · TF-AVVUI-05 · stallo Non disponibile → non disponibile con il motivo", () => {
    expect(disponibilitaAvvio("NON_DISPONIBILE", "ORDINARIO_A_PAGAMENTO")).toEqual({
      disponibile: false,
      motivo: MOTIVO_NON_DISPONIBILE,
    });
  });

  it("RF_SOSTA_1 · TF-AVVUI-06 · stallo Sconosciuto → non disponibile con il motivo", () => {
    expect(disponibilitaAvvio("SCONOSCIUTO", "ORDINARIO_A_PAGAMENTO")).toEqual({
      disponibile: false,
      motivo: MOTIVO_SCONOSCIUTO,
    });
  });

  it("RF_SOSTA_1 · TF-AVVUI-07 · stallo Libero per disabili → motivo dello stato (prima lo stato)", () => {
    expect(disponibilitaAvvio("LIBERO", "DISABILI")).toEqual({
      disponibile: false,
      motivo: MOTIVO_LIBERO,
    });
  });

  it("ISSUE_29 · TF-AVVUI-08 · stato non riconosciuto → non disponibile con il motivo generico", () => {
    expect(disponibilitaAvvio("GUASTO", "ORDINARIO_A_PAGAMENTO")).toEqual({
      disponibile: false,
      motivo: MOTIVO_GENERICO,
    });
  });

  it("ISSUE_29 · TF-AVVUI-09 · stallo Occupato di tipo non riconosciuto → non disponibile con il motivo generico", () => {
    expect(disponibilitaAvvio("OCCUPATO", "CARICO_SCARICO")).toEqual({
      disponibile: false,
      motivo: MOTIVO_GENERICO,
    });
  });

  it("RF_SOSTA_1 · TF-AVVUI-10 · durata massima multiplo di 15 → multipli di 15 fino al massimo", () => {
    expect(opzioniDurata(120)).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
  });

  it("RF_SOSTA_1 · TF-AVVUI-11 · durata massima non multiplo di 15 → massimo come ultima opzione", () => {
    expect(opzioniDurata(50)).toEqual([15, 30, 45, 50]);
  });

  it("RF_SOSTA_1 · TF-AVVUI-12 · durata massima inferiore a 15 → nessuna opzione", () => {
    expect(opzioniDurata(10)).toEqual([]);
  });

  it("NRF_USA_2 · TF-AVVUI-13 · durata massima oltre l'ora → predefinita 60", () => {
    expect(durataPredefinita(180)).toEqual(60);
  });

  it("NRF_USA_2 · TF-AVVUI-14 · durata massima sotto l'ora → predefinita la durata massima", () => {
    expect(durataPredefinita(45)).toEqual(45);
  });

  it("ISSUE_29 · TF-AVVUI-15 · durata massima inferiore a 15 → nessuna predefinita (null)", () => {
    expect(durataPredefinita(10)).toEqual(null);
  });

  it('ISSUE_29 · TF-AVVUI-16 · 45 minuti → "45 min"', () => {
    expect(etichettaDurata(45)).toEqual("45 min");
  });

  it('ISSUE_29 · TF-AVVUI-17 · 120 minuti → "2 h"', () => {
    expect(etichettaDurata(120)).toEqual("2 h");
  });

  it('ISSUE_29 · TF-AVVUI-18 · 90 minuti → "1 h 30 min"', () => {
    expect(etichettaDurata(90)).toEqual("1 h 30 min");
  });

  it("RF_WALLET_2 · TF-AVVUI-19 · saldo superiore all'importo → credito sufficiente", () => {
    expect(creditoSufficiente(1000, 300)).toEqual(true);
  });

  it("RF_WALLET_2 · TF-AVVUI-20 · saldo uguale all'importo → credito sufficiente", () => {
    expect(creditoSufficiente(300, 300)).toEqual(true);
  });

  it("RF_WALLET_2 · TF-AVVUI-21 · saldo inferiore all'importo → credito insufficiente", () => {
    expect(creditoSufficiente(50, 150)).toEqual(false);
  });

  it("RF_WALLET_2 · TF-AVVUI-22 · importo zero con saldo zero → credito sufficiente", () => {
    expect(creditoSufficiente(0, 0)).toEqual(true);
  });

  it('NRF_USA_2 · TF-AVVUI-23 · importo 300 centesimi → "Conferma e paga (3,00 €)"', () => {
    expect(etichettaConferma(300)).toEqual("Conferma e paga (3,00 €)");
  });

  it("RF_SOSTA_1 · TF-AVVUI-24 · 201 con la sosta avviata → successo con il corpo", () => {
    const corpo = {
      sosta: 41,
      orarioDiAvvio: "2026-11-20T08:42:00.000Z",
      orarioDiScadenza: "2026-11-20T10:42:00.000Z",
      importo: 300,
      pagamento: "PAGATA",
    };
    expect(interpretaRisposta(201, corpo, CAMPI_AVVIO_SOSTA)).toEqual({
      esito: "successo",
      dati: corpo,
    });
  });

  it("RF_WALLET_2 · TF-AVVUI-25 · CREDITO_INSUFFICIENTE → errore sul campo credito", () => {
    const msg = "Credito insufficiente: ricarica il wallet per avviare la sosta.";
    expect(
      interpretaRisposta(409, erroreApi("CREDITO_INSUFFICIENTE", msg), CAMPI_AVVIO_SOSTA),
    ).toEqual({ esito: "errore", campo: "credito", messaggio: msg });
  });

  it("RF_SOSTA_1 · TF-AVVUI-26 · DURATA_NON_VALIDA → errore sul campo durata", () => {
    const msg = "La durata scelta supera la durata massima dello stallo.";
    expect(interpretaRisposta(422, erroreApi("DURATA_NON_VALIDA", msg), CAMPI_AVVIO_SOSTA)).toEqual(
      { esito: "errore", campo: "durata", messaggio: msg },
    );
  });

  it("VD_3 · TF-AVVUI-27 · TARGA_NON_NEL_PROFILO → errore sul campo targa", () => {
    const msg = "La targa scelta non è associata al tuo profilo.";
    expect(
      interpretaRisposta(422, erroreApi("TARGA_NON_NEL_PROFILO", msg), CAMPI_AVVIO_SOSTA),
    ).toEqual({ esito: "errore", campo: "targa", messaggio: msg });
  });

  it("RF_SOSTA_1 · TF-AVVUI-28 · SOSTA_GIA_ATTIVA → errore sul campo targa", () => {
    const msg = "Per questa targa c'è già una sosta in corso.";
    expect(interpretaRisposta(409, erroreApi("SOSTA_GIA_ATTIVA", msg), CAMPI_AVVIO_SOSTA)).toEqual({
      esito: "errore",
      campo: "targa",
      messaggio: msg,
    });
  });

  it("RF_SOSTA_1 · TF-AVVUI-29 · STALLO_NON_OCCUPATO → errore sul campo generale", () => {
    const msg = "Lo stallo non risulta più occupato.";
    expect(
      interpretaRisposta(409, erroreApi("STALLO_NON_OCCUPATO", msg), CAMPI_AVVIO_SOSTA),
    ).toEqual({ esito: "errore", campo: "generale", messaggio: msg });
  });

  it("NRF_SIC_1 · TF-AVVUI-30 · 401 SESSIONE_NON_VALIDA → sessione scaduta", () => {
    const msg = "La sessione è scaduta: accedi di nuovo.";
    expect(
      interpretaRisposta(401, erroreApi("SESSIONE_NON_VALIDA", msg), CAMPI_AVVIO_SOSTA),
    ).toEqual({ esito: "sessioneScaduta" });
  });

  it('ISSUE_33 · TF-AVVUI-31 · importo zero (sosta gratuita) → "Conferma (senza addebito)"', () => {
    expect(etichettaConferma(0)).toEqual("Conferma (senza addebito)");
  });

  it("RF_SOSTA_5 · TF-AVVUI-32 · PERMESSO_MANCANTE → errore sul campo permesso", () => {
    const msg = "Su questo stallo servono la dichiarazione e la foto del permesso.";
    expect(interpretaRisposta(422, erroreApi("PERMESSO_MANCANTE", msg), CAMPI_AVVIO_SOSTA)).toEqual(
      { esito: "errore", campo: "permesso", messaggio: msg },
    );
  });

  it("RF_SOSTA_5 · TF-AVVUI-33 · PERMESSO_NON_VALIDO → errore sul campo permesso", () => {
    const msg = "La foto del permesso deve essere un'immagine JPEG o PNG di al massimo 2 MB.";
    expect(
      interpretaRisposta(422, erroreApi("PERMESSO_NON_VALIDO", msg), CAMPI_AVVIO_SOSTA),
    ).toEqual({ esito: "errore", campo: "permesso", messaggio: msg });
  });

  it("VD_8 · TF-AVVUI-34 · PERMESSO_NON_PREVISTO → errore sul campo generale", () => {
    const msg = "Su questo stallo il permesso non è previsto.";
    expect(
      interpretaRisposta(422, erroreApi("PERMESSO_NON_PREVISTO", msg), CAMPI_AVVIO_SOSTA),
    ).toEqual({ esito: "errore", campo: "generale", messaggio: msg });
  });

  it("RF_SOSTA_1 · TF-AVVUI-35 · senza permesso → POST con corpo JSON", () => {
    const richiesta = richiestaDiAvvio({ stallo: 19, targa: "AB123CD", durata: 60 });
    expect(richiesta.method).toBe("POST");
    expect(new Headers(richiesta.headers).get("content-type")).toBe("application/json");
    expect(richiesta.body).toBe('{"stallo":19,"targa":"AB123CD","durata":60}');
  });

  it("RF_SOSTA_5 · TF-AVVUI-36 · con permesso e foto JPEG → POST multipart con permesso.jpg", async () => {
    const richiesta = richiestaDiAvvio({
      stallo: 15,
      targa: "AB123CD",
      durata: 60,
      permesso: { dichiarazione: D, foto: J },
    });
    expect(richiesta.method).toBe("POST");
    expect(new Headers(richiesta.headers).has("content-type")).toBe(false);
    expect(richiesta.body).toBeInstanceOf(FormData);
    const corpo = richiesta.body as FormData;
    expect(corpo.get("stallo")).toBe("15");
    expect(corpo.get("targa")).toBe("AB123CD");
    expect(corpo.get("durata")).toBe("60");
    expect(corpo.get("dichiarazioneDiPermesso")).toBe(D);
    const foto = corpo.get("fotoDelPermesso");
    expect(foto).toBeInstanceOf(File);
    expect((foto as File).name).toBe("permesso.jpg");
    expect([...new Uint8Array(await (foto as File).arrayBuffer())]).toEqual(BYTE_J);
  });

  it("RF_SOSTA_5 · TF-AVVUI-37 · con permesso e foto PNG → POST multipart con permesso.png", async () => {
    const richiesta = richiestaDiAvvio({
      stallo: 14,
      targa: "AB123CD",
      durata: 60,
      permesso: { dichiarazione: D, foto: P },
    });
    expect(richiesta.method).toBe("POST");
    expect(new Headers(richiesta.headers).has("content-type")).toBe(false);
    expect(richiesta.body).toBeInstanceOf(FormData);
    const corpo = richiesta.body as FormData;
    expect(corpo.get("stallo")).toBe("14");
    expect(corpo.get("targa")).toBe("AB123CD");
    expect(corpo.get("durata")).toBe("60");
    expect(corpo.get("dichiarazioneDiPermesso")).toBe(D);
    const foto = corpo.get("fotoDelPermesso");
    expect(foto).toBeInstanceOf(File);
    expect((foto as File).name).toBe("permesso.png");
    expect([...new Uint8Array(await (foto as File).arrayBuffer())]).toEqual(BYTE_P);
  });

  it("RF_STALLI_2 · TF-AVVUI-58 · stallo a pagamento → tariffa e durata massima, nessun permesso", () => {
    expect(
      condizioniDelloStallo("ORDINARIO_A_PAGAMENTO", {
        costoOrario: 150,
        orarioInizioVigenza: "08:00:00",
        orarioFineVigenza: "20:00:00",
        durataMassima: 180,
      }),
    ).toEqual({
      tariffa: "1,50\u00a0€ l'ora, dalle 08:00 alle 20:00",
      durataMassima: "3 h",
      permesso: null,
    });
  });

  it("RF_STALLI_2 · TF-AVVUI-59 · stallo per disabili → permesso da dichiarare e sosta gratuita", () => {
    expect(
      condizioniDelloStallo("DISABILI", {
        costoOrario: 150,
        orarioInizioVigenza: "08:00:00",
        orarioFineVigenza: "20:00:00",
        durataMassima: 180,
      }),
    ).toEqual({
      tariffa: "1,50\u00a0€ l'ora, dalle 08:00 alle 20:00",
      durataMassima: "3 h",
      permesso:
        "Contrassegno per persone con disabilità, da dichiarare e fotografare all'avvio; sosta gratuita.",
    });
  });

  it("RF_STALLI_2 · TF-AVVUI-60 · stallo rosa → permesso da dichiarare e sosta a pagamento", () => {
    expect(
      condizioniDelloStallo("ROSA", {
        costoOrario: 100,
        orarioInizioVigenza: "08:30:00",
        orarioFineVigenza: "19:30:00",
        durataMassima: 90,
      }),
    ).toEqual({
      tariffa: "1,00\u00a0€ l'ora, dalle 08:30 alle 19:30",
      durataMassima: "1 h 30 min",
      permesso: "Permesso rosa, da dichiarare e fotografare all'avvio; sosta a pagamento.",
    });
  });
});
