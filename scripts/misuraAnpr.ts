// npm run misura:anpr — misura NRF_AFF_2 su un database di test appena popolato.
// Compila l'app, prepara le soste tramite le Facade, avvia next start sul database di test, invia
// il dataset con il simulatore ANPR e confronta gli esiti. Rifiuta ogni database non di test.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import {
  creaFacadeGestioneSoste,
  osservatoreGestioneSoste,
} from "../src/application/gestione-soste/facade.ts";
import { creaFacadeGestioneStalli } from "../src/application/gestione-stalli/facade.ts";
import type { Orologio } from "../src/application/orologio.ts";
import {
  creaFacadeUtentiAccessi,
  normalizzaTarga,
} from "../src/application/utenti-accessi/facade.ts";
import { creaFacadeWallet } from "../src/application/wallet/facade.ts";
import {
  dettaglioSegnalazione,
  segnalazioniNonChiuseDellEnte,
} from "../src/persistence/accessoDati/segnalazioniVerifiche.ts";
import { enti } from "../src/persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
  verificaDatabaseDiTest,
} from "../src/persistence/test/databaseDiTest.ts";
import { SimulatorePagamento } from "../src/simulators/pagamento/simulatorePagamento.ts";

type Sosta = { targa: string; stallo: number };
type Atteso = {
  categoria: string;
  http: number;
  esito?: string;
  motivo?: string;
  codice?: string;
};
type Dataset = {
  preparazione: { presenze: number[]; scadute: Sosta[]; attive: Sosta[] };
  letture: LetturaDelDataset[];
};
type LetturaDelDataset = { id: string; targa?: unknown; stallo?: unknown; atteso: Atteso };
type RigaRegistro = {
  id: string;
  dataOra?: string;
  http: number | null;
  risposta: {
    esito?: string;
    motivo?: string;
    segnalazione?: number;
    errore?: { codice?: string };
  } | null;
};

const RADICE = join(import.meta.dirname, "..");
const FILE_DATASET = join(RADICE, "src", "simulators", "dati", "letture-anpr.json");
const FILE_SIMULATORE = join(RADICE, "src", "simulators", "anpr.ts");
const FILE_MISURE = join(RADICE, "docs", "misure.md");
const CARTELLA_REGISTRI = join(RADICE, ".simulatori");
const BINARIO_NEXT = join(RADICE, "node_modules", ".bin", "next");

const SOGLIA_PERCENTUALE = 98;
const MINUTO = 60_000;
const ANTICIPO_SCADUTE = 24 * 60 * MINUTO;
const DURATA_SCADUTA = 15;
const PASSO_SCADUTE = (DURATA_SCADUTA + 1) * MINUTO;
const DURATA_ATTIVA = 120;
const RICARICHE = 4;
const TAGLIO_RICARICA = 2000;
const ATTESA_SERVER_MS = 60_000;
const INIZIO_SEZIONE = "<!-- misura:anpr -->";
const FINE_SEZIONE = "<!-- /misura:anpr -->";

/** Orologio spostabile: le soste avviate nel passato risultano Scadute all'istante reale. */
function creaOrologioSpostabile(): Orologio & { sposta(istante: Date | null): void } {
  let spostato: Date | null = null;
  return {
    adesso: () => spostato ?? new Date(),
    sposta: (istante) => {
      spostato = istante;
    },
  };
}

