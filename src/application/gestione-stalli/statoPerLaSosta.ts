// Servizio Stato per la sosta: stato e tariffa dello stallo, Non disponibile all'avvio della sosta
// e ripristino dello stato rilevato alla scadenza (SD_SOSTA_1, SD_SOSTA_7, SCD_1, RF_SOSTA_6).
// Con l'esecutore di una transazione del chiamante (Gestione soste) le operazioni sono atomiche
// con le sue scritture; senza, ciascuna apre una propria transazione.
import type { PoolClient } from "pg";
import {
  bloccaStallo,
  impostaStatoStallo,
  impostaStatoStalloSe,
  trovaStallo,
  type StatoStallo,
  type TipoDiStallo,
} from "../../persistence/accessoDati/stalliTariffe.ts";
import { nellaTransazione, notificaLiberazione, type ContestoGestioneStalli } from "./contesto.ts";
import { ErroreGestioneStalli } from "./errori.ts";
import { senzaRilevazioniRecenti } from "./rilevazioni.ts";

export type StatoETariffa = {
  stallo: number;
  tipoDiStallo: TipoDiStallo;
  stato: StatoStallo;
  tariffa: {
    costoOrario: number;
    orarioInizioVigenza: string;
    orarioFineVigenza: string;
    durataMassima: number;
  };
};

/** SD_SOSTA_1 2.1, 2.2, 3.1: stato, tipo e tariffa di base dello stallo. */
export async function statoETariffa(
  contesto: ContestoGestioneStalli,
  stallo: number,
  esecutore?: PoolClient,
): Promise<StatoETariffa> {
  const dettaglio = await trovaStallo(esecutore ?? contesto.pool, stallo);
  if (!dettaglio) {
    throw new ErroreGestioneStalli("STALLO_INESISTENTE");
  }
  const { costoOrario, orarioInizioVigenza, orarioFineVigenza, durataMassima } = dettaglio.tariffa;
  return {
    stallo: dettaglio.id,
    tipoDiStallo: dettaglio.tipoDiStallo,
    stato: dettaglio.stato,
    tariffa: { costoOrario, orarioInizioVigenza, orarioFineVigenza, durataMassima },
  };
}

/**
 * SD_SOSTA_1 6.3, evento avvioSosta di SCD_1: Occupato → Non disponibile, con un aggiornamento
 * condizionato allo stato Occupato (una rilevazione concorrente non viene sovrascritta).
 */
export async function impostaNonDisponibile(
  contesto: ContestoGestioneStalli,
  stallo: number,
  esecutore?: PoolClient,
): Promise<void> {
  await nellaTransazione(contesto, esecutore, async (client) => {
    if (await impostaStatoStalloSe(client, stallo, "OCCUPATO", "NON_DISPONIBILE")) {
      return;
    }
    const esiste = (await trovaStallo(client, stallo)) !== null;
    throw new ErroreGestioneStalli(esiste ? "STALLO_NON_OCCUPATO" : "STALLO_INESISTENTE");
  });
}

/**
 * SD_SOSTA_7 3.1–3.2, evento scadenzaSosta di SCD_1: da Non disponibile allo stato dell'ultima
 * rilevazione. Se lo stallo torna Libero notifica gli osservatori (entry / terminaSosta()).
 * Con adesso (dall'allineamento temporale, COD-23) e nessuna rilevazione da più di 60 s lo stallo
 * passa a Sconosciuto senza notifica: la sosta resta Scaduta (RF_IOT_2).
 */
export async function ripristinaStatoRilevato(
  contesto: ContestoGestioneStalli,
  stallo: number,
  esecutore?: PoolClient,
  adesso?: Date,
): Promise<StatoStallo> {
  return nellaTransazione(contesto, esecutore, async (client) => {
    const attuale = await bloccaStallo(client, stallo);
    if (!attuale) {
      throw new ErroreGestioneStalli("STALLO_INESISTENTE");
    }
    if (attuale.stato !== "NON_DISPONIBILE") {
      throw new ErroreGestioneStalli("STALLO_NON_IMPEGNATO");
    }
    const nuovoStato: StatoStallo =
      adesso !== undefined && senzaRilevazioniRecenti(attuale.dataEOraUltimaRilevazione, adesso)
        ? "SCONOSCIUTO"
        : attuale.occupazioneRilevata === "VEICOLO_PRESENTE"
          ? "OCCUPATO"
          : "LIBERO";
    await impostaStatoStallo(client, stallo, nuovoStato);
    if (nuovoStato === "LIBERO") {
      await notificaLiberazione(contesto, { stallo }, client);
    }
    return nuovoStato;
  });
}
