// Logica del prolungamento nella sosta in corso (OMP-61, docs/test/cp_prolungamentoInterfaccia.md,
// UC_SOSTA_2, RF_SOSTA_2): tempo ancora prolungabile entro la durata massima della tariffa, opzioni
// e tempo proposto (come la durata dell'avvio), disponibilità di «Prolunga», campi degli errori e
// messaggio di conferma. Il server resta l'autorità su ogni controllo.
import { durataPredefinita, opzioniDurata, type Disponibilita } from "./avvioSosta.ts";
import { formattaOra } from "./importi.ts";

const MINUTO_MS = 60_000;

/** Minuti ancora prolungabili: durata massima − (scadenza − avvio), per difetto, mai negativi. */
export function tempoDisponibile(
  durataMassima: number,
  orarioDiAvvio: string,
  orarioDiScadenza: string,
): number {
  const durataAttuale = (Date.parse(orarioDiScadenza) - Date.parse(orarioDiAvvio)) / MINUTO_MS;
  return Math.max(0, Math.floor(durataMassima - durataAttuale));
}

/** Tempi aggiuntivi sceglibili, come le durate dell'avvio: nessuno sotto i 15 minuti disponibili. */
export function opzioniProlungamento(
  durataMassima: number,
  orarioDiAvvio: string,
  orarioDiScadenza: string,
): number[] {
  return opzioniDurata(tempoDisponibile(durataMassima, orarioDiAvvio, orarioDiScadenza));
}

/** Tempo aggiuntivo già proposto: 60 minuti, o il disponibile se è minore; null sotto i 15. */
export function tempoAggiuntivoProposto(
  durataMassima: number,
  orarioDiAvvio: string,
  orarioDiScadenza: string,
): number | null {
  return durataPredefinita(tempoDisponibile(durataMassima, orarioDiAvvio, orarioDiScadenza));
}

/**
 * «Prolunga» solo su una sosta mostrata Attiva con almeno un tempo aggiuntivo (UC_SOSTA_2, entry
 * condition e 2.a2); su una sosta Scaduta il motivo di 2.a1. I testi sono quelli del server.
 */
export function disponibilitaProlungamento(
  statoMostrato: string,
  opzioni: readonly number[],
): Disponibilita {
  if (statoMostrato === "SCADUTA") {
    return {
      disponibile: false,
      motivo: "La sosta è scaduta e non si può prolungare: puoi avviarne una nuova.",
    };
  }
  if (statoMostrato !== "ATTIVA") {
    return { disponibile: false, motivo: "La sosta non si può prolungare." };
  }
  return opzioni.length > 0
    ? { disponibile: true }
    : {
        disponibile: false,
        motivo:
          "La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo.",
      };
}

/** Codici di GET e POST /api/soste/<id>/prolungamento → campo del pannello; gli altri su "generale". */
export const CAMPI_PROLUNGAMENTO: Readonly<Record<string, string>> = {
  CREDITO_INSUFFICIENTE: "credito",
  DURATA_OLTRE_IL_MASSIMO: "tempo",
  DURATA_NON_VALIDA: "tempo",
};

/** Conferma di UC_SOSTA_2 passo 6: «Sosta prolungata: scade alle 11:42.». */
export function messaggioProlungata(orarioDiScadenza: string): string {
  return `Sosta prolungata: scade alle ${formattaOra(orarioDiScadenza)}.`;
}