async function preparaSoste(dataset: Dataset): Promise<void> {
  const pool = poolDiTest();
  const orologio = creaOrologioSpostabile();
  const utentiAccessi = creaFacadeUtentiAccessi({ pool, orologio });
  const wallet = creaFacadeWallet({
    pagamento: new SimulatorePagamento({ latenzaMs: 0, sogliaMassima: TAGLIO_RICARICA }),
    pool,
    orologio,
  });
  const gestioneSoste = creaFacadeGestioneSoste({ wallet, pool, orologio, utentiAccessi });
  const gestioneStalli = creaFacadeGestioneStalli({
    pool,
    orologio,
    osservatori: [osservatoreGestioneSoste],
  });

  const { presenze, scadute, attive } = dataset.preparazione;
  const targhe = [...new Set([...scadute, ...attive].map((sosta) => sosta.targa))];
  const { utenteId: automobilista } = await utentiAccessi.registraAutomobilista(
    "misura.anpr@test.example",
    randomBytes(16).toString("hex"),
    targhe[0],
  );
  for (const targa of targhe.slice(1)) {
    await utentiAccessi.aggiungiTarga(automobilista, targa);
  }
  for (let i = 0; i < RICARICHE; i++) {
    await wallet.ricarica(automobilista, TAGLIO_RICARICA);
  }

  const inizio = Date.now() - ANTICIPO_SCADUTE;
  for (const stallo of presenze) {
    await gestioneStalli.registraRilevazione({
      stallo,
      presenza: true,
      dataOra: new Date(inizio - MINUTO),
    });
  }
  for (const [indice, sosta] of scadute.entries()) {
    orologio.sposta(new Date(inizio + indice * PASSO_SCADUTE));
    await gestioneSoste.avviaSosta({ automobilista, ...sosta, durata: DURATA_SCADUTA });
  }
  // All'istante reale l'allineamento porta a Scaduta tutte le soste avviate nel passato.
  orologio.sposta(null);
  for (const sosta of attive) {
    await gestioneSoste.avviaSosta({ automobilista, ...sosta, durata: DURATA_ATTIVA });
  }
}

function portaLibera(): Promise<number> {
  return new Promise((risolvi, rifiuta) => {
    const server = createServer();
    server.once("error", rifiuta);
    server.listen(0, "127.0.0.1", () => {
      const indirizzo = server.address();
      const porta = typeof indirizzo === "object" && indirizzo ? indirizzo.port : 0;
      server.close(() => risolvi(porta));
    });
  });
}

/** Attende il server e controlla che sia collegato proprio al database di test. */
async function attendiServer(base: string, database: string, server: ChildProcess): Promise<void> {
  const limite = Date.now() + ATTESA_SERVER_MS;
  while (Date.now() < limite) {
    if (server.exitCode !== null) {
      throw new Error("Il server si è chiuso durante l'avvio.");
    }
    try {
      const risposta = await fetch(`${base}/api/health/db`);
      if (risposta.ok) {
        const dati = (await risposta.json()) as { database?: string };
        if (dati.database !== database) {
          throw new Error("Il server non è collegato al database di test.");
        }
        return;
      }
    } catch (errore) {
      if (errore instanceof Error && errore.message.includes("database di test")) {
        throw errore;
      }
    }
    await new Promise((risolvi) => setTimeout(risolvi, 500));
  }
  throw new Error("Il server non ha risposto in tempo.");
}

/** Ogni lettura deve avere un id proprio e un esito atteso completo, prima di qualsiasi invio. */
function verificaDataset(dataset: Dataset): void {
  const visti = new Set<string>();
  for (const lettura of dataset.letture) {
    if (visti.has(lettura.id)) {
      throw new Error(`Dataset non valido: id duplicato ${lettura.id}.`);
    }
    visti.add(lettura.id);
    const { http, esito, motivo, codice } = lettura.atteso;
    const elaborata =
      http === 200 &&
      codice === undefined &&
      typeof lettura.targa === "string" &&
      typeof lettura.stallo === "number" &&
      (esito === "NESSUNA_SEGNALAZIONE"
        ? motivo === undefined
        : (esito === "SEGNALAZIONE_CREATA" || esito === "LETTURA_SCARTATA") && Boolean(motivo));
    const rifiutata =
      http === 422 && Boolean(codice) && esito === undefined && motivo === undefined;
    if (!elaborata && !rifiutata) {
      throw new Error(`Dataset non valido: esito atteso incompleto per ${lettura.id}.`);
    }
  }
}

/** Il registro deve contenere una sola riga per ogni lettura inviata. */
function verificaRegistro(dataset: Dataset, righe: RigaRegistro[]): void {
  const id = new Set(righe.map((riga) => riga.id));
  if (righe.length !== dataset.letture.length || id.size !== righe.length) {
    throw new Error("Il registro non ha esattamente una riga per ogni lettura.");
  }
}

function esitoCorretto(atteso: Atteso, riga: RigaRegistro | undefined): boolean {
  if (!riga || riga.http !== atteso.http) {
    return false;
  }
  if (atteso.codice) {
    return riga.risposta?.errore?.codice === atteso.codice;
  }
  return riga.risposta?.esito === atteso.esito && riga.risposta?.motivo === atteso.motivo;
}

