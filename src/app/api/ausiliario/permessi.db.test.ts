import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dettaglioSegnalazione } from "../../../persistence/accessoDati/segnalazioniVerifiche.ts";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  creaSosta,
  impostaSostaScaduta,
  type Pagamento,
} from "../../../persistence/accessoDati/walletSoste.ts";
import { chiudiPool, verificaConnessione } from "../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../persistence/test/databaseDiTest.ts";
import { POST as accesso } from "../auth/accesso/route.ts";
import { POST as esitoDelPermesso } from "../permessi/[sosta]/esito/route.ts";
import { GET as fotoDelPermesso } from "../permessi/[sosta]/foto/route.ts";
import { GET as elencoPermessi } from "./permessi/route.ts";

// Test frame TF-API-PER-01…21 di docs/test/cp_apiPermessi.md (OMP-63, parte B).
// Ordine fisso (§3): TF-API-PER-01 precede TF-API-PER-12 (esito registrato su A);
// TF-API-PER-18 (seconda verifica di A) segue TF-API-PER-12.

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const ANNA_MORETTI = "anna.moretti@omnipark.example";
const PAOLO_FERRI_ID = 2;
const UN_ORA = 60 * 60 * 1000;
const INESISTENTE = "999999";

// Permesso (cp_verificaPermesso.md §3).
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";
const FOTO_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 0x01)]);

type PermessoRisposta = Record<string, unknown> & {
  sostaId: number;
  stalloId: number;
  numeroStallo: number;
  tipoDiStallo: string;
  targa: string;
  dichiarazioneDiPermesso: string;
};

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

function chiediPermessi(cookie?: string): Promise<Response> {
  return elencoPermessi(richiesta("/api/ausiliario/permessi", "GET", { cookie }));
}

function chiediFoto(sosta: string, cookie?: string): Promise<Response> {
  return fotoDelPermesso(
    richiesta(`/api/permessi/${encodeURIComponent(sosta)}/foto`, "GET", { cookie }),
    { params: Promise.resolve({ sosta }) },
  );
}

