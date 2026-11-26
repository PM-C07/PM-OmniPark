// Servizio Panoramica degli enti (control :ControlloRiepilogoEnti, UC_ADM_1, SD_ADM_1, RF_ADM_1):
// elenco degli enti e, per ciascuno, stalli gestiti, soste attive e segnalazioni aperte, ottenuti
// dalle Facade di Gestione stalli, Gestione soste (dopo l'allineamento temporale) e Segnalazioni.
import type { Pool } from "pg";
import { enti as entiPreposti } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import type { FacadeGestioneSoste } from "../gestione-soste/facade.ts";
import type { FacadeGestioneStalli } from "../gestione-stalli/facade.ts";
import type { FacadeSegnalazioni } from "../segnalazioni/facade.ts";
import { ErroreAmministrazione } from "./errori.ts";

export type ContestoAmministrazione = {
  pool: Pool;
  gestioneStalli: FacadeGestioneStalli;
  gestioneSoste: FacadeGestioneSoste;
  segnalazioni: FacadeSegnalazioni;
};

export type Ente = { id: number; nome: string };

export type RiepilogoDellEnte = {
  stalliGestiti: number;
  sosteAttive: number;
  segnalazioniAperte: number;
};

/** SD_ADM_1 2.1: enti preposti, per nome e id; elenco vuoto se non ce ne sono (2.a1). */
export function enti(contesto: ContestoAmministrazione): Promise<Ente[]> {
  return entiPreposti(contesto.pool);
}

/** SD_ADM_1 4.1–4.2: i tre valori del riepilogo; ENTE_INESISTENTE se l'ente non c'è. */
export async function riepilogo(
  contesto: ContestoAmministrazione,
  ente: number,
): Promise<RiepilogoDellEnte> {
  const esiste =
    Number.isSafeInteger(ente) &&
    ente > 0 &&
    (await entiPreposti(contesto.pool)).some((e) => e.id === ente);
  if (!esiste) {
    throw new ErroreAmministrazione("ENTE_INESISTENTE");
  }
  const [stalliGestiti, sosteAttive, segnalazioniAperte] = await Promise.all([
    contesto.gestioneStalli.contaStalliGestiti(ente),
    contesto.gestioneSoste.contaSosteAttive(ente),
    contesto.segnalazioni.contaSegnalazioniAperte(ente),
  ]);
  return { stalliGestiti, sosteAttive, segnalazioniAperte };
}
