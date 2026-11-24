import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calcolaHashToken } from "../../../../application/utenti-accessi/crittografia.ts";
import { trovaStallo } from "../../../../persistence/accessoDati/stalliTariffe.ts";
import { creaSessione } from "../../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  sostaInCorsoSuStallo,
  trovaWalletDiAutomobilista,
} from "../../../../persistence/accessoDati/walletSoste.ts";
import { chiudiPool, verificaConnessione } from "../../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../../persistence/test/databaseDiTest.ts";
import { POST as accesso } from "../../auth/accesso/route.ts";
import { GET as importoSosta } from "./route.ts";

// Test frame TF-API-IMP-01…17 di docs/test/cp_apiImporto.md (OMP-58).

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const MARCO_ROSSI_ID = 8;
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const SCADENZA_PASSATA = new Date("2026-01-01T00:00:00+01:00");
const UN_MINUTO_MS = 60_000;

type ImportoRisposta = { importo: number; pagamento: string; orarioDiScadenza: string };

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
    body = JSON.stringify(opzioni.corpo);
  }
  return new Request(`${BASE}${percorso}`, { method: metodo, headers, body });
}

function query(parametri: Record<string, string | undefined>): string {
  const coppie = Object.entries(parametri)
    .filter(([, valore]) => valore !== undefined)
    .map(([nome, valore]) => `${nome}=${encodeURIComponent(valore!)}`);
  return coppie.length === 0 ? "" : `?${coppie.join("&")}`;
}

function chiediImporto(
  stallo: string | undefined,
  durata: string | undefined,
  cookie?: string,
): Promise<Response> {
  return importoSosta(
    richiesta(`/api/soste/importo${query({ stallo, durata })}`, "GET", { cookie }),
  );
}

// ---- Esiti ----

async function verificaErrore(risposta: Response, status: number, codice: string): Promise<void> {
  expect(risposta.status).toBe(status);
  const corpo = (await risposta.json()) as { errore: { codice: string; messaggio: string } };
  expect(corpo.errore.codice).toBe(codice);
  expect(typeof corpo.errore.messaggio).toBe("string");
  expect(corpo.errore.messaggio.length).toBeGreaterThan(0);
}

/** Risposta 200 con importo e pagamento attesi; restituisce il corpo. */
async function verificaImporto(
  risposta: Response,
  importo: number,
  pagamento: string,
): Promise<ImportoRisposta> {
  expect(risposta.status).toBe(200);
  const corpo = (await risposta.json()) as ImportoRisposta;
  expect(corpo.importo).toBe(importo);
  expect(corpo.pagamento).toBe(pagamento);
  return corpo;
}

// ---- Preparazioni ----

async function cookieDiAccesso(email: string, password: string): Promise<string> {
  const risposta = await accesso(
    richiesta("/api/auth/accesso", "POST", { corpo: { email, password } }),
  );
  expect(risposta.status).toBe(200);
  const valore = /omnipark_sessione=([^;,\s]+)/.exec(risposta.headers.get("set-cookie") ?? "");
  expect(valore).not.toBeNull();
  return valore![1];
}

/** Sessione scaduta inserita con la persistenza (§3): il cookie vale `scaduta-imp-<n>`. */
async function sessioneScaduta(utenteId: number, n: string): Promise<string> {
  const token = `scaduta-imp-${n}`;
  await creaSessione(poolDiTest(), {
    utenteId,
    hashToken: calcolaHashToken(token),
    scadenza: SCADENZA_PASSATA,
  });
  return token;
}

// ---- Verifiche sullo stato ----

async function saldoDi(automobilistaId: number): Promise<number> {
  const wallet = await trovaWalletDiAutomobilista(poolDiTest(), automobilistaId);
  expect(wallet).not.toBeNull();
  return wallet!.saldo;
}

