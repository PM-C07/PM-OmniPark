// Istante del database (OMP-48): l'orologio dello stesso database che scrive ultima_modifica con
// now(). Serve come cursore delle variazioni di stalli e segnalazioni
// (docs/test/cp_persistenza_stalli_tariffe.md §6).
import { interroga, type Esecutore } from "./esecutore.ts";

/** now() del database: inizio della transazione o, fuori transazione, dell'istruzione. */
export async function istanteDelDatabase(es: Esecutore): Promise<Date> {
  const r = await interroga<{ istante: Date }>(es, "SELECT now() AS istante");
  return r.rows[0].istante;
}
