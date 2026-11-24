// Facade del sottosistema Gestione stalli: l'unico punto usato dagli altri sottosistemi.
import type { Pool, PoolClient } from "pg";
import { ottieniPool } from "../../persistence/db.ts";
import type {
  StatoStallo,
  StalloZona,
  TipoDiStallo,
  Zona,
} from "../../persistence/accessoDati/stalliTariffe.ts";
import { orologioDiSistema, type Orologio } from "../orologio.ts";
import type { ContestoGestioneStalli, OsservatoreStalli, StalloLiberato } from "./contesto.ts";
import { contaStalliGestiti } from "./conteggio.ts";
import { fotografiaZona, stalliModificatiDopo, stalliNellaZona, variazioniDopo } from "./mappa.ts";
import { registraRilevazione, type RilevazioneRicevuta } from "./rilevazioni.ts";
import {
  impostaNonDisponibile,
  ripristinaStatoRilevato,
  statoETariffa,
  type StatoETariffa,
} from "./statoPerLaSosta.ts";

export { ErroreGestioneStalli, type CodiceErroreGestioneStalli } from "./errori.ts";
export type {
  OsservatoreStalli,
  RilevazioneRicevuta,
  StalloLiberato,
  StalloZona,
  StatoETariffa,
  StatoStallo,
  TipoDiStallo,
  Zona,
};

export type FacadeGestioneStalli = {
  // Rilevazioni (UC_IOT_1, SD_IOT_1)
  registraRilevazione(rilevazione: RilevazioneRicevuta): Promise<StatoStallo>;
  // Mappa (UC_STALLI_1, SD_STALLI_1, NRF_PER_3)
  stalliNellaZona(zona: Zona): Promise<StalloZona[]>;
  stalliModificatiDopo(
    zona: Zona,
    istante: Date,
  ): Promise<{ stalli: StalloZona[]; cursore: Date | null }>;
  // Mappa con il cursore del database e il margine di 5 s (OMP-48, usate dalle API)
  fotografiaZona(zona: Zona): Promise<{ stalli: StalloZona[]; cursore: Date }>;
  variazioniDopo(zona: Zona, cursore: Date): Promise<{ stalli: StalloZona[]; cursore: Date }>;
  // Stato per la sosta (SD_SOSTA_1, SD_SOSTA_7, RF_SOSTA_6)
  statoETariffa(stallo: number, esecutore?: PoolClient): Promise<StatoETariffa>;
  impostaNonDisponibile(stallo: number, esecutore?: PoolClient): Promise<void>;
  ripristinaStatoRilevato(stallo: number, esecutore?: PoolClient): Promise<StatoStallo>;
  // Conteggio (RF_ADM_1, SD_ADM_1)
  contaStalliGestiti(ente: number): Promise<number>;
};

/** Gli osservatori si passano qui: nessun registro globale, ogni richiesta ricrea la Facade. */
export function creaFacadeGestioneStalli(
  dipendenze: {
    pool?: Pool;
    osservatori?: readonly OsservatoreStalli[];
    orologio?: Orologio;
  } = {},
): FacadeGestioneStalli {
  const contesto: ContestoGestioneStalli = {
    pool: dipendenze.pool ?? ottieniPool(),
    osservatori: [...(dipendenze.osservatori ?? [])],
    orologio: dipendenze.orologio ?? orologioDiSistema,
  };
  return {
    registraRilevazione: (rilevazione) => registraRilevazione(contesto, rilevazione),
    stalliNellaZona: (zona) => stalliNellaZona(contesto, zona),
    stalliModificatiDopo: (zona, istante) => stalliModificatiDopo(contesto, zona, istante),
    fotografiaZona: (zona) => fotografiaZona(contesto, zona),
    variazioniDopo: (zona, cursore) => variazioniDopo(contesto, zona, cursore),
    statoETariffa: (stallo, esecutore) => statoETariffa(contesto, stallo, esecutore),
    impostaNonDisponibile: (stallo, esecutore) =>
      impostaNonDisponibile(contesto, stallo, esecutore),
    ripristinaStatoRilevato: (stallo, esecutore) =>
      ripristinaStatoRilevato(contesto, stallo, esecutore),
    contaStalliGestiti: (ente) => contaStalliGestiti(contesto, ente),
  };
}
