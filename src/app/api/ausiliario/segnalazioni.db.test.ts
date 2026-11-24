import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calcolaHashToken } from "../../../application/utenti-accessi/crittografia.ts";
import {
  creaSegnalazioneDaLettura,
  dettaglioSegnalazione,
} from "../../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { creaSessione } from "../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import { chiudiPool, verificaConnessione } from "../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../persistence/test/databaseDiTest.ts";
import { POST as accesso } from "../auth/accesso/route.ts";
import { POST as chiusuraSegnalazione } from "../segnalazioni/[id]/chiusura/route.ts";
import { GET as modificheSegnalazioni } from "./segnalazioni/modifiche/route.ts";
import { GET as fotografiaSegnalazioni } from "./segnalazioni/route.ts";

// Test frame TF-API-SEG-01…31 di docs/test/cp_apiSegnalazioni.md (OMP-48).

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const SARA_GALLI = "sara.galli@omnipark.example";
const ANNA_MORETTI = "anna.moretti@omnipark.example";
const GIORGIO_MARINO = "giorgio.marino@omnipark.example";
const SCADENZA_PASSATA = new Date("2026-01-01T00:00:00+01:00");
const SCADENZA_FUTURA = new Date("2027-01-01T00:00:00+01:00");
const DATA_DELLA_LETTURA = new Date("2026-11-20T09:00:00+01:00");
const DOPO_FISSO = "2026-11-20T09:00:00+01:00";

const ISO_8601_CON_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const CAMPI_SEGNALAZIONE = [
  "ausiliarioId",
  "dataEOraDellaLettura",
  "id",
  "latitudine",
  "longitudine",
  "motivo",
  "numeroStallo",
  "stalloId",
  "stato",
  "targaRilevata",
  "ultimaModifica",
];

type SegnalazioneRisposta = {
  id: number;
  stalloId: number;
  numeroStallo: number;
  latitudine: number;
  longitudine: number;
  stato: string;
  motivo: string | null;
  targaRilevata: string | null;
  dataEOraDellaLettura: string | null;
  ausiliarioId: number | null;
  ultimaModifica: string;
};

type RispostaSegnalazioni = { segnalazioni: SegnalazioneRisposta[]; cursore: string };

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

function query(parametri: Record<string, string | undefined>): string {
  const coppie = Object.entries(parametri)
    .filter(([, valore]) => valore !== undefined)
    .map(([nome, valore]) => `${nome}=${encodeURIComponent(valore!)}`);
  return coppie.length === 0 ? "" : `?${coppie.join("&")}`;
}

function chiediSegnalazioni(ente: string | undefined, cookie?: string): Promise<Response> {
  return fotografiaSegnalazioni(
    richiesta(`/api/ausiliario/segnalazioni${query({ ente })}`, "GET", { cookie }),
  );
}

function chiediModifiche(
  dopo: string | undefined,
  ente: string | undefined,
  cookie?: string,
): Promise<Response> {
  return modificheSegnalazioni(
    richiesta(`/api/ausiliario/segnalazioni/modifiche${query({ dopo, ente })}`, "GET", {
      cookie,
    }),
  );
}

