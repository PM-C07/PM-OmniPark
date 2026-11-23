// Controlli comuni agli ingressi dei simulatori: token, corpo JSON, data e ora, risposte di errore.
import { createHash, timingSafeEqual } from "node:crypto";

const DATA_ORA_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const FUSO_MASSIMO_EST_MINUTI = 14 * 60;
const FUSO_MASSIMO_OVEST_MINUTI = 12 * 60;

function impronta(valore: string): Buffer {
  return createHash("sha256").update(valore).digest();
}

/** Confronto a tempo costante: le impronte hanno sempre la stessa lunghezza. */
export function tokenValido(richiesta: Request): boolean {
  const atteso = process.env.SIMULATORE_TOKEN;
  const ricevuto = richiesta.headers.get("x-simulatore-token");
  if (!atteso || ricevuto === null) {
    return false;
  }
  return timingSafeEqual(impronta(ricevuto), impronta(atteso));
}

/** Il corpo se è un oggetto JSON, altrimenti null. */
export async function leggiCorpoJson(richiesta: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo: unknown = await richiesta.json();
    return typeof corpo === "object" && corpo !== null && !Array.isArray(corpo)
      ? (corpo as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** ISO 8601 completo, con fuso orario e data di calendario reale; altrimenti null. */
export function leggiDataOra(valore: unknown): Date | null {
  if (typeof valore !== "string") {
    return null;
  }
  const parti = DATA_ORA_ISO.exec(valore);
  if (!parti) {
    return null;
  }
  const [anno, mese, giorno, ore, minuti, secondi] = parti.slice(1, 7).map(Number);
  const [oreFuso, minutiFuso] = [Number(parti[8] ?? 0), Number(parti[9] ?? 0)];
  const fusoMassimo = parti[7] === "-" ? FUSO_MASSIMO_OVEST_MINUTI : FUSO_MASSIMO_EST_MINUTI;
  // setUTCFullYear, a differenza di Date.UTC, non interpreta gli anni 0–99 come 19xx.
  const fineDelMese = new Date(0);
  fineDelMese.setUTCFullYear(anno, mese, 0);
  const giorniDelMese = fineDelMese.getUTCDate();
  if (
    mese < 1 ||
    mese > 12 ||
    giorno < 1 ||
    giorno > giorniDelMese ||
    ore > 23 ||
    minuti > 59 ||
    secondi > 59 ||
    minutiFuso > 59 ||
    oreFuso * 60 + minutiFuso > fusoMassimo
  ) {
    return null;
  }
  const dataOra = new Date(valore);
  return Number.isNaN(dataOra.getTime()) ? null : dataOra;
}

export function rispostaErrore(status: number, codice: string, messaggio: string): Response {
  return Response.json({ errore: { codice, messaggio } }, { status });
}

export function rispostaTokenNonValido(): Response {
  return rispostaErrore(401, "TOKEN_NON_VALIDO", "Il token del simulatore non è valido.");
}

/** Errori non di dominio: il log riporta solo il tipo, mai dettagli della connessione. */
export function rispostaErroreImprevisto(errore: unknown): Response {
  // Si legge solo il codice: il boundary non dipende dalle classi dello strato di persistenza.
  if ((errore as { codice?: unknown } | null)?.codice === "DATABASE_NON_RAGGIUNGIBILE") {
    return rispostaErrore(
      503,
      "DATABASE_NON_RAGGIUNGIBILE",
      "Il database non è raggiungibile. Riprova più tardi.",
    );
  }
  console.error("Errore nell'ingresso dei simulatori:", errore instanceof Error ? errore.name : "");
  return rispostaErrore(500, "ERRORE_INTERNO", "Si è verificato un errore. Riprova più tardi.");
}
