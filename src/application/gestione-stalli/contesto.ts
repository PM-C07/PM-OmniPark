// Contesto del sottosistema Gestione stalli e notifica della liberazione (pattern Observer).
// Gli osservatori arrivano alla Facade quando la si crea: nessun registro globale, ogni richiesta
// ricostruisce la Facade.
import type { Pool, PoolClient } from "pg";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";

/** Evento terminaSosta di SCD_1: lo stallo è entrato nello stato Libero. */
export type StalloLiberato = { stallo: number };

/**
 * Interessato alla liberazione di uno stallo (per esempio Gestione soste, che porta a Terminata
 * le soste Scadute dello stallo). Riceve l'esecutore della transazione in corso: le sue scritture
 * sono atomiche con il cambio di stato; se lancia un errore, tutto è annullato.
 */
export type OsservatoreStalli = {
  terminaSosta(evento: StalloLiberato, esecutore: PoolClient): Promise<void>;
};

export type ContestoGestioneStalli = {
  pool: Pool;
  osservatori: readonly OsservatoreStalli[];
};

/** Notifica gli osservatori in ordine; il primo errore interrompe e risale invariato. */
export async function notificaLiberazione(
  contesto: ContestoGestioneStalli,
  evento: StalloLiberato,
  esecutore: PoolClient,
): Promise<void> {
  for (const osservatore of contesto.osservatori) {
    await osservatore.terminaSosta(evento, esecutore);
  }
}

/** Esegue l'operazione nella transazione del chiamante, se indicata, altrimenti in una propria. */
export function nellaTransazione<T>(
  contesto: ContestoGestioneStalli,
  esecutore: PoolClient | undefined,
  operazione: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return esecutore ? operazione(esecutore) : eseguiInTransazione(operazione, contesto.pool);
}
