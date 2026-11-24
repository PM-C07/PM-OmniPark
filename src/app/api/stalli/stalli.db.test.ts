import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calcolaHashToken } from "../../../application/utenti-accessi/crittografia.ts";
import { impostaStatoStallo } from "../../../persistence/accessoDati/stalliTariffe.ts";
import { creaSessione } from "../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import { chiudiPool, verificaConnessione } from "../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../persistence/test/databaseDiTest.ts";
import { POST as accesso } from "../auth/accesso/route.ts";
import { GET as dettaglioStallo } from "./[id]/route.ts";
import { GET as modificheStalli } from "./modifiche/route.ts";
import { GET as fotografiaStalli } from "./route.ts";

// Test frame TF-API-STA-01…22 di docs/test/cp_apiStalli.md (OMP-48).

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const SCADENZA_PASSATA = new Date("2026-01-01T00:00:00+01:00");
const DOPO_FISSO = "2026-11-20T09:00:00+01:00";

// Zone del §3 (formato latMin,lonMin,latMax,lonMax).
const PIAZZA_AUBRY = "40.688,14.522,40.689,14.5223";
const MARE = "40.0,14.0,40.1,14.1";
const VIVIANI = "40.7077,14.5033,40.7079,14.5034";
const VIA_ROMA = "40.6913,14.5161,40.6915,14.5162";
const GIOVANNI_PAOLO_II = "40.7804,14.7706,40.7806,14.7707";
const PENTA = "40.7673,14.7972,40.7675,14.7973";
const LATITUDINI_INVERTITE = "40.689,14.522,40.688,14.5223";

const ISO_8601_CON_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type StalloRisposta = {
  id: number;
  numero: unknown;
  latitudine: number;
  longitudine: number;
  tipoDiStallo: string;
  stato: string;
  ultimaModifica: string;
  areaDiSosta: { id: number; nome: string };
  tariffa: { id: number; costoOrario: number };
};

type RispostaStalli = { stalli: StalloRisposta[]; cursore: string };

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

function chiediStalli(zona: string | undefined, cookie?: string): Promise<Response> {
  return fotografiaStalli(richiesta(`/api/stalli${query({ zona })}`, "GET", { cookie }));
}

function chiediModifiche(
  zona: string | undefined,
  dopo: string | undefined,
  cookie?: string,
): Promise<Response> {
  return modificheStalli(
    richiesta(`/api/stalli/modifiche${query({ zona, dopo })}`, "GET", { cookie }),
  );
}

function chiediStallo(id: string, cookie?: string): Promise<Response> {
  return dettaglioStallo(richiesta(`/api/stalli/${encodeURIComponent(id)}`, "GET", { cookie }), {
    params: Promise.resolve({ id }),
  });
}

// ---- Esiti ----

async function verificaErrore(risposta: Response, status: number, codice: string): Promise<void> {
  expect(risposta.status).toBe(status);
  const corpo = (await risposta.json()) as { errore: { codice: string; messaggio: string } };
  expect(corpo.errore.codice).toBe(codice);
  expect(typeof corpo.errore.messaggio).toBe("string");
  expect(corpo.errore.messaggio.length).toBeGreaterThan(0);
}

function verificaCursore(cursore: unknown): void {
  expect(typeof cursore).toBe("string");
  expect(cursore as string).toMatch(ISO_8601_CON_FUSO);
  expect(Number.isNaN(Date.parse(cursore as string))).toBe(false);
}

/** Risposta 200 `{ stalli, cursore }` con cursore valido. */
async function leggiStalli(risposta: Response): Promise<RispostaStalli> {
  expect(risposta.status).toBe(200);
  const corpo = (await risposta.json()) as RispostaStalli;
  expect(Array.isArray(corpo.stalli)).toBe(true);
  verificaCursore(corpo.cursore);
  return corpo;
}

function stallo(corpo: RispostaStalli, id: number): StalloRisposta | undefined {
  return corpo.stalli.find((s) => s.id === id);
}

