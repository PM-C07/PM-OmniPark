// Simulatori di COD-14 lanciati dai test di sistema come processi figli (docs/test/test_di_sistema.md
// §2): scenario generato per l'esecuzione, SIMULATORE_TOKEN dall'ambiente, esiti letti dal registro
// JSONL del simulatore. I simulatori parlano con l'applicazione solo tramite le API.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { anticipoMs, variabileObbligatoria } from "./ambiente.ts";

const RADICE = process.cwd();
const SIMULATORE_SENSORI = join(RADICE, "src", "simulators", "sensori.ts");
const SIMULATORE_ANPR = join(RADICE, "src", "simulators", "anpr.ts");

export type PassoSensori = { stallo: number; presenza: boolean; attesaMs?: number };
export type RigaSensori = {
  etichetta: string;
  inviatoIl: string;
  durataMs: number;
  stallo: number | null;
  presenza: boolean | null;
  http: number | null;
  esito: string;
  httpAtteso?: number;
  codiceAtteso?: string;
};

export type LetturaAnpr = {
  targa: string;
  stallo: number;
  attesaMs?: number;
  scostamentoSecondi?: number;
};
export type RigaAnpr = {
  id: string;
  inviatoIl: string;
  dataOra?: string;
  http: number | null;
  risposta: {
    esito?: string;
    motivo?: string;
    segnalazione?: number;
    errore?: { codice?: string };
  } | null;
};

type Esecuzione = { codice: number | null; uscita: string; errori: string };

function esegui(argomenti: string[]): Promise<Esecuzione> {
  const token = variabileObbligatoria(process.env, "SIMULATORE_TOKEN");
  return new Promise((risolvi, rifiuta) => {
    const figlio = spawn(
      process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", ...argomenti],
      { cwd: RADICE, env: { ...process.env, SIMULATORE_TOKEN: token } },
    );
    let uscita = "";
    let errori = "";
    figlio.stdout.on("data", (parte: Buffer) => {
      uscita += parte.toString();
    });
    figlio.stderr.on("data", (parte: Buffer) => {
      errori += parte.toString();
    });
    figlio.on("error", rifiuta);
    figlio.on("close", (codice) => risolvi({ codice, uscita, errori }));
  });
}

async function righeJsonl<R>(percorso: string): Promise<R[]> {
  const testo = await readFile(percorso, "utf8");
  return testo
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((riga) => JSON.parse(riga) as R);
}

function registroDalleUscite({ uscita, errori, codice }: Esecuzione): string {
  const trovato = /Registro: (.+)$/m.exec(uscita);
  if (!trovato) {
    throw new Error(
      `Il simulatore non ha indicato il registro (uscita ${codice}): ${errori.trim()}`,
    );
  }
  return trovato[1].trim();
}

/** Invia le rilevazioni con il simulatore dei sensori; restituisce le righe del suo registro. */
export async function inviaRilevazioni(
  url: string,
  passi: readonly PassoSensori[],
  fileScenario: string,
): Promise<RigaSensori[]> {
  await mkdir(dirname(fileScenario), { recursive: true });
  await writeFile(fileScenario, JSON.stringify({ sensori: passi }));
  const esecuzione = await esegui([
    SIMULATORE_SENSORI,
    "--url",
    url,
    "--scenario",
    fileScenario,
    "--anticipo-ms",
    String(anticipoMs(process.env)),
  ]);
  return righeJsonl<RigaSensori>(registroDalleUscite(esecuzione));
}

/** Rilevazioni non valide del simulatore (--invalide), ciascuna con l'esito atteso. */
export async function inviaRilevazioniNonValide(url: string): Promise<RigaSensori[]> {
  const esecuzione = await esegui([
    SIMULATORE_SENSORI,
    "--url",
    url,
    "--invalide",
    "--anticipo-ms",
    String(anticipoMs(process.env)),
  ]);
  return righeJsonl<RigaSensori>(registroDalleUscite(esecuzione));
}

/** Invia le letture con il simulatore ANPR; restituisce le righe del registro, nell'ordine. */
export async function inviaLetture(
  url: string,
  letture: readonly LetturaAnpr[],
  fileScenario: string,
): Promise<RigaAnpr[]> {
  // dataOra della lettura nel passato quanto l'anticipo, arrotondato al secondo in eccesso.
  const scostamento = -Math.ceil(anticipoMs(process.env) / 1000) - 1;
  const registro = join(dirname(fileScenario), "registro-anpr.jsonl");
  await mkdir(dirname(fileScenario), { recursive: true });
  await writeFile(registro, "");
  await writeFile(
    fileScenario,
    JSON.stringify({
      anpr: letture.map((l) => ({ scostamentoSecondi: scostamento, ...l })),
    }),
  );
  const esecuzione = await esegui([
    SIMULATORE_ANPR,
    "--url",
    url,
    "--scenario",
    fileScenario,
    "--registro",
    registro,
  ]);
  const righe = await righeJsonl<RigaAnpr>(registro);
  if (righe.length !== letture.length) {
    throw new Error(
      `Il simulatore ANPR ha registrato ${righe.length} letture su ${letture.length}: ${esecuzione.errori.trim()}`,
    );
  }
  return righe;
}