function chiudi(id: string, corpo: unknown, cookie?: string): Promise<Response> {
  return chiusuraSegnalazione(
    richiesta(`/api/segnalazioni/${encodeURIComponent(id)}/chiusura`, "POST", { cookie, corpo }),
    { params: Promise.resolve({ id }) },
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

function verificaCursore(cursore: unknown): void {
  expect(typeof cursore).toBe("string");
  expect(cursore as string).toMatch(ISO_8601_CON_FUSO);
  expect(Number.isNaN(Date.parse(cursore as string))).toBe(false);
}

/** Risposta 200 `{ segnalazioni, cursore }` con cursore valido. */
async function leggiSegnalazioni(risposta: Response): Promise<RispostaSegnalazioni> {
  expect(risposta.status).toBe(200);
  const corpo = (await risposta.json()) as RispostaSegnalazioni;
  expect(Array.isArray(corpo.segnalazioni)).toBe(true);
  verificaCursore(corpo.cursore);
  return corpo;
}

function conTarga(corpo: RispostaSegnalazioni, targa: string): SegnalazioneRisposta | undefined {
  return corpo.segnalazioni.find((s) => s.targaRilevata === targa);
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

/** Sessione scaduta inserita con la persistenza (§3): il cookie vale `scaduta-seg-<n>`. */
async function sessioneScaduta(utenteId: number, n: string): Promise<string> {
  const token = `scaduta-seg-${n}`;
  await creaSessione(poolDiTest(), {
    utenteId,
    hashToken: calcolaHashToken(token),
    scadenza: SCADENZA_PASSATA,
  });
  return token;
}

/** Segnalazione di prova (§3), `APERTA`. */
function segnalazioneDiProva(stalloId: number, targa: string): Promise<number> {
  return creaSegnalazioneDaLettura(poolDiTest(), {
    stalloId,
    targa,
    dataEOra: DATA_DELLA_LETTURA,
    motivo: "SOSTA_ASSENTE",
  });
}

/** Stato confrontato da «invariata» (§3). */
async function statoDellaSegnalazione(id: number): Promise<unknown> {
  const dettaglio = await dettaglioSegnalazione(poolDiTest(), id);
  expect(dettaglio).not.toBeNull();
  return {
    stato: dettaglio!.stato,
    ausiliarioId: dettaglio!.ausiliarioId,
    assegnatario: dettaglio!.assegnatario,
    esito: dettaglio!.esito,
    ultimaModifica: dettaglio!.ultimaModifica.getTime(),
  };
}

describe("OMP-48 · cp_apiSegnalazioni", () => {
  let marco: string;
  let paolo: string;
  let sara: string;
  let anna: string;
  let giorgio: string;

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
    sara = await cookieDiAccesso(SARA_GALLI, PASSWORD_AUSILIARIO);
    anna = await cookieDiAccesso(ANNA_MORETTI, PASSWORD_AUSILIARIO);
    giorgio = await cookieDiAccesso(GIORGIO_MARINO, PASSWORD_AUSILIARIO);
  });

  afterAll(async () => {
    await chiudiPool();
    await chiudiDatabaseDiTest();
    vi.unstubAllEnvs();
  });

  // ---- Lista: GET /api/ausiliario/segnalazioni ----
  // Ordine fisso (§3): 01 e 02 precedono le chiusure dell'ente 1, 04 precede le
  // segnalazioni create sull'ente 3.

  it("RF_OP_1 · TF-API-SEG-01 · segnalazioni dell'ente di Paolo Ferri → 200, id [4, 5, 10, 11] in ordine, nessuna chiusa, cursore valido", async () => {
    const corpo = await leggiSegnalazioni(await chiediSegnalazioni(undefined, paolo));

    expect(corpo.segnalazioni.map((s) => s.id)).toEqual([4, 5, 10, 11]);
    for (const s of corpo.segnalazioni) {
      expect(s.stato).not.toBe("CHIUSA");
      expect(Object.keys(s).sort()).toEqual(CAMPI_SEGNALAZIONE);
      expect(s.ultimaModifica).toMatch(ISO_8601_CON_FUSO);
    }
  });

  it("RF_OP_1 · TF-API-SEG-02 · segnalazioni con ente=1 indicato da Paolo Ferri → 200, id [4, 5, 10, 11]", async () => {
    const corpo = await leggiSegnalazioni(await chiediSegnalazioni("1", paolo));

    expect(corpo.segnalazioni.map((s) => s.id)).toEqual([4, 5, 10, 11]);
  });

  it("NRF_SIC_1 · TF-API-SEG-03 · segnalazioni con ente=2 indicato da Paolo Ferri → 403 ENTE_NON_AMMESSO", async () => {
    await verificaErrore(await chiediSegnalazioni("2", paolo), 403, "ENTE_NON_AMMESSO");
  });

  it("RF_OP_1 · TF-API-SEG-04 · segnalazioni dell'ente 3 di Giorgio Marino, senza segnalazioni → 200, elenco vuoto e cursore valido", async () => {
    const corpo = await leggiSegnalazioni(await chiediSegnalazioni(undefined, giorgio));

    expect(corpo.segnalazioni).toEqual([]);
  });

  it("NRF_SIC_1 · TF-API-SEG-05 · segnalazioni senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediSegnalazioni(undefined), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-SEG-06 · segnalazioni con sessione scaduta dell'utente 2 → 401 SESSIONE_NON_VALIDA", async () => {
    const cookie = await sessioneScaduta(2, "06");

    await verificaErrore(await chiediSegnalazioni(undefined, cookie), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-SEG-07 · segnalazioni con la sessione di Marco Rossi → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediSegnalazioni(undefined, marco), 403, "RUOLO_NON_AMMESSO");
  });

  it("VD_19 · TF-API-SEG-08 · segnalazioni con sessione valida dell'Ausiliario disattivato 4 → 401 SESSIONE_NON_VALIDA", async () => {
    const token = "disattivato-08";
    await creaSessione(poolDiTest(), {
      utenteId: 4,
      hashToken: calcolaHashToken(token),
      scadenza: SCADENZA_FUTURA,
    });

    await verificaErrore(await chiediSegnalazioni(undefined, token), 401, "SESSIONE_NON_VALIDA");
  });

  it("ISSUE_27 · TF-API-SEG-09 · segnalazioni con ente=abc → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(await chiediSegnalazioni("abc", paolo), 422, "RICHIESTA_NON_VALIDA");
  });

  // ---- Modifiche: GET /api/ausiliario/segnalazioni/modifiche ----

  it("NRF_PER_3 · TF-API-SEG-10 · modifiche di Anna Moretti dopo il cursore, con nuova segnalazione SG10AA → 200, SG10AA APERTA, cursore non precedente", async () => {
    const c0 = (await leggiSegnalazioni(await chiediSegnalazioni(undefined, anna))).cursore;
    await segnalazioneDiProva(22, "SG10AA");

    const corpo = await leggiSegnalazioni(await chiediModifiche(c0, undefined, anna));

    expect(conTarga(corpo, "SG10AA")?.stato).toBe("APERTA");
    expect(Date.parse(corpo.cursore)).toBeGreaterThanOrEqual(Date.parse(c0));
  });

  it("ISSUE_27 · TF-API-SEG-11 · modifiche di Anna Moretti ripetute dopo il cursore appena restituito → SG11AA torna in entrambe", async () => {
    const c0 = (await leggiSegnalazioni(await chiediSegnalazioni(undefined, anna))).cursore;
    await segnalazioneDiProva(24, "SG11AA");

    const r1 = await leggiSegnalazioni(await chiediModifiche(c0, undefined, anna));
    const r2 = await leggiSegnalazioni(await chiediModifiche(r1.cursore, undefined, anna));

    expect(conTarga(r1, "SG11AA")).toBeDefined();
    expect(conTarga(r2, "SG11AA")).toBeDefined();
  });

  it("NRF_PER_3 · TF-API-SEG-12 · modifiche di Giorgio Marino dopo cursore + 6 s → 200, elenco vuoto e cursore valido", async () => {
    const c0 = (await leggiSegnalazioni(await chiediSegnalazioni(undefined, giorgio))).cursore;
    await segnalazioneDiProva(28, "SG12AA");

    const r1 = await leggiSegnalazioni(await chiediModifiche(c0, undefined, giorgio));
    expect(conTarga(r1, "SG12AA")).toBeDefined();

    const r2 = await leggiSegnalazioni(
      await chiediModifiche(piuSeiSecondi(r1.cursore), undefined, giorgio),
    );
    expect(r2.segnalazioni).toEqual([]);
  });

  it("NRF_PER_3 · TF-API-SEG-13 · segnalazione SG13AA confermata con ritardo entro il margine → assente in r1, APERTA in r2", async () => {
    const c0 = (await leggiSegnalazioni(await chiediSegnalazioni(undefined, giorgio))).cursore;
    const client = await poolDiTest().connect();
    try {
      await client.query("BEGIN");
      await creaSegnalazioneDaLettura(client, {
        stalloId: 29,
        targa: "SG13AA",
        dataEOra: DATA_DELLA_LETTURA,
        motivo: "SOSTA_ASSENTE",
      });

      const r1 = await leggiSegnalazioni(await chiediModifiche(c0, undefined, giorgio));
      expect(conTarga(r1, "SG13AA")).toBeUndefined();

      await client.query("COMMIT");

      const r2 = await leggiSegnalazioni(await chiediModifiche(r1.cursore, undefined, giorgio));
      expect(conTarga(r2, "SG13AA")?.stato).toBe("APERTA");
    } finally {
      client.release();
    }
  });

  it("ISSUE_27 · TF-API-SEG-14 · modifiche senza dopo → 422 ISTANTE_NON_VALIDO", async () => {
    await verificaErrore(
      await chiediModifiche(undefined, undefined, paolo),
      422,
      "ISTANTE_NON_VALIDO",
    );
  });

  it("ISSUE_27 · TF-API-SEG-15 · modifiche con dopo=ieri → 422 ISTANTE_NON_VALIDO", async () => {
    await verificaErrore(
      await chiediModifiche("ieri", undefined, paolo),
      422,
      "ISTANTE_NON_VALIDO",
    );
  });

  it("NRF_SIC_1 · TF-API-SEG-16 · modifiche con ente=2 indicato da Paolo Ferri → 403 ENTE_NON_AMMESSO", async () => {
    await verificaErrore(await chiediModifiche(DOPO_FISSO, "2", paolo), 403, "ENTE_NON_AMMESSO");
  });

  it("NRF_SIC_1 · TF-API-SEG-17 · modifiche con la sessione di Marco Rossi → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(
      await chiediModifiche(DOPO_FISSO, undefined, marco),
      403,
      "RUOLO_NON_AMMESSO",
    );
  });

  it("NRF_SIC_1 · TF-API-SEG-18 · modifiche senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediModifiche(DOPO_FISSO, undefined), 401, "SESSIONE_NON_VALIDA");
  });

  // ---- Chiusura: POST /api/segnalazioni/<id>/chiusura ----

  it("RF_OP_6 · TF-API-SEG-19 · chiusura di una segnalazione APERTA da parte di Paolo Ferri → 200, CHIUSA, assegnata all'Ausiliario 2, SOSTA_IRREGOLARE_ACCERTATA", async () => {
    const id = await segnalazioneDiProva(16, "SG19AA");

    const risposta = await chiudi(String(id), { esito: "SOSTA_IRREGOLARE_ACCERTATA" }, paolo);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({});
    const dettaglio = await dettaglioSegnalazione(poolDiTest(), id);
    expect(dettaglio?.stato).toBe("CHIUSA");
    expect(dettaglio?.ausiliarioId).toBe(2);
    expect(dettaglio?.esito).toBe("SOSTA_IRREGOLARE_ACCERTATA");
  });

  it("RF_OP_6 · TF-API-SEG-20 · chiusura della 5 presa in carico dallo stesso Paolo Ferri → 200, CHIUSA, assegnata all'Ausiliario 2, NON_CONFERMATA", async () => {
    const risposta = await chiudi("5", { esito: "NON_CONFERMATA" }, paolo);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({});
    const dettaglio = await dettaglioSegnalazione(poolDiTest(), 5);
    expect(dettaglio?.stato).toBe("CHIUSA");
    expect(dettaglio?.ausiliarioId).toBe(2);
    expect(dettaglio?.esito).toBe("NON_CONFERMATA");
  });

  it("RF_OP_6 · TF-API-SEG-21 · chiusura della 4 presa in carico da Sara Galli → 409 SEGNALAZIONE_PRESA_DA_ALTRI, invariata", async () => {
    const prima = await statoDellaSegnalazione(4);

    await verificaErrore(
      await chiudi("4", { esito: "NON_CONFERMATA" }, paolo),
      409,
      "SEGNALAZIONE_PRESA_DA_ALTRI",
    );
    expect(await statoDellaSegnalazione(4)).toEqual(prima);
  });

  it("RF_OP_6 · TF-API-SEG-22 · chiusura della 1 già CHIUSA → 409 SEGNALAZIONE_GIA_CHIUSA, invariata", async () => {
    const prima = await statoDellaSegnalazione(1);

    await verificaErrore(
      await chiudi("1", { esito: "NON_CONFERMATA" }, paolo),
      409,
      "SEGNALAZIONE_GIA_CHIUSA",
    );
    expect(await statoDellaSegnalazione(1)).toEqual(prima);
  });

  it("RF_OP_6 · TF-API-SEG-23 · chiusura della segnalazione inesistente 999999 → 404 SEGNALAZIONE_INESISTENTE", async () => {
    await verificaErrore(
      await chiudi("999999", { esito: "NON_CONFERMATA" }, paolo),
      404,
      "SEGNALAZIONE_INESISTENTE",
    );
  });

  it("NRF_SIC_1 · TF-API-SEG-24 · chiusura della 10 dell'ente 1 da parte di Anna Moretti (ente 2) → 403 ENTE_NON_AMMESSO, invariata", async () => {
    const prima = await statoDellaSegnalazione(10);

    await verificaErrore(
      await chiudi("10", { esito: "NON_CONFERMATA" }, anna),
      403,
      "ENTE_NON_AMMESSO",
    );
    expect(await statoDellaSegnalazione(10)).toEqual(prima);
  });

  it("RF_OP_6 · TF-API-SEG-25 · chiusura della 10 con esito ALTRO → 422 ESITO_NON_VALIDO, invariata", async () => {
    const prima = await statoDellaSegnalazione(10);

    await verificaErrore(await chiudi("10", { esito: "ALTRO" }, sara), 422, "ESITO_NON_VALIDO");
    expect(await statoDellaSegnalazione(10)).toEqual(prima);
  });

  it("RF_OP_6 · TF-API-SEG-26 · chiusura della 10 senza esito {} → 422 ESITO_NON_VALIDO, invariata", async () => {
    const prima = await statoDellaSegnalazione(10);

    await verificaErrore(await chiudi("10", {}, sara), 422, "ESITO_NON_VALIDO");
    expect(await statoDellaSegnalazione(10)).toEqual(prima);
  });

  it("ISSUE_27 · TF-API-SEG-27 · chiusura della 10 con corpo non JSON → 422 RICHIESTA_NON_VALIDA, invariata", async () => {
    const prima = await statoDellaSegnalazione(10);

    await verificaErrore(await chiudi("10", '{"esito":', sara), 422, "RICHIESTA_NON_VALIDA");
    expect(await statoDellaSegnalazione(10)).toEqual(prima);
  });

  it("ISSUE_27 · TF-API-SEG-28 · chiusura con id non intero abc → 422 RICHIESTA_NON_VALIDA", async () => {
    await verificaErrore(
      await chiudi("abc", { esito: "NON_CONFERMATA" }, paolo),
      422,
      "RICHIESTA_NON_VALIDA",
    );
  });

  it("NRF_SIC_1 · TF-API-SEG-29 · chiusura della 10 senza cookie → 401 SESSIONE_NON_VALIDA, invariata", async () => {
    const prima = await statoDellaSegnalazione(10);

    await verificaErrore(
      await chiudi("10", { esito: "NON_CONFERMATA" }),
      401,
      "SESSIONE_NON_VALIDA",
    );
    expect(await statoDellaSegnalazione(10)).toEqual(prima);
  });

  it("NRF_SIC_1 · TF-API-SEG-30 · chiusura della 10 con la sessione di Marco Rossi → 403 RUOLO_NON_AMMESSO, invariata", async () => {
    const prima = await statoDellaSegnalazione(10);

    await verificaErrore(
      await chiudi("10", { esito: "NON_CONFERMATA" }, marco),
      403,
      "RUOLO_NON_AMMESSO",
    );
    expect(await statoDellaSegnalazione(10)).toEqual(prima);
  });

  it("NRF_SIC_1 · TF-API-SEG-31 · chiusura della 10 con sessione scaduta dell'utente 3 → 401 SESSIONE_NON_VALIDA, invariata", async () => {
    const cookie = await sessioneScaduta(3, "31");
    const prima = await statoDellaSegnalazione(10);

    await verificaErrore(
      await chiudi("10", { esito: "NON_CONFERMATA" }, cookie),
      401,
      "SESSIONE_NON_VALIDA",
    );
    expect(await statoDellaSegnalazione(10)).toEqual(prima);
  });
});
