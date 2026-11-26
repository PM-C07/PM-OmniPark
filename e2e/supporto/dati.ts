// Dati propri di ogni esecuzione dei test di sistema (docs/test/test_di_sistema.md §3): email,
// password, targhe e scelte degli stalli. Funzioni pure, salvo la generazione casuale.
import { randomBytes, randomInt } from "node:crypto";

const LETTERE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Identificativo dell'esecuzione: istante in base 36 e 4 caratteri casuali. */
export function nuovoIdEsecuzione(): string {
  return `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
}

export function emailDiProva(idEsecuzione: string, n: string | number): string {
  return `e2e.${idEsecuzione}.${n}@test.example`;
}

/** Password casuale dell'Automobilista di prova: vale solo per questa esecuzione. */
export function passwordDiProva(): string {
  return randomBytes(12).toString("base64url");
}

function lettera(): string {
  return LETTERE[randomInt(LETTERE.length)];
}

/** Targa nel formato AB123CD richiesto dalla registrazione, con la Z iniziale dei test. */
export function targaDiProva(): string {
  return `Z${lettera()}${String(randomInt(1000)).padStart(3, "0")}${lettera()}${lettera()}`;
}

/** Targa di una lettura ANPR senza registrazione: solo lettere maiuscole e cifre. */
export function targaAnpr(idEsecuzione: string, suffisso: string): string {
  return `E2E${idEsecuzione}${suffisso}`.toUpperCase();
}

/** Stalli dei test con le soste (Piazza Aubry n. 4…8), in ordine di preferenza. */
export const STALLI_PER_LE_SOSTE: readonly number[] = [17, 18, 19, 20, 21];
/** Stalli delle variazioni dei sensori: nessun test vi avvia soste. */
export const STALLI_PER_LE_VARIAZIONI: readonly number[] = [1, 3, 16];
/** Stalli delle letture ANPR (Via Raffaele Viviani). */
export const STALLI_PER_LE_LETTURE = { a: 7, b: 8, c: 9 } as const;
/** Stalli riservati delle soste con permesso (TS-14, Piazza Aubry n. 1 e 2). */
export const STALLI_RISERVATI = { disabili: 14, rosa: 15 } as const;

/** Primo stallo candidato senza una sosta in corso; null se sono tutti Non disponibili. */
export function primoStalloSenzaSosta<S extends { id: number; stato: string }>(
  stalli: readonly S[],
  candidati: readonly number[] = STALLI_PER_LE_SOSTE,
): S | null {
  for (const id of candidati) {
    const stallo = stalli.find((s) => s.id === id);
    if (stallo && stallo.stato !== "NON_DISPONIBILE") {
      return stallo;
    }
  }
  return null;
}

/** Presenza che cambia lo stato mostrato: «nessun veicolo» se Occupato, altrimenti «presente». */
export function presenzaOpposta(stato: string): boolean {
  return stato !== "OCCUPATO";
}

export type Variazione = {
  stallo: number;
  presenza: boolean;
  statoAtteso: "LIBERO" | "OCCUPATO";
  attesaMs: number;
};

/**
 * Variazioni a turno sugli stalli, ciascuna verso lo stato opposto all'ultimo, con l'attesa prima
 * di ogni invio (zero per il primo).
 */
export function pianoDiVariazioni(
  stalli: readonly { id: number; stato: string }[],
  quante: number,
  intervalloMs: number,
): Variazione[] {
  if (stalli.length === 0) {
    throw new Error("Nessuno stallo per le variazioni.");
  }
  const stati = new Map(stalli.map((s) => [s.id, s.stato]));
  return Array.from({ length: quante }, (_, i) => {
    const stallo = stalli[i % stalli.length].id;
    const presenza = presenzaOpposta(stati.get(stallo) ?? "");
    const statoAtteso = presenza ? "OCCUPATO" : "LIBERO";
    stati.set(stallo, statoAtteso);
    return { stallo, presenza, statoAtteso, attesaMs: i === 0 ? 0 : intervalloMs };
  });
}

export const MOTIVO_FUORI_FASCIA =
  "Non eseguito: fuori dalla fascia a pagamento degli stalli 17…21 (08:00–19:45, ora italiana), l'importo sarebbe zero.";

/** true tra le 08:00 e le 19:45 di Roma: un avvio ha un importo maggiore di zero. */
export function nellaFasciaAPagamento(istante: Date): boolean {
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(istante);
  const ore = Number(parti.find((p) => p.type === "hour")?.value);
  const minuti = Number(parti.find((p) => p.type === "minute")?.value);
  const totale = ore * 60 + minuti;
  return totale >= 8 * 60 && totale <= 19 * 60 + 45;
}

/** Centesimi da un importo mostrato come «1,50 €» (anche con lo spazio indivisibile). */
export function centesimiDa(testo: string): number {
  const trovato = /(\d+(?:\.\d{3})*),(\d{2})\s*€/u.exec(testo);
  if (!trovato) {
    throw new Error(`Importo non trovato in «${testo}».`);
  }
  return Number(trovato[1].replaceAll(".", "")) * 100 + Number(trovato[2]);
}
