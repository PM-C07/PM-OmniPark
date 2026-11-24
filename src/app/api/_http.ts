// Strumenti comuni delle route API: lettura della richiesta e risposte JSON, compresi gli errori
// nella forma { errore: { codice, messaggio } }. Nessuna regola di dominio.
import { createHash } from "node:crypto";

const DATA_ORA_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const FUSO_MASSIMO_EST_MINUTI = 14 * 60;
const FUSO_MASSIMO_OVEST_MINUTI = 12 * 60;

/** Impronta SHA-256, per confronti a tempo costante tra stringhe di lunghezza diversa. */
export function impronta(valore: string): Buffer {
  return createHash("sha256").update(valore).digest();
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

/** Un intero positivo scritto solo con cifre (id nei percorsi e nei parametri), altrimenti null. */
export function leggiId(valore: string | null | undefined): number | null {
  if (typeof valore !== "string" || !/^[1-9]\d{0,15}$/.test(valore)) {
    return null;
  }
  const id = Number(valore);
  return Number.isSafeInteger(id) ? id : null;
}

export function rispostaErrore(status: number, codice: string, messaggio: string): Response {
  return Response.json({ errore: { codice, messaggio } }, { status });
}

/** Errori non di dominio: il log riporta solo il tipo, mai dettagli della connessione o del database. */
export function rispostaErroreImprevisto(errore: unknown, origine = "in una route API"): Response {
  // Si legge solo il codice: il boundary non dipende dalle classi dello strato di persistenza.
  if ((errore as { codice?: unknown } | null)?.codice === "DATABASE_NON_RAGGIUNGIBILE") {
    return rispostaErrore(
      503,
      "DATABASE_NON_RAGGIUNGIBILE",
      "Il database non è raggiungibile. Riprova più tardi.",
    );
  }
  console.error(`Errore ${origine}:`, errore instanceof Error ? errore.name : "");
  return rispostaErrore(500, "ERRORE_INTERNO", "Si è verificato un errore. Riprova più tardi.");
}

const NUMERO_DECIMALE = /^-?\d+(?:\.\d+)?$/;

/**
 * Parametro `zona` nel formato `latMin,lonMin,latMax,lonMax` (quattro numeri decimali); null se
 * manca o non ha quel formato. La validità della zona la controlla Gestione stalli.
 */
export function leggiZona(
  valore: string | null,
): { latMin: number; lonMin: number; latMax: number; lonMax: number } | null {
  const parti = valore?.split(",");
  if (!parti || parti.length !== 4 || !parti.every((parte) => NUMERO_DECIMALE.test(parte))) {
    return null;
  }
  const [latMin, lonMin, latMax, lonMax] = parti.map(Number);
  return { latMin, lonMin, latMax, lonMax };
}
