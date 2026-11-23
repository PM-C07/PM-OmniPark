// Servizio Conteggio: numero di stalli gestiti da un ente (RF_ADM_1, SD_ADM_1 4.2).
import { riepilogoEnte } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import type { ContestoGestioneStalli } from "./contesto.ts";
import { ErroreGestioneStalli } from "./errori.ts";

/** Stalli di tutte le aree di sosta dell'ente, in qualsiasi stato. */
export async function contaStalliGestiti(
  contesto: ContestoGestioneStalli,
  ente: number,
): Promise<number> {
  const riepilogo = await riepilogoEnte(contesto.pool, ente);
  if (!riepilogo) {
    throw new ErroreGestioneStalli("ENTE_INESISTENTE");
  }
  return riepilogo.stalliGestiti;
}
