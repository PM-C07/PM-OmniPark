// Servizio Consultazione: sosta in corso sullo stallo (SD_ANPR_1 2.1), soste attive dell'ente
// (SD_ADM_1 4.2), soste in corso dell'Automobilista (np_01 «le mie soste») e della targa (riscontro
// ANPR, OMP-46). Ogni lettura parte
// dall'allineamento temporale, così una sosta scaduta risulta Scaduta alla prima lettura.
import type { PoolClient } from "pg";
import type { TipoDiStallo } from "../../persistence/accessoDati/stalliTariffe.ts";
import { riepilogoEnte } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import {
  sostaInCorsoSuStallo,
  sosteInCorsoDiAutomobilista,
  sosteInCorsoDiTarga,
  sostaPerTargaSuStallo,
  trovaSostaConStalloPerAggiornamento,
  type Sosta,
} from "../../persistence/accessoDati/walletSoste.ts";
import { formatoDellaFoto, type FormatoDellaFoto } from "./avvio.ts";
import { normalizzaTarga } from "../utenti-accessi/facade.ts";
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

/** Soste ATTIVA e SCADUTA del veicolo con la targa, su qualsiasi stallo, dalla più recente. */
export async function sosteInCorsoDellaTarga(
  contesto: ContestoGestioneSoste,
  targa: string,
): Promise<Sosta[]> {
  await contesto.allineamento.allinea();
  const targaNormalizzata = typeof targa === "string" ? normalizzaTarga(targa) : "";
  return targaNormalizzata === "" ? [] : sosteInCorsoDiTarga(contesto.pool, targaNormalizzata);
}

/**
 * La sosta più recente della targa sullo stallo, in qualsiasi stato, dopo l'allineamento temporale
 * (OMP-63, UC_OP_3 passo 2): per lo stato del pagamento di una segnalazione. null se non ce n'è.
 */
export async function sostaDellaTargaSulloStallo(
  contesto: ContestoGestioneSoste,
  targa: string,
  stallo: number,
): Promise<Sosta | null> {
  await contesto.allineamento.allinea();
  return idValido(stallo) && typeof targa === "string"
    ? sostaPerTargaSuStallo(contesto.pool, normalizzaTarga(targa), stallo)
    : null;
}

/** Sosta con stallo, ente e tipo della foto del permesso (OMP-63, verifica del permesso). */
export type SostaConPermesso = Sosta & {
  tipoDiStallo: TipoDiStallo;
  enteId: number;
  /** Dai primi byte della foto (formatoDellaFoto dell'avvio); null senza foto. */
  tipoDellaFoto: FormatoDellaFoto | null;
};

/**
 * La sosta con tipo di stallo, ente e tipo della foto, con la riga bloccata fino alla fine della
 * transazione del chiamante (OMP-63, UC_OP_5, SD_OP_5 2.1–2.3): la verifica del permesso controlla
 * stato e permesso senza corse. null se la sosta non esiste. Senza allineamento: chi la usa
 * confronta la scadenza con l'istante corrente (at(orario di scadenza) di SCD_2).
 */
export async function sostaConPermesso(
  sosta: number,
  esecutore: PoolClient,
): Promise<SostaConPermesso | null> {
  if (!idValido(sosta)) {
    return null;
  }
  const trovata = await trovaSostaConStalloPerAggiornamento(esecutore, sosta);
  return trovata
    ? {
        ...trovata,
        tipoDellaFoto: trovata.fotoDelPermesso ? formatoDellaFoto(trovata.fotoDelPermesso) : null,
      }
    : null;
}