describe("OMP-58 · cp_apiImporto", () => {
  let marco: string;
  let paolo: string;

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

    marco = await cookieDiAccesso(MARCO_ROSSI, PASSWORD_AUTOMOBILISTA);
    paolo = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);
  });

  afterAll(async () => {
    await chiudiPool();
    await chiudiDatabaseDiTest();
    vi.unstubAllEnvs();
  });

  // ---- Calcolo ----

  it("RF_WALLET_2 · TF-API-IMP-01 · 60 min sullo stallo 3 a pagamento → 200 importo 150 PAGATA, orario di scadenza a +60 min e nessuna scrittura", async () => {
    const durata = 60;
    const prima = Date.now();
    const risposta = await chiediImporto("3", String(durata), marco);
    const corpo = await verificaImporto(risposta, 150, "PAGATA");
    const dopo = Date.now();

    expect(corpo).toEqual({
      importo: 150,
      pagamento: "PAGATA",
      orarioDiScadenza: expect.any(String),
    });
    const scadenza = Date.parse(corpo.orarioDiScadenza);
    expect(Number.isNaN(scadenza)).toBe(false);
    expect(scadenza).toBeGreaterThanOrEqual(prima + durata * UN_MINUTO_MS);
    expect(scadenza).toBeLessThanOrEqual(dopo + durata * UN_MINUTO_MS);

    expect((await trovaStallo(poolDiTest(), 3))?.stato).toBe("OCCUPATO");
    expect(await sostaInCorsoSuStallo(poolDiTest(), 3)).toBeNull();
    expect(await saldoDi(MARCO_ROSSI_ID)).toBe(600);
  });

  it("RF_WALLET_2 · TF-API-IMP-02 · 15 min sullo stallo 3 → 200 importo 38 PAGATA", async () => {
    await verificaImporto(await chiediImporto("3", "15", marco), 38, "PAGATA");
  });

  it("RF_SOSTA_1 · TF-API-IMP-03 · durata massima 180 min sullo stallo 3 → 200 importo 450 PAGATA", async () => {
    await verificaImporto(await chiediImporto("3", "180", marco), 450, "PAGATA");
  });

  it("VD_10 · TF-API-IMP-04 · 120 min sullo stallo 15 ROSA → 200 importo 300 PAGATA", async () => {
    await verificaImporto(await chiediImporto("15", "120", marco), 300, "PAGATA");
  });

  it("VD_10 · TF-API-IMP-05 · 60 min sullo stallo 14 DISABILI → 200 importo 0 GRATUITA", async () => {
    await verificaImporto(await chiediImporto("14", "60", marco), 0, "GRATUITA");
  });

  it("ISSUE_29 · TF-API-IMP-06 · 60 min sullo stallo 16 LIBERO → 200 importo 150 PAGATA", async () => {
    await verificaImporto(await chiediImporto("16", "60", marco), 150, "PAGATA");
  });

  // ---- Errori di dominio ----

  it("RF_SOSTA_1 · TF-API-IMP-07 · durata sotto il minimo (14 min) → 422 DURATA_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto("3", "14", marco), 422, "DURATA_NON_VALIDA");
  });

  it("RF_SOSTA_1 · TF-API-IMP-08 · durata oltre la massima (181 min) → 422 DURATA_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto("3", "181", marco), 422, "DURATA_NON_VALIDA");
  });

  it("RF_SOSTA_1 · TF-API-IMP-09 · stallo 999999 inesistente → 404 STALLO_INESISTENTE", async () => {
    await verificaErrore(await chiediImporto("999999", "60", marco), 404, "STALLO_INESISTENTE");
  });

  // ---- Parametri ----

  it("ISSUE_29 · TF-API-IMP-10 · stallo non intero abc → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto("abc", "60", marco), 422, "RICHIESTA_NON_VALIDA");
  });

  it("ISSUE_29 · TF-API-IMP-11 · stallo mancante → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto(undefined, "60", marco), 422, "RICHIESTA_NON_VALIDA");
  });

  it("ISSUE_29 · TF-API-IMP-12 · durata non intera 60.5 → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto("3", "60.5", marco), 422, "RICHIESTA_NON_VALIDA");
  });

  it("ISSUE_29 · TF-API-IMP-13 · durata mancante → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto("3", undefined, marco), 422, "RICHIESTA_NON_VALIDA");
  });

  // ---- Sessione e ruolo ----

  it("NRF_SIC_1 · TF-API-IMP-14 · importo senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto("3", "60"), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-IMP-15 · stallo abc senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediImporto("abc", "60"), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-IMP-16 · importo con sessione scaduta dell'utente 8 → 401 SESSIONE_NON_VALIDA", async () => {
    const cookie = await sessioneScaduta(MARCO_ROSSI_ID, "16");

    await verificaErrore(await chiediImporto("3", "60", cookie), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-IMP-17 · importo con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediImporto("3", "60", paolo), 403, "RUOLO_NON_AMMESSO");
  });
});
