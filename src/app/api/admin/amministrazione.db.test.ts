import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  calcolaHashPassword,
  calcolaHashToken,
} from "../../../application/utenti-accessi/crittografia.ts";
import {
  ausiliari,
  creaAusiliario,
  creaSessione,
  trovaAusiliario,
  trovaUtentePerEmail,
} from "../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import { chiudiPool, verificaConnessione } from "../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../persistence/test/databaseDiTest.ts";
import { POST as accesso } from "../auth/accesso/route.ts";
import { GET as io } from "../auth/io/route.ts";
import { POST as disattivazioneAusiliario } from "./ausiliari/[id]/disattivazione/route.ts";
import { PUT as modificaAusiliario } from "./ausiliari/[id]/route.ts";
import { GET as elencoAusiliari, POST as nuovoAusiliario } from "./ausiliari/route.ts";
import { GET as riepilogoEnte } from "./enti/[id]/riepilogo/route.ts";
import { GET as elencoEnti } from "./enti/route.ts";

// Test frame TF-API-ADM-01…34 di docs/test/cp_apiAmministrazione.md (OMP-62).
// I frame si eseguono nell'ordine della tabella e le scritture vanno in commit (§3).

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_VALIDA = "parola-di-prova-lunga";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const SCADENZA_FUTURA = new Date("2027-01-01T00:00:00+01:00");
const ID_INESISTENTE = "999999";

const CAMPI_AUSILIARIO = ["cognome", "email", "ente", "enteId", "id", "nome", "statoDellAccount"];

type AusiliarioRisposta = {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  enteId: number;
  ente: string;
  statoDellAccount: string;
};

type Utente = { id: number; ruolo: string; ente: number | null };

// ---- Richieste ----

function richiesta(
  percorso: string,
  metodo: string,
  opzioni: { cookie?: string; corpo?: unknown } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opzioni.cookie !== undefined) {
    headers.cookie = `${NOME_COOKIE}=${opzioni.cookie}`;
  }
  let body: string | undefined;
  if (opzioni.corpo !== undefined) {
    headers["content-type"] = "application/json";
    body = typeof opzioni.corpo === "string" ? opzioni.corpo : JSON.stringify(opzioni.corpo);
  }
  return new Request(`${BASE}${percorso}`, { method: metodo, headers, body });
}

function chiediEnti(cookie?: string): Promise<Response> {
  return elencoEnti(richiesta("/api/admin/enti", "GET", { cookie }));
}

function chiediRiepilogo(id: string, cookie?: string): Promise<Response> {
  return riepilogoEnte(
    richiesta(`/api/admin/enti/${encodeURIComponent(id)}/riepilogo`, "GET", { cookie }),
    { params: Promise.resolve({ id }) },
  );
}

function chiediAusiliari(cookie?: string): Promise<Response> {
  return elencoAusiliari(richiesta("/api/admin/ausiliari", "GET", { cookie }));
}

function crea(corpo: unknown, cookie?: string): Promise<Response> {
  return nuovoAusiliario(richiesta("/api/admin/ausiliari", "POST", { cookie, corpo }));
}

function modifica(id: string, corpo: unknown, cookie?: string): Promise<Response> {
  return modificaAusiliario(
    richiesta(`/api/admin/ausiliari/${encodeURIComponent(id)}`, "PUT", { cookie, corpo }),
    { params: Promise.resolve({ id }) },
  );
}

function disattiva(id: string, cookie?: string): Promise<Response> {
  return disattivazioneAusiliario(
    richiesta(`/api/admin/ausiliari/${encodeURIComponent(id)}/disattivazione`, "POST", {
      cookie,
    }),
    { params: Promise.resolve({ id }) },
  );
}

function accedi(email: string, password: string): Promise<Response> {
  return accesso(richiesta("/api/auth/accesso", "POST", { corpo: { email, password } }));
}

function chiediIo(cookie?: string): Promise<Response> {
  return io(richiesta("/api/auth/io", "GET", { cookie }));
}

// ---- Esiti ----

