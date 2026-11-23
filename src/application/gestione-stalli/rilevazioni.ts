// Servizio Rilevazioni: acquisizione delle rilevazioni dei sensori (UC_IOT_1, SD_IOT_1, SCD_1).
import {
  bloccaStallo,
  registraRilevazione as registraRilevazioneStallo,
  type OccupazioneRilevata,
  type StatoStallo,
} from "../../persistence/accessoDati/stalliTariffe.ts";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import { notificaLiberazione, type ContestoGestioneStalli } from "./contesto.ts";
import { ErroreGestioneStalli } from "./errori.ts";

export type RilevazioneRicevuta = {
  stallo?: number | null;
  presenza?: boolean | null;
  dataOra?: Date | null;
};

/**
 * Nuovo stato dopo una rilevazione (SCD_1): Non disponibile resta tale (transizione interna,
 * la sosta Attiva prevale); negli altri stati decide la presenza del veicolo.
 */
export function statoDopoRilevazione(statoAttuale: StatoStallo, presenza: boolean): StatoStallo {
  if (statoAttuale === "NON_DISPONIBILE") {
    return "NON_DISPONIBILE";
  }
  return presenza ? "OCCUPATO" : "LIBERO";
}

/**
 * Registra la rilevazione come ultima dello stallo, ne aggiorna lo stato e, se lo stallo entra in
 * Libero, notifica gli osservatori: tutto nella stessa transazione. Restituisce il nuovo stato.
 */
export async function registraRilevazione(
  contesto: ContestoGestioneStalli,
  rilevazione: RilevazioneRicevuta,
): Promise<StatoStallo> {
  const { stallo, presenza, dataOra } = rilevazione;
  // SD_IOT_1 2.1: completezza
  if (
    stallo === undefined ||
    stallo === null ||
    typeof presenza !== "boolean" ||
    !(dataOra instanceof Date) ||
    Number.isNaN(dataOra.getTime())
  ) {
    throw new ErroreGestioneStalli("RILEVAZIONE_INCOMPLETA");
  }
  // Una data futura diventerebbe l'ultima rilevazione e farebbe rifiutare quelle reali successive.
  if (dataOra.getTime() > contesto.orologio.adesso().getTime()) {
    throw new ErroreGestioneStalli("RILEVAZIONE_NON_VALIDA");
  }
  if (!Number.isSafeInteger(stallo) || stallo <= 0) {
    throw new ErroreGestioneStalli("STALLO_INESISTENTE");
  }

  return eseguiInTransazione(async (client) => {
    // SD_IOT_1 2.2: esistenza, con la riga bloccata fino alla fine della transazione
    const attuale = await bloccaStallo(client, stallo);
    if (!attuale) {
      throw new ErroreGestioneStalli("STALLO_INESISTENTE");
    }
    // Richieste fuori ordine: una rilevazione più vecchia dell'ultima non la sostituisce.
    if (
      attuale.dataEOraUltimaRilevazione &&
      dataOra.getTime() < attuale.dataEOraUltimaRilevazione.getTime()
    ) {
      throw new ErroreGestioneStalli("RILEVAZIONE_SUPERATA");
    }

    const nuovoStato = statoDopoRilevazione(attuale.stato, presenza);
    const occupazioneRilevata: OccupazioneRilevata = presenza
      ? "VEICOLO_PRESENTE"
      : "NESSUN_VEICOLO";
    // SD_IOT_1 3.1 e 3.3
    await registraRilevazioneStallo(client, stallo, {
      occupazioneRilevata,
      dataEOra: dataOra,
      stato: nuovoStato,
    });
    if (nuovoStato === "LIBERO" && attuale.stato !== "LIBERO") {
      await notificaLiberazione(contesto, { stallo }, client);
    }
    return nuovoStato;
  }, contesto.pool);
}
