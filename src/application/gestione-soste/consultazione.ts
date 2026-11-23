// Servizio Consultazione: sosta in corso sullo stallo (SD_ANPR_1 2.1), soste attive dell'ente
// (SD_ADM_1 4.2) e soste in corso dell'Automobilista (np_01 «le mie soste»). Ogni lettura parte
// dall'allineamento temporale, così una sosta scaduta risulta Scaduta alla prima lettura.
import { riepilogoEnte } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  sostaInCorsoSuStallo,
  sosteInCorsoDiAutomobilista,
  type Sosta,
} from "../../persistence/accessoDati/walletSoste.ts";
import type { ContestoGestioneSoste } from "./contesto.ts";
import { ErroreGestioneSoste } from "./errori.ts";

function idValido(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

/** La sosta ATTIVA dello stallo, altrimenti la SCADUTA più recente; null se non ce ne sono. */
export async function sostaInCorso(
  contesto: ContestoGestioneSoste,
  stallo: number,
): Promise<Sosta | null> {
  await contesto.allineamento.allinea();
  return idValido(stallo) ? sostaInCorsoSuStallo(contesto.pool, stallo) : null;
}

/** Soste ATTIVA negli stalli delle aree dell'ente (RF_ADM_1). */
export async function contaSosteAttive(
  contesto: ContestoGestioneSoste,
  ente: number,
): Promise<number> {
  await contesto.allineamento.allinea();
  const riepilogo = idValido(ente) ? await riepilogoEnte(contesto.pool, ente) : null;
  if (!riepilogo) {
    throw new ErroreGestioneSoste("ENTE_INESISTENTE");
  }
  return riepilogo.sosteAttive;
}

/** Soste ATTIVA e SCADUTA dell'Automobilista, dalla più recente. */
export async function sosteDellAutomobilista(
  contesto: ContestoGestioneSoste,
  automobilista: number,
): Promise<Sosta[]> {
  await contesto.allineamento.allinea();
  return idValido(automobilista) ? sosteInCorsoDiAutomobilista(contesto.pool, automobilista) : [];
}