function piuSeiSecondi(cursore: string): string {
  return new Date(Date.parse(cursore) + 6000).toISOString();
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

/** Sessione scaduta inserita con la persistenza (§3): il cookie vale `scaduta-sta-<n>`. */
async function sessioneScaduta(utenteId: number, n: string): Promise<string> {
  const token = `scaduta-sta-${n}`;
  await creaSessione(poolDiTest(), {
    utenteId,
    hashToken: calcolaHashToken(token),
    scadenza: SCADENZA_PASSATA,
  });
  return token;
}

describe("OMP-48 · cp_apiStalli", () => {
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

  // ---- Mappa: GET /api/stalli ----

  it("RF_STALLI_1 · TF-API-STA-01 · mappa di Piazza Aubry → 200, stalli 14…21 in ordine e cursore valido", async () => {
    const corpo = await leggiStalli(await chiediStalli(PIAZZA_AUBRY, marco));

    expect(corpo.stalli.map((s) => s.id)).toEqual([14, 15, 16, 17, 18, 19, 20, 21]);
    const s14 = stallo(corpo, 14)!;
    expect(s14.tipoDiStallo).toBe("DISABILI");
    expect(s14.stato).toBe("LIBERO");
    expect(s14.areaDiSosta).toEqual({ id: 5, nome: "Piazza Aubry" });
    expect(s14.tariffa).toEqual({ id: 1, costoOrario: 150 });
    expect(typeof s14.ultimaModifica).toBe("string");
    expect(s14.ultimaModifica).toMatch(ISO_8601_CON_FUSO);
  });

  it("RF_STALLI_1 · TF-API-STA-02 · mappa della zona Mare senza stalli → 200, stalli vuoti e cursore valido", async () => {
    const corpo = await leggiStalli(await chiediStalli(MARE, marco));

    expect(corpo.stalli).toEqual([]);
  });

  it("NRF_SIC_1 · TF-API-STA-03 · mappa senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediStalli(PIAZZA_AUBRY), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-STA-04 · mappa con sessione scaduta dell'utente 8 → 401 SESSIONE_NON_VALIDA", async () => {
    const cookie = await sessioneScaduta(8, "04");

    await verificaErrore(await chiediStalli(PIAZZA_AUBRY, cookie), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-STA-05 · mappa con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediStalli(PIAZZA_AUBRY, paolo), 403, "RUOLO_NON_AMMESSO");
  });

  it("ISSUE_27 · TF-API-STA-06 · mappa senza zona → 422 ZONA_NON_VALIDA", async () => {
    await verificaErrore(await chiediStalli(undefined, marco), 422, "ZONA_NON_VALIDA");
  });

  it("ISSUE_27 · TF-API-STA-07 · mappa con zona malformata 40.688,14.522,abc → 422 ZONA_NON_VALIDA", async () => {
    await verificaErrore(await chiediStalli("40.688,14.522,abc", marco), 422, "ZONA_NON_VALIDA");
  });

  it("ISSUE_27 · TF-API-STA-08 · mappa con latitudini invertite → 422 ZONA_NON_VALIDA", async () => {
    await verificaErrore(await chiediStalli(LATITUDINI_INVERTITE, marco), 422, "ZONA_NON_VALIDA");
  });

  // ---- Modifiche: GET /api/stalli/modifiche ----

  it("NRF_PER_3 · TF-API-STA-09 · modifiche di Viviani dopo il cursore, con variazione dello stallo 9 → 200, stallo 9 NON_DISPONIBILE", async () => {
    const c0 = (await leggiStalli(await chiediStalli(VIVIANI, marco))).cursore;
    await impostaStatoStallo(poolDiTest(), 9, "NON_DISPONIBILE");

    const corpo = await leggiStalli(await chiediModifiche(VIVIANI, c0, marco));

    expect(stallo(corpo, 9)?.stato).toBe("NON_DISPONIBILE");
    expect(Date.parse(corpo.cursore)).toBeGreaterThanOrEqual(Date.parse(c0));
  });

  it("ISSUE_27 · TF-API-STA-10 · modifiche di Via Roma ripetute dopo il cursore appena restituito → lo stallo 10 NON_DISPONIBILE torna in entrambe", async () => {
    const c0 = (await leggiStalli(await chiediStalli(VIA_ROMA, marco))).cursore;
    await impostaStatoStallo(poolDiTest(), 10, "NON_DISPONIBILE");

    const r1 = await leggiStalli(await chiediModifiche(VIA_ROMA, c0, marco));
    const r2 = await leggiStalli(await chiediModifiche(VIA_ROMA, r1.cursore, marco));

    expect(stallo(r1, 10)?.stato).toBe("NON_DISPONIBILE");
    expect(stallo(r2, 10)?.stato).toBe("NON_DISPONIBILE");
  });

  it("NRF_PER_3 · TF-API-STA-11 · modifiche di Giovanni Paolo II dopo cursore + 6 s → 200, stalli vuoti", async () => {
    const c0 = (await leggiStalli(await chiediStalli(GIOVANNI_PAOLO_II, marco))).cursore;
    await impostaStatoStallo(poolDiTest(), 22, "NON_DISPONIBILE");

    const r1 = await leggiStalli(await chiediModifiche(GIOVANNI_PAOLO_II, c0, marco));
    expect(stallo(r1, 22)).toBeDefined();

    const r2 = await leggiStalli(
      await chiediModifiche(GIOVANNI_PAOLO_II, piuSeiSecondi(r1.cursore), marco),
    );
    expect(r2.stalli).toEqual([]);
  });

  it("NRF_PER_3 · TF-API-STA-12 · variazione confermata con ritardo entro il margine → restituita", async () => {
    const c0 = (await leggiStalli(await chiediStalli(PENTA, marco))).cursore;
    const client = await poolDiTest().connect();
    try {
      await client.query("BEGIN");
      await impostaStatoStallo(client, 27, "NON_DISPONIBILE");

      const r1 = await leggiStalli(await chiediModifiche(PENTA, c0, marco));
      expect(stallo(r1, 27)).toBeUndefined();

      await client.query("COMMIT");

      const r2 = await leggiStalli(await chiediModifiche(PENTA, r1.cursore, marco));
      expect(stallo(r2, 27)?.stato).toBe("NON_DISPONIBILE");
    } finally {
      client.release();
    }
  });

  it("ISSUE_27 · TF-API-STA-13 · modifiche senza dopo → 422 ISTANTE_NON_VALIDO", async () => {
    await verificaErrore(
      await chiediModifiche(PIAZZA_AUBRY, undefined, marco),
      422,
      "ISTANTE_NON_VALIDO",
    );
  });

  it("ISSUE_27 · TF-API-STA-14 · modifiche con dopo=ieri → 422 ISTANTE_NON_VALIDO", async () => {
    await verificaErrore(
      await chiediModifiche(PIAZZA_AUBRY, "ieri", marco),
      422,
      "ISTANTE_NON_VALIDO",
    );
  });

  it("ISSUE_27 · TF-API-STA-15 · modifiche senza zona → 422 ZONA_NON_VALIDA", async () => {
    await verificaErrore(
      await chiediModifiche(undefined, DOPO_FISSO, marco),
      422,
      "ZONA_NON_VALIDA",
    );
  });

  it("NRF_SIC_1 · TF-API-STA-16 · modifiche senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(
      await chiediModifiche(PIAZZA_AUBRY, DOPO_FISSO),
      401,
      "SESSIONE_NON_VALIDA",
    );
  });

  it("NRF_SIC_1 · TF-API-STA-17 · modifiche con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(
      await chiediModifiche(PIAZZA_AUBRY, DOPO_FISSO, paolo),
      403,
      "RUOLO_NON_AMMESSO",
    );
  });

  // ---- Dettaglio: GET /api/stalli/<id> ----

  it("RF_STALLI_2 · TF-API-STA-18 · stato e tariffa dello stallo 14 → 200, DISABILI, LIBERO, tariffa 1", async () => {
    const risposta = await chiediStallo("14", marco);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({
      stallo: 14,
      tipoDiStallo: "DISABILI",
      stato: "LIBERO",
      tariffa: {
        costoOrario: 150,
        orarioInizioVigenza: "08:00:00",
        orarioFineVigenza: "20:00:00",
        durataMassima: 180,
      },
    });
  });

  it("RF_STALLI_2 · TF-API-STA-19 · stallo 999999 inesistente → 404 STALLO_INESISTENTE", async () => {
    await verificaErrore(await chiediStallo("999999", marco), 404, "STALLO_INESISTENTE");
  });

  it("ISSUE_27 · TF-API-STA-20 · stallo con id non intero abc → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await chiediStallo("abc", marco), 422, "RICHIESTA_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-STA-21 · stallo 14 senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediStallo("14"), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-STA-22 · stallo 14 con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediStallo("14", paolo), 403, "RUOLO_NON_AMMESSO");
  });
});
