// Controlli comuni di presa in carico, stato del pagamento e chiusura (OMP-63, RAD 0.6), dentro la
// transazione del chiamante e con le righe bloccate: prima la riga dell'Ausiliario in condivisione
// (FOR SHARE, verifica ATTIVO: vincolo per COD-22 di OMP-62, una disattivazione concorrente aspetta),
// poi la riga della segnalazione (FOR UPDATE). Sempre in quest'ordine, per evitare stalli.
import type { PoolClient } from "pg";
import {
  bloccaSegnalazione,
  type DettaglioSegnalazione,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { bloccaAusiliarioInCondivisione } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import { ErroreSegnalazioni } from "./errori.ts";

/**
 * Ausiliario attivo, segnalazione esistente e dello stesso ente (prima di rivelarne lo stato,
 * VD_18); altrimenti AUSILIARIO_NON_ATTIVO, SEGNALAZIONE_INESISTENTE o ENTE_NON_AMMESSO.
 */
export async function segnalazioneBloccata(
  client: PoolClient,
  ausiliario: number,
  segnalazione: number,
): Promise<DettaglioSegnalazione> {
  const richiedente =
    Number.isSafeInteger(ausiliario) && ausiliario > 0
      ? await bloccaAusiliarioInCondivisione(client, ausiliario)
      : null;
  if (!richiedente || richiedente.statoDellAccount !== "ATTIVO") {
    throw new ErroreSegnalazioni("AUSILIARIO_NON_ATTIVO");
  }
  const dettaglio =
    Number.isSafeInteger(segnalazione) && segnalazione > 0
      ? await bloccaSegnalazione(client, segnalazione)
      : null;
  if (!dettaglio) {
    throw new ErroreSegnalazioni("SEGNALAZIONE_INESISTENTE");
  }
  if (dettaglio.enteId !== richiedente.enteId) {
    throw new ErroreSegnalazioni("ENTE_NON_AMMESSO");
  }
  return dettaglio;
}

/**
 * Stato del pagamento e chiusura (RAD 0.6, UC_OP_3 e UC_OP_4): solo una segnalazione presa in
 * carico dallo stesso Ausiliario.
 */
export function verificaPresaDalRichiedente(
  dettaglio: DettaglioSegnalazione,
  ausiliario: number,
): void {
  if (dettaglio.stato === "APERTA") {
    throw new ErroreSegnalazioni("SEGNALAZIONE_NON_PRESA_IN_CARICO");
  }
  if (dettaglio.stato === "CHIUSA") {
    throw new ErroreSegnalazioni("SEGNALAZIONE_GIA_CHIUSA");
  }
  if (dettaglio.ausiliarioId !== ausiliario) {
    throw new ErroreSegnalazioni("SEGNALAZIONE_PRESA_DA_ALTRI");
  }
}
