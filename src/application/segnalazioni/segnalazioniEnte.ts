// Servizio Segnalazioni dell'ente (UC_OP_1, SD_OP_1 2.1–2.2, RF_OP_1): segnalazioni non chiuse
// dell'ente e segnalazioni modificate dopo un istante, solo per un Ausiliario attivo di quell'ente.
// I permessi da verificare (RF_OP_2) restano alla COD-21.
import {
  segnalazioniModificateDopo as segnalazioniModificateDopoNellEnte,
  segnalazioniNonChiuseDellEnte,
  type SegnalazioneMappa,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { verificaEnteDellAusiliario } from "./ausiliario.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";
import { ErroreSegnalazioni } from "./errori.ts";

/** Segnalazioni Aperte e Prese in carico degli stalli dell'ente, per id. */
export async function segnalazioniNonChiuse(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  ente: number,
): Promise<SegnalazioneMappa[]> {
  await verificaEnteDellAusiliario(contesto, ausiliario, ente);
  return segnalazioniNonChiuseDellEnte(contesto.pool, ente);
}

/**
 * Segnalazioni dell'ente, in qualsiasi stato, modificate dopo l'istante, e cursore (massima
 * ultimaModifica restituita, null se nessuna) per la richiesta successiva.
 */
export async function segnalazioniModificateDopo(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  ente: number,
  istante: Date,
): Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date | null }> {
  await verificaEnteDellAusiliario(contesto, ausiliario, ente);
  if (!(istante instanceof Date) || Number.isNaN(istante.getTime())) {
    throw new ErroreSegnalazioni("ISTANTE_NON_VALIDO");
  }
  return segnalazioniModificateDopoNellEnte(contesto.pool, ente, istante);
}
