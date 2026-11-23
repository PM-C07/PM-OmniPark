// Servizio Mappa: stalli di una zona e stalli modificati dopo un istante (UC_STALLI_1,
// SD_STALLI_1, NRF_PER_3). L'aggiornamento della mappa interroga le modifiche dopo il cursore.
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
