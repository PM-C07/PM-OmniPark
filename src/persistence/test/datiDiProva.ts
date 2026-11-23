// Dati di prova per i test sul database (npm run test:db) che nessuna funzione di accesso crea,
// perché nessun caso d'uso li prevede. Solo per i test: l'SQL resta nello strato di persistenza.
import { interroga, type Esecutore } from "../accessoDati/esecutore.ts";

/** Crea un ente preposto senza aree di sosta né stalli; restituisce l'id. */
export async function creaEnteDiProva(es: Esecutore, nome: string): Promise<number> {
  const r = await interroga<{ id: string }>(
    es,
    "INSERT INTO ente_preposto (nome) VALUES ($1) RETURNING id",
    [nome],
  );
  return Number(r.rows[0].id);
}
