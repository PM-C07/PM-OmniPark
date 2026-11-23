// Servizio Chiusura con esito (UC_OP_4, SD_OP_4, RF_OP_6, SCD_3). La chiusura è un solo
// aggiornamento condizionato della persistenza: una segnalazione Aperta è assegnata e chiusa
// insieme, una Presa in carico si chiude solo dall'assegnatario. La rilettura dopo un rifiuto
// serve solo a scegliere il codice d'errore.
import {
  chiudiSegnalazione,
  dettaglioSegnalazione,
  type Esito,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { enteDellAusiliario } from "./ausiliario.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";
import { ErroreSegnalazioni } from "./errori.ts";

const ESITI: readonly string[] = ["SOSTA_IRREGOLARE_ACCERTATA", "NON_CONFERMATA"];

/** SD_OP_4: chiude la segnalazione con l'esito indicato dall'Ausiliario. */
export async function chiudi(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  segnalazione: number,
  esito: Esito,
): Promise<void> {
  const enteAusiliario = await enteDellAusiliario(contesto, ausiliario);
  const dettaglio = Number.isSafeInteger(segnalazione)
    ? await dettaglioSegnalazione(contesto.pool, segnalazione)
    : null;
  if (!dettaglio) {
    throw new ErroreSegnalazioni("SEGNALAZIONE_INESISTENTE");
  }
  // Prima dell'ente non si rivela lo stato della segnalazione (VD_18).
  if (dettaglio.enteId !== enteAusiliario) {
    throw new ErroreSegnalazioni("ENTE_NON_AMMESSO");
  }
  if (typeof esito !== "string" || !ESITI.includes(esito)) {
    throw new ErroreSegnalazioni("ESITO_NON_VALIDO");
  }

  const chiusa = await chiudiSegnalazione(
    contesto.pool,
    segnalazione,
    ausiliario,
    esito,
    contesto.orologio.adesso(),
  );
  if (chiusa) {
    return;
  }
  const attuale = await dettaglioSegnalazione(contesto.pool, segnalazione);
  if (attuale?.stato === "PRESA_IN_CARICO") {
    throw new ErroreSegnalazioni("SEGNALAZIONE_PRESA_DA_ALTRI");
  }
  throw new ErroreSegnalazioni("SEGNALAZIONE_GIA_CHIUSA");
}
