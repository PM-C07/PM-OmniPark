import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { osservatoreGestioneSoste } from "../../../application/gestione-soste/facade.ts";
import { creaFacadeGestioneStalli } from "../../../application/gestione-stalli/facade.ts";
import { calcolaHashToken } from "../../../application/utenti-accessi/crittografia.ts";
import {
  creaSessione,
  targheDelProfilo,
  trovaOCreaVeicolo,
  trovaUtentePerEmail,
} from "../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import { creaSosta } from "../../../persistence/accessoDati/walletSoste.ts";
import { chiudiPool, verificaConnessione } from "../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../persistence/test/databaseDiTest.ts";
import { proxy } from "../../../proxy.ts";
import {
  DELETE as eliminaTarga,
  GET as leggiTarghe,
  POST as aggiungiTarga,
} from "../automobilista/targhe/route.ts";
import { POST as accesso } from "./accesso/route.ts";
import { GET as io } from "./io/route.ts";
import { POST as registrazione } from "./registrazione/route.ts";
import { POST as uscita } from "./uscita/route.ts";

// Test frame TF-ACC-01…46 di docs/test/cp_apiAccesso.md (OMP-48; 39…43 da OMP-57, 44…46 da OMP-66).

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_VALIDA = "parola-di-prova-lunga";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const SCADENZA_PASSATA = new Date("2026-01-01T00:00:00+01:00");
const STALLO_OCCUPATO = 17;
const DB_IRRAGGIUNGIBILE = "postgresql://127.0.0.1:1/omnipark_irraggiungibile_test";

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

function registra(corpo: unknown): Promise<Response> {
  return registrazione(richiesta("/api/auth/registrazione", "POST", { corpo }));
}

function accedi(corpo: unknown): Promise<Response> {
  return accesso(richiesta("/api/auth/accesso", "POST", { corpo }));
}

function chiediIo(cookie?: string): Promise<Response> {
  return io(richiesta("/api/auth/io", "GET", { cookie }));
}

function esci(cookie?: string): Promise<Response> {
  return uscita(richiesta("/api/auth/uscita", "POST", { cookie }));
}

function elencoTarghe(cookie?: string): Promise<Response> {
  return leggiTarghe(richiesta("/api/automobilista/targhe", "GET", { cookie }));
}

function nuovaTarga(corpo: unknown, cookie?: string): Promise<Response> {
  return aggiungiTarga(richiesta("/api/automobilista/targhe", "POST", { cookie, corpo }));
}

function togliTarga(targa: string | null, cookie?: string): Promise<Response> {
  const percorso =
    targa === null
      ? "/api/automobilista/targhe"
      : `/api/automobilista/targhe?targa=${encodeURIComponent(targa)}`;
  return eliminaTarga(richiesta(percorso, "DELETE", { cookie }));
}

function chiamaProxy(percorso: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) {
    headers.cookie = `${NOME_COOKIE}=${cookie}`;
  }
  return proxy(new NextRequest(`${BASE}${percorso}`, { headers }));
}

// ---- Cookie ----

function intestazioneCookie(risposta: Response): string {
  return risposta.headers.get("set-cookie") ?? "";
}

/** Verifica gli attributi del cookie di sessione (§2) e ne restituisce il valore. */
function verificaCookieDiSessione(risposta: Response): string {
  const intestazione = intestazioneCookie(risposta);
  const valore = /omnipark_sessione=([^;,\s]+)/.exec(intestazione);
  expect(valore).not.toBeNull();
  // Nomi e valori degli attributi sono confrontati senza distinguere maiuscole (RFC 6265).
  expect(intestazione).toMatch(/;\s*HttpOnly/i);
  expect(intestazione).toMatch(/;\s*Secure/i);
  expect(intestazione).toMatch(/;\s*SameSite=Lax/i);
  expect(intestazione).toMatch(/;\s*Path=\/(;|,|$)/i);
  expect(intestazione).toMatch(/;\s*Max-Age=28800(;|,|$)/i);
  return valore![1];
}

function verificaCookieCancellato(risposta: Response): void {
  const intestazione = intestazioneCookie(risposta);
  expect(intestazione).toMatch(/omnipark_sessione=/);
  expect(intestazione).toMatch(/;\s*Max-Age=0(;|,|$)/i);
}

