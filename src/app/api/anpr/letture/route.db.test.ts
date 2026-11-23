import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  dettaglioSegnalazione,
  esisteSegnalazioneNonChiusa,
  segnalazioniNonChiuseDellEnte,
} from "../../../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { chiudiPool, verificaConnessione } from "../../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../../persistence/test/databaseDiTest.ts";
import { POST } from "./route.ts";

// Test frame TF-01…15 di docs/test/cp_ingressoLetture.md (COD-14, OMP-47).

const URL_ROUTE = "http://localhost/api/anpr/letture";
const TOKEN_DI_PROVA = "token-di-prova";
const DATA_ORA_VALIDA = "2026-11-20T09:00:00+01:00";
const STALLO_INESISTENTE = 999999;
// Gli id degli enti del dataset sono compresi in questo intervallo; un id senza righe dà un elenco vuoto.
const ENTI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Intestazioni = Record<string, string>;

const conTokenValido: Intestazioni = { "x-simulatore-token": TOKEN_DI_PROVA };

function invia(corpo: unknown, intestazioni: Intestazioni = conTokenValido): Promise<Response> {
  return POST(
    new Request(URL_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json", ...intestazioni },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  );
}

function dataFutura(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

async function idNonChiuse(): Promise<number[]> {
  const elenchi = await Promise.all(
    ENTI.map((ente) => segnalazioniNonChiuseDellEnte(poolDiTest(), ente)),
  );
  return elenchi
    .flat()
    .map((s) => s.id)
    .sort((a, b) => a - b);
}

async function verificaErrore(risposta: Response, status: number, codice: string): Promise<void> {
  expect(risposta.status).toBe(status);
  const corpo = (await risposta.json()) as { errore: { codice: string; messaggio: string } };
  expect(corpo.errore.codice).toBe(codice);
  expect(typeof corpo.errore.messaggio).toBe("string");
  expect(corpo.errore.messaggio.length).toBeGreaterThan(0);
}

async function verificaRifiuto(
  corpo: unknown,
  status: number,
  codice: string,
  intestazioni: Intestazioni = conTokenValido,
): Promise<void> {
  const prima = await idNonChiuse();
  await verificaErrore(await invia(corpo, intestazioni), status, codice);
  expect(await idNonChiuse()).toEqual(prima);
}

describe("COD-14 · cp_ingressoLetture", () => {
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
    vi.stubEnv("SIMULATORE_TOKEN", TOKEN_DI_PROVA);

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

  it("RF_ANPR_1 · TF-01 · token valido, sosta assente → 200 SEGNALAZIONE_CREATA", async () => {
    const risposta = await invia({ targa: "LE01AA", stallo: 16, dataOra: DATA_ORA_VALIDA });

    expect(risposta.status).toBe(200);
    const esito = (await risposta.json()) as { esito: string; segnalazione: number };
    expect(esito).toEqual({
      esito: "SEGNALAZIONE_CREATA",
      segnalazione: expect.any(Number),
      motivo: "SOSTA_ASSENTE",
    });
    const dettaglio = await dettaglioSegnalazione(poolDiTest(), esito.segnalazione);
    expect(dettaglio).not.toBeNull();
    expect(dettaglio!.stato).toBe("APERTA");
    expect(dettaglio!.stalloId).toBe(16);
    expect(dettaglio!.targaRilevata).toBe("LE01AA");
    expect(dettaglio!.motivo).toBe("SOSTA_ASSENTE");
    expect(dettaglio!.dataEOraDellaLettura?.getTime()).toBe(new Date(DATA_ORA_VALIDA).getTime());
  });

  it("RF_ANPR_1 · TF-02 · token assente → 401 TOKEN_NON_VALIDO", async () => {
    await verificaRifiuto(
      { targa: "LE02AA", stallo: 1, dataOra: DATA_ORA_VALIDA },
      401,
      "TOKEN_NON_VALIDO",
      {},
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE02AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-03 · token errato → 401 TOKEN_NON_VALIDO", async () => {
    await verificaRifiuto(
      { targa: "LE03AA", stallo: 2, dataOra: DATA_ORA_VALIDA },
      401,
      "TOKEN_NON_VALIDO",
      { "x-simulatore-token": "token-errato" },
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE03AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-04 · corpo non JSON → 422 LETTURA_INCOMPLETA", async () => {
    await verificaRifiuto(
      `{"targa":"LE04AA","stallo":5,"dataOra":"${DATA_ORA_VALIDA}"`,
      422,
      "LETTURA_INCOMPLETA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE04AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-05 · campo targa mancante → 422 LETTURA_INCOMPLETA", async () => {
    await verificaRifiuto({ stallo: 6, dataOra: DATA_ORA_VALIDA }, 422, "LETTURA_INCOMPLETA");
  });

  it("RF_ANPR_1 · TF-06 · targa non stringa → 422 LETTURA_INCOMPLETA", async () => {
    await verificaRifiuto(
      { targa: 12345, stallo: 9, dataOra: DATA_ORA_VALIDA },
      422,
      "LETTURA_INCOMPLETA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "12345")).toBe(false);
  });

  it("RF_ANPR_1 · TF-07 · dataOra non valida → 422 LETTURA_INCOMPLETA", async () => {
    await verificaRifiuto(
      { targa: "LE07AA", stallo: 10, dataOra: "non-una-data" },
      422,
      "LETTURA_INCOMPLETA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE07AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-08 · stallo inesistente → 422 STALLO_INESISTENTE", async () => {
    await verificaRifiuto(
      { targa: "LE08AA", stallo: STALLO_INESISTENTE, dataOra: DATA_ORA_VALIDA },
      422,
      "STALLO_INESISTENTE",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE08AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-09 · targa con caratteri non ammessi → 422 TARGA_NON_VALIDA", async () => {
    await verificaRifiuto(
      { targa: "RA22-AA", stallo: 14, dataOra: DATA_ORA_VALIDA },
      422,
      "TARGA_NON_VALIDA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "RA22-AA")).toBe(false);
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "RA22AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-10 · dataOra un'ora dopo l'istante corrente → 422 LETTURA_NON_VALIDA", async () => {
    await verificaRifiuto(
      { targa: "LE10AA", stallo: 22, dataOra: dataFutura() },
      422,
      "LETTURA_NON_VALIDA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE10AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-11 · dataOra senza fuso orario → 422 LETTURA_INCOMPLETA", async () => {
    await verificaRifiuto(
      { targa: "LE11AA", stallo: 24, dataOra: "2026-11-20T09:00:00" },
      422,
      "LETTURA_INCOMPLETA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE11AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-12 · dataOra con data inesistente → 422 LETTURA_INCOMPLETA", async () => {
    await verificaRifiuto(
      { targa: "LE12AA", stallo: 27, dataOra: "2026-02-31T10:00:00+01:00" },
      422,
      "LETTURA_INCOMPLETA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE12AA")).toBe(false);
  });

  it("RF_ANPR_1 · TF-13 · SIMULATORE_TOKEN non configurata → 401 TOKEN_NON_VALIDO", async () => {
    vi.stubEnv("SIMULATORE_TOKEN", "");
    try {
      const corpo = { targa: "LE13AA", stallo: 28, dataOra: DATA_ORA_VALIDA };
      await verificaRifiuto(corpo, 401, "TOKEN_NON_VALIDO");
      await verificaRifiuto(corpo, 401, "TOKEN_NON_VALIDO", { "x-simulatore-token": "" });
      expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE13AA")).toBe(false);
    } finally {
      vi.stubEnv("SIMULATORE_TOKEN", TOKEN_DI_PROVA);
    }
  });

  it("RF_ANPR_1 · TF-14 · targa con segnalazione già aperta → 200 LETTURA_SCARTATA", async () => {
    const segnalazione11 = await dettaglioSegnalazione(poolDiTest(), 11);
    expect(segnalazione11).not.toBeNull();
    const prima = await idNonChiuse();

    const risposta = await invia({ targa: "HB204KM", stallo: 30, dataOra: DATA_ORA_VALIDA });

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ esito: "LETTURA_SCARTATA", motivo: "SOSTA_ASSENTE" });
    expect(await idNonChiuse()).toEqual(prima);
    expect(await dettaglioSegnalazione(poolDiTest(), 11)).toEqual(segnalazione11);
  });

  it("RF_ANPR_1 · TF-15 · stallo non numerico → 422 LETTURA_INCOMPLETA", async () => {
    await verificaRifiuto(
      { targa: "LE15AA", stallo: "5", dataOra: DATA_ORA_VALIDA },
      422,
      "LETTURA_INCOMPLETA",
    );
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), "LE15AA")).toBe(false);
  });
});
