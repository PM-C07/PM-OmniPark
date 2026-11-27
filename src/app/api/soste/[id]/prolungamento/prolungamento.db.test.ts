import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { osservatoreGestioneSoste } from "../../../../../application/gestione-soste/facade.ts";
import { creaFacadeGestioneStalli } from "../../../../../application/gestione-stalli/facade.ts";
import { trovaStallo } from "../../../../../persistence/accessoDati/stalliTariffe.ts";
import { targheDelProfilo } from "../../../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  creaSosta,
  impostaSostaScaduta,
  movimenti,
  registraRicarica,
  trovaSosta,
  trovaWalletDiAutomobilista,
} from "../../../../../persistence/accessoDati/walletSoste.ts";
import { chiudiPool, verificaConnessione } from "../../../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../../../persistence/test/databaseDiTest.ts";
import { rilevazioniAllIstante } from "../../../../../persistence/test/datiDiProva.ts";
import { POST as accesso } from "../../../auth/accesso/route.ts";
import { POST as registrazione } from "../../../auth/registrazione/route.ts";
import { GET as saldoWallet } from "../../../wallet/route.ts";
import { GET as anteprimaProlungamento, POST as confermaProlungamento } from "./route.ts";

// Test frame TF-API-PRO-01…20 di docs/test/cp_apiProlungamento.md (OMP-61, blocco A; 20 da OMP-66).
// Orologio di sistema: A = Date.now() all'inizio della preparazione del frame; S + m è la scadenza
// della sosta di prova della preparazione più m minuti. TF-API-PRO-15, 17, 18 e 19 riusano la
// sosta di TF-API-PRO-14, 16, 16 e 04.

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_VALIDA = "parola-di-prova-lunga";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const MARCO_ROSSI_ID = 8;
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const SOSTA_TERMINATA = 1;
const STALLO_SOSTA_TERMINATA = 10;
const SCADENZA_SOSTA_TERMINATA = new Date("2026-10-31T10:00:00+01:00");
const INESISTENTE = 999999;
const MINUTO_MS = 60_000;

const MESSAGGIO_120_DISPONIBILI =
  "Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 120 minuti.";
const MESSAGGIO_NON_PROLUNGABILE =
  "La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo.";

type SostaProlungata = { sosta: number; orarioDiScadenza: string; importo: number };
type ImportoDelProlungamento = { importo: number; orarioDiScadenza: string };
type Movimento = { tipoDiMovimento: string; importo: number; sostaId: number | null };
type Automobilista = { id: number; cookie: string; veicolo: number };
type SostaDiProva = { id: number; stallo: number; orarioDiScadenza: Date };

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

function contesto(id: string | number): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

/** POST /api/soste/<id>/prolungamento con il corpo indicato. */
function prolunga(id: string | number, corpo: unknown, cookie?: string): Promise<Response> {
  return confermaProlungamento(
    richiesta(`/api/soste/${id}/prolungamento`, "POST", { cookie, corpo }),
    contesto(id),
  );
}

/** GET /api/soste/<id>/prolungamento, con `?tempoAggiuntivo=<m>` se indicato. */
function anteprima(
  id: string | number,
  tempoAggiuntivo: string | undefined,
  cookie?: string,
): Promise<Response> {
  const query =
    tempoAggiuntivo === undefined ? "" : `?tempoAggiuntivo=${encodeURIComponent(tempoAggiuntivo)}`;
  return anteprimaProlungamento(
    richiesta(`/api/soste/${id}/prolungamento${query}`, "GET", { cookie }),
    contesto(id),
  );
}

function chiediSaldo(cookie: string): Promise<Response> {
  return saldoWallet(richiesta("/api/wallet", "GET", { cookie }));
}

// ---- Esiti ----

/** Errore nella forma { errore: { codice, messaggio } }; restituisce il messaggio. */
async function verificaErrore(risposta: Response, status: number, codice: string): Promise<string> {
  expect(risposta.status).toBe(status);
  const corpo = (await risposta.json()) as { errore: { codice: string; messaggio: string } };
  expect(corpo.errore.codice).toBe(codice);
  expect(typeof corpo.errore.messaggio).toBe("string");
  expect(corpo.errore.messaggio.length).toBeGreaterThan(0);
  return corpo.errore.messaggio;
}