async function verificaErrore(risposta: Response, status: number, codice: string): Promise<void> {
  expect(risposta.status).toBe(status);
  const corpo = (await risposta.json()) as { errore: { codice: string; messaggio: string } };
  expect(corpo.errore.codice).toBe(codice);
  expect(typeof corpo.errore.messaggio).toBe("string");
  expect(corpo.errore.messaggio.length).toBeGreaterThan(0);
}

/** Nessun campo con la password o il suo hash, a qualsiasi livello. */
function verificaSenzaPassword(valore: unknown): void {
  const testo = JSON.stringify(valore);
  expect(testo).not.toContain(PASSWORD_VALIDA);
  expect(testo).not.toMatch(/"[^"]*(password|hash)[^"]*"\s*:/i);
}

// ---- Preparazioni ----

/** Corpo valido predefinito del frame n (§3), con n su due cifre. */
function corpoValido(n: string): {
  nome: string;
  cognome: string;
  email: string;
  password: string;
  ente: number;
} {
  return {
    nome: `Nome${n}`,
    cognome: `Cognome${n}`,
    email: emailDelFrame(n),
    password: PASSWORD_VALIDA,
    ente: 2,
  };
}

function emailDelFrame(n: string): string {
  return `api.adm${n}@test.example`;
}

/** Sessione dell'Amministratore inserita con la persistenza (§3): cookie `amministratore-<n>`. */
async function sessioneAmministratore(n: string): Promise<string> {
  const token = `amministratore-${n}`;
  await creaSessione(poolDiTest(), {
    utenteId: 1,
    hashToken: calcolaHashToken(token),
    scadenza: SCADENZA_FUTURA,
  });
  return token;
}

async function cookieDiAccesso(email: string, password: string): Promise<string> {
  const risposta = await accedi(email, password);
  expect(risposta.status).toBe(200);
  const valore = /omnipark_sessione=([^;,\s]+)/.exec(risposta.headers.get("set-cookie") ?? "");
  expect(valore).not.toBeNull();
  return valore![1];
}

/** Dati confrontati da «invariato» (§3). */
async function datiAusiliario(id: number): Promise<unknown> {
  const ausiliario = await trovaAusiliario(poolDiTest(), id);
  expect(ausiliario).not.toBeNull();
  return { ...ausiliario };
}

async function nessunAccount(email: string): Promise<void> {
  expect(await trovaUtentePerEmail(poolDiTest(), email)).toBeNull();
}

async function elencoAusiliariPersistito(): Promise<unknown> {
  return (await ausiliari(poolDiTest())).map((a) => ({ ...a }));
}

