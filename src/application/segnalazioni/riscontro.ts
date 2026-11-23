// Servizio Riscontro ANPR (UC_ANPR_1, SD_ANPR_1, RF_ANPR_1, NRF_AFF_2): confronta la lettura di una
// targa con le soste dello stallo e della targa e, se serve, genera una segnalazione Aperta.
// Fasce orarie e tipo di stallo (SD_ANPR_1 2.2–2.3) sono fuori ambito fino alla COD-23.
import { ErroreDominio } from "../../persistence/accessoDati/errori.ts";
import {
  creaSegnalazioneDaLettura,
  esisteSegnalazioneNonChiusa,
  type Motivo,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import type { Sosta } from "../gestione-soste/facade.ts";
import { ErroreGestioneStalli } from "../gestione-stalli/facade.ts";
import { normalizzaTarga } from "../utenti-accessi/facade.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";
import { ErroreSegnalazioni } from "./errori.ts";

export type Lettura = { targa?: string | null; stallo?: number | null; dataOra?: Date | null };

export type EsitoRiscontro =
  | { esito: "NESSUNA_SEGNALAZIONE" }
  | { esito: "SEGNALAZIONE_CREATA"; segnalazione: number; motivo: Motivo }
  | { esito: "LETTURA_SCARTATA"; motivo: Motivo };

/** Stessa regola del vincolo segnalazione_targa_rilevata_normalizzata dello schema. */
const TARGA_RILEVABILE = /^[A-Z0-9]+$/;

type LetturaValida = { targa: string; stallo: number; dataOra: Date };

/** Controlli della lettura nell'ordine della specifica; restituisce la targa normalizzata. */
function verificaLettura(contesto: ContestoSegnalazioni, lettura: Lettura): LetturaValida {
  const { stallo, dataOra } = lettura;
  const targa = typeof lettura.targa === "string" ? normalizzaTarga(lettura.targa) : "";
  if (
    targa === "" ||
    stallo === undefined ||
    stallo === null ||
    !(dataOra instanceof Date) ||
    Number.isNaN(dataOra.getTime())
  ) {
    throw new ErroreSegnalazioni("LETTURA_INCOMPLETA");
  }
  if (!TARGA_RILEVABILE.test(targa)) {
    throw new ErroreSegnalazioni("TARGA_NON_VALIDA");
  }
  // Una segnalazione con la lettura nel futuro non si potrebbe più chiudere
  // (vincolo segnalazione_date_ordinate).
  if (dataOra.getTime() > contesto.orologio.adesso().getTime()) {
    throw new ErroreSegnalazioni("LETTURA_NON_VALIDA");
  }
  return { targa, stallo, dataOra };
}

async function verificaStallo(contesto: ContestoSegnalazioni, stallo: number): Promise<void> {
  if (!Number.isSafeInteger(stallo) || stallo <= 0) {
    throw new ErroreSegnalazioni("STALLO_INESISTENTE");
  }
  try {
    await contesto.gestioneStalli.statoETariffa(stallo);
  } catch (errore) {
    if (errore instanceof ErroreGestioneStalli && errore.codice === "STALLO_INESISTENTE") {
      throw new ErroreSegnalazioni("STALLO_INESISTENTE", { cause: errore });
    }
    throw errore;
  }
}

/**
 * Classificazione del piano approvato (priorità P1–P4): A sosta Attiva della targa sullo stallo;
 * S sosta Scaduta della targa sullo stallo; D sosta Attiva di un'altra targa sullo stallo;
 * X sosta Attiva della targa su un altro stallo. null = nessuna segnalazione.
 */
export function classificaLettura(
  targa: string,
  stallo: number,
  sostaSulloStallo: Sosta | null,
  sosteDellaTarga: readonly Sosta[],
): Motivo | null {
  const sulloStallo = sosteDellaTarga.filter((s) => s.stalloId === stallo);
  if (sulloStallo.some((s) => s.stato === "ATTIVA")) {
    return null; // P1
  }
  if (sulloStallo.some((s) => s.stato === "SCADUTA")) {
    return "SOSTA_SCADUTA"; // P2
  }
  const attivaDiAltraTarga =
    sostaSulloStallo?.stato === "ATTIVA" && sostaSulloStallo.targa !== targa;
  const attivaAltrove = sosteDellaTarga.some((s) => s.stato === "ATTIVA" && s.stalloId !== stallo);
  if (attivaDiAltraTarga || attivaAltrove) {
    return "TARGA_NON_CORRISPONDENTE"; // P3
  }
  return "SOSTA_ASSENTE"; // P4
}

/** SD_ANPR_1: elabora la lettura e restituisce l'esito del riscontro. */
export async function elaboraLettura(
  contesto: ContestoSegnalazioni,
  lettura: Lettura,
): Promise<EsitoRiscontro> {
  const { targa, stallo, dataOra } = verificaLettura(contesto, lettura);
  await verificaStallo(contesto, stallo);

  // Entrambe le letture partono dall'allineamento temporale di Gestione soste.
  const sostaSulloStallo = await contesto.gestioneSoste.sostaInCorso(stallo);
  const sosteDellaTarga = await contesto.gestioneSoste.sosteInCorsoDellaTarga(targa);
  const motivo = classificaLettura(targa, stallo, sostaSulloStallo, sosteDellaTarga);
  if (motivo === null) {
    return { esito: "NESSUNA_SEGNALAZIONE" };
  }

  // UC_ANPR_1 4.a1: al più una segnalazione non chiusa per targa (VD_16).
  if (await esisteSegnalazioneNonChiusa(contesto.pool, targa)) {
    return { esito: "LETTURA_SCARTATA", motivo };
  }
  try {
    const segnalazione = await creaSegnalazioneDaLettura(contesto.pool, {
      stalloId: stallo,
      targa,
      dataEOra: dataOra,
      motivo,
    });
    return { esito: "SEGNALAZIONE_CREATA", segnalazione, motivo };
  } catch (errore) {
    // Lettura concorrente della stessa targa: l'indice unico ferma la seconda.
    if (
      errore instanceof ErroreDominio &&
      errore.codice === "SEGNALAZIONE_NON_CHIUSA_GIA_PRESENTE"
    ) {
      return { esito: "LETTURA_SCARTATA", motivo };
    }
    throw errore;
  }
}