/** Per una segnalazione creata, la riga del database deve corrispondere alla lettura. */
async function segnalazioneConforme(
  lettura: LetturaDelDataset,
  riga: RigaRegistro | undefined,
): Promise<boolean> {
  if (lettura.atteso.esito !== "SEGNALAZIONE_CREATA") {
    return true;
  }
  const id = riga?.risposta?.segnalazione;
  if (!Number.isSafeInteger(id) || !riga?.dataOra) {
    return false;
  }
  const dettaglio = await dettaglioSegnalazione(poolDiTest(), id as number);
  return (
    dettaglio?.stato === "APERTA" &&
    dettaglio.stalloId === lettura.stallo &&
    dettaglio.targaRilevata === normalizzaTarga(lettura.targa as string) &&
    dettaglio.motivo === lettura.atteso.motivo &&
    dettaglio.dataEOraDellaLettura?.getTime() === new Date(riga.dataOra).getTime() &&
    dettaglio.ausiliarioId === null
  );
}

async function segnalazioniNonChiuse(): Promise<{ id: number; targa: string | null }[]> {
  const pool = poolDiTest();
  const elenco = [];
  for (const ente of await enti(pool)) {
    for (const s of await segnalazioniNonChiuseDellEnte(pool, ente.id)) {
      elenco.push({ id: s.id, targa: s.targaRilevata });
    }
  }
  return elenco;
}

/** Le nuove segnalazioni sono solo quelle attese e ogni targa ne ha al più una non chiusa (VD_16). */
function segnalazioniCoerenti(
  prima: { id: number }[],
  dopo: { id: number; targa: string | null }[],
  create: number[],
): boolean {
  const idPrima = new Set(prima.map((s) => s.id));
  const nuove = dopo.filter((s) => !idPrima.has(s.id)).map((s) => s.id);
  const attese = new Set(create);
  const targhe = dopo.map((s) => s.targa);
  return (
    attese.size === create.length &&
    nuove.length === attese.size &&
    nuove.every((id) => attese.has(id)) &&
    prima.every((s) => dopo.some((d) => d.id === s.id)) &&
    new Set(targhe).size === targhe.length
  );
}

async function salvaRisultato(righe: string[]): Promise<void> {
  const sezione = [INIZIO_SEZIONE, ...righe, FINE_SEZIONE].join("\n");
  const attuale = existsSync(FILE_MISURE)
    ? await readFile(FILE_MISURE, "utf8")
    : "# Misure dei requisiti non funzionali\n";
  const inizio = attuale.indexOf(INIZIO_SEZIONE);
  const fine = attuale.indexOf(FINE_SEZIONE);
  const nuovo =
    inizio >= 0 && fine > inizio
      ? `${attuale.slice(0, inizio)}${sezione}${attuale.slice(fine + FINE_SEZIONE.length)}`
      : `${attuale.trimEnd()}\n\n${sezione}\n`;
  await writeFile(FILE_MISURE, nuovo);
}

