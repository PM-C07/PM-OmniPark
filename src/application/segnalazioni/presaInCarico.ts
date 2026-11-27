// Servizio Presa in carico (UC_OP_2, SCD_3 Aperta → Presa in carico, RF_OP_3; OMP-63,
// docs/test/cp_presaInCarico.md): in un'unica transazione, con la riga dell'Ausiliario in
// condivisione e quella della segnalazione bloccata. Due richieste simultanee si mettono in fila:
// la seconda trova la segnalazione già presa in carico. Una presa in carico ripetuta dallo stesso
// Ausiliario non cambia nulla e non è un errore (decisione D1).
import {
  dettaglioSegnalazione,
  prendiInCarico as prendiInCaricoNelDatabase,
  type SegnalazioneMappa,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import { segnalazioneBloccata } from "./bloccoSegnalazione.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";
import { ErroreSegnalazioni } from "./errori.ts";

/** Restituisce la segnalazione dopo la presa in carico (con il tipo di stallo). */
export async function prendiInCarico(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  segnalazione: number,
): Promise<SegnalazioneMappa> {
  return eseguiInTransazione(async (client) => {
    const dettaglio = await segnalazioneBloccata(client, ausiliario, segnalazione);
    if (dettaglio.stato === "CHIUSA") {
      throw new ErroreSegnalazioni("SEGNALAZIONE_GIA_CHIUSA");
    }
    if (dettaglio.stato === "PRESA_IN_CARICO") {
      if (dettaglio.ausiliarioId !== ausiliario) {
        throw new ErroreSegnalazioni("SEGNALAZIONE_PRESA_DA_ALTRI");
      }
      return segnalazioneDa(dettaglio);
    }
    await prendiInCaricoNelDatabase(client, segnalazione, ausiliario, contesto.orologio.adesso());
    const aggiornata = await dettaglioSegnalazione(client, segnalazione);
    if (!aggiornata) {
      throw new ErroreSegnalazioni("SEGNALAZIONE_INESISTENTE");
    }
    return segnalazioneDa(aggiornata);
  }, contesto.pool);
}

/** Solo i campi della mappa: niente ente, esito né assegnatario per esteso. */
function segnalazioneDa(dettaglio: SegnalazioneMappa): SegnalazioneMappa {
  return {
    id: dettaglio.id,
    stalloId: dettaglio.stalloId,
    numeroStallo: dettaglio.numeroStallo,
    latitudine: dettaglio.latitudine,
    longitudine: dettaglio.longitudine,
    stato: dettaglio.stato,
    motivo: dettaglio.motivo,
    targaRilevata: dettaglio.targaRilevata,
    dataEOraDellaLettura: dettaglio.dataEOraDellaLettura,
    ausiliarioId: dettaglio.ausiliarioId,
    ultimaModifica: dettaglio.ultimaModifica,
    tipoDiStallo: dettaglio.tipoDiStallo,
  };
}