function valoreCookie(risposta: Response): string {
  const valore = /omnipark_sessione=([^;,\s]+)/.exec(risposta.headers.get("set-cookie") ?? "");
  expect(valore).not.toBeNull();
  return valore![1];
}

function istante(orario: string): number {
  const valore = Date.parse(orario);
  expect(Number.isNaN(valore)).toBe(false);
  return valore;
}

function piuMinuti(orario: Date | number, minuti: number): number {
  return (typeof orario === "number" ? orario : orario.getTime()) + minuti * MINUTO_MS;
}

// ---- Preparazioni ----

async function cookieDiAccesso(email: string, password: string): Promise<string> {
  const risposta = await accesso(
    richiesta("/api/auth/accesso", "POST", { corpo: { email, password } }),
  );
  expect(risposta.status).toBe(200);
  return valoreCookie(risposta);
}

/** Automobilista registrato dalla route (§3), con il saldo di preparazione indicato. */
async function registraAutomobilista(
  email: string,
  targa: string,
  saldo: number,
): Promise<Automobilista> {
  const risposta = await registrazione(
    richiesta("/api/auth/registrazione", "POST", {
      corpo: { email, password: PASSWORD_VALIDA, targa },
    }),
  );
  expect(risposta.status).toBe(201);
  const cookie = valoreCookie(risposta);
  const { utente } = (await risposta.json()) as { utente: { id: number } };

  if (saldo > 0) {
    const wallet = await trovaWalletDiAutomobilista(poolDiTest(), utente.id);
    expect(wallet).not.toBeNull();
    await registraRicarica(poolDiTest(), {
      walletVirtualeId: wallet!.id,
      importo: saldo,
      dataEOra: new Date(),
    });
  }

  const veicolo = (await targheDelProfilo(poolDiTest(), utente.id)).find((t) => t.targa === targa);
  expect(veicolo).toBeDefined();
  return { id: utente.id, cookie, veicolo: veicolo!.veicoloId };
}

/** Automobilista nuovo del frame n (due cifre): api.pro<n>@test.example, targa AP0<n>XX. */
function automobilistaDelFrame(n: string, saldo = 1000): Promise<Automobilista> {
  return registraAutomobilista(`api.pro${n}@test.example`, `AP0${n}XX`, saldo);
}

function gestioneStalli() {
  return creaFacadeGestioneStalli({ pool: poolDiTest(), osservatori: [osservatoreGestioneSoste] });
}

/**
 * Sosta di prova S (§3): PAGATA, dalle A − 30 alle A + 30 salvo indicazione, poi stallo Non
 * disponibile; «scaduta» la porta a SCADUTA e lascia lo stallo com'è.
 */
async function sostaDiProva(
  a: number,
  automobilista: Automobilista,
  stallo: number,
  opzioni: { avvio?: number; scadenza?: number; scaduta?: boolean } = {},
): Promise<SostaDiProva> {
  const id = await creaSosta(poolDiTest(), {
    automobilistaId: automobilista.id,
    veicoloId: automobilista.veicolo,
    stalloId: stallo,
    orarioDiAvvio: new Date(piuMinuti(a, opzioni.avvio ?? -30)),
    orarioDiScadenza: new Date(piuMinuti(a, opzioni.scadenza ?? 30)),
    pagamento: "PAGATA",
  });
  if (opzioni.scaduta) {
    expect(await impostaSostaScaduta(poolDiTest(), id)).toBe(true);
  } else {
    await gestioneStalli().impostaNonDisponibile(stallo);
  }
  const letta = await trovaSosta(poolDiTest(), id);
  expect(letta).not.toBeNull();
  return { id, stallo, orarioDiScadenza: letta!.orarioDiScadenza };
}

// ---- Verifiche sullo stato ----

async function saldoDi(automobilistaId: number): Promise<number> {
  const wallet = await trovaWalletDiAutomobilista(poolDiTest(), automobilistaId);
  expect(wallet).not.toBeNull();
  return wallet!.saldo;
}

