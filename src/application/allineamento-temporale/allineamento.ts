// Allineamento temporale (attore Time, UC_SOSTA_7, SD_SOSTA_7): la piattaforma non tiene processi
// accesi, quindi le soste scadute si allineano quando qualcuno legge soste o stalli.
// Sta sopra Gestione stalli e sotto Gestione soste: scrive le soste tramite la persistenza (non la
// Facade di Gestione soste, che lo chiama) e riporta lo stallo allo stato rilevato tramite la Facade
// di Gestione stalli, creata dal chiamante con l'osservatore di Gestione soste.
import type { Pool } from "pg";
import { ottieniPool } from "../../persistence/db.ts";
import { ErroreDominio } from "../../persistence/accessoDati/errori.ts";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import {
  impostaSostaScadutaSeRaggiunta,
  sosteDaScadere,
  trovaSosta,
} from "../../persistence/accessoDati/walletSoste.ts";
import { ErroreGestioneStalli, type FacadeGestioneStalli } from "../gestione-stalli/facade.ts";
import { orologioDiSistema, type Orologio } from "../orologio.ts";

export type EsitoAllineamento = {
  /** Soste portate da ATTIVA a SCADUTA da questa chiamata, comprese le anomale. */
  sosteScadute: number[];
  /** Soste lasciate ATTIVA per un conflitto di concorrenza: le riprende la lettura successiva. */
  sosteInConflitto: number[];
  /** Sottoinsieme di sosteScadute: lo stallo non era Non disponibile ed è rimasto com'è. */
  sosteAnomale: number[];
};

export type AllineamentoTemporale = { allinea(): Promise<EsitoAllineamento> };

type ContestoAllineamento = {
  pool: Pool;
  orologio: Orologio;
  gestioneStalli: FacadeGestioneStalli;
};

type EsitoScadenza = "SCADUTA" | "ANOMALA" | "GIA_ALLINEATA";

/**
 * SD_SOSTA_7 1–3.3 per una sosta, in una transazione propria: ATTIVA → SCADUTA condizionato, poi
 * ripristino dello stato rilevato dello stallo. Se lo stallo torna Libero, la sosta passa a
 * Terminata tramite l'osservatore di Gestione soste, nella stessa transazione.
 */
export async function scadenzaRaggiunta(
  contesto: ContestoAllineamento,
  sosta: number,
): Promise<EsitoScadenza> {
  return eseguiInTransazione(async (client) => {
    // Un'altra transazione l'ha già fatta scadere, o un prolungamento ne ha spostato la scadenza
    // dopo l'istante dell'orologio: niente ripristino dello stallo.
    if (!(await impostaSostaScadutaSeRaggiunta(client, sosta, contesto.orologio.adesso()))) {
      return "GIA_ALLINEATA";
    }
    const scaduta = await trovaSosta(client, sosta);
    if (!scaduta) {
      return "GIA_ALLINEATA";
    }
    try {
      await contesto.gestioneStalli.ripristinaStatoRilevato(scaduta.stalloId, client);
    } catch (errore) {
      // Dati incoerenti (VD_6 violato): la sosta scade comunque, lo stallo resta com'è. L'errore
      // arriva prima di ogni scrittura sullo stallo, quindi la transazione è ancora utilizzabile.
      if (errore instanceof ErroreGestioneStalli && errore.codice === "STALLO_NON_IMPEGNATO") {
        return "ANOMALA";
      }
      throw errore;
    }
    return "SCADUTA";
  }, contesto.pool);
}

/** Porta a Scaduta tutte le soste ATTIVA con scadenza raggiunta all'istante dell'orologio. */
async function allinea(contesto: ContestoAllineamento): Promise<EsitoAllineamento> {
  const esito: EsitoAllineamento = { sosteScadute: [], sosteInConflitto: [], sosteAnomale: [] };
  const daScadere = await sosteDaScadere(contesto.pool, contesto.orologio.adesso());
  for (const sosta of daScadere) {
    try {
      const risultato = await scadenzaRaggiunta(contesto, sosta);
      if (risultato !== "GIA_ALLINEATA") {
        esito.sosteScadute.push(sosta);
      }
      if (risultato === "ANOMALA") {
        esito.sosteAnomale.push(sosta);
      }
    } catch (errore) {
      // Un conflitto non deve bloccare la lettura che ha avviato l'allineamento.
      if (errore instanceof ErroreDominio && errore.codice === "CONFLITTO_DI_CONCORRENZA") {
        esito.sosteInConflitto.push(sosta);
        continue;
      }
      throw errore;
    }
  }
  // COD-22 (RF_IOT_2): qui si aggiungerà il passaggio a Sconosciuto degli stalli senza rilevazioni
  // da più di 60 secondi (stalliSenzaRilevazioniDa della persistenza).
  return esito;
}

export function creaAllineamentoTemporale(dipendenze: {
  gestioneStalli: FacadeGestioneStalli;
  pool?: Pool;
  orologio?: Orologio;
}): AllineamentoTemporale {
  const contesto: ContestoAllineamento = {
    pool: dipendenze.pool ?? ottieniPool(),
    orologio: dipendenze.orologio ?? orologioDiSistema,
    gestioneStalli: dipendenze.gestioneStalli,
  };
  return { allinea: () => allinea(contesto) };
}
