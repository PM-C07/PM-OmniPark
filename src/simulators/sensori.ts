// Simulatore dei sensori IoT: parla con l'applicazione solo tramite POST /api/sensori/rilevazioni.
// Uso: npm run sim:sensori -- --url http://localhost:3000 (--casuale | --scenario <file> | --invalide)
// Con l'app remota, --anticipo-ms <n> invia dataOra n millisecondi prima dell'orologio locale, per
// assorbire un orologio del PC in anticipo: il server non ha tolleranza sulle date future.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

type Invio = {
  etichetta: string;
  corpo: string;
  token?: string | null;
  httpAtteso?: number;
  codiceAtteso?: string;
  stallo?: unknown;
  presenza?: unknown;
  attesaMs?: number;
};

const CARTELLA_REGISTRI = join(import.meta.dirname, "..", "..", ".simulatori");
const FILE_STALLI = join(import.meta.dirname, "dati", "stalli.json");

const { values: opzioni } = parseArgs({
  options: {
    url: { type: "string" },
    casuale: { type: "boolean", default: false },
    scenario: { type: "string" },
    invalide: { type: "boolean", default: false },
    quante: { type: "string", default: "20" },
    intervallo: { type: "string", default: "1000" },
    "anticipo-ms": { type: "string", default: "0" },
  },
});

function esci(messaggio: string): never {
  console.error(messaggio);
  process.exit(1);
}

function interoNonNegativo(valore: string, nome: string): number {
  const numero = Number(valore);
  if (!Number.isSafeInteger(numero) || numero < 0) {
    esci(`--${nome} deve essere un intero non negativo.`);
  }
  return numero;
}

function corpoRilevazione(stallo: unknown, presenza: unknown, dataOra: unknown): string {
  return JSON.stringify({ stallo, presenza, dataOra });
}

async function inviiCasuali(quante: number, intervalloMs: number): Promise<Invio[]> {
  const { stalli } = JSON.parse(await readFile(FILE_STALLI, "utf8")) as { stalli: number[] };
  return Array.from({ length: quante }, (_, indice) => {
    const stallo = stalli[Math.floor(Math.random() * stalli.length)];
    const presenza = Math.random() < 0.5;
    return {
      etichetta: `casuale-${indice + 1}`,
      corpo: "",
      stallo,
      presenza,
      attesaMs: indice === 0 ? 0 : intervalloMs,
    };
  });
}

async function inviiDaScenario(percorso: string): Promise<Invio[]> {
  const scenario = JSON.parse(await readFile(resolve(percorso), "utf8")) as {
    sensori?: { stallo: number; presenza: boolean; attesaMs?: number }[];
  };
  if (!Array.isArray(scenario.sensori)) {
    esci('Lo scenario deve contenere l\'elenco "sensori".');
  }
  return scenario.sensori.map((passo, indice) => ({
    etichetta: `scenario-${indice + 1}`,
    corpo: "",
    stallo: passo.stallo,
    presenza: passo.presenza,
    attesaMs: passo.attesaMs ?? 0,
  }));
}

function inviiInvalidi(anticipoMs: number): Invio[] {
  const adesso = Date.now();
  const futura = new Date(adesso + 3_600_000).toISOString();
  const valida = new Date(adesso - anticipoMs).toISOString();
  const incompleta = { httpAtteso: 422, codiceAtteso: "RILEVAZIONE_INCOMPLETA" };
  const tokenRifiutato = { httpAtteso: 401, codiceAtteso: "TOKEN_NON_VALIDO" };
  return [
    {
      etichetta: "token assente",
      corpo: corpoRilevazione(1, true, valida),
      token: null,
      ...tokenRifiutato,
    },
    {
      etichetta: "token errato",
      corpo: corpoRilevazione(1, true, valida),
      token: "token-errato",
      ...tokenRifiutato,
    },
    { etichetta: "corpo non JSON", corpo: "non è json", ...incompleta },
    {
      etichetta: "campo mancante",
      corpo: JSON.stringify({ stallo: 1, dataOra: valida }),
      ...incompleta,
    },
    { etichetta: "presenza non boolean", corpo: corpoRilevazione(1, "sì", valida), ...incompleta },
    { etichetta: "stallo non numerico", corpo: corpoRilevazione("1", true, valida), ...incompleta },
    { etichetta: "dataOra non valida", corpo: corpoRilevazione(1, true, "ieri"), ...incompleta },
    {
      etichetta: "dataOra senza fuso",
      corpo: corpoRilevazione(1, true, "2026-11-20T09:00:00"),
      ...incompleta,
    },
    {
      etichetta: "dataOra inesistente",
      corpo: corpoRilevazione(1, true, "2026-02-31T10:00:00+01:00"),
      ...incompleta,
    },
    {
      etichetta: "dataOra futura",
      corpo: corpoRilevazione(1, true, futura),
      httpAtteso: 422,
      codiceAtteso: "RILEVAZIONE_NON_VALIDA",
    },
    {
      etichetta: "stallo inesistente",
      corpo: corpoRilevazione(999999, true, valida),
      httpAtteso: 422,
      codiceAtteso: "STALLO_INESISTENTE",
    },
  ];
}