async function movimentiDi(automobilistaId: number): Promise<Movimento[]> {
  const wallet = await trovaWalletDiAutomobilista(poolDiTest(), automobilistaId);
  expect(wallet).not.toBeNull();
  return (await movimenti(poolDiTest(), wallet!.id)).map((m) => ({
    tipoDiMovimento: m.tipoDiMovimento,
    importo: m.importo,
    sostaId: m.sostaId,
  }));
}

async function statoStallo(stallo: number): Promise<string | null> {
  return (await trovaStallo(poolDiTest(), stallo))?.stato ?? null;
}

async function statoSosta(id: number): Promise<{ stato: string; orarioDiScadenza: number }> {
  const sosta = await trovaSosta(poolDiTest(), id);
  expect(sosta).not.toBeNull();
  return { stato: sosta!.stato, orarioDiScadenza: sosta!.orarioDiScadenza.getTime() };
}

type Fotografia = {
  sosta: { stato: string; orarioDiScadenza: number } | null;
  wallet: { saldo: number; movimenti: Movimento[] }[];
  statoStallo: string | null;
};

/** Stato della sosta, del wallet di ogni automobilista e dello stallo (verifica N, §3). */
async function fotografa(dati: {
  sosta?: number;
  automobilisti: number[];
  stallo?: number;
}): Promise<Fotografia> {
  const wallet: Fotografia["wallet"] = [];
  for (const id of dati.automobilisti) {
    wallet.push({ saldo: await saldoDi(id), movimenti: await movimentiDi(id) });
  }
  return {
    sosta: dati.sosta === undefined ? null : await statoSosta(dati.sosta),
    wallet,
    statoStallo: dati.stallo === undefined ? null : await statoStallo(dati.stallo),
  };
}

