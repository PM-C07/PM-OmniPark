import { describe, expect, it } from "vitest";
import {
  CAMPI_AUSILIARIO,
  CAMPI_DISATTIVAZIONE,
  corpoAusiliario,
  moduloDa,
  raggruppaPerEnte,
  righePanoramica,
  validaModuloAusiliario,
  type AusiliarioDellElenco,
  type ModuloAusiliario,
  type RiepilogoCaricato,
} from "./amministrazione.ts";
import { interpretaRisposta } from "./risposteApi.ts";

const PREDEFINITO: ModuloAusiliario = {
  nome: "Anna",
  cognome: "Moretti",
  email: "anna.moretti@omnipark.example",
  password: "parola-di-prova-lunga",
  ente: "2",
};

function modulo(modifiche: Partial<ModuloAusiliario>): ModuloAusiliario {
  return { ...PREDEFINITO, ...modifiche };
}

function ausiliario(
  id: number,
  cognome: string,
  enteId: number,
  ente: string,
): AusiliarioDellElenco {
  return {
    id,
    email: `ausiliario${id}@omnipark.example`,
    nome: "Nome",
    cognome,
    enteId,
    ente,
    statoDellAccount: "ATTIVO",
  };
}

function erroreApi(codice: string, messaggio: string): unknown {
  return { errore: { codice, messaggio } };
}

