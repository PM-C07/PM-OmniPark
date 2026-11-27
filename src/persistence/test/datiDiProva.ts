// Dati di prova per i test sul database (npm run test:db) che nessuna funzione di accesso crea,
// perché nessun caso d'uso li prevede. Solo per i test: l'SQL resta nello strato di persistenza.
import { interroga, type Esecutore } from "../accessoDati/esecutore.ts";

/**
 * Porta all'istante dato l'ultima rilevazione di tutti gli stalli già rilevati, senza cambiarne
 * stato né occupazione (COD-23): con il timeout di 60 s di RF_IOT_2 i test che preparano stalli
 * Libero od Occupato hanno bisogno di rilevazioni recenti rispetto al loro orologio.
 */
export async function rilevazioniAllIstante(es: Esecutore, istante: Date): Promise<void> {
  await interroga(
    es,
    `UPDATE stallo SET data_e_ora_dell_ultima_rilevazione = $1
     WHERE data_e_ora_dell_ultima_rilevazione IS NOT NULL`,
    [istante],
  );
}

/** Crea un ente preposto senza aree di sosta né stalli; restituisce l'id. */
export async function creaEnteDiProva(es: Esecutore, nome: string): Promise<number> {
  const r = await interroga<{ id: string }>(
    es,
    "INSERT INTO ente_preposto (nome) VALUES ($1) RETURNING id",
    [nome],
  );
  return Number(r.rows[0].id);
}
