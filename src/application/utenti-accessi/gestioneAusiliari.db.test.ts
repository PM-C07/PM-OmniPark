import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chiudiSegnalazione,
  contaSegnalazioniPreseInCarico,
  dettaglioSegnalazione,
} from "../../persistence/accessoDati/segnalazioniVerifiche";
import {
  creaSessione,
  trovaAusiliario,
  trovaSessione,
  trovaUtentePerEmail,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { calcolaHashToken } from "./crittografia";
import {
  creaFacadeUtentiAccessi,
  ErroreUtentiAccessi,
  type CodiceErroreUtentiAccessi,
  type DatiAusiliario,
  type DatiNuovoAusiliario,
  type FacadeUtentiAccessi,
} from "./facade";

// Test frame TF-GAU-01…31 di docs/test/cp_gestioneAusiliari.md (OMP-62).
// Le scritture vanno in commit: i frame si eseguono nell'ordine della tabella (§3).

const T = new Date("2026-11-20T10:00:00+01:00");
const UN_ORA_DOPO = new Date(T.getTime() + 60 * 60 * 1000);
const PASSWORD = "parola-di-prova-lunga";
const PASSWORD_DIMOSTRATIVA_AUSILIARI = "Demo-Ausiliario-2026";
const AMMINISTRATORE = 1;
const INESISTENTE = 999999;

describe("OMP-62 · cp_gestioneAusiliari", () => {
  let facade: FacadeUtentiAccessi;

  beforeAll(async () => {
    await preparaDatabaseDiTest();
    facade = creaFacadeUtentiAccessi({ pool: poolDiTest(), orologio: { adesso: () => T } });
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§3) ---

  function due(n: number): string {
    return String(n).padStart(2, "0");
  }

  /** Dati validi predefiniti del frame n per la creazione. */
  function datiNuovi(n: number, modifiche: Partial<DatiNuovoAusiliario> = {}): DatiNuovoAusiliario {
    const k = due(n);
    return {
      nome: `Nome${k}`,
      cognome: `Cognome${k}`,
      email: `gau.${k}@test.example`,
      password: PASSWORD,
      ente: 2,
      ...modifiche,
    };
  }

  /** Dati validi predefiniti del frame n per la modifica (senza password). */
  function datiModifica(n: number, modifiche: Partial<DatiAusiliario> = {}): DatiAusiliario {
    const k = due(n);
    return {
      nome: `Nome${k}`,
      cognome: `Cognome${k}`,
      email: `gau.${k}@test.example`,
      ente: 2,
      ...modifiche,
    };
  }

  async function sessioneDiProva(utenteId: number, n: number, k: number): Promise<string> {
    const hashToken = calcolaHashToken(`gau-${due(n)}-${k}`);
    await creaSessione(poolDiTest(), { utenteId, hashToken, scadenza: UN_ORA_DOPO });
    return hashToken;
  }

  async function sessioneValida(hashToken: string): Promise<boolean> {
    return (await trovaSessione(poolDiTest(), hashToken, T)) !== null;
  }

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: CodiceErroreUtentiAccessi,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreUtentiAccessi);
    expect((ottenuto as ErroreUtentiAccessi).codice).toBe(codice);
  }

  async function numeroAusiliari(): Promise<number> {
    return (await facade.ausiliariPerEnte()).length;
  }

  /** Creazione rifiutata con codice; invariato: nessun utente con l'email, numero di Ausiliari uguale. */
  async function creazioneRifiutata(
    dati: DatiNuovoAusiliario,
    codice: CodiceErroreUtentiAccessi,
  ): Promise<void> {
    const prima = await numeroAusiliari();

    await rifiutato(facade.creaAusiliario(AMMINISTRATORE, dati), codice);

    expect(await trovaUtentePerEmail(poolDiTest(), dati.email)).toBeNull();
    expect(await numeroAusiliari()).toBe(prima);
  }

  /** Modifica rifiutata con codice; invariato: trovaAusiliario(id) uguale a prima. */
  async function modificaRifiutata(
    id: number,
    dati: DatiAusiliario,
    codice: CodiceErroreUtentiAccessi,
  ): Promise<void> {
    const prima = await trovaAusiliario(poolDiTest(), id);
    expect(prima).not.toBeNull();

    await rifiutato(facade.aggiornaAusiliario(id, dati), codice);

    expect(await trovaAusiliario(poolDiTest(), id)).toEqual(prima);
  }

  // --- Elenco ---

  it("RF_ADM_2 · TF-GAU-01 · elenco del dataset → 5 Ausiliari per ente, cognome e nome, Russo DISATTIVATO", async () => {
    const elenco = await facade.ausiliariPerEnte();

    expect(
      elenco.map((a) => ({
        id: a.id,
        cognome: a.cognome,
        ente: a.ente,
        enteId: a.enteId,
        statoDellAccount: a.statoDellAccount,
      })),
    ).toEqual([
      {
        id: 6,
        cognome: "Marino",
        ente: "Comune di Baronissi",
        enteId: 3,
        statoDellAccount: "ATTIVO",
      },
      {
        id: 5,
        cognome: "Moretti",
        ente: "Comune di Fisciano",
        enteId: 2,
        statoDellAccount: "ATTIVO",
      },
      {
        id: 2,
        cognome: "Ferri",
        ente: "Comune di Gragnano",
        enteId: 1,
        statoDellAccount: "ATTIVO",
      },
      {
        id: 3,
        cognome: "Galli",
        ente: "Comune di Gragnano",
        enteId: 1,
        statoDellAccount: "ATTIVO",
      },
      {
        id: 4,
        cognome: "Russo",
        ente: "Comune di Gragnano",
        enteId: 1,
        statoDellAccount: "DISATTIVATO",
      },
    ]);
  });

  // --- Creazione ---

  it("RF_ADM_2 · TF-GAU-02 · dati validi → Ausiliario ATTIVO dell'ente 2, hash scrypt, gestito dall'Amministratore 1, accesso riuscito", async () => {
    const creato = await facade.creaAusiliario(AMMINISTRATORE, datiNuovi(2));

    expect(creato).toMatchObject({
      email: "gau.02@test.example",
      nome: "Nome02",
      cognome: "Cognome02",
      enteId: 2,
      ente: "Comune di Fisciano",
      statoDellAccount: "ATTIVO",
    });

    const hash = await poolDiTest().query<{ hash_password: string }>(
      "SELECT hash_password FROM utente WHERE id = $1",
      [creato.id],
    );
    expect(hash.rows).toHaveLength(1);
    expect(hash.rows[0].hash_password.startsWith("$scrypt$")).toBe(true);
    expect(hash.rows[0].hash_password).not.toBe(PASSWORD);

    const gestione = await poolDiTest().query(
      "SELECT 1 FROM gestione_account_ausiliario WHERE amministratore_id = $1 AND ausiliario_del_traffico_id = $2",
      [AMMINISTRATORE, creato.id],
    );
    expect(gestione.rows).toHaveLength(1);

    const sessione = await facade.accedi("gau.02@test.example", PASSWORD);
    expect(sessione).toMatchObject({
      utenteId: creato.id,
      ruolo: "AUSILIARIO_DEL_TRAFFICO",
      enteId: 2,
    });
  });

  it("VD_1 · TF-GAU-03 · email già registrata con maiuscole diverse → EMAIL_GIA_REGISTRATA", async () => {
    const dati = datiNuovi(3, { email: "PAOLO.FERRI@omnipark.example" });
    const utentePrima = await trovaUtentePerEmail(poolDiTest(), dati.email);
    expect(utentePrima?.id).toBe(2);
    const prima = await numeroAusiliari();

    await rifiutato(facade.creaAusiliario(AMMINISTRATORE, dati), "EMAIL_GIA_REGISTRATA");

    // L'email appartiene a Paolo Ferri: «invariato» = l'utente trovato è sempre lui, senza cambiamenti.
    expect(await trovaUtentePerEmail(poolDiTest(), dati.email)).toEqual(utentePrima);
    expect(await numeroAusiliari()).toBe(prima);
  });

  it("ISSUE_39 · TF-GAU-04 · email non valida → EMAIL_NON_VALIDA", async () => {
    await creazioneRifiutata(datiNuovi(4, { email: "senza-chiocciola" }), "EMAIL_NON_VALIDA");
  });

  it("ISSUE_39 · TF-GAU-05 · password di 7 caratteri → PASSWORD_TROPPO_CORTA", async () => {
    await creazioneRifiutata(datiNuovi(5, { password: "corta77" }), "PASSWORD_TROPPO_CORTA");
  });

  it("ISSUE_39 · TF-GAU-06 · password di 8 caratteri accentati → Ausiliario creato, accesso riuscito", async () => {
    const password = "àèìòùàèì";
    const creato = await facade.creaAusiliario(AMMINISTRATORE, datiNuovi(6, { password }));

    expect(creato).toMatchObject({ email: "gau.06@test.example", statoDellAccount: "ATTIVO" });
    const sessione = await facade.accedi("gau.06@test.example", password);
    expect(sessione.utenteId).toBe(creato.id);
  });

  it("RF_ADM_2 · TF-GAU-07 · ente inesistente → ENTE_INESISTENTE", async () => {
    await creazioneRifiutata(datiNuovi(7, { ente: INESISTENTE }), "ENTE_INESISTENTE");
  });

  it("RF_ADM_2 · TF-GAU-08 · nome di soli spazi → DATI_INCOMPLETI", async () => {
    await creazioneRifiutata(datiNuovi(8, { nome: "   " }), "DATI_INCOMPLETI");
  });

  it("RF_ADM_2 · TF-GAU-09 · password vuota → DATI_INCOMPLETI", async () => {
    await creazioneRifiutata(datiNuovi(9, { password: "" }), "DATI_INCOMPLETI");
  });

  it("RF_ADM_2 · TF-GAU-10 · email vuota → DATI_INCOMPLETI", async () => {
    await creazioneRifiutata(datiNuovi(10, { email: "" }), "DATI_INCOMPLETI");
  });

  it("RF_ADM_2 · TF-GAU-11 · ente assente → DATI_INCOMPLETI", async () => {
    await creazioneRifiutata(datiNuovi(11, { ente: null }), "DATI_INCOMPLETI");
  });

  it("ISSUE_39 · TF-GAU-12 · nome e cognome con spazi ai lati → salvati senza spazi", async () => {
    const creato = await facade.creaAusiliario(
      AMMINISTRATORE,
      datiNuovi(12, { nome: "  Nome12 ", cognome: " Cognome12  " }),
    );

    expect(creato).toMatchObject({ nome: "Nome12", cognome: "Cognome12" });
    expect(await trovaAusiliario(poolDiTest(), creato.id)).toMatchObject({
      nome: "Nome12",
      cognome: "Cognome12",
    });
  });

  // --- Modifica ---

  it("RF_ADM_2 · TF-GAU-13 · nuovo nome di Giorgio Marino → nome «Giorgio Maria», email ed ente invariati, ATTIVO", async () => {
    const aggiornato = await facade.aggiornaAusiliario(6, {
      nome: "Giorgio Maria",
      cognome: "Marino",
      email: "giorgio.marino@omnipark.example",
      ente: 3,
    });

    expect(aggiornato).toMatchObject({
      id: 6,
      nome: "Giorgio Maria",
      cognome: "Marino",
      email: "giorgio.marino@omnipark.example",
      enteId: 3,
      ente: "Comune di Baronissi",
      statoDellAccount: "ATTIVO",
    });
  });

  it("ISSUE_39 · TF-GAU-14 · email invariata con maiuscole diverse → accettata, accesso con la password dimostrativa", async () => {
    const aggiornato = await facade.aggiornaAusiliario(6, {
      nome: "Giorgio Maria",
      cognome: "Marino",
      email: "Giorgio.Marino@omnipark.example",
      ente: 3,
    });

    expect(aggiornato.email).toBe("Giorgio.Marino@omnipark.example");
    expect((await trovaAusiliario(poolDiTest(), 6))?.email).toBe("Giorgio.Marino@omnipark.example");
    const sessione = await facade.accedi(
      "giorgio.marino@omnipark.example",
      PASSWORD_DIMOSTRATIVA_AUSILIARI,
    );
    expect(sessione.utenteId).toBe(6);
  });

  it("RF_ADM_2 · TF-GAU-15 · nuova email di Anna Moretti → accesso con la nuova, CREDENZIALI_NON_VALIDE con la vecchia", async () => {
    const aggiornato = await facade.aggiornaAusiliario(5, {
      nome: "Anna",
      cognome: "Moretti",
      email: "anna.moretti.nuova@test.example",
      ente: 2,
    });

    expect(aggiornato.email).toBe("anna.moretti.nuova@test.example");
    const sessione = await facade.accedi(
      "anna.moretti.nuova@test.example",
      PASSWORD_DIMOSTRATIVA_AUSILIARI,
    );
    expect(sessione.utenteId).toBe(5);
    await rifiutato(
      facade.accedi("anna.moretti@omnipark.example", PASSWORD_DIMOSTRATIVA_AUSILIARI),
      "CREDENZIALI_NON_VALIDE",
    );
  });

  it("VD_1 · TF-GAU-16 · email di un altro utente → EMAIL_GIA_REGISTRATA", async () => {
    await modificaRifiutata(
      5,
      datiModifica(16, { email: "marco.rossi@omnipark.example" }),
      "EMAIL_GIA_REGISTRATA",
    );
  });

  it("ISSUE_39 · TF-GAU-17 · email non valida → EMAIL_NON_VALIDA", async () => {
    await modificaRifiutata(5, datiModifica(17, { email: "senza-chiocciola" }), "EMAIL_NON_VALIDA");
  });

  it("RF_ADM_2 · TF-GAU-18 · cognome vuoto → DATI_INCOMPLETI", async () => {
    await modificaRifiutata(5, datiModifica(18, { cognome: "" }), "DATI_INCOMPLETI");
  });

  it("RF_ADM_2 · TF-GAU-19 · ente inesistente → ENTE_INESISTENTE", async () => {
    await modificaRifiutata(5, datiModifica(19, { ente: INESISTENTE }), "ENTE_INESISTENTE");
  });

  it("RF_ADM_2 · TF-GAU-20 · Ausiliario inesistente → AUSILIARIO_INESISTENTE", async () => {
    await rifiutato(
      facade.aggiornaAusiliario(INESISTENTE, datiModifica(20)),
      "AUSILIARIO_INESISTENTE",
    );
    expect(await trovaUtentePerEmail(poolDiTest(), "gau.20@test.example")).toBeNull();
  });

  it("NRF_SIC_1 · TF-GAU-21 · id di un Automobilista → AUSILIARIO_INESISTENTE, utente 8 invariato", async () => {
    const prima = await trovaUtentePerEmail(poolDiTest(), "marco.rossi@omnipark.example");
    expect(prima?.id).toBe(8);

    await rifiutato(facade.aggiornaAusiliario(8, datiModifica(21)), "AUSILIARIO_INESISTENTE");

    expect(await trovaUtentePerEmail(poolDiTest(), "marco.rossi@omnipark.example")).toEqual(prima);
    expect(await trovaUtentePerEmail(poolDiTest(), "gau.21@test.example")).toBeNull();
  });

  it("NRF_SIC_1 · TF-GAU-22 · cambio di ente senza prese in carico → ente 2 «Comune di Fisciano»", async () => {
    const aggiornato = await facade.aggiornaAusiliario(6, {
      nome: "Giorgio Maria",
      cognome: "Marino",
      email: "giorgio.marino@omnipark.example",
      ente: 2,
    });

    expect(aggiornato).toMatchObject({ id: 6, enteId: 2, ente: "Comune di Fisciano" });
    expect((await trovaAusiliario(poolDiTest(), 6))?.enteId).toBe(2);
  });

  it("VD_18 · TF-GAU-23 · cambio di ente con 2 prese in carico → CAMBIO_ENTE_NON_CONSENTITO, Sara resta all'ente 1", async () => {
    await modificaRifiutata(
      3,
      { nome: "Sara", cognome: "Galli", email: "sara.galli@omnipark.example", ente: 2 },
      "CAMBIO_ENTE_NON_CONSENTITO",
    );

    expect((await trovaAusiliario(poolDiTest(), 3))?.enteId).toBe(1);
  });

  it("RF_ADM_2 · TF-GAU-24 · stesso ente con prese in carico → nome «Sara Maria», ente 1", async () => {
    const aggiornato = await facade.aggiornaAusiliario(3, {
      nome: "Sara Maria",
      cognome: "Galli",
      email: "sara.galli@omnipark.example",
      ente: 1,
    });

    expect(aggiornato).toMatchObject({ id: 3, nome: "Sara Maria", enteId: 1 });
  });

  it("RF_ADM_2 · TF-GAU-25 · Ausiliario disattivato modificato → nome «Luca Andrea», resta DISATTIVATO", async () => {
    const aggiornato = await facade.aggiornaAusiliario(4, {
      nome: "Luca Andrea",
      cognome: "Russo",
      email: "luca.russo@omnipark.example",
      ente: 1,
    });

    expect(aggiornato).toMatchObject({
      id: 4,
      nome: "Luca Andrea",
      statoDellAccount: "DISATTIVATO",
    });
    expect((await trovaAusiliario(poolDiTest(), 4))?.statoDellAccount).toBe("DISATTIVATO");
  });

  // --- Disattivazione ---

  it("RF_ADM_2 · TF-GAU-26 · Ausiliario attivo con due sessioni → DISATTIVATO, sessioni chiuse, accesso ACCOUNT_DISATTIVATO", async () => {
    const creato = await facade.creaAusiliario(AMMINISTRATORE, datiNuovi(26));
    const prima = await sessioneDiProva(creato.id, 26, 1);
    const seconda = await sessioneDiProva(creato.id, 26, 2);
    expect(await sessioneValida(prima)).toBe(true);
    expect(await sessioneValida(seconda)).toBe(true);

    const disattivato = await facade.disattivaAusiliario(creato.id);

    expect(disattivato).toMatchObject({ id: creato.id, statoDellAccount: "DISATTIVATO" });
    expect(await sessioneValida(prima)).toBe(false);
    expect(await sessioneValida(seconda)).toBe(false);
    await rifiutato(facade.accedi("gau.26@test.example", PASSWORD), "ACCOUNT_DISATTIVATO");
  });

  it("VD_19 · TF-GAU-27 · Ausiliario con segnalazioni prese in carico → AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO", async () => {
    const sessione = await sessioneDiProva(3, 27, 1);
    const prima = await trovaAusiliario(poolDiTest(), 3);

    await rifiutato(facade.disattivaAusiliario(3), "AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO");

    const dopo = await trovaAusiliario(poolDiTest(), 3);
    expect(dopo?.statoDellAccount).toBe("ATTIVO");
    expect(dopo).toEqual(prima);
    expect(await sessioneValida(sessione)).toBe(true);
  });

  it("VD_19 · TF-GAU-28 · Ausiliario senza più prese in carico → DISATTIVATO, segnalazioni e verifica conservate", async () => {
    const segnalazione1 = await dettaglioSegnalazione(poolDiTest(), 1);
    const segnalazione6 = await dettaglioSegnalazione(poolDiTest(), 6);
    expect(await chiudiSegnalazione(poolDiTest(), 5, 2, "NON_CONFERMATA", T)).toBe(true);
    expect(await contaSegnalazioniPreseInCarico(poolDiTest(), 2)).toBe(0);

    const disattivato = await facade.disattivaAusiliario(2);

    expect(disattivato).toMatchObject({ id: 2, statoDellAccount: "DISATTIVATO" });
    for (const [id, esito] of [
      [1, segnalazione1?.esito],
      [5, "NON_CONFERMATA"],
      [6, segnalazione6?.esito],
    ] as const) {
      const d = await dettaglioSegnalazione(poolDiTest(), id);
      expect(d).toMatchObject({ stato: "CHIUSA", ausiliarioId: 2, esito });
    }
    const verifica = await poolDiTest().query<{ ausiliario: string }>(
      "SELECT ausiliario_del_traffico_id AS ausiliario FROM verifica_del_permesso WHERE id = 2",
    );
    expect(verifica.rows).toHaveLength(1);
    expect(Number(verifica.rows[0].ausiliario)).toBe(2);
  });

  it("RF_ADM_2 · TF-GAU-29 · Ausiliario già disattivato → AUSILIARIO_GIA_DISATTIVATO", async () => {
    await rifiutato(facade.disattivaAusiliario(4), "AUSILIARIO_GIA_DISATTIVATO");
  });

  it("RF_ADM_2 · TF-GAU-30 · Ausiliario inesistente → AUSILIARIO_INESISTENTE", async () => {
    await rifiutato(facade.disattivaAusiliario(INESISTENTE), "AUSILIARIO_INESISTENTE");
  });

  it("NRF_SIC_1 · TF-GAU-31 · id di un Automobilista → AUSILIARIO_INESISTENTE, sessione dell'utente 8 ancora valida", async () => {
    const sessione = await sessioneDiProva(8, 31, 1);

    await rifiutato(facade.disattivaAusiliario(8), "AUSILIARIO_INESISTENTE");

    expect(await sessioneValida(sessione)).toBe(true);
  });
});