describe("logica delle schermate dell'Amministratore (cp_amministrazioneInterfaccia)", () => {
  it("RF_ADM_2 · TF-AMMUI-01 · modulo valido in creazione → nessun errore", () => {
    expect(validaModuloAusiliario(PREDEFINITO, "creazione")).toEqual({});
  });

  it("RF_ADM_2 · TF-AMMUI-02 · tutti i campi vuoti in creazione → un messaggio per campo", () => {
    expect(
      validaModuloAusiliario(
        { nome: "", cognome: "", email: "", password: "", ente: "" },
        "creazione",
      ),
    ).toEqual({
      nome: "Inserisci il nome.",
      cognome: "Inserisci il cognome.",
      email: "Inserisci l'email.",
      password: "Inserisci la password.",
      ente: "Scegli l'ente.",
    });
  });

  it("RF_ADM_2 · TF-AMMUI-03 · nome di soli spazi → Inserisci il nome.", () => {
    expect(validaModuloAusiliario(modulo({ nome: "   " }), "creazione")).toEqual({
      nome: "Inserisci il nome.",
    });
  });

  it("NRF_USA_1 · TF-AMMUI-04 · email senza chiocciola → L'email non è valida.", () => {
    expect(validaModuloAusiliario(modulo({ email: "senza-chiocciola" }), "creazione")).toEqual({
      email: "L'email non è valida.",
    });
  });

  it("ISSUE_39 · TF-AMMUI-05 · password troppo corta in creazione → almeno 8 caratteri", () => {
    expect(validaModuloAusiliario(modulo({ password: "corta77" }), "creazione")).toEqual({
      password: "La password deve avere almeno 8 caratteri.",
    });
  });

  it("ISSUE_39 · TF-AMMUI-06 · password vuota in modifica → nessun errore", () => {
    expect(validaModuloAusiliario(modulo({ password: "" }), "modifica")).toEqual({});
  });

  it("RF_ADM_2 · TF-AMMUI-07 · ente non scelto in modifica → Scegli l'ente.", () => {
    expect(validaModuloAusiliario(modulo({ ente: "" }), "modifica")).toEqual({
      ente: "Scegli l'ente.",
    });
  });

  it("ISSUE_39 · TF-AMMUI-08 · corpo in creazione con spazi ai lati → nome e cognome ripuliti, ente numerico, password", () => {
    expect(corpoAusiliario(modulo({ nome: " Anna ", cognome: "Moretti " }), "creazione")).toEqual({
      nome: "Anna",
      cognome: "Moretti",
      email: "anna.moretti@omnipark.example",
      ente: 2,
      password: "parola-di-prova-lunga",
    });
  });

  it("ISSUE_39 · TF-AMMUI-09 · corpo in modifica → senza la chiave password", () => {
    const corpo = corpoAusiliario(PREDEFINITO, "modifica");
    expect(corpo).toEqual({
      nome: "Anna",
      cognome: "Moretti",
      email: "anna.moretti@omnipark.example",
      ente: 2,
    });
    expect(Object.keys(corpo)).not.toContain("password");
  });

  it("RF_ADM_2 · TF-AMMUI-10 · modulo da un Ausiliario dell'elenco → compilato con password vuota", () => {
    expect(
      moduloDa({
        id: 5,
        email: "anna.moretti@omnipark.example",
        nome: "Anna",
        cognome: "Moretti",
        enteId: 2,
        ente: "Comune di Fisciano",
        statoDellAccount: "ATTIVO",
      }),
    ).toEqual({
      nome: "Anna",
      cognome: "Moretti",
      email: "anna.moretti@omnipark.example",
      password: "",
      ente: "2",
    });
  });

  it("RF_ADM_2 · TF-AMMUI-11 · EMAIL_GIA_REGISTRATA → errore sul campo email", () => {
    const messaggio = "Questa email è già usata da un altro account.";
    expect(
      interpretaRisposta(409, erroreApi("EMAIL_GIA_REGISTRATA", messaggio), CAMPI_AUSILIARIO),
    ).toEqual({ esito: "errore", campo: "email", messaggio });
  });

  it("RF_ADM_2 · TF-AMMUI-12 · ENTE_INESISTENTE → errore sul campo ente", () => {
    const messaggio = "L'ente scelto non esiste.";
    expect(
      interpretaRisposta(404, erroreApi("ENTE_INESISTENTE", messaggio), CAMPI_AUSILIARIO),
    ).toEqual({ esito: "errore", campo: "ente", messaggio });
  });

  it("VD_18 · TF-AMMUI-13 · CAMBIO_ENTE_NON_CONSENTITO → errore sul campo ente", () => {
    const messaggio = "Non puoi cambiare l'ente di un Ausiliario con segnalazioni prese in carico.";
    expect(
      interpretaRisposta(409, erroreApi("CAMBIO_ENTE_NON_CONSENTITO", messaggio), CAMPI_AUSILIARIO),
    ).toEqual({ esito: "errore", campo: "ente", messaggio });
  });

  it("RF_ADM_2 · TF-AMMUI-14 · DATI_INCOMPLETI → avviso generale", () => {
    const messaggio = "Compila tutti i campi.";
    expect(
      interpretaRisposta(422, erroreApi("DATI_INCOMPLETI", messaggio), CAMPI_AUSILIARIO),
    ).toEqual({ esito: "errore", campo: "generale", messaggio });
  });

  it("VD_19 · TF-AMMUI-15 · AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO → messaggio sulla riga", () => {
    const messaggio = "L'Ausiliario ha segnalazioni prese in carico.";
    expect(
      interpretaRisposta(
        409,
        erroreApi("AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO", messaggio),
        CAMPI_DISATTIVAZIONE,
      ),
    ).toEqual({ esito: "errore", campo: "riga", messaggio });
  });

  it("RF_ADM_2 · TF-AMMUI-16 · Ausiliari di più enti → tre gruppi nell'ordine di arrivo", () => {
    const marino = ausiliario(1, "Marino", 3, "Comune di Baronissi");
    const moretti = ausiliario(2, "Moretti", 2, "Comune di Fisciano");
    const ferri = ausiliario(3, "Ferri", 1, "Comune di Gragnano");
    const galli = ausiliario(4, "Galli", 1, "Comune di Gragnano");
    expect(raggruppaPerEnte([marino, moretti, ferri, galli])).toEqual([
      { enteId: 3, ente: "Comune di Baronissi", ausiliari: [marino] },
      { enteId: 2, ente: "Comune di Fisciano", ausiliari: [moretti] },
      { enteId: 1, ente: "Comune di Gragnano", ausiliari: [ferri, galli] },
    ]);
  });

  it("RF_ADM_2 · TF-AMMUI-17 · nessun Ausiliario → nessun gruppo", () => {
    expect(raggruppaPerEnte([])).toEqual([]);
  });

  it("RF_ADM_1 · TF-AMMUI-18 · riepilogo pronto → i tre numeri come testo", () => {
    const riepiloghi = new Map<number, RiepilogoCaricato>([
      [1, { stato: "pronto", stalliGestiti: 21, sosteAttive: 0, segnalazioniAperte: 4 }],
    ]);
    expect(righePanoramica([{ id: 1, nome: "Comune di Gragnano" }], riepiloghi)).toEqual([
      { id: 1, ente: "Comune di Gragnano", celle: ["21", "0", "4"] },
    ]);
  });

  it("RF_ADM_1 · TF-AMMUI-19 · riepilogo in errore → Non disponibile", () => {
    const riepiloghi = new Map<number, RiepilogoCaricato>([[2, { stato: "errore" }]]);
    expect(righePanoramica([{ id: 2, nome: "Comune di Fisciano" }], riepiloghi)).toEqual([
      {
        id: 2,
        ente: "Comune di Fisciano",
        celle: ["Non disponibile", "Non disponibile", "Non disponibile"],
      },
    ]);
  });

  it("ISSUE_39 · TF-AMMUI-20 · riepilogo assente → Caricamento…", () => {
    const riepiloghi = new Map<number, RiepilogoCaricato>();
    expect(righePanoramica([{ id: 3, nome: "Comune di Baronissi" }], riepiloghi)).toEqual([
      {
        id: 3,
        ente: "Comune di Baronissi",
        celle: ["Caricamento…", "Caricamento…", "Caricamento…"],
      },
    ]);
  });

  it("RF_ADM_1 · TF-AMMUI-21 · nessun ente → nessuna riga", () => {
    expect(righePanoramica([], new Map<number, RiepilogoCaricato>())).toEqual([]);
  });
});