describe("OMP-62 · cp_apiAmministrazione", () => {
  let paolo: string;
  let marco: string;

  beforeAll(async () => {
    await preparaDatabaseDiTest();

    if ((globalThis as { omniparkPool?: unknown }).omniparkPool !== undefined) {
      throw new Error("Pool applicativo creato all'import: test interrotti senza richieste.");
    }

    const verifica = verificaDatabaseDiTest(process.env);
    if (!verifica.consentito) {
      throw new Error(verifica.motivo);
    }

    vi.stubEnv("DATABASE_URL", process.env.DATABASE_URL_TEST!);

    const { database } = await verificaConnessione();
    if (!database.endsWith("_test") || database !== verifica.destinazione.database) {
      throw new Error("Il pool applicativo non punta al database di test: test interrotti.");
    }

    paolo = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);
    marco = await cookieDiAccesso(MARCO_ROSSI, PASSWORD_AUTOMOBILISTA);
  });

  afterAll(async () => {
    await chiudiPool();
    await chiudiDatabaseDiTest();
    vi.unstubAllEnvs();
  });

  // ---- GET /api/admin/enti ----

  it("RF_ADM_1 · TF-API-ADM-01 · enti chiesti dall'Amministratore → 200, Baronissi, Fisciano, Gragnano per nome", async () => {
    const cookie = await sessioneAmministratore("01");

    const risposta = await chiediEnti(cookie);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({
      enti: [
        { id: 3, nome: "Comune di Baronissi" },
        { id: 2, nome: "Comune di Fisciano" },
        { id: 1, nome: "Comune di Gragnano" },
      ],
    });
  });

  it("NRF_SIC_1 · TF-API-ADM-02 · enti senza sessione → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediEnti(), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-ADM-03 · enti chiesti da un Ausiliario → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediEnti(paolo), 403, "RUOLO_NON_AMMESSO");
  });

  it("NRF_SIC_1 · TF-API-ADM-04 · enti chiesti da un Automobilista → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediEnti(marco), 403, "RUOLO_NON_AMMESSO");
  });

  // ---- GET /api/admin/enti/<id>/riepilogo ----

  it("RF_ADM_1 · TF-API-ADM-05 · riepilogo dell'ente 1 → 200, 21 stalli, 0 soste attive, 4 segnalazioni aperte", async () => {
    const cookie = await sessioneAmministratore("05");

    const risposta = await chiediRiepilogo("1", cookie);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({
      ente: 1,
      stalliGestiti: 21,
      sosteAttive: 0,
      segnalazioniAperte: 4,
    });
  });

  it("RF_ADM_1 · TF-API-ADM-06 · riepilogo dell'ente inesistente 999999 → 404 ENTE_INESISTENTE", async () => {
    const cookie = await sessioneAmministratore("06");

    await verificaErrore(await chiediRiepilogo(ID_INESISTENTE, cookie), 404, "ENTE_INESISTENTE");
  });

  it("ISSUE_39 · TF-API-ADM-07 · riepilogo con id non intero abc → 422 RICHIESTA_NON_VALIDA", async () => {
    const cookie = await sessioneAmministratore("07");

    await verificaErrore(await chiediRiepilogo("abc", cookie), 422, "RICHIESTA_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-ADM-08 · riepilogo dell'ente 1 chiesto da un Ausiliario → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediRiepilogo("1", paolo), 403, "RUOLO_NON_AMMESSO");
  });

  it("NRF_SIC_1 · TF-API-ADM-09 · riepilogo dell'ente 1 senza sessione → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediRiepilogo("1"), 401, "SESSIONE_NON_VALIDA");
  });

  // ---- GET /api/admin/ausiliari ----

  it("RF_ADM_2 · TF-API-ADM-10 · elenco degli Ausiliari → 200, Marino, Moretti, Ferri, Galli, Russo con ente, Russo DISATTIVATO, senza password", async () => {
    const cookie = await sessioneAmministratore("10");

    const risposta = await chiediAusiliari(cookie);

    expect(risposta.status).toBe(200);
    const corpo = (await risposta.json()) as { ausiliari: AusiliarioRisposta[] };
    verificaSenzaPassword(corpo);
    expect(corpo.ausiliari.map((a) => a.cognome)).toEqual([
      "Marino",
      "Moretti",
      "Ferri",
      "Galli",
      "Russo",
    ]);
    expect(corpo.ausiliari.map((a) => [a.id, a.enteId, a.ente, a.statoDellAccount])).toEqual([
      [6, 3, "Comune di Baronissi", "ATTIVO"],
      [5, 2, "Comune di Fisciano", "ATTIVO"],
      [2, 1, "Comune di Gragnano", "ATTIVO"],
      [3, 1, "Comune di Gragnano", "ATTIVO"],
      [4, 1, "Comune di Gragnano", "DISATTIVATO"],
    ]);
    for (const a of corpo.ausiliari) {
      expect(Object.keys(a).sort()).toEqual(CAMPI_AUSILIARIO);
    }
  });

  it("NRF_SIC_1 · TF-API-ADM-11 · elenco degli Ausiliari chiesto da un Automobilista → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediAusiliari(marco), 403, "RUOLO_NON_AMMESSO");
  });

  it("NRF_SIC_1 · TF-API-ADM-12 · elenco degli Ausiliari senza sessione → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediAusiliari(), 401, "SESSIONE_NON_VALIDA");
  });

  // ---- POST /api/admin/ausiliari ----

  it("RF_ADM_2 · TF-API-ADM-13 · creazione con il corpo valido 13 → 201, ATTIVO nell'ente 2, gestito dall'Amministratore 1, accesso come AUSILIARIO_DEL_TRAFFICO", async () => {
    const cookie = await sessioneAmministratore("13");
    const corpo = corpoValido("13");

    const risposta = await crea(corpo, cookie);

    expect(risposta.status).toBe(201);
    const { ausiliario } = (await risposta.json()) as { ausiliario: AusiliarioRisposta };
    verificaSenzaPassword(ausiliario);
    expect(ausiliario).toMatchObject({
      id: expect.any(Number),
      email: corpo.email,
      nome: "Nome13",
      cognome: "Cognome13",
      enteId: 2,
      ente: "Comune di Fisciano",
      statoDellAccount: "ATTIVO",
    });

    // Nessuna funzione di sola lettura della persistenza legge l'associazione:
    // lettura diretta, senza scritture, sul database di test.
    const gestione = await poolDiTest().query(
      "SELECT 1 FROM gestione_account_ausiliario WHERE amministratore_id = $1 AND ausiliario_del_traffico_id = $2",
      [1, ausiliario.id],
    );
    expect(gestione.rowCount).toBe(1);

    const rispostaAccesso = await accedi(corpo.email, corpo.password);
    expect(rispostaAccesso.status).toBe(200);
    const { utente } = (await rispostaAccesso.json()) as { utente: Utente };
    expect(utente).toEqual({ id: ausiliario.id, ruolo: "AUSILIARIO_DEL_TRAFFICO", ente: 2 });
  });

  it("VD_1 · TF-API-ADM-14 · creazione con email Paolo.Ferri@omnipark.example già registrata → 409 EMAIL_GIA_REGISTRATA, invariato", async () => {
    const cookie = await sessioneAmministratore("14");
    const prima = await elencoAusiliariPersistito();

    await verificaErrore(
      await crea({ ...corpoValido("14"), email: "Paolo.Ferri@omnipark.example" }, cookie),
      409,
      "EMAIL_GIA_REGISTRATA",
    );
    expect(await elencoAusiliariPersistito()).toEqual(prima);
  });

  it("ISSUE_39 · TF-API-ADM-15 · creazione con email senza-chiocciola → 422 EMAIL_NON_VALIDA, invariato", async () => {
    const cookie = await sessioneAmministratore("15");

    await verificaErrore(
      await crea({ ...corpoValido("15"), email: "senza-chiocciola" }, cookie),
      422,
      "EMAIL_NON_VALIDA",
    );
    await nessunAccount("senza-chiocciola");
  });

  it("ISSUE_39 · TF-API-ADM-16 · creazione con password corta77 → 422 PASSWORD_TROPPO_CORTA, invariato", async () => {
    const cookie = await sessioneAmministratore("16");

    await verificaErrore(
      await crea({ ...corpoValido("16"), password: "corta77" }, cookie),
      422,
      "PASSWORD_TROPPO_CORTA",
    );
    await nessunAccount(emailDelFrame("16"));
  });

  it("RF_ADM_2 · TF-API-ADM-17 · creazione con ente inesistente 999999 → 404 ENTE_INESISTENTE, invariato", async () => {
    const cookie = await sessioneAmministratore("17");

    await verificaErrore(
      await crea({ ...corpoValido("17"), ente: 999999 }, cookie),
      404,
      "ENTE_INESISTENTE",
    );
    await nessunAccount(emailDelFrame("17"));
  });

  it("RF_ADM_2 · TF-API-ADM-18 · creazione con il corpo valido 18 senza nome → 422 DATI_INCOMPLETI, invariato", async () => {
    const cookie = await sessioneAmministratore("18");
    const { cognome, email, password, ente } = corpoValido("18");

    await verificaErrore(
      await crea({ cognome, email, password, ente }, cookie),
      422,
      "DATI_INCOMPLETI",
    );
    await nessunAccount(emailDelFrame("18"));
  });

  it("ISSUE_39 · TF-API-ADM-19 · creazione con corpo non JSON → 422 RICHIESTA_NON_VALIDA", async () => {
    const cookie = await sessioneAmministratore("19");

    await verificaErrore(await crea("non è json", cookie), 422, "RICHIESTA_NON_VALIDA");
  });

  it('ISSUE_39 · TF-API-ADM-20 · creazione con ente "2" stringa → 422 RICHIESTA_NON_VALIDA, invariato', async () => {
    const cookie = await sessioneAmministratore("20");

    await verificaErrore(
      await crea({ ...corpoValido("20"), ente: "2" }, cookie),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    await nessunAccount(emailDelFrame("20"));
  });

  it("NRF_SIC_1 · TF-API-ADM-21 · creazione con il corpo valido 21 da un Ausiliario → 403 RUOLO_NON_AMMESSO, nessun account creato", async () => {
    await verificaErrore(await crea(corpoValido("21"), paolo), 403, "RUOLO_NON_AMMESSO");
    await nessunAccount(emailDelFrame("21"));
  });

  it("NRF_SIC_1 · TF-API-ADM-22 · creazione con il corpo valido 22 senza sessione → 401 SESSIONE_NON_VALIDA, nessun account creato", async () => {
    await verificaErrore(await crea(corpoValido("22")), 401, "SESSIONE_NON_VALIDA");
    await nessunAccount(emailDelFrame("22"));
  });

  // ---- PUT /api/admin/ausiliari/<id> ----

  const CORPO_23 = {
    nome: "Giorgio Maria",
    cognome: "Marino",
    email: "giorgio.marino@omnipark.example",
    ente: 3,
  };

  it("RF_ADM_2 · TF-API-ADM-23 · modifica del nome di Giorgio Marino (6) → 200, nome Giorgio Maria, ente 3", async () => {
    const cookie = await sessioneAmministratore("23");

    const risposta = await modifica("6", CORPO_23, cookie);

    expect(risposta.status).toBe(200);
    const { ausiliario } = (await risposta.json()) as { ausiliario: AusiliarioRisposta };
    verificaSenzaPassword(ausiliario);
    expect(ausiliario).toMatchObject({ id: 6, nome: "Giorgio Maria", enteId: 3 });
    expect(await trovaAusiliario(poolDiTest(), 6)).toMatchObject({
      nome: "Giorgio Maria",
      cognome: "Marino",
      email: "giorgio.marino@omnipark.example",
      enteId: 3,
    });
  });

  it("RF_ADM_2 · TF-API-ADM-24 · modifica dell'Ausiliario inesistente 999999 → 404 AUSILIARIO_INESISTENTE", async () => {
    const cookie = await sessioneAmministratore("24");

    await verificaErrore(
      await modifica(ID_INESISTENTE, CORPO_23, cookie),
      404,
      "AUSILIARIO_INESISTENTE",
    );
  });

  it("VD_1 · TF-API-ADM-25 · modifica di Anna Moretti (5) con l'email di Marco Rossi → 409 EMAIL_GIA_REGISTRATA, invariato", async () => {
    const cookie = await sessioneAmministratore("25");
    const prima = await datiAusiliario(5);

    await verificaErrore(
      await modifica(
        "5",
        { nome: "Anna", cognome: "Moretti", email: MARCO_ROSSI, ente: 2 },
        cookie,
      ),
      409,
      "EMAIL_GIA_REGISTRATA",
    );
    expect(await datiAusiliario(5)).toEqual(prima);
  });

  it("VD_18 · TF-API-ADM-26 · cambio di ente di Sara Galli (3) con prese in carico → 409 CAMBIO_ENTE_NON_CONSENTITO, invariato", async () => {
    const cookie = await sessioneAmministratore("26");
    const prima = await datiAusiliario(3);

    await verificaErrore(
      await modifica(
        "3",
        { nome: "Sara", cognome: "Galli", email: "sara.galli@omnipark.example", ente: 2 },
        cookie,
      ),
      409,
      "CAMBIO_ENTE_NON_CONSENTITO",
    );
    expect(await datiAusiliario(3)).toEqual(prima);
  });

  it("ISSUE_39 · TF-API-ADM-27 · modifica con id non intero abc → 422 RICHIESTA_NON_VALIDA", async () => {
    const cookie = await sessioneAmministratore("27");

    await verificaErrore(await modifica("abc", CORPO_23, cookie), 422, "RICHIESTA_NON_VALIDA");
  });

  // ---- POST /api/admin/ausiliari/<id>/disattivazione ----

  it("RF_AUTH_4 · TF-API-ADM-28 · disattivazione dell'Ausiliario di prova → 200 DISATTIVATO, la sua sessione → 401 SESSIONE_NON_VALIDA, nuovo accesso → 403 ACCOUNT_DISATTIVATO", async () => {
    const email = emailDelFrame("28");
    const id = await creaAusiliario(poolDiTest(), {
      email,
      hashPassword: await calcolaHashPassword(PASSWORD_VALIDA),
      nome: "Nome28",
      cognome: "Cognome28",
      enteId: 2,
      amministratoreId: 1,
    });
    const sessioneAusiliario = await cookieDiAccesso(email, PASSWORD_VALIDA);
    const cookie = await sessioneAmministratore("28");

    const risposta = await disattiva(String(id), cookie);

    expect(risposta.status).toBe(200);
    const { ausiliario } = (await risposta.json()) as { ausiliario: AusiliarioRisposta };
    verificaSenzaPassword(ausiliario);
    expect(ausiliario).toMatchObject({ id, statoDellAccount: "DISATTIVATO" });

    await verificaErrore(await chiediIo(sessioneAusiliario), 401, "SESSIONE_NON_VALIDA");
    await verificaErrore(await accedi(email, PASSWORD_VALIDA), 403, "ACCOUNT_DISATTIVATO");
  });

  it("VD_19 · TF-API-ADM-29 · disattivazione di Sara Galli (3) con prese in carico → 409 AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO, resta ATTIVO", async () => {
    const cookie = await sessioneAmministratore("29");

    await verificaErrore(
      await disattiva("3", cookie),
      409,
      "AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO",
    );
    expect((await trovaAusiliario(poolDiTest(), 3))?.statoDellAccount).toBe("ATTIVO");
  });

  it("RF_ADM_2 · TF-API-ADM-30 · disattivazione di Luca Russo (4) già DISATTIVATO → 409 AUSILIARIO_GIA_DISATTIVATO", async () => {
    const cookie = await sessioneAmministratore("30");

    await verificaErrore(await disattiva("4", cookie), 409, "AUSILIARIO_GIA_DISATTIVATO");
  });

  it("RF_ADM_2 · TF-API-ADM-31 · disattivazione dell'Ausiliario inesistente 999999 → 404 AUSILIARIO_INESISTENTE", async () => {
    const cookie = await sessioneAmministratore("31");

    await verificaErrore(await disattiva(ID_INESISTENTE, cookie), 404, "AUSILIARIO_INESISTENTE");
  });

  it("NRF_SIC_1 · TF-API-ADM-32 · disattivazione di Giorgio Marino (6) da un Ausiliario → 403 RUOLO_NON_AMMESSO, resta ATTIVO", async () => {
    await verificaErrore(await disattiva("6", paolo), 403, "RUOLO_NON_AMMESSO");
    expect((await trovaAusiliario(poolDiTest(), 6))?.statoDellAccount).toBe("ATTIVO");
  });

  it("NRF_SIC_1 · TF-API-ADM-33 · disattivazione di Giorgio Marino (6) senza sessione → 401 SESSIONE_NON_VALIDA, resta ATTIVO", async () => {
    await verificaErrore(await disattiva("6"), 401, "SESSIONE_NON_VALIDA");
    expect((await trovaAusiliario(poolDiTest(), 6))?.statoDellAccount).toBe("ATTIVO");
  });

  it("NRF_SIC_1 · TF-API-ADM-34 · modifica di Giorgio Marino (6) da un Automobilista → 403 RUOLO_NON_AMMESSO, invariato", async () => {
    const prima = await datiAusiliario(6);

    const corpo34 = { ...CORPO_23, nome: "Giorgio Luigi" }; // diverso dai dati salvati da TF-23
    await verificaErrore(await modifica("6", corpo34, marco), 403, "RUOLO_NON_AMMESSO");
    expect(await datiAusiliario(6)).toEqual(prima);
  });
});
