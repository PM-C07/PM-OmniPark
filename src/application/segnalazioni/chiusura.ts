// Servizio Chiusura con esito (UC_OP_4, SD_OP_4, RF_OP_6, SCD_3). Da OMP-63 (RAD 0.6) si chiude solo
// una segnalazione presa in carico dallo stesso Ausiliario: una Aperta va prima presa in carico
// (SEGNALAZIONE_NON_PRESA_IN_CARICO). I controlli si fanno in un'unica transazione con le righe
// bloccate (bloccoSegnalazione.ts), nello stesso ordine di OMP-46: Ausiliario attivo, segnalazione
// esistente, ente, esito, stato.
import {
  chiudiSegnalazione,
  type Esito,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import { segnalazioneBloccata, verificaPresaDalRichiedente } from "./bloccoSegnalazione.ts";
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
  await eseguiInTransazione(async (client) => {
    const dettaglio = await segnalazioneBloccata(client, ausiliario, segnalazione);
    if (typeof esito !== "string" || !ESITI.includes(esito)) {
      throw new ErroreSegnalazioni("ESITO_NON_VALIDO");
    }
    verificaPresaDalRichiedente(dettaglio, ausiliario);
    // La riga è bloccata: l'aggiornamento condizionato non può più fallire per una corsa.
    await chiudiSegnalazione(client, segnalazione, ausiliario, esito, contesto.orologio.adesso());
  }, contesto.pool);
}
