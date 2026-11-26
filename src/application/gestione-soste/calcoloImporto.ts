// Servizio Calcolo dell'importo (SD_SOSTA_1 2.2, 3.1–3.3, RF_WALLET_2, VD_9, VD_10).
// Fasce orarie e orari di vigenza sono fuori ambito (NRF_LEG_1, COD-23).
import type { Pagamento } from "../../persistence/accessoDati/walletSoste.ts";
import {
  ErroreGestioneStalli,
  type StatoETariffa,
  type TipoDiStallo,
} from "../gestione-stalli/facade.ts";
import type { ContestoGestioneSoste } from "./contesto.ts";
import { ErroreGestioneSoste } from "./errori.ts";

/** Durata minima della sosta in minuti (issue #9). */
export const DURATA_MINIMA = 15;

export type ImportoDellaSosta = {
  importo: number;
  pagamento: Pagamento;
  orarioDiScadenza: Date;
};

/**
 * Importo in centesimi: 0 e GRATUITA negli stalli per disabili; altrimenti costo orario × minuti / 60
 * arrotondato al centesimo con la metà verso l'alto, in aritmetica intera, e PAGATA.
 */
export function importoDellaSosta(
  tipoDiStallo: TipoDiStallo,
  costoOrario: number,
  durata: number,
): { importo: number; pagamento: Pagamento } {
  if (tipoDiStallo === "DISABILI") {
    return { importo: 0, pagamento: "GRATUITA" };
  }
  return { importo: importoATariffa(costoOrario, durata), pagamento: "PAGATA" };
}

/** Costo orario × minuti / 60, arrotondato al centesimo con la metà verso l'alto, in interi. */
export function importoATariffa(costoOrario: number, durata: number): number {
  return Math.floor((costoOrario * durata + 30) / 60);
}

/** Minuti interi tra la durata minima e la durata massima della tariffa, estremi inclusi. */
export function verificaDurata(durata: number, durataMassima: number): void {
  if (!Number.isSafeInteger(durata) || durata < DURATA_MINIMA || durata > durataMassima) {
    throw new ErroreGestioneSoste("DURATA_NON_VALIDA");
  }
}

export function orarioDiScadenza(avvio: Date, durata: number): Date {
  return new Date(avvio.getTime() + durata * 60_000);
}

/** Stato, tipo e tariffa dello stallo dalla Facade di Gestione stalli. */
export async function statoETariffaDelloStallo(
  contesto: ContestoGestioneSoste,
  stallo: number,
): Promise<StatoETariffa> {
  // Un id non intero non arriva alla query: lo stallo non può esistere.
  if (!Number.isSafeInteger(stallo) || stallo <= 0) {
    throw new ErroreGestioneSoste("STALLO_INESISTENTE");
  }
  try {
    return await contesto.gestioneStalli.statoETariffa(stallo);
  } catch (errore) {
    if (errore instanceof ErroreGestioneStalli && errore.codice === "STALLO_INESISTENTE") {
      throw new ErroreGestioneSoste("STALLO_INESISTENTE", { cause: errore });
    }
    throw errore;
  }
}

/** SD_SOSTA_1 3.2–3.3: importo, pagamento e orario di scadenza per la durata richiesta. */
export async function calcolaImporto(
  contesto: ContestoGestioneSoste,
  stallo: number,
  durata: number,
): Promise<ImportoDellaSosta> {
  const { tipoDiStallo, tariffa } = await statoETariffaDelloStallo(contesto, stallo);
  verificaDurata(durata, tariffa.durataMassima);
  return {
    ...importoDellaSosta(tipoDiStallo, tariffa.costoOrario, durata),
    orarioDiScadenza: orarioDiScadenza(contesto.orologio.adesso(), durata),
  };
}
