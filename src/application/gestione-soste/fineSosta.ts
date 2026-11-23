// Fine della sosta (SCD_1 entry / terminaSosta() di Libero, sincronizzazione_eventi.md §1,
// UC_IOT_1 3.a2, UC_SOSTA_7 3.a1): Gestione soste osserva Gestione stalli.
import { terminaSosteScaduteDelloStallo } from "../../persistence/accessoDati/walletSoste.ts";
import type { OsservatoreStalli } from "../gestione-stalli/facade.ts";

/**
 * Quando lo stallo entra in Libero, porta a Terminata tutte le sue soste Scadute ed elimina
 * dichiarazione e foto (NRF_LEG_2), nella transazione di chi ha liberato lo stallo. Le soste
 * Attive non cambiano (VD_20): uno stallo con una sosta Attiva è Non disponibile e non si libera.
 */
export const osservatoreGestioneSoste: OsservatoreStalli = {
  async terminaSosta(evento, esecutore) {
    await terminaSosteScaduteDelloStallo(esecutore, evento.stallo);
  },
};