async function invia(
  destinazione: URL,
  tokenSimulatore: string,
  voce: Invio,
  anticipoMs: number,
): Promise<Record<string, unknown>> {
  const token = voce.token === undefined ? tokenSimulatore : voce.token;
  const intestazioni: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) {
    intestazioni["x-simulatore-token"] = token;
  }
  const corpo =
    voce.corpo ||
    corpoRilevazione(voce.stallo, voce.presenza, new Date(Date.now() - anticipoMs).toISOString());
  const inviatoIl = new Date();
  const base = { etichetta: voce.etichetta, inviatoIl: inviatoIl.toISOString() };
  try {
    const risposta = await fetch(destinazione, {
      method: "POST",
      headers: intestazioni,
      body: corpo,
    });
    const dati = (await risposta.json().catch(() => null)) as {
      stato?: string;
      errore?: { codice?: string };
    } | null;
    return {
      ...base,
      durataMs: Date.now() - inviatoIl.getTime(),
      stallo: voce.stallo ?? null,
      presenza: voce.presenza ?? null,
      http: risposta.status,
      esito: dati?.stato ?? dati?.errore?.codice ?? "RISPOSTA_NON_VALIDA",
      ...(voce.httpAtteso === undefined
        ? {}
        : { httpAtteso: voce.httpAtteso, codiceAtteso: voce.codiceAtteso }),
    };
  } catch {
    return {
      ...base,
      durataMs: Date.now() - inviatoIl.getTime(),
      stallo: voce.stallo ?? null,
      presenza: voce.presenza ?? null,
      http: null,
      esito: "ERRORE_DI_RETE",
    };
  }
}

async function principale(): Promise<void> {
  const modalita = [opzioni.casuale, opzioni.scenario !== undefined, opzioni.invalide];
  if (modalita.filter(Boolean).length !== 1) {
    esci("Indica una sola modalità: --casuale, --scenario <file> oppure --invalide.");
  }
  if (!opzioni.url) {
    esci("Indica l'indirizzo dell'applicazione con --url.");
  }
  const tokenSimulatore = process.env.SIMULATORE_TOKEN;
  if (!tokenSimulatore) {
    esci("SIMULATORE_TOKEN non configurata.");
  }

  const anticipoMs = interoNonNegativo(opzioni["anticipo-ms"], "anticipo-ms");
  const destinazione = new URL("/api/sensori/rilevazioni", opzioni.url);
  const invii = opzioni.casuale
    ? await inviiCasuali(
        interoNonNegativo(opzioni.quante, "quante"),
        interoNonNegativo(opzioni.intervallo, "intervallo"),
      )
    : opzioni.scenario
      ? await inviiDaScenario(opzioni.scenario)
      : inviiInvalidi(anticipoMs);

  await mkdir(CARTELLA_REGISTRI, { recursive: true });
  const registro = join(
    CARTELLA_REGISTRI,
    `sensori-${new Date().toISOString().replaceAll(":", "-")}.jsonl`,
  );

  let inattesi = 0;
  for (const voce of invii) {
    if (voce.attesaMs) {
      await new Promise((risolvi) => setTimeout(risolvi, voce.attesaMs));
    }
    const riga = await invia(destinazione, tokenSimulatore, voce, anticipoMs);
    await appendFile(registro, `${JSON.stringify(riga)}\n`);
    const fallita =
      riga.http === null ||
      (voce.httpAtteso !== undefined &&
        (riga.http !== voce.httpAtteso || riga.esito !== voce.codiceAtteso));
    inattesi += fallita ? 1 : 0;
    console.log(`${voce.etichetta}: ${riga.http ?? "rete"} ${riga.esito}`);
  }
  console.log(
    `Inviate ${invii.length} rilevazioni, ${inattesi} con esito inatteso. Registro: ${registro}`,
  );
  process.exitCode = inattesi === 0 ? 0 : 1;
}

await principale();
