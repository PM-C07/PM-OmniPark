// Servizio Mappa: stalli di una zona e stalli modificati dopo un istante (UC_STALLI_1,
// SD_STALLI_1, NRF_PER_3). L'aggiornamento della mappa interroga le modifiche dopo il cursore.
// Da OMP-48 le API usano fotografiaZona e variazioniDopo: cursore letto dal database e margine di
// 5 s (docs/test/cp_persistenza_stalli_tariffe.md §6); le due operazioni precedenti restano.
import { istanteDelDatabase } from "../../persistence/accessoDati/istante.ts";
import {
  stalliModificatiDopo as stalliModificatiDopoInZona,
  stalliNellaZona as stalliInZona,
  type StalloZona,
  type Zona,
} from "../../persistence/accessoDati/stalliTariffe.ts";
import type { ContestoGestioneStalli } from "./contesto.ts";
import { ErroreGestioneStalli } from "./errori.ts";

// Stessi limiti dei vincoli dello schema sulle coordinate dello stallo.
function verificaZona(zona: Zona): void {
  const { latMin, latMax, lonMin, lonMax } = zona;
  const valida =
    [latMin, latMax, lonMin, lonMax].every(Number.isFinite) &&
    latMin <= latMax &&
    lonMin <= lonMax &&
    latMin >= -90 &&
    latMax <= 90 &&
    lonMin >= -180 &&
    lonMax <= 180;
  if (!valida) {
    throw new ErroreGestioneStalli("ZONA_NON_VALIDA");
  }
}

/** Stalli della zona con tipo, stato, area e tariffa sintetica, ordinati per id. */
export async function stalliNellaZona(
  contesto: ContestoGestioneStalli,
  zona: Zona,
): Promise<StalloZona[]> {
  verificaZona(zona);
  return stalliInZona(contesto.pool, zona);
}

/**
 * Stalli della zona modificati dopo l'istante e cursore (massima ultimaModifica restituita, null se
 * nessuna), da usare come istante della richiesta successiva scartando i duplicati per id.
 */
export async function stalliModificatiDopo(
  contesto: ContestoGestioneStalli,
  zona: Zona,
  istante: Date,
): Promise<{ stalli: StalloZona[]; cursore: Date | null }> {
  verificaZona(zona);
  if (!(istante instanceof Date) || Number.isNaN(istante.getTime())) {
    throw new ErroreGestioneStalli("ISTANTE_NON_VALIDO");
  }
  return stalliModificatiDopoInZona(contesto.pool, zona, istante);
}

/**
 * Margine di sicurezza del cursore: una variazione confermata dopo la lettura precedente, da una
 * transazione iniziata prima del cursore da meno di 5 s, compare nella risposta successiva.
 */
export const MARGINE_CURSORE_MS = 5_000;

function verificaCursore(cursore: Date): void {
  if (!(cursore instanceof Date) || Number.isNaN(cursore.getTime())) {
    throw new ErroreGestioneStalli("ISTANTE_NON_VALIDO");
  }
}

/** Stalli della zona e cursore iniziale, letto dal database prima delle righe. */
export async function fotografiaZona(
  contesto: ContestoGestioneStalli,
  zona: Zona,
): Promise<{ stalli: StalloZona[]; cursore: Date }> {
  verificaZona(zona);
  const cursore = await istanteDelDatabase(contesto.pool);
  return { stalli: await stalliInZona(contesto.pool, zona), cursore };
}

/**
 * Stalli della zona modificati dopo il cursore meno il margine, per id, e nuovo cursore letto dal
 * database prima delle righe. Le righe già viste possono tornare: il chiamante le applica per id.
 */
export async function variazioniDopo(
  contesto: ContestoGestioneStalli,
  zona: Zona,
  cursore: Date,
): Promise<{ stalli: StalloZona[]; cursore: Date }> {
  verificaZona(zona);
  verificaCursore(cursore);
  const nuovoCursore = await istanteDelDatabase(contesto.pool);
  const { stalli } = await stalliModificatiDopoInZona(
    contesto.pool,
    zona,
    new Date(cursore.getTime() - MARGINE_CURSORE_MS),
  );
  return { stalli, cursore: nuovoCursore };
}