function verificaNessunCookie(risposta: Response): void {
  expect(intestazioneCookie(risposta)).not.toMatch(/omnipark_sessione=/);
}

// ---- Esiti ----

async function verificaErrore(risposta: Response, status: number, codice: string): Promise<void> {
  expect(risposta.status).toBe(status);
  const corpo = (await risposta.json()) as { errore: { codice: string; messaggio: string } };
  expect(corpo.errore.codice).toBe(codice);
  expect(typeof corpo.errore.messaggio).toBe("string");
  expect(corpo.errore.messaggio.length).toBeGreaterThan(0);
}

function verificaRedirect(risposta: Response, percorsoEQuery: string): void {
  expect(risposta.status).toBe(307);
  const location = risposta.headers.get("location");
  expect(location).not.toBeNull();
  const destinazione = new URL(location!, BASE);
  expect(destinazione.pathname + destinazione.search).toBe(percorsoEQuery);
}

function verificaNessunRedirect(risposta: Response): void {
  expect(risposta.headers.get("location")).toBeNull();
}

// ---- Preparazioni ----

function emailDelFrame(n: string): string {
  return `api.acc${n}@test.example`;
}

/** Automobilista nuovo del frame n (§3): restituisce id e valore del cookie. */
async function automobilistaNuovo(n: string): Promise<{ id: number; cookie: string }> {
  const risposta = await registra({
    email: emailDelFrame(n),
    password: PASSWORD_VALIDA,
    targa: `AC${n.padStart(3, "0")}XX`,
  });
  expect(risposta.status).toBe(201);
  const cookie = verificaCookieDiSessione(risposta);
  const { utente } = (await risposta.json()) as { utente: Utente };
  return { id: utente.id, cookie };
}

async function cookieDiAccesso(email: string, password: string): Promise<string> {
  const risposta = await accedi({ email, password });
  expect(risposta.status).toBe(200);
  return verificaCookieDiSessione(risposta);
}

/** Sessione scaduta inserita con la persistenza (§3): il cookie vale `scaduta-<n>`. */
async function sessioneScaduta(utenteId: number, n: string): Promise<string> {
  const token = `scaduta-${n}`;
  await creaSessione(poolDiTest(), {
    utenteId,
    hashToken: calcolaHashToken(token),
    scadenza: SCADENZA_PASSATA,
  });
  return token;
}

async function targhe(automobilistaId: number): Promise<string[]> {
  return (await targheDelProfilo(poolDiTest(), automobilistaId)).map((t) => t.targa);
}

