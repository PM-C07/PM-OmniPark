// Servizio Segnalazioni dell'ente (UC_OP_1, SD_OP_1 2.1–2.2, RF_OP_1): segnalazioni non chiuse
// dell'ente e segnalazioni modificate dopo un istante, solo per un Ausiliario attivo di quell'ente.
// I permessi da verificare (RF_OP_2) restano alla COD-21. Da OMP-48 le API usano
// fotografiaSegnalazioni e variazioniDopo: cursore letto dal database e margine di 5 s.
import { istanteDelDatabase } from "../../persistence/accessoDati/istante.ts";
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

/** Margine di sicurezza del cursore delle variazioni (docs/test/cp_persistenza_stalli_tariffe.md §6). */
export const MARGINE_CURSORE_MS = 5_000;

/** Segnalazioni non chiuse dell'ente e cursore iniziale, letto dal database prima delle righe. */
export async function fotografiaSegnalazioni(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  ente: number,
): Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date }> {
  await verificaEnteDellAusiliario(contesto, ausiliario, ente);
  const cursore = await istanteDelDatabase(contesto.pool);
  return { segnalazioni: await segnalazioniNonChiuseDellEnte(contesto.pool, ente), cursore };
}

/**
 * Segnalazioni dell'ente, in qualsiasi stato, modificate dopo il cursore meno il margine, per id, e
 * nuovo cursore letto dal database prima delle righe. Le righe già viste possono tornare.
 */
export async function variazioniDopo(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  ente: number,
  cursore: Date,
): Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date }> {
  await verificaEnteDellAusiliario(contesto, ausiliario, ente);
  if (!(cursore instanceof Date) || Number.isNaN(cursore.getTime())) {
    throw new ErroreSegnalazioni("ISTANTE_NON_VALIDO");
  }
  const nuovoCursore = await istanteDelDatabase(contesto.pool);
  const { segnalazioni } = await segnalazioniModificateDopoNellEnte(
    contesto.pool,
    ente,
    new Date(cursore.getTime() - MARGINE_CURSORE_MS),
  );
  return { segnalazioni, cursore: nuovoCursore };
}
