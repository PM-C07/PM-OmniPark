import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { osservatoreGestioneSoste } from "../../../application/gestione-soste/facade.ts";
import { creaFacadeGestioneStalli } from "../../../application/gestione-stalli/facade.ts";
import { calcolaHashToken } from "../../../application/utenti-accessi/crittografia.ts";
import { trovaStallo } from "../../../persistence/accessoDati/stalliTariffe.ts";
import {
  associaVeicolo,
  creaAutomobilista,
  creaSessione,
  targheDelProfilo,
  trovaOCreaVeicolo,
} from "../../../persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  creaSosta,
  movimenti,
  registraRicarica,
  sostaAttivaPerVeicolo,
  sostaAttivaSuStallo,
  trovaSosta,
  trovaWalletDiAutomobilista,
} from "../../../persistence/accessoDati/walletSoste.ts";
import { chiudiPool, verificaConnessione } from "../../../persistence/db.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../../../persistence/test/databaseDiTest.ts";
import { rilevazioniAllIstante } from "../../../persistence/test/datiDiProva.ts";
import { POST as accesso } from "../auth/accesso/route.ts";
import { POST as registrazione } from "../auth/registrazione/route.ts";
import { POST as ricarica } from "../wallet/ricarica/route.ts";
import { GET as saldoWallet } from "../wallet/route.ts";
import { GET as sosteDellAutomobilista, POST as avviaSosta } from "./route.ts";

// Test frame TF-API-WS-01…43 di docs/test/cp_apiWalletSoste.md (OMP-48; con la OMP-61
// TF-API-WS-20…23 aggiornati e TF-API-WS-32…43 aggiunti).

const BASE = "http://localhost";
const NOME_COOKIE = "omnipark_sessione";
const PASSWORD_VALIDA = "parola-di-prova-lunga";
const PASSWORD_AUTOMOBILISTA = "Demo-Automobilista-2026";
const PASSWORD_AUSILIARIO = "Demo-Ausiliario-2026";
const MARCO_ROSSI = "marco.rossi@omnipark.example";
const PAOLO_FERRI = "paolo.ferri@omnipark.example";
const TARGA_MARCO_ROSSI = "MN234PQ";
const SCADENZA_PASSATA = new Date("2026-01-01T00:00:00+01:00");
const UN_ORA_MS = 60 * 60_000;

// Foto di prova (§3, da cp_avvioSosta.md §3), generate in memoria.
function fotoConFirma(firma: number[], n: number): Buffer {
  const foto = Buffer.alloc(n, 0x00);
  Buffer.from(firma).copy(foto);
  return foto;
}

function JPEG(n: number): Buffer {
  return fotoConFirma([0xff, 0xd8, 0xff, 0xe0], n);
}

function PNG(n: number): Buffer {
  return fotoConFirma([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], n);
}