function inviaEsito(sosta: string, corpo: unknown, cookie?: string): Promise<Response> {
  return esitoDelPermesso(
    richiesta(`/api/permessi/${encodeURIComponent(sosta)}/esito`, "POST", { cookie, corpo }),
    { params: Promise.resolve({ sosta }) },
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

/**
 * Sosta di prova (§3): automobilista `api.per<n>@test.example`, veicolo con la targa indicata,
 * avvio un'ora prima dell'istante corrente e scadenza due ore dopo.
 */
async function sostaDiProva(dati: {
  n: number;
  stalloId: number;
  targa: string;
  pagamento: Pagamento;
  conPermesso: boolean;
}): Promise<number> {
  const automobilista = await creaAutomobilista(poolDiTest(), {
    email: `api.per${dati.n}@test.example`,
    hashPassword: "hash-di-prova",
  });
  const veicolo = await trovaOCreaVeicolo(poolDiTest(), dati.targa);
  await associaVeicolo(poolDiTest(), automobilista, veicolo);
  const adesso = Date.now();
  return creaSosta(poolDiTest(), {
    automobilistaId: automobilista,
    veicoloId: veicolo,
    stalloId: dati.stalloId,
    orarioDiAvvio: new Date(adesso - UN_ORA),
    orarioDiScadenza: new Date(adesso + 2 * UN_ORA),
    pagamento: dati.pagamento,
    ...(dati.conPermesso
      ? { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: FOTO_JPEG }
      : {}),
  });
}

describe("OMP-63 · cp_apiPermessi", () => {
  let marco: string;
  let paolo: string;
  let anna: string;
  let A: string;
  let B: string;
  let C: string;

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

    // Soste di prova (§3).
    A = String(
      await sostaDiProva({
        n: 1,
        stalloId: 15,
        targa: "PE01AA",
        pagamento: "PAGATA",
        conPermesso: true,
      }),
    );
    const idB = await sostaDiProva({
      n: 2,
      stalloId: 14,
      targa: "PE02AA",
      pagamento: "GRATUITA",
      conPermesso: true,
    });
    expect(await impostaSostaScaduta(poolDiTest(), idB)).toBe(true);
    B = String(idB);
    C = String(
      await sostaDiProva({
        n: 3,
        stalloId: 16,
        targa: "PE03AA",
        pagamento: "PAGATA",
        conPermesso: false,
      }),
    );

    marco = await cookieDiAccesso(MARCO_ROSSI, PASSWORD_AUTOMOBILISTA);
    paolo = await cookieDiAccesso(PAOLO_FERRI, PASSWORD_AUSILIARIO);
    anna = await cookieDiAccesso(ANNA_MORETTI, PASSWORD_AUSILIARIO);
  });

  afterAll(async () => {
    await chiudiPool();
    await chiudiDatabaseDiTest();
    vi.unstubAllEnvs();
  });

  // ---- Elenco: GET /api/ausiliario/permessi ----

  it("RF_OP_2 · TF-API-PER-01 · elenco dei permessi da verificare di Paolo Ferri → 200 { permessi } con la sosta A sullo stallo 15 ROSA, senza B, C né foto", async () => {
    const risposta = await chiediPermessi(paolo);

    expect(risposta.status).toBe(200);
    const corpo = (await risposta.json()) as { permessi: PermessoRisposta[] };
    expect(Array.isArray(corpo.permessi)).toBe(true);

    const a = corpo.permessi.find((p) => p.sostaId === Number(A));
    expect(a).toBeDefined();
    expect(a!.stalloId).toBe(15);
    expect(a!.numeroStallo).toBe(2);
    expect(a!.tipoDiStallo).toBe("ROSA");
    expect(a!.targa).toBe("PE01AA");
    expect(a!.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);

    expect(corpo.permessi.some((p) => p.sostaId === Number(B))).toBe(false);
    expect(corpo.permessi.some((p) => p.sostaId === Number(C))).toBe(false);
    for (const p of corpo.permessi) {
      expect(Object.keys(p).some((campo) => /foto/i.test(campo))).toBe(false);
    }
  });

  it("NRF_SIC_1 · TF-API-PER-02 · elenco dei permessi senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediPermessi(), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-PER-03 · elenco dei permessi con la sessione di Marco Rossi → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediPermessi(marco), 403, "RUOLO_NON_AMMESSO");
  });

  // ---- Foto: GET /api/permessi/<sosta>/foto ----

  it("NRF_LEG_2 · TF-API-PER-04 · foto del permesso della sosta attiva A → 200 image/jpeg, no-store, byte della foto", async () => {
    const risposta = await chiediFoto(A, paolo);

    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("content-type")).toBe("image/jpeg");
    expect(risposta.headers.get("cache-control")).toBe("no-store");
    const dati = Buffer.from(await risposta.arrayBuffer());
    expect(dati.equals(FOTO_JPEG)).toBe(true);
  });

  it("NRF_SIC_1 · TF-API-PER-05 · foto del permesso di A senza cookie → 401 SESSIONE_NON_VALIDA, no-store", async () => {
    const risposta = await chiediFoto(A);

    expect(risposta.headers.get("cache-control")).toBe("no-store");
    await verificaErrore(risposta, 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-PER-06 · foto del permesso di A con la sessione di Marco Rossi → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediFoto(A, marco), 403, "RUOLO_NON_AMMESSO");
  });

  it("NRF_SIC_1 · TF-API-PER-07 · foto del permesso di A (ente 1) da parte di Anna Moretti (ente 2) → 403 ENTE_NON_AMMESSO", async () => {
    await verificaErrore(await chiediFoto(A, anna), 403, "ENTE_NON_AMMESSO");
  });

  it("RF_OP_2 · TF-API-PER-08 · foto del permesso della sosta inesistente 999999 → 404 SOSTA_INESISTENTE", async () => {
    await verificaErrore(await chiediFoto(INESISTENTE, paolo), 404, "SOSTA_INESISTENTE");
  });

  it("NRF_LEG_2 · TF-API-PER-09 · foto del permesso della sosta scaduta B → 409 SOSTA_NON_ATTIVA", async () => {
    await verificaErrore(await chiediFoto(B, paolo), 409, "SOSTA_NON_ATTIVA");
  });

  it("RF_OP_2 · TF-API-PER-10 · foto del permesso della sosta C senza permesso → 409 NESSUN_PERMESSO_DA_VERIFICARE", async () => {
    await verificaErrore(await chiediFoto(C, paolo), 409, "NESSUN_PERMESSO_DA_VERIFICARE");
  });

  it("ISSUE_27 · TF-API-PER-11 · foto del permesso con id non intero abc → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await chiediFoto("abc", paolo), 422, "RICHIESTA_NON_VALIDA");
  });

  // ---- Esito: POST /api/permessi/<sosta>/esito ----

  it("RF_OP_5 · TF-API-PER-12 · esito NON_CONFORME su A da parte di Paolo Ferri → 200 { verifica, segnalazione }, segnalazione CHIUSA SOSTA_IRREGOLARE_ACCERTATA assegnata a 2", async () => {
    const risposta = await inviaEsito(A, { esito: "NON_CONFORME" }, paolo);

    expect(risposta.status).toBe(200);
    const corpo = (await risposta.json()) as { verifica: unknown; segnalazione: unknown };
    expect(Object.keys(corpo).sort()).toEqual(["segnalazione", "verifica"]);
    expect(Number.isInteger(corpo.verifica)).toBe(true);
    expect(Number.isInteger(corpo.segnalazione)).toBe(true);

    const dettaglio = await dettaglioSegnalazione(poolDiTest(), corpo.segnalazione as number);
    expect(dettaglio).not.toBeNull();
    expect(dettaglio!.stato).toBe("CHIUSA");
    expect(dettaglio!.esito).toBe("SOSTA_IRREGOLARE_ACCERTATA");
    expect(dettaglio!.ausiliarioId).toBe(PAOLO_FERRI_ID);
    expect(dettaglio!.stalloId).toBe(15);
    expect(dettaglio!.targaRilevata).toBeNull();
  });

  it("NRF_SIC_1 · TF-API-PER-13 · esito CONFORME su A senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await inviaEsito(A, { esito: "CONFORME" }), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-PER-14 · esito CONFORME su A con la sessione di Marco Rossi → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(
      await inviaEsito(A, { esito: "CONFORME" }, marco),
      403,
      "RUOLO_NON_AMMESSO",
    );
  });

  it("NRF_SIC_1 · TF-API-PER-15 · esito CONFORME su A (ente 1) da parte di Anna Moretti (ente 2) → 403 ENTE_NON_AMMESSO", async () => {
    await verificaErrore(await inviaEsito(A, { esito: "CONFORME" }, anna), 403, "ENTE_NON_AMMESSO");
  });

  it("RF_OP_5 · TF-API-PER-16 · esito CONFORME sulla sosta inesistente 999999 → 404 SOSTA_INESISTENTE", async () => {
    await verificaErrore(
      await inviaEsito(INESISTENTE, { esito: "CONFORME" }, paolo),
      404,
      "SOSTA_INESISTENTE",
    );
  });

  it("RF_OP_5 · TF-API-PER-17 · esito CONFORME sulla sosta scaduta B → 409 SOSTA_NON_ATTIVA", async () => {
    await verificaErrore(
      await inviaEsito(B, { esito: "CONFORME" }, paolo),
      409,
      "SOSTA_NON_ATTIVA",
    );
  });

  it("VD_12 · TF-API-PER-18 · seconda verifica CONFORME su A dopo TF-API-PER-12 → 409 VERIFICA_GIA_REGISTRATA", async () => {
    await verificaErrore(
      await inviaEsito(A, { esito: "CONFORME" }, paolo),
      409,
      "VERIFICA_GIA_REGISTRATA",
    );
  });

  it("RF_OP_5 · TF-API-PER-19 · esito CONFORME sulla sosta C senza permesso → 409 NESSUN_PERMESSO_DA_VERIFICARE", async () => {
    await verificaErrore(
      await inviaEsito(C, { esito: "CONFORME" }, paolo),
      409,
      "NESSUN_PERMESSO_DA_VERIFICARE",
    );
  });

  it("RF_OP_5 · TF-API-PER-20 · esito mancante {} sulla sosta C → 422 ESITO_VERIFICA_NON_VALIDO", async () => {
    await verificaErrore(await inviaEsito(C, {}, paolo), 422, "ESITO_VERIFICA_NON_VALIDO");
  });

  it("ISSUE_27 · TF-API-PER-21 · esito su A con corpo non JSON → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await inviaEsito(A, '{"esito":', paolo), 422, "RICHIESTA_NON_VALIDA");
  });
});
