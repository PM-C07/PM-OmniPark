// Simulatore della telecamera ANPR: parla con l'applicazione solo tramite POST /api/anpr/letture.
// Uso: npm run sim:anpr -- --url http://localhost:3000 (--scenario <file> | --dataset <file>)
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

type LetturaDaInviare = {
  id: string;
  targa?: unknown;
  stallo?: unknown;
  /** Secondi rispetto all'istante di invio; negativo = nel passato. */
  scostamentoSecondi?: number;
  /** Valore inviato così com'è, per le date non conformi. */
  dataOraGrezza?: string;
  senzaDataOra?: boolean;
  attesaMs?: number;
};

const CARTELLA_REGISTRI = join(import.meta.dirname, "..", "..", ".simulatori");
const SCOSTAMENTO_PREDEFINITO = -60;

const { values: opzioni } = parseArgs({
  options: {
    url: { type: "string" },
    scenario: { type: "string" },
    dataset: { type: "string" },
    registro: { type: "string" },
  },
});

function esci(messaggio: string): never {
  console.error(messaggio);
  process.exit(1);
}

async function lettureDaScenario(percorso: string): Promise<LetturaDaInviare[]> {
  const scenario = JSON.parse(await readFile(resolve(percorso), "utf8")) as {
    anpr?: { targa: string; stallo: number; attesaMs?: number }[];
  };
  if (!Array.isArray(scenario.anpr)) {
    esci('Lo scenario deve contenere l\'elenco "anpr".');
  }
  return scenario.anpr.map((passo, indice) => ({ id: `scenario-${indice + 1}`, ...passo }));
}

async function lettureDaDataset(percorso: string): Promise<LetturaDaInviare[]> {
  const dataset = JSON.parse(await readFile(resolve(percorso), "utf8")) as {
    letture?: LetturaDaInviare[];
  };
  if (!Array.isArray(dataset.letture)) {
    esci('Il dataset deve contenere l\'elenco "letture".');
  }
  return dataset.letture;
}

function dataOraDellaLettura(lettura: LetturaDaInviare): string | undefined {
  const scostamento = lettura.scostamentoSecondi ?? SCOSTAMENTO_PREDEFINITO;
  return lettura.senzaDataOra
    ? undefined
    : (lettura.dataOraGrezza ?? new Date(Date.now() + scostamento * 1000).toISOString());
}

async function invia(
  destinazione: URL,
  token: string,
  lettura: LetturaDaInviare,
): Promise<Record<string, unknown>> {
  const inviatoIl = new Date();
  const dataOra = dataOraDellaLettura(lettura);
  const base = { id: lettura.id, inviatoIl: inviatoIl.toISOString(), dataOra };
  try {
    const risposta = await fetch(destinazione, {
      method: "POST",
      headers: { "content-type": "application/json", "x-simulatore-token": token },
      body: JSON.stringify({ targa: lettura.targa, stallo: lettura.stallo, dataOra }),
    });
    const dati: unknown = await risposta.json().catch(() => null);
    return {
      ...base,
      durataMs: Date.now() - inviatoIl.getTime(),
      http: risposta.status,
      risposta: dati,
    };
  } catch {
    return { ...base, durataMs: Date.now() - inviatoIl.getTime(), http: null, risposta: null };
  }
}

function descrizione(riga: Record<string, unknown>): string {
  const dati = riga.risposta as {
    esito?: string;
    motivo?: string;
    errore?: { codice?: string };
  } | null;
  return (
    [dati?.esito, dati?.motivo, dati?.errore?.codice].filter(Boolean).join(" ") || "nessun esito"
  );
}

async function principale(): Promise<void> {
  // Un valore vuoto (--dataset=) conta come file non indicato.
  const modalita = [opzioni.scenario, opzioni.dataset].filter((file) => file !== undefined);
  if (modalita.length !== 1 || !modalita[0]) {
    esci("Indica una sola modalità: --scenario <file> oppure --dataset <file>.");
  }
  if (!opzioni.url) {
    esci("Indica l'indirizzo dell'applicazione con --url.");
  }
  const token = process.env.SIMULATORE_TOKEN;
  if (!token) {
    esci("SIMULATORE_TOKEN non configurata.");
  }

  const destinazione = new URL("/api/anpr/letture", opzioni.url);
  const letture = opzioni.scenario
    ? await lettureDaScenario(opzioni.scenario)
    : await lettureDaDataset(opzioni.dataset as string);

  const registro =
    opzioni.registro ??
    join(CARTELLA_REGISTRI, `anpr-${new Date().toISOString().replaceAll(":", "-")}.jsonl`);
  await mkdir(dirname(registro), { recursive: true });

  let erroriDiRete = 0;
  for (const lettura of letture) {
    if (lettura.attesaMs) {
      await new Promise((risolvi) => setTimeout(risolvi, lettura.attesaMs));
    }
    const riga = await invia(destinazione, token, lettura);
    await appendFile(registro, `${JSON.stringify(riga)}\n`);
    erroriDiRete += riga.http === null ? 1 : 0;
    console.log(`${lettura.id}: ${riga.http ?? "rete"} ${descrizione(riga)}`);
  }
  console.log(
    `Inviate ${letture.length} letture, ${erroriDiRete} errori di rete. Registro: ${registro}`,
  );
  process.exitCode = erroriDiRete === 0 ? 0 : 1;
}

await principale();