const GIF = fotoConFirma([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 1024);

// Permesso completo (multipart, §3).
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";
const PERMESSO_COMPLETO = { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: JPEG(1024) };

type SostaInElenco = {
  id: number;
  stato: string;
  targa: string;
  stalloId: number;
  orarioDiAvvio: string;
  orarioDiScadenza: string;
  pagamento: string;
};

type SostaAvviata = {
  sosta: number;
  orarioDiAvvio: string;
  orarioDiScadenza: string;
  importo: number;
  pagamento: string;
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

function chiediSaldo(cookie?: string): Promise<Response> {
  return saldoWallet(richiesta("/api/wallet", "GET", { cookie }));
}

function ricaricaWallet(corpo: unknown, cookie?: string): Promise<Response> {
  return ricarica(richiesta("/api/wallet/ricarica", "POST", { cookie, corpo }));
}

function avvia(corpo: unknown, cookie?: string): Promise<Response> {
  return avviaSosta(richiesta("/api/soste", "POST", { cookie, corpo }));
}

function elencoSoste(cookie?: string): Promise<Response> {
  return sosteDellAutomobilista(richiesta("/api/soste", "GET", { cookie }));
}

/** POST con il cookie, le intestazioni aggiunte e un corpo già pronto: FormData o testo. */
function richiestaConCorpo(
  percorso: string,
  opzioni: { cookie?: string; corpo: FormData | string; intestazioni?: Record<string, string> },
): Request {
  const headers: Record<string, string> = { ...opzioni.intestazioni };
  if (opzioni.cookie !== undefined) {
    headers.cookie = `${NOME_COOKIE}=${opzioni.cookie}`;
  }
  return new Request(`${BASE}${percorso}`, { method: "POST", headers, body: opzioni.corpo });
}

/** Campi del multipart: testo, oppure foto (Buffer) inviata come file. */
type CampiDiAvvio = {
  stallo?: string;
  targa?: string;
  durata?: string;
  dichiarazioneDiPermesso?: string;
  fotoDelPermesso?: Buffer | string;
};

/** Richiesta multipart (§3): la foto è il file `permesso.jpg` di tipo `image/jpeg`. */
function moduloDiAvvio(campi: CampiDiAvvio): FormData {
  const modulo = new FormData();
  for (const [nome, valore] of Object.entries(campi)) {
    if (valore === undefined) {
      continue;
    }
    if (typeof valore === "string") {
      modulo.append(nome, valore);
    } else {
      const file = new File([new Uint8Array(valore)], "permesso.jpg", { type: "image/jpeg" });
      modulo.append(nome, file);
    }
  }
  return modulo;
}

function avviaMultipart(campi: CampiDiAvvio, cookie?: string): Promise<Response> {
  return avviaSosta(richiestaConCorpo("/api/soste", { cookie, corpo: moduloDiAvvio(campi) }));
}

function avviaConCorpoTestuale(
  corpo: string,
  contentType: string,
  cookie?: string,
): Promise<Response> {
  return avviaSosta(
    richiestaConCorpo("/api/soste", {
      cookie,
      corpo,
      intestazioni: { "content-type": contentType },
    }),
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

function valoreCookie(risposta: Response): string {
  const valore = /omnipark_sessione=([^;,\s]+)/.exec(risposta.headers.get("set-cookie") ?? "");
  expect(valore).not.toBeNull();
  return valore![1];
}

// ---- Preparazioni ----

async function cookieDiAccesso(email: string, password: string): Promise<string> {
  const risposta = await accesso(
    richiesta("/api/auth/accesso", "POST", { corpo: { email, password } }),
  );
  expect(risposta.status).toBe(200);
  return valoreCookie(risposta);
}

/** Automobilista nuovo del frame n (§3): wallet a saldo 0 e cookie di sessione. */
async function automobilistaNuovo(n: string): Promise<{ id: number; cookie: string }> {
  const risposta = await registrazione(
    richiesta("/api/auth/registrazione", "POST", {
      corpo: {
        email: `api.ws${n}@test.example`,
        password: PASSWORD_VALIDA,
        targa: `WS${n.padStart(3, "0")}XX`,
      },
    }),
  );
  expect(risposta.status).toBe(201);
  const cookie = valoreCookie(risposta);
  const { utente } = (await risposta.json()) as { utente: { id: number } };
  return { id: utente.id, cookie };
}

/** Saldo di preparazione (§3): ricarica registrata con la persistenza, non con la route. */
async function ricaricaDiPreparazione(automobilistaId: number, importo: number): Promise<void> {
  const wallet = await trovaWalletDiAutomobilista(poolDiTest(), automobilistaId);
  expect(wallet).not.toBeNull();
  await registraRicarica(poolDiTest(), {
    walletVirtualeId: wallet!.id,
    importo,
    dataEOra: new Date(),
  });
}

/** Automobilista nuovo del frame n con il saldo di preparazione indicato. */
async function automobilistaConSaldo(
  n: string,
  saldo: number,
): Promise<{ id: number; cookie: string }> {
  const automobilista = await automobilistaNuovo(n);
  if (saldo > 0) {
    await ricaricaDiPreparazione(automobilista.id, saldo);
  }
  return automobilista;
}

/** Sessione scaduta inserita con la persistenza (§3): il cookie vale `scaduta-ws-<n>`. */
async function sessioneScaduta(utenteId: number, n: string): Promise<string> {
  const token = `scaduta-ws-${n}`;
  await creaSessione(poolDiTest(), {
    utenteId,
    hashToken: calcolaHashToken(token),
    scadenza: SCADENZA_PASSATA,
  });
  return token;
}

function gestioneStalli() {
  return creaFacadeGestioneStalli({ pool: poolDiTest(), osservatori: [osservatoreGestioneSoste] });
}

/** Stallo portato a OCCUPATO (§3). */
async function portaAOccupato(stallo: number): Promise<void> {
  await gestioneStalli().registraRilevazione({
    stallo,
    presenza: true,
    dataOra: new Date(), // COD-23: istante della chiamata (§3)
  });
  expect((await trovaStallo(poolDiTest(), stallo))?.stato).toBe("OCCUPATO");
}

// ---- Verifiche sullo stato ----

async function saldoDi(automobilistaId: number): Promise<number> {
  const wallet = await trovaWalletDiAutomobilista(poolDiTest(), automobilistaId);
  expect(wallet).not.toBeNull();
  return wallet!.saldo;
}

async function movimentiDi(
  automobilistaId: number,
): Promise<{ tipoDiMovimento: string; importo: number; sostaId: number | null }[]> {
  const wallet = await trovaWalletDiAutomobilista(poolDiTest(), automobilistaId);
  expect(wallet).not.toBeNull();
  return (await movimenti(poolDiTest(), wallet!.id)).map((m) => ({
    tipoDiMovimento: m.tipoDiMovimento,
    importo: m.importo,
    sostaId: m.sostaId,
  }));
}

type Fotografia = {
  saldo: number;
  movimenti: { tipoDiMovimento: string; importo: number; sostaId: number | null }[];
  statoStallo: string | null;
};

/** Saldo, movimenti e stato dello stallo dopo la preparazione. */
async function fotografa(automobilistaId: number, stallo: number): Promise<Fotografia> {
  return {
    saldo: await saldoDi(automobilistaId),
    movimenti: await movimentiDi(automobilistaId),
    statoStallo: (await trovaStallo(poolDiTest(), stallo))?.stato ?? null,
  };
}

/** Nessun effetto (§3): stato come dopo la preparazione e nessuna sosta attiva per i suoi veicoli. */
async function verificaNessunEffetto(
  automobilistaId: number,
  stallo: number,
  prima: Fotografia,
): Promise<void> {
  expect(await fotografa(automobilistaId, stallo)).toEqual(prima);
  const veicoli = await targheDelProfilo(poolDiTest(), automobilistaId);
  expect(veicoli.length).toBeGreaterThan(0);
  for (const { veicoloId } of veicoli) {
    expect(await sostaAttivaPerVeicolo(poolDiTest(), veicoloId)).toBeNull();
  }
}

describe("OMP-48 · cp_apiWalletSoste", () => {
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

    // Stalli 24 (disabili) e 25 (rosa) a OCCUPATO una sola volta (§3, TF-API-WS-33…38).
    await portaAOccupato(24);
    await portaAOccupato(25);
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

  // ---- Saldo: GET /api/wallet ----

  it("RF_WALLET_3 · TF-API-WS-01 · saldo di un automobilista nuovo → 200 { saldo: 0 }", async () => {
    const { cookie } = await automobilistaNuovo("01");

    const risposta = await chiediSaldo(cookie);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ saldo: 0 });
  });

  it("RF_WALLET_3 · TF-API-WS-02 · saldo di Marco Rossi → 200 { saldo: 600 }", async () => {
    const risposta = await chiediSaldo(marco);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ saldo: 600 });
  });

  it("NRF_SIC_1 · TF-API-WS-03 · saldo senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await chiediSaldo(), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-WS-04 · saldo con sessione scaduta dell'utente 8 → 401 SESSIONE_NON_VALIDA", async () => {
    const cookie = await sessioneScaduta(8, "04");

    await verificaErrore(await chiediSaldo(cookie), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-WS-05 · saldo con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await chiediSaldo(paolo), 403, "RUOLO_NON_AMMESSO");
  });

  // ---- Ricarica: POST /api/wallet/ricarica ----

  it("RF_WALLET_1 · TF-API-WS-06 · ricarica di 1000 → 200 { saldo: 1000 } e un movimento RICARICA da 1000", async () => {
    const { id, cookie } = await automobilistaNuovo("06");

    const risposta = await ricaricaWallet({ importo: 1000 }, cookie);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ saldo: 1000 });
    expect(await movimentiDi(id)).toEqual([
      { tipoDiMovimento: "RICARICA", importo: 1000, sostaId: null },
    ]);
  });

  it("RF_WALLET_1 · TF-API-WS-07 · ricarica di 1500 → 422 IMPORTO_NON_PREVISTO, saldo 0 e nessun movimento", async () => {
    const { id, cookie } = await automobilistaNuovo("07");

    await verificaErrore(
      await ricaricaWallet({ importo: 1500 }, cookie),
      422,
      "IMPORTO_NON_PREVISTO",
    );
    expect(await saldoDi(id)).toBe(0);
    expect(await movimentiDi(id)).toEqual([]);
  });

  it('ISSUE_27 · TF-API-WS-08 · ricarica con importo stringa "1000" → 422 RICHIESTA_NON_VALIDA, saldo 0 e nessun movimento', async () => {
    const { id, cookie } = await automobilistaNuovo("08");

    await verificaErrore(
      await ricaricaWallet({ importo: "1000" }, cookie),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    expect(await saldoDi(id)).toBe(0);
    expect(await movimentiDi(id)).toEqual([]);
  });

  it("NRF_SIC_1 · TF-API-WS-09 · ricarica senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await ricaricaWallet({ importo: 1000 }), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-WS-10 · ricarica con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await ricaricaWallet({ importo: 1000 }, paolo), 403, "RUOLO_NON_AMMESSO");
  });

  // ---- Avvio: POST /api/soste ----

  it("RF_SOSTA_1 · TF-API-WS-11 · avvio di 60 min sullo stallo 3 con saldo 1000 → 201 importo 150 PAGATA, saldo 850 e stallo NON_DISPONIBILE", async () => {
    const { cookie } = await automobilistaConSaldo("11", 1000);

    const risposta = await avvia({ stallo: 3, targa: "WS011XX", durata: 60 }, cookie);

    expect(risposta.status).toBe(201);
    const corpo = (await risposta.json()) as SostaAvviata;
    expect(corpo).toEqual({
      sosta: expect.any(Number),
      orarioDiAvvio: expect.any(String),
      orarioDiScadenza: expect.any(String),
      importo: 150,
      pagamento: "PAGATA",
    });
    expect(Number.isNaN(Date.parse(corpo.orarioDiAvvio))).toBe(false);
    expect(Date.parse(corpo.orarioDiScadenza) - Date.parse(corpo.orarioDiAvvio)).toBe(UN_ORA_MS);

    const rispostaSaldo = await chiediSaldo(cookie);
    expect(rispostaSaldo.status).toBe(200);
    expect(await rispostaSaldo.json()).toEqual({ saldo: 850 });
    expect((await trovaStallo(poolDiTest(), 3))?.stato).toBe("NON_DISPONIBILE");
  });

  it("RF_SOSTA_1 · TF-API-WS-12 · durata sotto il minimo (14 min) → 422 DURATA_NON_VALIDA, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("12", 1000);
    const prima = await fotografa(id, 7);

    await verificaErrore(
      await avvia({ stallo: 7, targa: "WS012XX", durata: 14 }, cookie),
      422,
      "DURATA_NON_VALIDA",
    );
    await verificaNessunEffetto(id, 7, prima);
  });

  it("VD_3 · TF-API-WS-13 · avvio con la targa MN234PQ di Marco Rossi → 422 TARGA_NON_NEL_PROFILO, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("13", 1000);
    const prima = await fotografa(id, 8);

    await verificaErrore(
      await avvia({ stallo: 8, targa: TARGA_MARCO_ROSSI, durata: 60 }, cookie),
      422,
      "TARGA_NON_NEL_PROFILO",
    );
    await verificaNessunEffetto(id, 8, prima);
  });

  it("RF_SOSTA_1 · TF-API-WS-14 · avvio sullo stallo 999999 inesistente → 404 STALLO_INESISTENTE, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("14", 1000);
    const prima = await fotografa(id, 999999);

    await verificaErrore(
      await avvia({ stallo: 999999, targa: "WS014XX", durata: 60 }, cookie),
      404,
      "STALLO_INESISTENTE",
    );
    await verificaNessunEffetto(id, 999999, prima);
  });

  it("RF_SOSTA_1 · TF-API-WS-15 · avvio sullo stallo 16 LIBERO → 409 STALLO_NON_OCCUPATO, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("15", 1000);
    const prima = await fotografa(id, 16);

    await verificaErrore(
      await avvia({ stallo: 16, targa: "WS015XX", durata: 60 }, cookie),
      409,
      "STALLO_NON_OCCUPATO",
    );
    await verificaNessunEffetto(id, 16, prima);
  });

  it("RF_SOSTA_1 · TF-API-WS-16 · secondo avvio con WS016XX già in sosta sullo stallo 11 → 409 SOSTA_GIA_ATTIVA, stallo 12 OCCUPATO e saldo 850", async () => {
    const { id, cookie } = await automobilistaConSaldo("16", 1000);
    const primo = await avvia({ stallo: 11, targa: "WS016XX", durata: 60 }, cookie);
    expect(primo.status).toBe(201);
    const { sosta } = (await primo.json()) as SostaAvviata;

    await verificaErrore(
      await avvia({ stallo: 12, targa: "WS016XX", durata: 60 }, cookie),
      409,
      "SOSTA_GIA_ATTIVA",
    );
    expect((await trovaStallo(poolDiTest(), 12))?.stato).toBe("OCCUPATO");
    expect(await saldoDi(id)).toBe(850);
    expect((await movimentiDi(id)).filter((m) => m.tipoDiMovimento === "ADDEBITO")).toEqual([
      { tipoDiMovimento: "ADDEBITO", importo: 150, sostaId: sosta },
    ]);
  });

  it("ISSUE_27 · TF-API-WS-17 · avvio sullo stallo 17 con sosta attiva di WS017YY → 409 STALLO_CON_SOSTA_ATTIVA, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("17", 1000);
    const altroAutomobilista = await creaAutomobilista(poolDiTest(), {
      email: "api.ws17yy@test.example",
      hashPassword: "hash-non-usato-ws17",
    });
    const veicoloAltro = await trovaOCreaVeicolo(poolDiTest(), "WS017YY");
    await associaVeicolo(poolDiTest(), altroAutomobilista, veicoloAltro);
    const avvio = new Date();
    await creaSosta(poolDiTest(), {
      automobilistaId: altroAutomobilista,
      veicoloId: veicoloAltro,
      stalloId: 17,
      orarioDiAvvio: avvio,
      orarioDiScadenza: new Date(avvio.getTime() + UN_ORA_MS),
      pagamento: "PAGATA",
    });
    const prima = await fotografa(id, 17);

    await verificaErrore(
      await avvia({ stallo: 17, targa: "WS017XX", durata: 60 }, cookie),
      409,
      "STALLO_CON_SOSTA_ATTIVA",
    );
    await verificaNessunEffetto(id, 17, prima);
  });

  it("RF_WALLET_2 · TF-API-WS-18 · avvio di 60 min sullo stallo 18 con saldo 0 → 409 CREDITO_INSUFFICIENTE, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("18", 0);
    const prima = await fotografa(id, 18);

    await verificaErrore(
      await avvia({ stallo: 18, targa: "WS018XX", durata: 60 }, cookie),
      409,
      "CREDITO_INSUFFICIENTE",
    );
    await verificaNessunEffetto(id, 18, prima);
  });

  it("VD_10 · TF-API-WS-19 · avvio sullo stallo 2 DISABILI senza permesso → 422 PERMESSO_MANCANTE, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("19", 1000);
    await portaAOccupato(2);
    const prima = await fotografa(id, 2);

    await verificaErrore(
      await avvia({ stallo: 2, targa: "WS019XX", durata: 60 }, cookie),
      422,
      "PERMESSO_MANCANTE",
    );
    await verificaNessunEffetto(id, 2, prima);
  });

  it("RF_SOSTA_5 · TF-API-WS-20 · avvio multipart sullo stallo 14 DISABILI con permesso completo e saldo 0 → 201 importo 0 GRATUITA, dichiarazione e foto JPEG(1024) salvate, saldo 0", async () => {
    const { id, cookie } = await automobilistaConSaldo("20", 0);
    await portaAOccupato(14);

    const risposta = await avviaMultipart(
      { stallo: "14", targa: "WS020XX", durata: "60", ...PERMESSO_COMPLETO },
      cookie,
    );

    expect(risposta.status).toBe(201);
    const corpo = (await risposta.json()) as SostaAvviata;
    expect(corpo.importo).toBe(0);
    expect(corpo.pagamento).toBe("GRATUITA");

    const sosta = await trovaSosta(poolDiTest(), corpo.sosta);
    expect(sosta).not.toBeNull();
    expect(sosta!.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
    expect(sosta!.fotoDelPermesso).not.toBeNull();
    expect(Buffer.compare(sosta!.fotoDelPermesso!, JPEG(1024))).toBe(0);
    expect(await saldoDi(id)).toBe(0);
  });

  it("RF_SOSTA_5 · TF-API-WS-21 · avvio multipart sullo stallo 15 ROSA con il solo file della foto → 422 PERMESSO_MANCANTE, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("21", 1000);
    const prima = await fotografa(id, 15);

    await verificaErrore(
      await avviaMultipart(
        { stallo: "15", targa: "WS021XX", durata: "60", fotoDelPermesso: JPEG(1024) },
        cookie,
      ),
      422,
      "PERMESSO_MANCANTE",
    );
    await verificaNessunEffetto(id, 15, prima);
  });

  it("VD_8 · TF-API-WS-22 · avvio multipart sullo stallo 19 ordinario con permesso completo → 422 PERMESSO_NON_PREVISTO, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("22", 1000);
    const prima = await fotografa(id, 19);

    await verificaErrore(
      await avviaMultipart(
        { stallo: "19", targa: "WS022XX", durata: "60", ...PERMESSO_COMPLETO },
        cookie,
      ),
      422,
      "PERMESSO_NON_PREVISTO",
    );
    await verificaNessunEffetto(id, 19, prima);
  });

  it("ISSUE_33 · TF-API-WS-23 · avvio JSON con fotoDelPermesso in base64 valido di JPEG(1024) → 422 RICHIESTA_NON_VALIDA, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("23", 1000);
    const prima = await fotografa(id, 20);

    await verificaErrore(
      await avvia(
        {
          stallo: 20,
          targa: "WS023XX",
          durata: 60,
          dichiarazioneDiPermesso: DICHIARAZIONE,
          fotoDelPermesso: JPEG(1024).toString("base64"),
        },
        cookie,
      ),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    await verificaNessunEffetto(id, 20, prima);
  });

  it("ISSUE_27 · TF-API-WS-24 · avvio senza durata → 422 RICHIESTA_NON_VALIDA, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("24", 1000);
    const prima = await fotografa(id, 21);

    await verificaErrore(
      await avvia({ stallo: 21, targa: "WS024XX" }, cookie),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    await verificaNessunEffetto(id, 21, prima);
  });

  it("NRF_SIC_1 · TF-API-WS-25 · avvio senza cookie → 401 SESSIONE_NON_VALIDA, nessuna sosta attiva sullo stallo 21", async () => {
    await verificaErrore(
      await avvia({ stallo: 21, targa: "WS025XX", durata: 60 }),
      401,
      "SESSIONE_NON_VALIDA",
    );
    expect(await sostaAttivaSuStallo(poolDiTest(), 21)).toBeNull();
  });

  it("NRF_SIC_1 · TF-API-WS-26 · avvio con sessione scaduta dell'utente 8 → 401 SESSIONE_NON_VALIDA, nessuna sosta attiva sullo stallo 21", async () => {
    const cookie = await sessioneScaduta(8, "26");

    await verificaErrore(
      await avvia({ stallo: 21, targa: TARGA_MARCO_ROSSI, durata: 60 }, cookie),
      401,
      "SESSIONE_NON_VALIDA",
    );
    expect(await sostaAttivaSuStallo(poolDiTest(), 21)).toBeNull();
  });

  it("NRF_SIC_1 · TF-API-WS-27 · avvio con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO, nessuna sosta attiva sullo stallo 21", async () => {
    await verificaErrore(
      await avvia({ stallo: 21, targa: TARGA_MARCO_ROSSI, durata: 60 }, paolo),
      403,
      "RUOLO_NON_AMMESSO",
    );
    expect(await sostaAttivaSuStallo(poolDiTest(), 21)).toBeNull();
  });

  // ---- Soste dell'Automobilista: GET /api/soste ----

  it("ISSUE_27 · TF-API-WS-28 · soste dopo l'avvio sullo stallo 26 con WS028XX → 200 con una sola sosta ATTIVA PAGATA, senza dichiarazione né foto del permesso", async () => {
    const { cookie } = await automobilistaConSaldo("28", 1000);
    const avvio = await avvia({ stallo: 26, targa: "WS028XX", durata: 60 }, cookie);
    expect(avvio.status).toBe(201);
    const { sosta } = (await avvio.json()) as SostaAvviata;

    const risposta = await elencoSoste(cookie);

    expect(risposta.status).toBe(200);
    const corpo = (await risposta.json()) as { soste: SostaInElenco[] };
    expect(corpo.soste).toHaveLength(1);
    const [s] = corpo.soste;
    expect(s).toEqual({
      id: sosta,
      stato: "ATTIVA",
      targa: "WS028XX",
      stalloId: 26,
      orarioDiAvvio: expect.any(String),
      orarioDiScadenza: expect.any(String),
      pagamento: "PAGATA",
    });
    expect(s).not.toHaveProperty("dichiarazioneDiPermesso");
    expect(s).not.toHaveProperty("fotoDelPermesso");
  });

  it("ISSUE_27 · TF-API-WS-29 · soste di un automobilista nuovo → 200 { soste: [] }", async () => {
    const { cookie } = await automobilistaNuovo("29");

    const risposta = await elencoSoste(cookie);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ soste: [] });
  });

  it("NRF_SIC_1 · TF-API-WS-30 · soste senza cookie → 401 SESSIONE_NON_VALIDA", async () => {
    await verificaErrore(await elencoSoste(), 401, "SESSIONE_NON_VALIDA");
  });

  it("NRF_SIC_1 · TF-API-WS-31 · soste con la sessione di Paolo Ferri → 403 RUOLO_NON_AMMESSO", async () => {
    await verificaErrore(await elencoSoste(paolo), 403, "RUOLO_NON_AMMESSO");
  });

  // ---- Avvio con il permesso e lettura del corpo: POST /api/soste (OMP-61) ----

  it("RF_SOSTA_5 · TF-API-WS-32 · avvio multipart sullo stallo 4 ROSA con dichiarazione e PNG(1024) → 201 importo 100 PAGATA, dichiarazione e foto PNG(1024) salvate, saldo 900 e stallo NON_DISPONIBILE", async () => {
    const { cookie } = await automobilistaConSaldo("32", 1000);

    const risposta = await avviaMultipart(
      {
        stallo: "4",
        targa: "WS032XX",
        durata: "60",
        dichiarazioneDiPermesso: DICHIARAZIONE,
        fotoDelPermesso: PNG(1024),
      },
      cookie,
    );

    expect(risposta.status).toBe(201);
    const corpo = (await risposta.json()) as SostaAvviata;
    expect(corpo.importo).toBe(100);
    expect(corpo.pagamento).toBe("PAGATA");

    const sosta = await trovaSosta(poolDiTest(), corpo.sosta);
    expect(sosta).not.toBeNull();
    expect(sosta!.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
    expect(sosta!.fotoDelPermesso).not.toBeNull();
    expect(Buffer.compare(sosta!.fotoDelPermesso!, PNG(1024))).toBe(0);

    const rispostaSaldo = await chiediSaldo(cookie);
    expect(rispostaSaldo.status).toBe(200);
    expect(await rispostaSaldo.json()).toEqual({ saldo: 900 });
    expect((await trovaStallo(poolDiTest(), 4))?.stato).toBe("NON_DISPONIBILE");
  });

  it("RF_SOSTA_5 · TF-API-WS-33 · avvio JSON sullo stallo 25 ROSA senza permesso → 422 PERMESSO_MANCANTE, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("33", 1000);
    const prima = await fotografa(id, 25);

    await verificaErrore(
      await avvia({ stallo: 25, targa: "WS033XX", durata: 60 }, cookie),
      422,
      "PERMESSO_MANCANTE",
    );
    await verificaNessunEffetto(id, 25, prima);
  });

  it("ISSUE_33 · TF-API-WS-34 · avvio multipart sullo stallo 24 con GIF dichiarato come permesso.jpg image/jpeg → 422 PERMESSO_NON_VALIDO, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("34", 1000);
    const prima = await fotografa(id, 24);

    await verificaErrore(
      await avviaMultipart(
        {
          stallo: "24",
          targa: "WS034XX",
          durata: "60",
          dichiarazioneDiPermesso: DICHIARAZIONE,
          fotoDelPermesso: GIF,
        },
        cookie,
      ),
      422,
      "PERMESSO_NON_VALIDO",
    );
    await verificaNessunEffetto(id, 24, prima);
  });

  it("ISSUE_33 · TF-API-WS-35 · avvio multipart sullo stallo 24 con JPEG(2097153) oltre 2 MB → 422 PERMESSO_NON_VALIDO, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("35", 1000);
    const prima = await fotografa(id, 24);

    await verificaErrore(
      await avviaMultipart(
        {
          stallo: "24",
          targa: "WS035XX",
          durata: "60",
          dichiarazioneDiPermesso: DICHIARAZIONE,
          fotoDelPermesso: JPEG(2097153),
        },
        cookie,
      ),
      422,
      "PERMESSO_NON_VALIDO",
    );
    await verificaNessunEffetto(id, 24, prima);
  });

  it("ISSUE_33 · TF-API-WS-36 · avvio multipart sullo stallo 24 con content-length 5000000 oltre il limite → 422 PERMESSO_NON_VALIDO, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("36", 1000);
    const prima = await fotografa(id, 24);
    const richiestaOltreIlLimite = richiestaConCorpo("/api/soste", {
      cookie,
      corpo: moduloDiAvvio({ stallo: "24", targa: "WS036XX", durata: "60", ...PERMESSO_COMPLETO }),
      intestazioni: { "content-length": "5000000" },
    });
    // Preparazione del frame: l'intestazione deve arrivare alla route (§6).
    expect(richiestaOltreIlLimite.headers.get("content-length")).toBe("5000000");

    await verificaErrore(await avviaSosta(richiestaOltreIlLimite), 422, "PERMESSO_NON_VALIDO");
    await verificaNessunEffetto(id, 24, prima);
  });

  it("ISSUE_33 · TF-API-WS-37 · avvio multipart sullo stallo 24 con fotoDelPermesso come campo di testo base64 → 422 RICHIESTA_NON_VALIDA, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("37", 1000);
    const prima = await fotografa(id, 24);

    await verificaErrore(
      await avviaMultipart(
        {
          stallo: "24",
          targa: "WS037XX",
          durata: "60",
          dichiarazioneDiPermesso: DICHIARAZIONE,
          fotoDelPermesso: JPEG(1024).toString("base64"),
        },
        cookie,
      ),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    await verificaNessunEffetto(id, 24, prima);
  });

  it("RF_SOSTA_5 · TF-API-WS-38 · avvio multipart sullo stallo 24 con dichiarazione e file della foto di 0 byte → 422 PERMESSO_MANCANTE, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("38", 1000);
    const prima = await fotografa(id, 24);

    await verificaErrore(
      await avviaMultipart(
        {
          stallo: "24",
          targa: "WS038XX",
          durata: "60",
          dichiarazioneDiPermesso: DICHIARAZIONE,
          fotoDelPermesso: Buffer.alloc(0),
        },
        cookie,
      ),
      422,
      "PERMESSO_MANCANTE",
    );
    await verificaNessunEffetto(id, 24, prima);
  });

  it('ISSUE_33 · TF-API-WS-39 · avvio multipart sullo stallo 22 con durata "60 min" → 422 RICHIESTA_NON_VALIDA, nessun effetto', async () => {
    const { id, cookie } = await automobilistaConSaldo("39", 1000);
    const prima = await fotografa(id, 22);

    await verificaErrore(
      await avviaMultipart({ stallo: "22", targa: "WS039XX", durata: "60 min" }, cookie),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    await verificaNessunEffetto(id, 22, prima);
  });

  it("ISSUE_33 · TF-API-WS-40 · avvio con content-type text/plain e corpo JSON → 422 RICHIESTA_NON_VALIDA, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("40", 1000);
    const prima = await fotografa(id, 22);

    await verificaErrore(
      await avviaConCorpoTestuale(
        '{"stallo":22,"targa":"WS040XX","durata":60}',
        "text/plain",
        cookie,
      ),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    await verificaNessunEffetto(id, 22, prima);
  });

  it("ISSUE_33 · TF-API-WS-41 · avvio con content-type multipart e corpo che non è un multipart → 422 RICHIESTA_NON_VALIDA, nessun effetto", async () => {
    const { id, cookie } = await automobilistaConSaldo("41", 1000);
    const prima = await fotografa(id, 22);

    await verificaErrore(
      await avviaConCorpoTestuale(
        "non è un multipart",
        "multipart/form-data; boundary=confine",
        cookie,
      ),
      422,
      "RICHIESTA_NON_VALIDA",
    );
    await verificaNessunEffetto(id, 22, prima);
  });

  it("ISSUE_33 · TF-API-WS-42 · avvio multipart sullo stallo 29 a pagamento senza permesso → 201 importo 80 PAGATA, dichiarazione e foto null, saldo 920 e stallo NON_DISPONIBILE", async () => {
    const { cookie } = await automobilistaConSaldo("42", 1000);

    const risposta = await avviaMultipart({ stallo: "29", targa: "WS042XX", durata: "60" }, cookie);

    expect(risposta.status).toBe(201);
    const corpo = (await risposta.json()) as SostaAvviata;
    expect(corpo.importo).toBe(80);
    expect(corpo.pagamento).toBe("PAGATA");

    const sosta = await trovaSosta(poolDiTest(), corpo.sosta);
    expect(sosta).not.toBeNull();
    expect(sosta!.dichiarazioneDiPermesso).toBeNull();
    expect(sosta!.fotoDelPermesso).toBeNull();

    const rispostaSaldo = await chiediSaldo(cookie);
    expect(rispostaSaldo.status).toBe(200);
    expect(await rispostaSaldo.json()).toEqual({ saldo: 920 });
    expect((await trovaStallo(poolDiTest(), 29))?.stato).toBe("NON_DISPONIBILE");
  });

  it("NRF_SIC_1 · TF-API-WS-43 · avvio multipart con permesso completo senza cookie → 401 SESSIONE_NON_VALIDA, nessuna sosta attiva sullo stallo 22", async () => {
    await verificaErrore(
      await avviaMultipart({ stallo: "22", targa: "WS043XX", durata: "60", ...PERMESSO_COMPLETO }),
      401,
      "SESSIONE_NON_VALIDA",
    );
    expect(await sostaAttivaSuStallo(poolDiTest(), 22)).toBeNull();
  });
});
