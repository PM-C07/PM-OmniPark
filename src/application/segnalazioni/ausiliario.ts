// Controllo del richiedente per le operazioni dell'Ausiliario del Traffico (NRF_SIC_1, VD_18,
// VD_19): l'Ausiliario esiste ed è attivo, e opera solo sull'ente per cui lavora.
import type { ContestoSegnalazioni } from "./contesto.ts";
import { ErroreSegnalazioni } from "./errori.ts";

/** Restituisce l'ente dell'Ausiliario attivo; altrimenti AUSILIARIO_NON_ATTIVO. */
export async function enteDellAusiliario(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
): Promise<number> {
  const trovato = await contesto.utentiAccessi.trovaAusiliario(ausiliario);
  if (!trovato || trovato.statoDellAccount !== "ATTIVO") {
    throw new ErroreSegnalazioni("AUSILIARIO_NON_ATTIVO");
  }
  return trovato.enteId;
}

/** L'Ausiliario è attivo e l'ente richiesto è il suo; altrimenti l'errore corrispondente. */
export async function verificaEnteDellAusiliario(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  ente: number,
): Promise<void> {
  if ((await enteDellAusiliario(contesto, ausiliario)) !== ente) {
    throw new ErroreSegnalazioni("ENTE_NON_AMMESSO");
  }
}