async function principale(): Promise<void> {
  // Stessa protezione di test:db, prima di qualsiasi altra operazione.
  const verifica = verificaDatabaseDiTest(process.env);
  if (!verifica.consentito) {
    throw new Error(verifica.motivo);
  }

  const dataset = JSON.parse(await readFile(FILE_DATASET, "utf8")) as Dataset;
  verificaDataset(dataset);

  console.log("Build di produzione...");
  const build = spawnSync(BINARIO_NEXT, ["build"], { cwd: RADICE, stdio: "inherit" });
  if (build.status !== 0) {
    throw new Error("Build non riuscita.");
  }

  console.log(`Preparazione del database "${verifica.destinazione.database}"...`);
  await preparaDatabaseDiTest();
  await preparaSoste(dataset);
  const segnalazioniPrima = await segnalazioniNonChiuse();

  const token = randomBytes(32).toString("hex");
  const porta = await portaLibera();
  const base = `http://127.0.0.1:${porta}`;
  const ambiente = {
    ...process.env,
    DATABASE_URL: verifica.databaseUrlTest,
    SIMULATORE_TOKEN: token,
  };
  const server = spawn(BINARIO_NEXT, ["start", "-p", String(porta), "-H", "127.0.0.1"], {
    cwd: RADICE,
    env: ambiente,
    stdio: "ignore",
  });

  try {
    await attendiServer(base, verifica.destinazione.database, server);
    await mkdir(CARTELLA_REGISTRI, { recursive: true });
    const registro = join(
      CARTELLA_REGISTRI,
      `misura-anpr-${new Date().toISOString().replaceAll(":", "-")}.jsonl`,
    );
    console.log(`Invio di ${dataset.letture.length} letture...`);
    const invio = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        FILE_SIMULATORE,
        "--url",
        base,
        "--dataset",
        FILE_DATASET,
        "--registro",
        registro,
      ],
      { cwd: RADICE, env: ambiente, stdio: ["ignore", "ignore", "inherit"] },
    );
    if (invio.status !== 0) {
      throw new Error("Il simulatore ANPR non ha completato l'invio.");
    }

    const righe = (await readFile(registro, "utf8"))
      .trim()
      .split("\n")
      .map((riga) => JSON.parse(riga) as RigaRegistro);
    verificaRegistro(dataset, righe);
    const perId = new Map(righe.map((riga) => [riga.id, riga]));

    const conformi = new Set<string>();
    for (const lettura of dataset.letture) {
      const riga = perId.get(lettura.id);
      if (esitoCorretto(lettura.atteso, riga) && (await segnalazioneConforme(lettura, riga))) {
        conformi.add(lettura.id);
      }
    }
    const create = righe.flatMap((riga) =>
      riga.risposta?.esito === "SEGNALAZIONE_CREATA" && riga.risposta.segnalazione !== undefined
        ? [riga.risposta.segnalazione]
        : [],
    );
    const coerenti = segnalazioniCoerenti(segnalazioniPrima, await segnalazioniNonChiuse(), create);

    const valide = dataset.letture.filter((l) => l.atteso.http === 200);
    const rifiutate = dataset.letture.filter((l) => l.atteso.http !== 200);
    const corrette = valide.filter((l) => conformi.has(l.id));
    const rifiutateCorrette = rifiutate.filter((l) => conformi.has(l.id));
    const percentuale = (corrette.length / valide.length) * 100;
    const superata = percentuale >= SOGLIA_PERCENTUALE && coerenti;

    const difformi = dataset.letture.filter((l) => !conformi.has(l.id));
    for (const lettura of difformi) {
      console.error(`Difforme ${lettura.id}: atteso ${JSON.stringify(lettura.atteso)}`);
    }

    const categorie = new Map<string, number>();
    for (const { atteso } of dataset.letture) {
      categorie.set(atteso.categoria, (categorie.get(atteso.categoria) ?? 0) + 1);
    }
    await salvaRisultato([
      "",
      "## NRF_AFF_2 – Accuratezza dell'associazione targa-sosta",
      "",
      `- Data della misura: ${new Date().toISOString()}`,
      "- Comando: `npm run misura:anpr`, su un database di test appena popolato",
      `- Letture valide con esito corretto: ${corrette.length} su ${valide.length}`,
      `- **Accuratezza: ${percentuale.toFixed(2)}%** (soglia ${SOGLIA_PERCENTUALE}%): ${superata ? "superata" : "NON superata"}`,
      `- Letture rifiutate correttamente, escluse dalla percentuale: ${rifiutateCorrette.length} su ${rifiutate.length}`,
      `- Composizione del dataset: ${[...categorie].map(([nome, n]) => `${nome} ${n}`).join(", ")}`,
      `- Segnalazioni nel database: ${create.length} create, ${coerenti ? "coerenti" : "NON coerenti"} con le letture e con il vincolo di una sola non chiusa per targa`,
      "- Limite: la misura non applica le fasce orarie di UC_ANPR_1 2.a2, fuori ambito fino a COD-23. Va ripetuta dopo COD-23.",
      "",
    ]);
    console.log(
      `Accuratezza: ${percentuale.toFixed(2)}% (${corrette.length}/${valide.length}). ` +
        `Rifiutate correttamente: ${rifiutateCorrette.length}/${rifiutate.length}. ` +
        `Segnalazioni create: ${create.length}, ${coerenti ? "coerenti" : "NON coerenti"}.`,
    );
    process.exitCode = superata && rifiutateCorrette.length === rifiutate.length ? 0 : 1;
  } finally {
    server.kill("SIGTERM");
  }
}

try {
  await principale();
} catch (errore) {
  console.error(`Misura non riuscita: ${errore instanceof Error ? errore.message : "errore"}`);
  process.exitCode = 1;
} finally {
  await chiudiDatabaseDiTest();
}
