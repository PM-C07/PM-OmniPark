import { describe, expect, it } from "vitest";
import {
  eTaglioPrevisto,
  esitoRicarica,
  messaggioRicaricaApprovata,
  riquadroRicarica,
  TAGLI_RICARICA,
} from "./wallet.ts";

describe("logica del wallet nell'interfaccia (cp_walletInterfaccia)", () => {
  it("RF_WALLET_1 · TF-WALUI-01 · tagli di ricarica → [500, 1000, 2000]", () => {
    expect(TAGLI_RICARICA).toEqual([500, 1000, 2000]);
  });

  it("RF_WALLET_1 · TF-WALUI-02 · taglio 5 € → previsto", () => {
    expect(eTaglioPrevisto(500)).toBe(true);
  });

  it("RF_WALLET_1 · TF-WALUI-03 · taglio 10 € → previsto", () => {
    expect(eTaglioPrevisto(1000)).toBe(true);
  });

  it("RF_WALLET_1 · TF-WALUI-04 · taglio 20 € → previsto", () => {
    expect(eTaglioPrevisto(2000)).toBe(true);
  });

  it("RF_WALLET_1 · TF-WALUI-05 · taglio 15 € non previsto → non previsto", () => {
    expect(eTaglioPrevisto(1500)).toBe(false);
  });

  it("RF_WALLET_1 · TF-WALUI-06 · importo zero → non previsto", () => {
    expect(eTaglioPrevisto(0)).toBe(false);
  });

  it("RF_WALLET_1 · TF-WALUI-07 · 200 con saldo intero → approvata con il saldo", () => {
    expect(esitoRicarica(200, { saldo: 1600 })).toEqual({
      esito: "approvata",
      saldo: 1600,
    });
  });

  it("RF_WALLET_1 · TF-WALUI-08 · PAGAMENTO_RIFIUTATO → rifiutata con il messaggio", () => {
    expect(
      esitoRicarica(409, {
        errore: {
          codice: "PAGAMENTO_RIFIUTATO",
          messaggio: "Il pagamento è stato rifiutato. Il saldo non è cambiato.",
        },
      }),
    ).toEqual({
      esito: "rifiutata",
      messaggio: "Il pagamento è stato rifiutato. Il saldo non è cambiato.",
    });
  });

  it("RF_WALLET_1 · TF-WALUI-09 · IMPORTO_NON_PREVISTO → errore con il messaggio", () => {
    expect(
      esitoRicarica(422, {
        errore: { codice: "IMPORTO_NON_PREVISTO", messaggio: "Puoi ricaricare solo 5, 10 o 20 €." },
      }),
    ).toEqual({ esito: "errore", messaggio: "Puoi ricaricare solo 5, 10 o 20 €." });
  });

  it("NRF_SIC_1 · TF-WALUI-10 · SESSIONE_NON_VALIDA → sessione scaduta", () => {
    expect(
      esitoRicarica(401, {
        errore: {
          codice: "SESSIONE_NON_VALIDA",
          messaggio: "La sessione non è valida.",
        },
      }),
    ).toEqual({ esito: "sessioneScaduta" });
  });

  it("ISSUE_29 · TF-WALUI-11 · 200 con saldo non intero (stringa) → errore generico", () => {
    expect(esitoRicarica(200, { saldo: "1600" })).toEqual({
      esito: "errore",
      messaggio: "Si è verificato un errore. Riprova più tardi.",
    });
  });

  it("ISSUE_29 · TF-WALUI-12 · 502 con corpo non riconosciuto → errore generico", () => {
    expect(esitoRicarica(502, "<html>Bad gateway</html>")).toEqual({
      esito: "errore",
      messaggio: "Si è verificato un errore. Riprova più tardi.",
    });
  });

  it("RF_WALLET_1 · TF-WALUI-13 · ricarica di 5 € con saldo 5 € → messaggio con taglio e saldo", () => {
    expect(messaggioRicaricaApprovata(500, 500)).toBe(
      "Ricarica di 5,00\u00a0€ approvata. Nuovo saldo: 5,00\u00a0€.",
    );
  });

  it("RF_WALLET_1 · TF-WALUI-14 · ricarica di 10 € con saldo 10,50 € → saldo con decimali", () => {
    expect(messaggioRicaricaApprovata(1000, 1050)).toBe(
      "Ricarica di 10,00\u00a0€ approvata. Nuovo saldo: 10,50\u00a0€.",
    );
  });

  it("RF_WALLET_2 · TF-WALUI-15 · credito scarso → proposta", () => {
    expect(
      riquadroRicarica({ creditoScarso: true, erroreCredito: false, ricaricaApprovata: false }),
    ).toBe("proposta");
  });

  it("RF_WALLET_2 · TF-WALUI-16 · errore di credito dal server → proposta", () => {
    expect(
      riquadroRicarica({ creditoScarso: false, erroreCredito: true, ricaricaApprovata: false }),
    ).toBe("proposta");
  });

  it("RF_WALLET_1 · TF-WALUI-17 · ricarica approvata con il credito ora sufficiente → approvata", () => {
    expect(
      riquadroRicarica({ creditoScarso: false, erroreCredito: false, ricaricaApprovata: true }),
    ).toBe("approvata");
  });

  it("RF_WALLET_2 · TF-WALUI-18 · ricarica approvata ma credito ancora scarso → proposta", () => {
    expect(
      riquadroRicarica({ creditoScarso: true, erroreCredito: false, ricaricaApprovata: true }),
    ).toBe("proposta");
  });

  it("ISSUE_33 · TF-WALUI-19 · nessuna ricarica, credito sufficiente → nessuno", () => {
    expect(
      riquadroRicarica({ creditoScarso: false, erroreCredito: false, ricaricaApprovata: false }),
    ).toBe("nessuno");
  });
});
