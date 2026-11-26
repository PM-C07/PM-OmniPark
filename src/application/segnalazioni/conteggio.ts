// Servizio Conteggio: segnalazioni aperte di un ente per la panoramica (RF_ADM_1, SD_ADM_1 4.2,
// OMP-62). «Aperte» sono tutte quelle non chiuse, Aperta e Presa in carico (UC_ADM_1, Regole di
// dominio; vincoli_dominio.md §1). L'autorizzazione dell'Amministratore la controlla la route.
import { riepilogoEnte } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";
import { ErroreSegnalazioni } from "./errori.ts";

export async function contaSegnalazioniAperte(
  contesto: ContestoSegnalazioni,
  ente: number,
): Promise<number> {
  const riepilogo =
    Number.isSafeInteger(ente) && ente > 0 ? await riepilogoEnte(contesto.pool, ente) : null;
  if (!riepilogo) {
    throw new ErroreSegnalazioni("ENTE_INESISTENTE");
  }
  return riepilogo.segnalazioniNonChiuse;
}
