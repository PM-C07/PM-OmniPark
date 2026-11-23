import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { trovaStallo } from "../../../../persistence/accessoDati/stalliTariffe.ts";
import { chiudiPool, verificaConnessione } from "../../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../../persistence/test/databaseDiTest.ts";
import { POST } from "./route.ts";

// Test frame TF-01…15 di docs/test/cp_ingressoRilevazioni.md (COD-14, OMP-47).

const URL_ROUTE = "http://localhost/api/sensori/rilevazioni";
const TOKEN_DI_PROVA = "token-di-prova";
const DATA_ORA_VALIDA = "2026-11-20T09:00:00+01:00";
const DATA_ORA_PRECEDENTE = "2026-11-15T07:59:59+01:00";
const STALLO_INESISTENTE = 999999;

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

async function statoRilevato(id: number) {
  const stallo = await trovaStallo(poolDiTest(), id);
  expect(stallo).not.toBeNull();
  return {
    stato: stallo!.stato,
    occupazioneRilevata: stallo!.occupazioneRilevata,
    ultimaRilevazione: stallo!.dataEOraUltimaRilevazione?.getTime() ?? null,
  };
}

async function verificaErrore(risposta: Response, status: number, codice: string): Promise<void> {
  expect(risposta.status).toBe(status);
  const corpo = (await risposta.json()) as { errore: { codice: string; messaggio: string } };
  expect(corpo.errore.codice).toBe(codice);
  expect(typeof corpo.errore.messaggio).toBe("string");
  expect(corpo.errore.messaggio.length).toBeGreaterThan(0);
}

async function verificaRifiuto(
  stallo: number,
  corpo: unknown,
  status: number,
  codice: string,
  intestazioni: Intestazioni = conTokenValido,
): Promise<void> {
  const prima = await statoRilevato(stallo);
  await verificaErrore(await invia(corpo, intestazioni), status, codice);
  expect(await statoRilevato(stallo)).toEqual(prima);
}