describe("OMP-61 · cp_apiProlungamento", () => {
  let marco: string;
  let paolo: string;

  // Preparazioni riusate dai frame successivi (§5).
  let primoDi04: Automobilista | undefined;
  let secondoDi04: Automobilista | undefined;
  let sostaDi04: SostaDiProva | undefined;
  let automobilistaDi14: Automobilista | undefined;
  let sostaDi14: SostaDiProva | undefined;
  let automobilistaDi16: Automobilista | undefined;
  let sostaDi16: SostaDiProva | undefined;

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

  // COD-23 (RF_IOT_2): rilevazioni all'istante corrente prima di ogni frame, così l'allineamento
  // delle route non porta gli stalli a Sconosciuto (§3).
  beforeEach(async () => {
    await rilevazioniAllIstante(poolDiTest(), new Date());
  });

  afterAll(async () => {
    await chiudiPool();
    await chiudiDatabaseDiTest();
    vi.unstubAllEnvs();
  });

  // ---- Prolungamenti e anteprima riusciti ----

  it("RF_SOSTA_2 · TF-API-PRO-01 · prolungamento di 30 min sullo stallo 3 → 200 importo 75 e scadenza S + 30, ADDEBITO da 75, saldo 925 e stallo NON_DISPONIBILE", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("01");
    const s = await sostaDiProva(a, automobilista, 3);

    const risposta = await prolunga(s.id, { tempoAggiuntivo: 30 }, automobilista.cookie);

    expect(risposta.status).toBe(200);
    const corpo = (await risposta.json()) as SostaProlungata;
    expect(corpo).toEqual({ sosta: s.id, orarioDiScadenza: expect.any(String), importo: 75 });
    expect(istante(corpo.orarioDiScadenza)).toBe(piuMinuti(s.orarioDiScadenza, 30));

    expect(await statoSosta(s.id)).toEqual({
      stato: "ATTIVA",
      orarioDiScadenza: piuMinuti(s.orarioDiScadenza, 30),
    });
    expect(
      (await movimentiDi(automobilista.id)).filter((m) => m.tipoDiMovimento === "ADDEBITO"),
    ).toEqual([{ tipoDiMovimento: "ADDEBITO", importo: 75, sostaId: s.id }]);
    const rispostaSaldo = await chiediSaldo(automobilista.cookie);
    expect(rispostaSaldo.status).toBe(200);
    expect(await rispostaSaldo.json()).toEqual({ saldo: 925 });
    expect(await statoStallo(3)).toBe("NON_DISPONIBILE");
  });

  it("RF_SOSTA_2 · TF-API-PRO-02 · anteprima di 30 min sullo stallo 7 → 200 importo 75 e scadenza S + 30, nessuna scrittura", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("02");
    const s = await sostaDiProva(a, automobilista, 7);
    const prima = await fotografa({ sosta: s.id, automobilisti: [automobilista.id], stallo: 7 });

    const risposta = await anteprima(s.id, "30", automobilista.cookie);

    expect(risposta.status).toBe(200);
    const corpo = (await risposta.json()) as ImportoDelProlungamento;
    expect(corpo).toEqual({ importo: 75, orarioDiScadenza: expect.any(String) });
    expect(istante(corpo.orarioDiScadenza)).toBe(piuMinuti(s.orarioDiScadenza, 30));

    expect(await fotografa({ sosta: s.id, automobilisti: [automobilista.id], stallo: 7 })).toEqual(
      prima,
    );
    expect((await statoSosta(s.id)).orarioDiScadenza).toBe(s.orarioDiScadenza.getTime());
    expect(await saldoDi(automobilista.id)).toBe(1000);
    expect(await movimentiDi(automobilista.id)).toEqual([
      { tipoDiMovimento: "RICARICA", importo: 1000, sostaId: null },
    ]);
  });

  it("RF_SOSTA_2 · TF-API-PRO-03 · due prolungamenti simultanei di 30 min sullo stallo 8 → entrambi 200 importo 75, scadenze S + 30 e S + 60, due ADDEBITO da 75 e saldo 850", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("03");
    const s = await sostaDiProva(a, automobilista, 8);

    const esiti = await Promise.allSettled([
      prolunga(s.id, { tempoAggiuntivo: 30 }, automobilista.cookie),
      prolunga(s.id, { tempoAggiuntivo: 30 }, automobilista.cookie),
    ]);

    const corpi: SostaProlungata[] = [];
    for (const esito of esiti) {
      expect(esito.status).toBe("fulfilled");
      const risposta = (esito as PromiseFulfilledResult<Response>).value;
      expect(risposta.status).toBe(200);
      corpi.push((await risposta.json()) as SostaProlungata);
    }
    for (const corpo of corpi) {
      expect(corpo).toEqual({ sosta: s.id, orarioDiScadenza: expect.any(String), importo: 75 });
    }
    expect(corpi.map((c) => istante(c.orarioDiScadenza)).sort((x, y) => x - y)).toEqual([
      piuMinuti(s.orarioDiScadenza, 30),
      piuMinuti(s.orarioDiScadenza, 60),
    ]);

    expect(await statoSosta(s.id)).toEqual({
      stato: "ATTIVA",
      orarioDiScadenza: piuMinuti(s.orarioDiScadenza, 60),
    });
    expect(
      (await movimentiDi(automobilista.id)).filter((m) => m.tipoDiMovimento === "ADDEBITO"),
    ).toEqual([
      { tipoDiMovimento: "ADDEBITO", importo: 75, sostaId: s.id },
      { tipoDiMovimento: "ADDEBITO", importo: 75, sostaId: s.id },
    ]);
    expect(await saldoDi(automobilista.id)).toBe(850);
  });

  // ---- Sosta: proprietario e stato ----

  it("RF_SOSTA_2 · TF-API-PRO-04 · prolungamento della sosta di un altro automobilista → 404 SOSTA_INESISTENTE, nessun effetto per entrambi", async () => {
    const a = Date.now();
    primoDi04 = await automobilistaDelFrame("04");
    secondoDi04 = await registraAutomobilista("api.pro04b@test.example", "AP004YY", 1000);
    sostaDi04 = await sostaDiProva(a, secondoDi04, 11);
    const dati = {
      sosta: sostaDi04.id,
      automobilisti: [primoDi04.id, secondoDi04.id],
      stallo: 11,
    };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(sostaDi04.id, { tempoAggiuntivo: 30 }, primoDi04.cookie),
      404,
      "SOSTA_INESISTENTE",
    );
    expect(await fotografa(dati)).toEqual(prima);
  });

  it("ISSUE_33 · TF-API-PRO-05 · prolungamento della sosta 999999 inesistente → 404 SOSTA_INESISTENTE, saldo 1000 e solo la ricarica", async () => {
    const automobilista = await automobilistaDelFrame("05");

    await verificaErrore(
      await prolunga(INESISTENTE, { tempoAggiuntivo: 30 }, automobilista.cookie),
      404,
      "SOSTA_INESISTENTE",
    );
    expect(await saldoDi(automobilista.id)).toBe(1000);
    expect(await movimentiDi(automobilista.id)).toEqual([
      { tipoDiMovimento: "RICARICA", importo: 1000, sostaId: null },
    ]);
  });

  it("RF_SOSTA_2 · TF-API-PRO-06 · prolungamento di una sosta scaduta sullo stallo 12 → 409 SOSTA_SCADUTA, S SCADUTA e stallo 12 OCCUPATO", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("06");
    const s = await sostaDiProva(a, automobilista, 12, {
      avvio: -90,
      scadenza: -30,
      scaduta: true,
    });
    const dati = { sosta: s.id, automobilisti: [automobilista.id], stallo: 12 };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(s.id, { tempoAggiuntivo: 30 }, automobilista.cookie),
      409,
      "SOSTA_SCADUTA",
    );
    expect(await fotografa(dati)).toEqual(prima);
    expect(await statoSosta(s.id)).toEqual({
      stato: "SCADUTA",
      orarioDiScadenza: s.orarioDiScadenza.getTime(),
    });
    expect(await statoStallo(12)).toBe("OCCUPATO");
  });

  it("RF_SOSTA_2 · TF-API-PRO-07 · prolungamento della sosta 1 terminata di Marco Rossi → 409 SOSTA_TERMINATA, sosta 1 invariata e saldo 600", async () => {
    const dati = {
      sosta: SOSTA_TERMINATA,
      automobilisti: [MARCO_ROSSI_ID],
      stallo: STALLO_SOSTA_TERMINATA,
    };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(SOSTA_TERMINATA, { tempoAggiuntivo: 30 }, marco),
      409,
      "SOSTA_TERMINATA",
    );
    expect(await fotografa(dati)).toEqual(prima);
    expect(await statoSosta(SOSTA_TERMINATA)).toEqual({
      stato: "TERMINATA",
      orarioDiScadenza: SCADENZA_SOSTA_TERMINATA.getTime(),
    });
    expect(await saldoDi(MARCO_ROSSI_ID)).toBe(600);
  });

  // ---- Credito ----

  it("RF_WALLET_2 · TF-API-PRO-08 · prolungamento di 30 min (importo 75) con saldo 50 → 409 CREDITO_INSUFFICIENTE, saldo 50 e scadenza invariata", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("08", 50);
    const s = await sostaDiProva(a, automobilista, 17);
    const dati = { sosta: s.id, automobilisti: [automobilista.id], stallo: 17 };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(s.id, { tempoAggiuntivo: 30 }, automobilista.cookie),
      409,
      "CREDITO_INSUFFICIENTE",
    );
    expect(await fotografa(dati)).toEqual(prima);
    expect(await saldoDi(automobilista.id)).toBe(50);
    expect((await statoSosta(s.id)).orarioDiScadenza).toBe(s.orarioDiScadenza.getTime());
  });

  // ---- Durata totale ----

  it("RF_SOSTA_2 · TF-API-PRO-09 · prolungamento di 121 min con 60 già usati su 180 → 422 DURATA_OLTRE_IL_MASSIMO con 120 minuti disponibili nel messaggio, nessun effetto", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("09");
    const s = await sostaDiProva(a, automobilista, 18);
    const dati = { sosta: s.id, automobilisti: [automobilista.id], stallo: 18 };
    const prima = await fotografa(dati);

    const messaggio = await verificaErrore(
      await prolunga(s.id, { tempoAggiuntivo: 121 }, automobilista.cookie),
      422,
      "DURATA_OLTRE_IL_MASSIMO",
    );
    expect(messaggio).toBe(MESSAGGIO_120_DISPONIBILI);
    expect(await fotografa(dati)).toEqual(prima);
  });

  it("RF_SOSTA_2 · TF-API-PRO-10 · prolungamento di 15 min con 175 già usati su 180 → 422 DURATA_OLTRE_IL_MASSIMO con il messaggio di sosta non più prolungabile, nessun effetto", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("10");
    const s = await sostaDiProva(a, automobilista, 19, { avvio: -30, scadenza: 145 });
    const dati = { sosta: s.id, automobilisti: [automobilista.id], stallo: 19 };
    const prima = await fotografa(dati);

    const messaggio = await verificaErrore(
      await prolunga(s.id, { tempoAggiuntivo: 15 }, automobilista.cookie),
      422,
      "DURATA_OLTRE_IL_MASSIMO",
    );
    expect(messaggio).toBe(MESSAGGIO_NON_PROLUNGABILE);
    expect(await fotografa(dati)).toEqual(prima);
  });

  it("RF_SOSTA_2 · TF-API-PRO-11 · anteprima di 121 min con 60 già usati su 180 → 422 DURATA_OLTRE_IL_MASSIMO con 120 minuti disponibili nel messaggio, nessun effetto", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("11");
    const s = await sostaDiProva(a, automobilista, 20);
    const dati = { sosta: s.id, automobilisti: [automobilista.id], stallo: 20 };
    const prima = await fotografa(dati);

    const messaggio = await verificaErrore(
      await anteprima(s.id, "121", automobilista.cookie),
      422,
      "DURATA_OLTRE_IL_MASSIMO",
    );
    expect(messaggio).toBe(MESSAGGIO_120_DISPONIBILI);
    expect(await fotografa(dati)).toEqual(prima);
  });

  // ---- Tempo aggiuntivo e lettura della richiesta ----

  it("ISSUE_33 · TF-API-PRO-12 · tempo aggiuntivo sotto il minimo (14 min) → 422 DURATA_NON_VALIDA, nessun effetto", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("12");
    const s = await sostaDiProva(a, automobilista, 21);
    const dati = { sosta: s.id, automobilisti: [automobilista.id], stallo: 21 };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(s.id, { tempoAggiuntivo: 14 }, automobilista.cookie),
      422,
      "DURATA_NON_VALIDA",
    );
    expect(await fotografa(dati)).toEqual(prima);
  });

  it("ISSUE_33 · TF-API-PRO-13 · id della sosta non numerico abc → 422 RICHIESTA_NON_VALIDA, saldo 1000 e solo la ricarica", async () => {
    const automobilista = await automobilistaDelFrame("13");

    await verificaErrore(
      await prolunga("abc", { tempoAggiuntivo: 30 }, automobilista.cookie),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    expect(await saldoDi(automobilista.id)).toBe(1000);
    expect(await movimentiDi(automobilista.id)).toEqual([
      { tipoDiMovimento: "RICARICA", importo: 1000, sostaId: null },
    ]);
  });

  it('ISSUE_33 · TF-API-PRO-14 · tempoAggiuntivo stringa "30" → 422 RICHIESTA_NON_VALIDA, nessun effetto', async () => {
    const a = Date.now();
    automobilistaDi14 = await automobilistaDelFrame("14");
    sostaDi14 = await sostaDiProva(a, automobilistaDi14, 23);
    const dati = { sosta: sostaDi14.id, automobilisti: [automobilistaDi14.id], stallo: 23 };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(sostaDi14.id, { tempoAggiuntivo: "30" }, automobilistaDi14.cookie),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    expect(await fotografa(dati)).toEqual(prima);
  });

  it("ISSUE_33 · TF-API-PRO-15 · anteprima senza tempoAggiuntivo sulla sosta di TF-API-PRO-14 → 422 RICHIESTA_NON_VALIDA, nessun effetto", async () => {
    expect(automobilistaDi14).toBeDefined();
    expect(sostaDi14).toBeDefined();
    const dati = { sosta: sostaDi14!.id, automobilisti: [automobilistaDi14!.id], stallo: 23 };
    const prima = await fotografa(dati);

    await verificaErrore(
      await anteprima(sostaDi14!.id, undefined, automobilistaDi14!.cookie),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    expect(await fotografa(dati)).toEqual(prima);
  });

  // ---- Sessione e ruolo ----

  it("NRF_SIC_1 · TF-API-PRO-16 · prolungamento senza cookie → 401 SESSIONE_NON_VALIDA, nessun effetto", async () => {
    const a = Date.now();
    automobilistaDi16 = await automobilistaDelFrame("16");
    sostaDi16 = await sostaDiProva(a, automobilistaDi16, 26);
    const dati = { sosta: sostaDi16.id, automobilisti: [automobilistaDi16.id], stallo: 26 };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(sostaDi16.id, { tempoAggiuntivo: 30 }),
      401,
      "SESSIONE_NON_VALIDA",
    );
    expect(await fotografa(dati)).toEqual(prima);
  });

  it("NRF_SIC_1 · TF-API-PRO-17 · anteprima senza cookie sulla sosta di TF-API-PRO-16 → 401 SESSIONE_NON_VALIDA, nessun effetto", async () => {
    expect(automobilistaDi16).toBeDefined();
    expect(sostaDi16).toBeDefined();
    const dati = { sosta: sostaDi16!.id, automobilisti: [automobilistaDi16!.id], stallo: 26 };
    const prima = await fotografa(dati);

    await verificaErrore(await anteprima(sostaDi16!.id, "30"), 401, "SESSIONE_NON_VALIDA");
    expect(await fotografa(dati)).toEqual(prima);
  });

  it("NRF_SIC_1 · TF-API-PRO-18 · prolungamento con la sessione di Paolo Ferri sulla sosta di TF-API-PRO-16 → 403 RUOLO_NON_AMMESSO, nessun effetto", async () => {
    expect(automobilistaDi16).toBeDefined();
    expect(sostaDi16).toBeDefined();
    const dati = { sosta: sostaDi16!.id, automobilisti: [automobilistaDi16!.id], stallo: 26 };
    const prima = await fotografa(dati);

    await verificaErrore(
      await prolunga(sostaDi16!.id, { tempoAggiuntivo: 30 }, paolo),
      403,
      "RUOLO_NON_AMMESSO",
    );
    expect(await fotografa(dati)).toEqual(prima);
  });

  // ---- Anteprima della sosta di un altro automobilista ----

  it("RF_SOSTA_2 · TF-API-PRO-19 · anteprima della sosta di un altro automobilista (TF-API-PRO-04) → 404 SOSTA_INESISTENTE, nessun effetto per entrambi", async () => {
    expect(primoDi04).toBeDefined();
    expect(secondoDi04).toBeDefined();
    expect(sostaDi04).toBeDefined();
    const dati = {
      sosta: sostaDi04!.id,
      automobilisti: [primoDi04!.id, secondoDi04!.id],
      stallo: 11,
    };
    const prima = await fotografa(dati);

    await verificaErrore(
      await anteprima(sostaDi04!.id, "30", primoDi04!.cookie),
      404,
      "SOSTA_INESISTENTE",
    );
    expect(await fotografa(dati)).toEqual(prima);
  });

  // ---- Anteprima con un ruolo non ammesso (OMP-66, docs/test/matrice_accessi.md) ----

  it("NRF_SIC_1 · TF-API-PRO-20 · anteprima con la sessione di Paolo Ferri su una sosta preparata come in TF-API-PRO-16 → 403 RUOLO_NON_AMMESSO, nessun effetto", async () => {
    const a = Date.now();
    const automobilista = await automobilistaDelFrame("20");
    const sosta = await sostaDiProva(a, automobilista, 29);
    const dati = { sosta: sosta.id, automobilisti: [automobilista.id], stallo: 29 };
    const prima = await fotografa(dati);

    await verificaErrore(await anteprima(sosta.id, "30", paolo), 403, "RUOLO_NON_AMMESSO");
    expect(await fotografa(dati)).toEqual(prima);
  });
});