describe("OMP-48 · cp_apiAccesso", () => {
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
  });

  afterAll(async () => {
    await chiudiPool();
    await chiudiDatabaseDiTest();
    vi.unstubAllEnvs();
  });

  // ---- Registrazione ----

  it("RF_AUTH_1 · TF-ACC-01 · registrazione valida → 201, cookie di sessione e utente AUTOMOBILISTA", async () => {
    const risposta = await registra({
      email: emailDelFrame("01"),
      password: PASSWORD_VALIDA,
      targa: "AC001XX",
    });

    expect(risposta.status).toBe(201);
    const cookie = verificaCookieDiSessione(risposta);
    const corpo = (await risposta.json()) as { utente: Utente };
    expect(corpo).toEqual({
      utente: { id: expect.any(Number), ruolo: "AUTOMOBILISTA", ente: null },
    });

    const rispostaIo = await chiediIo(cookie);
    expect(rispostaIo.status).toBe(200);
    expect(await rispostaIo.json()).toEqual(corpo);
  });

  it("ISSUE_27 · TF-ACC-02 · registrazione con corpo non JSON → 422 RICHIESTA_NON_VALIDA", async () => {
    const risposta = await registra(`{"email":"${emailDelFrame("02")}","password":`);

    verificaNessunCookie(risposta);
    await verificaErrore(risposta, 422, "RICHIESTA_NON_VALIDA");
  });

  it("ISSUE_27 · TF-ACC-03 · registrazione senza targa → 422 RICHIESTA_NON_VALIDA", async () => {
    const risposta = await registra({ email: emailDelFrame("03"), password: PASSWORD_VALIDA });

    await verificaErrore(risposta, 422, "RICHIESTA_NON_VALIDA");
    expect(await trovaUtentePerEmail(poolDiTest(), emailDelFrame("03"))).toBeNull();
  });

  it("RF_AUTH_1 · TF-ACC-04 · registrazione con email già registrata → 409 EMAIL_GIA_REGISTRATA", async () => {
    const risposta = await registra({
      email: "elena.bianchi@omnipark.example",
      password: PASSWORD_VALIDA,
      targa: "AC004XX",
    });

    verificaNessunCookie(risposta);
    await verificaErrore(risposta, 409, "EMAIL_GIA_REGISTRATA");
  });

  it("RF_AUTH_1 · TF-ACC-05 · registrazione con email senza chiocciola → 422 EMAIL_NON_VALIDA", async () => {
    const risposta = await registra({
      email: "senza-chiocciola",
      password: PASSWORD_VALIDA,
      targa: "AC005XX",
    });

    await verificaErrore(risposta, 422, "EMAIL_NON_VALIDA");
  });

  it("RF_AUTH_1 · TF-ACC-06 · registrazione con password corta → 422 PASSWORD_TROPPO_CORTA", async () => {
    const risposta = await registra({
      email: emailDelFrame("06"),
      password: "corta",
      targa: "AC006XX",
    });

    await verificaErrore(risposta, 422, "PASSWORD_TROPPO_CORTA");
  });

  it("RF_AUTH_5 · TF-ACC-07 · registrazione con targa 12-AB → 422 TARGA_NON_VALIDA", async () => {
    const risposta = await registra({
      email: emailDelFrame("07"),
      password: PASSWORD_VALIDA,
      targa: "12-AB",
    });

    await verificaErrore(risposta, 422, "TARGA_NON_VALIDA");
    expect(await trovaUtentePerEmail(poolDiTest(), emailDelFrame("07"))).toBeNull();
  });

  // ---- Accesso ----

  it("RF_AUTH_4 · TF-ACC-08 · accesso di Marco Rossi → 200, cookie e utente 8 AUTOMOBILISTA", async () => {
    const risposta = await accedi({ email: MARCO_ROSSI, password: PASSWORD_AUTOMOBILISTA });

    expect(risposta.status).toBe(200);
    verificaCookieDiSessione(risposta);
    expect(await risposta.json()).toEqual({
      utente: { id: 8, ruolo: "AUTOMOBILISTA", ente: null },
    });
  });

  it("RF_AUTH_4 · TF-ACC-09 · accesso di Paolo Ferri → 200, cookie e utente 2 AUSILIARIO_DEL_TRAFFICO dell'ente 1", async () => {
    const risposta = await accedi({ email: PAOLO_FERRI, password: PASSWORD_AUSILIARIO });

    expect(risposta.status).toBe(200);
    verificaCookieDiSessione(risposta);
    expect(await risposta.json()).toEqual({
      utente: { id: 2, ruolo: "AUSILIARIO_DEL_TRAFFICO", ente: 1 },
    });
  });

  it("RF_AUTH_4 · TF-ACC-10 · accesso con password errata → 401 CREDENZIALI_NON_VALIDE", async () => {
    const risposta = await accedi({ email: MARCO_ROSSI, password: "password-sbagliata-10" });

    verificaNessunCookie(risposta);
    await verificaErrore(risposta, 401, "CREDENZIALI_NON_VALIDE");
  });

  it("VD_19 · TF-ACC-11 · accesso di un Ausiliario disattivato con la password giusta → 403 ACCOUNT_DISATTIVATO", async () => {
    const risposta = await accedi({
      email: "luca.russo@omnipark.example",
      password: PASSWORD_AUSILIARIO,
    });

    verificaNessunCookie(risposta);
    await verificaErrore(risposta, 403, "ACCOUNT_DISATTIVATO");
  });

  it("ISSUE_27 · TF-ACC-12 · accesso senza password → 422 RICHIESTA_NON_VALIDA", async () => {
    const risposta = await accedi({ email: MARCO_ROSSI });

    await verificaErrore(risposta, 422, "RICHIESTA_NON_VALIDA");
  });

  // ---- io ----

  it("NRF_SIC_1 · TF-ACC-13 · io senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediIo(), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-ACC-14 · io con sessione scaduta dell'utente 8 → 401 SESSIONE_NON_VALIDA", async () => {
    const cookie = await sessioneScaduta(8, "14");

    await verificaErrore(await chiediIo(cookie), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-ACC-15 · io con sessione inesistente → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediIo("inesistente-15"), 401, "SESSIONE_NON_VALIDA");
  });

  // ---- Uscita ----

  it("RF_AUTH_4 · TF-ACC-16 · uscita con il cookie, poi io con lo stesso cookie → 204 con Max-Age=0, poi 401 SESSIONE_NON_VALIDA", async () => {
    const { cookie } = await automobilistaNuovo("16");

    const rispostaUscita = await esci(cookie);
    expect(rispostaUscita.status).toBe(204);
    verificaCookieCancellato(rispostaUscita);

    await verificaErrore(await chiediIo(cookie), 401, "SESSIONE_NON_VALIDA");
  });

  it("ISSUE_27 · TF-ACC-17 · uscita senza cookie → 204 con Max-Age=0", async () => {
    const risposta = await esci();

    expect(risposta.status).toBe(204);
    verificaCookieCancellato(risposta);
  });

  // ---- Targhe ----

  it("RF_AUTH_5 · TF-ACC-18 · targhe di un automobilista nuovo → 200 con la sola AC018XX", async () => {
    const { cookie } = await automobilistaNuovo("18");

    const risposta = await elencoTarghe(cookie);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({
      targhe: [{ veicolo: expect.any(Number), targa: "AC018XX" }],
    });
  });

  it("NRF_SIC_1 · TF-ACC-19 · targhe senza sessione → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await elencoTarghe(), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-ACC-20 · targhe con sessione scaduta dell'utente 8 → 401 SESSIONE_NON_VALIDA", async () => {
    const cookie = await sessioneScaduta(8, "20");

    await verificaErrore(await elencoTarghe(cookie), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-ACC-21 · targhe con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    const cookie = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);

    await verificaErrore(await elencoTarghe(cookie), 403, "RUOLO_NON_AMMESSO");
  });

  it("RF_AUTH_5 · TF-ACC-22 · aggiunta della targa «ac022 yy» → 201 con AC022XX e AC022YY in ordine di targa", async () => {
    const { cookie } = await automobilistaNuovo("22");

    const risposta = await nuovaTarga({ targa: "ac022 yy" }, cookie);

    expect(risposta.status).toBe(201);
    expect(await risposta.json()).toEqual({
      targhe: [
        { veicolo: expect.any(Number), targa: "AC022XX" },
        { veicolo: expect.any(Number), targa: "AC022YY" },
      ],
    });
  });

  it("RF_AUTH_5 · TF-ACC-23 · aggiunta della propria targa AC023XX → 409 TARGA_GIA_PRESENTE", async () => {
    const { id, cookie } = await automobilistaNuovo("23");

    await verificaErrore(await nuovaTarga({ targa: "AC023XX" }, cookie), 409, "TARGA_GIA_PRESENTE");
    expect(await targhe(id)).toEqual(["AC023XX"]);
  });

  it("RF_AUTH_5 · TF-ACC-24 · aggiunta della targa 12-AB → 422 TARGA_NON_VALIDA", async () => {
    const { id, cookie } = await automobilistaNuovo("24");

    await verificaErrore(await nuovaTarga({ targa: "12-AB" }, cookie), 422, "TARGA_NON_VALIDA");
    expect(await targhe(id)).toEqual(["AC024XX"]);
  });

  it("ISSUE_27 · TF-ACC-25 · aggiunta con corpo vuoto {} → 422 RICHIESTA_NON_VALIDA", async () => {
    const { id, cookie } = await automobilistaNuovo("25");

    await verificaErrore(await nuovaTarga({}, cookie), 422, "RICHIESTA_NON_VALIDA");
    expect(await targhe(id)).toEqual(["AC025XX"]);
  });

  it("RF_AUTH_5 · TF-ACC-26 · rimozione della seconda targa AC026YY → 200 con la sola AC026XX", async () => {
    const { cookie } = await automobilistaNuovo("26");
    expect((await nuovaTarga({ targa: "AC026YY" }, cookie)).status).toBe(201);

    const risposta = await togliTarga("AC026YY", cookie);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({
      targhe: [{ veicolo: expect.any(Number), targa: "AC026XX" }],
    });
  });

  it("RF_AUTH_5 · TF-ACC-27 · rimozione dell'unica targa AC027XX → 409 ULTIMA_TARGA", async () => {
    const { id, cookie } = await automobilistaNuovo("27");

    await verificaErrore(await togliTarga("AC027XX", cookie), 409, "ULTIMA_TARGA");
    expect(await targhe(id)).toEqual(["AC027XX"]);
  });

  it("RF_AUTH_5 · TF-ACC-28 · rimozione di una targa non del profilo ZZ999ZZ → 404 TARGA_NON_PRESENTE", async () => {
    const { id, cookie } = await automobilistaNuovo("28");

    await verificaErrore(await togliTarga("ZZ999ZZ", cookie), 404, "TARGA_NON_PRESENTE");
    expect(await targhe(id)).toEqual(["AC028XX"]);
  });

  it("RF_AUTH_5 · TF-ACC-29 · rimozione di AC029YY con sosta attiva sullo stallo 17 → 409 TARGA_CON_SOSTA_ATTIVA", async () => {
    const { id, cookie } = await automobilistaNuovo("29");
    expect((await nuovaTarga({ targa: "AC029YY" }, cookie)).status).toBe(201);
    const avvio = new Date();
    await creaSosta(poolDiTest(), {
      automobilistaId: id,
      veicoloId: await trovaOCreaVeicolo(poolDiTest(), "AC029YY"),
      stalloId: STALLO_OCCUPATO,
      orarioDiAvvio: avvio,
      orarioDiScadenza: new Date(avvio.getTime() + 3_600_000),
      pagamento: "PAGATA",
    });
    const gestioneStalli = creaFacadeGestioneStalli({
      osservatori: [osservatoreGestioneSoste],
      pool: poolDiTest(),
    });
    await gestioneStalli.impostaNonDisponibile(STALLO_OCCUPATO);

    await verificaErrore(await togliTarga("AC029YY", cookie), 409, "TARGA_CON_SOSTA_ATTIVA");
    expect(await targhe(id)).toEqual(["AC029XX", "AC029YY"]);
  });

  it("ISSUE_27 · TF-ACC-30 · rimozione senza parametro targa → 422 RICHIESTA_NON_VALIDA", async () => {
    const { id, cookie } = await automobilistaNuovo("30");

    await verificaErrore(await togliTarga(null, cookie), 422, "RICHIESTA_NON_VALIDA");
    expect(await targhe(id)).toEqual(["AC030XX"]);
  });

  it("NRF_SIC_1 · TF-ACC-31 · aggiunta della targa AC031YY senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await nuovaTarga({ targa: "AC031YY" }), 401, "SESSIONE_NON_VALIDA");

    // Nessuna funzione di sola lettura della persistenza cerca un veicolo per targa:
    // lettura diretta, senza scritture, sul database di test.
    const veicoli = await poolDiTest().query("SELECT 1 FROM veicolo WHERE targa = $1", ["AC031YY"]);
    expect(veicoli.rowCount).toBe(0);
  });

  // TF-ACC-44…46 (OMP-66, docs/test/matrice_accessi.md): prima di TF-ACC-38, che resta l'ultimo.

  it("NRF_SIC_1 · TF-ACC-44 · aggiunta della targa AC044YY con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    const cookie = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);

    await verificaErrore(await nuovaTarga({ targa: "AC044YY" }, cookie), 403, "RUOLO_NON_AMMESSO");
  });

  it("NRF_SIC_1 · TF-ACC-45 · rimozione della targa AC045YY senza cookie → 401 SESSIONE_NON_VALIDA, profilo invariato", async () => {
    const { id, cookie } = await automobilistaNuovo("45");
    expect((await nuovaTarga({ targa: "AC045YY" }, cookie)).status).toBe(201);

    await verificaErrore(await togliTarga("AC045YY"), 401, "SESSIONE_NON_VALIDA");
    expect(await targhe(id)).toEqual(["AC045XX", "AC045YY"]);
  });

  it("NRF_SIC_1 · TF-ACC-46 · rimozione della targa AC046YY con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO, profilo invariato", async () => {
    const { id, cookie } = await automobilistaNuovo("46");
    expect((await nuovaTarga({ targa: "AC046YY" }, cookie)).status).toBe(201);
    const paolo = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);

    await verificaErrore(await togliTarga("AC046YY", paolo), 403, "RUOLO_NON_AMMESSO");
    expect(await targhe(id)).toEqual(["AC046XX", "AC046YY"]);
  });

  // ---- Proxy ----

  it("NRF_SIC_1 · TF-ACC-32 · proxy su /mappa senza cookie → redirect a /accesso?da=%2Fmappa", async () => {
    verificaRedirect(await chiamaProxy("/mappa"), "/accesso?da=%2Fmappa");
  });

  it("NRF_SIC_1 · TF-ACC-33 · proxy su /mappa con il cookie di Marco Rossi → nessun redirect", async () => {
    const cookie = await cookieDiAccesso(MARCO_ROSSI, PASSWORD_AUTOMOBILISTA);

    verificaNessunRedirect(await chiamaProxy("/mappa", cookie));
  });

  it("NRF_SIC_1 · TF-ACC-34 · proxy su /ausiliario con il cookie di Marco Rossi → redirect a /accesso-negato", async () => {
    const cookie = await cookieDiAccesso(MARCO_ROSSI, PASSWORD_AUTOMOBILISTA);

    verificaRedirect(await chiamaProxy("/ausiliario", cookie), "/accesso-negato");
  });

  it("NRF_SIC_1 · TF-ACC-35 · proxy su /mappa con sessione scaduta dell'utente 8 → redirect a /accesso?da=%2Fmappa", async () => {
    const cookie = await sessioneScaduta(8, "35");

    verificaRedirect(await chiamaProxy("/mappa", cookie), "/accesso?da=%2Fmappa");
  });

  it("NRF_SIC_1 · TF-ACC-36 · proxy su /ausiliario/segnalazioni con il cookie di Paolo Ferri → nessun redirect", async () => {
    const cookie = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);

    verificaNessunRedirect(await chiamaProxy("/ausiliario/segnalazioni", cookie));
  });

  it("NRF_SIC_1 · TF-ACC-37 · proxy su /admin con il cookie di Paolo Ferri → redirect a /accesso-negato", async () => {
    const cookie = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);

    verificaRedirect(await chiamaProxy("/admin", cookie), "/accesso-negato");
  });

  it("NRF_SIC_1 · TF-ACC-39 · proxy su /profilo con il cookie di Paolo Ferri → redirect a /accesso-negato", async () => {
    const cookie = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);

    verificaRedirect(await chiamaProxy("/profilo", cookie), "/accesso-negato");
  });

  it("NRF_SIC_1 · TF-ACC-40 · proxy su /admin/ausiliari con il cookie di Marco Rossi → redirect a /accesso-negato", async () => {
    const cookie = await cookieDiAccesso(MARCO_ROSSI, PASSWORD_AUTOMOBILISTA);

    verificaRedirect(await chiamaProxy("/admin/ausiliari", cookie), "/accesso-negato");
  });

  it("ISSUE_28 · TF-ACC-41 · proxy su / senza cookie → redirect a /accesso", async () => {
    verificaRedirect(await chiamaProxy("/"), "/accesso");
  });

  it("RF_AUTH_4 · TF-ACC-42 · proxy su / con il cookie di Marco Rossi → redirect a /mappa", async () => {
    const cookie = await cookieDiAccesso(MARCO_ROSSI, PASSWORD_AUTOMOBILISTA);

    verificaRedirect(await chiamaProxy("/", cookie), "/mappa");
  });

  it("RF_AUTH_4 · TF-ACC-43 · proxy su / con il cookie di Paolo Ferri → redirect a /ausiliario", async () => {
    const cookie = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);

    verificaRedirect(await chiamaProxy("/", cookie), "/ausiliario");
  });

  // Ultimo frame del file: sostituisce il pool applicativo.
  it("ISSUE_27 · TF-ACC-38 · proxy su /mappa con database non raggiungibile → redirect a /accesso?da=%2Fmappa, nessun 500", async () => {
    await chiudiPool();
    vi.stubEnv("DATABASE_URL", DB_IRRAGGIUNGIBILE);
    try {
      const risposta = await chiamaProxy("/mappa", "qualsiasi-38");

      expect(risposta.status).not.toBe(500);
      verificaRedirect(risposta, "/accesso?da=%2Fmappa");
    } finally {
      await chiudiPool();
      vi.stubEnv("DATABASE_URL", process.env.DATABASE_URL_TEST!);
    }
  });
});