describe("COD-14 · cp_ingressoRilevazioni", () => {
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

  it("RF_IOT_1 · TF-01 · token valido, stallo Libero, presenza vera → 200 OCCUPATO", async () => {
    const risposta = await invia({ stallo: 1, presenza: true, dataOra: DATA_ORA_VALIDA });

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ stato: "OCCUPATO" });
    expect(await statoRilevato(1)).toEqual({
      stato: "OCCUPATO",
      occupazioneRilevata: "VEICOLO_PRESENTE",
      ultimaRilevazione: new Date(DATA_ORA_VALIDA).getTime(),
    });
  });

  it("RF_IOT_1 · TF-02 · token valido, stallo Occupato, presenza falsa → 200 LIBERO", async () => {
    const risposta = await invia({ stallo: 3, presenza: false, dataOra: DATA_ORA_VALIDA });

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ stato: "LIBERO" });
    expect(await statoRilevato(3)).toEqual({
      stato: "LIBERO",
      occupazioneRilevata: "NESSUN_VEICOLO",
      ultimaRilevazione: new Date(DATA_ORA_VALIDA).getTime(),
    });
  });

  it("RF_IOT_1 · TF-03 · token assente → 401 TOKEN_NON_VALIDO", async () => {
    await verificaRifiuto(
      5,
      { stallo: 5, presenza: true, dataOra: DATA_ORA_VALIDA },
      401,
      "TOKEN_NON_VALIDO",
      {},
    );
  });

  it("RF_IOT_1 · TF-04 · token errato → 401 TOKEN_NON_VALIDO", async () => {
    await verificaRifiuto(
      6,
      { stallo: 6, presenza: true, dataOra: DATA_ORA_VALIDA },
      401,
      "TOKEN_NON_VALIDO",
      { "x-simulatore-token": "token-errato" },
    );
  });

  it("RF_IOT_1 · TF-05 · corpo non JSON → 422 RILEVAZIONE_INCOMPLETA", async () => {
    await verificaRifiuto(
      2,
      `{"stallo":2,"presenza":true,"dataOra":"${DATA_ORA_VALIDA}"`,
      422,
      "RILEVAZIONE_INCOMPLETA",
    );
  });

  it("RF_IOT_1 · TF-06 · campo presenza mancante → 422 RILEVAZIONE_INCOMPLETA", async () => {
    await verificaRifiuto(
      9,
      { stallo: 9, dataOra: DATA_ORA_VALIDA },
      422,
      "RILEVAZIONE_INCOMPLETA",
    );
  });

  it("RF_IOT_1 · TF-07 · presenza non boolean → 422 RILEVAZIONE_INCOMPLETA", async () => {
    await verificaRifiuto(
      10,
      { stallo: 10, presenza: "true", dataOra: DATA_ORA_VALIDA },
      422,
      "RILEVAZIONE_INCOMPLETA",
    );
  });

  it("RF_IOT_1 · TF-08 · dataOra non valida → 422 RILEVAZIONE_INCOMPLETA", async () => {
    await verificaRifiuto(
      14,
      { stallo: 14, presenza: true, dataOra: "non-una-data" },
      422,
      "RILEVAZIONE_INCOMPLETA",
    );
  });

  it("RF_IOT_1 · TF-09 · stallo inesistente → 422 STALLO_INESISTENTE", async () => {
    const risposta = await invia({
      stallo: STALLO_INESISTENTE,
      presenza: true,
      dataOra: DATA_ORA_VALIDA,
    });

    await verificaErrore(risposta, 422, "STALLO_INESISTENTE");
    expect(await trovaStallo(poolDiTest(), STALLO_INESISTENTE)).toBeNull();
  });

  it("RF_IOT_1 · TF-10 · dataOra precedente all'ultima rilevazione → 409 RILEVAZIONE_SUPERATA", async () => {
    await verificaRifiuto(
      16,
      { stallo: 16, presenza: true, dataOra: DATA_ORA_PRECEDENTE },
      409,
      "RILEVAZIONE_SUPERATA",
    );
  });

  it("RF_IOT_1 · TF-11 · dataOra un'ora dopo l'istante corrente → 422 RILEVAZIONE_NON_VALIDA", async () => {
    await verificaRifiuto(
      22,
      { stallo: 22, presenza: true, dataOra: dataFutura() },
      422,
      "RILEVAZIONE_NON_VALIDA",
    );
  });

  it("RF_IOT_1 · TF-12 · dataOra senza fuso orario → 422 RILEVAZIONE_INCOMPLETA", async () => {
    await verificaRifiuto(
      24,
      { stallo: 24, presenza: true, dataOra: "2026-11-20T09:00:00" },
      422,
      "RILEVAZIONE_INCOMPLETA",
    );
  });

  it("RF_IOT_1 · TF-13 · dataOra con data inesistente → 422 RILEVAZIONE_INCOMPLETA", async () => {
    await verificaRifiuto(
      27,
      { stallo: 27, presenza: true, dataOra: "2026-02-31T10:00:00+01:00" },
      422,
      "RILEVAZIONE_INCOMPLETA",
    );
  });

  it("RF_IOT_1 · TF-14 · SIMULATORE_TOKEN non configurata → 401 TOKEN_NON_VALIDO", async () => {
    vi.stubEnv("SIMULATORE_TOKEN", "");
    try {
      const corpo = { stallo: 28, presenza: true, dataOra: DATA_ORA_VALIDA };
      await verificaRifiuto(28, corpo, 401, "TOKEN_NON_VALIDO");
      await verificaRifiuto(28, corpo, 401, "TOKEN_NON_VALIDO", { "x-simulatore-token": "" });
    } finally {
      vi.stubEnv("SIMULATORE_TOKEN", TOKEN_DI_PROVA);
    }
  });

  it("RF_IOT_1 · TF-15 · stallo non numerico → 422 RILEVAZIONE_INCOMPLETA", async () => {
    await verificaRifiuto(
      5,
      { stallo: "5", presenza: true, dataOra: DATA_ORA_VALIDA },
      422,
      "RILEVAZIONE_INCOMPLETA",
    );
  });
});
