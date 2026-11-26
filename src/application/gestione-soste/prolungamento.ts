// Servizio Prolungamento (UC_SOSTA_2, SD_SOSTA_2, RF_SOSTA_2, RF_WALLET_2).
// Controlli e scritture in un'unica transazione, con la riga della sosta bloccata: due
// prolungamenti della stessa sosta si eseguono uno dopo l'altro, e l'allineamento temporale non
// fa scadere una sosta appena prolungata (aggiornamento condizionato all'orario di scadenza).
import type { PoolClient } from "pg";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import {
  aggiornaScadenza,
  trovaSosta,
  trovaSostaPerAggiornamento,
  type Sosta,
} from "../../persistence/accessoDati/walletSoste.ts";
import { ErroreWallet } from "../wallet/facade.ts";
import { DURATA_MINIMA, importoATariffa, orarioDiScadenza } from "./calcoloImporto.ts";
import type { ContestoGestioneSoste } from "./contesto.ts";
import { ErroreGestioneSoste } from "./errori.ts";

export type SostaProlungata = {
  sosta: number;
  orarioDiScadenza: Date;
  importo: number;
};

export type ImportoDelProlungamento = {
  importo: number;
  orarioDiScadenza: Date;
};

const MINUTO = 60_000;

function idValido(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/**
 * SD_SOSTA_2 2.1–3.2 sulla sosta già letta: proprietà, stato, tempo aggiuntivo, durata massima
 * della tariffa e importo aggiuntivo. Non scrive nulla.
 */
async function verificaECalcola(
  contesto: ContestoGestioneSoste,
  sosta: Sosta | null,
  automobilista: number,
  tempoAggiuntivo: number,
  esecutore?: PoolClient,
): Promise<ImportoDelProlungamento> {
  // La sosta di un altro Automobilista è trattata come inesistente (piano approvato, risposta 2).
  if (!sosta || sosta.automobilistaId !== automobilista) {
    throw new ErroreGestioneSoste("SOSTA_INESISTENTE");
  }
  if (sosta.stato === "TERMINATA") {
    throw new ErroreGestioneSoste("SOSTA_TERMINATA");
  }
  // UC_SOSTA_2 2.a1: Scaduta, oppure Attiva con scadenza raggiunta non ancora allineata.
  if (
    sosta.stato === "SCADUTA" ||
    sosta.orarioDiScadenza.getTime() <= contesto.orologio.adesso().getTime()
  ) {
    throw new ErroreGestioneSoste("SOSTA_SCADUTA");
  }

  if (!Number.isSafeInteger(tempoAggiuntivo) || tempoAggiuntivo < DURATA_MINIMA) {
    throw new ErroreGestioneSoste("DURATA_NON_VALIDA");
  }

  // UC_SOSTA_2 2.a2, VD_9: la durata complessiva resta entro la durata massima della tariffa.
  const { tariffa } = await contesto.gestioneStalli.statoETariffa(sosta.stalloId, esecutore);
  const durataAttuale = sosta.orarioDiScadenza.getTime() - sosta.orarioDiAvvio.getTime();
  const durataMassima = tariffa.durataMassima * MINUTO;
  if (durataAttuale + tempoAggiuntivo * MINUTO > durataMassima) {
    throw new ErroreGestioneSoste("DURATA_OLTRE_IL_MASSIMO", {
      tempoDisponibile: Math.max(0, Math.floor((durataMassima - durataAttuale) / MINUTO)),
    });
  }

  // Il pagamento è quello scritto all'avvio (VD_10): una sosta gratuita resta gratuita.
  const importo =
    sosta.pagamento === "GRATUITA" ? 0 : importoATariffa(tariffa.costoOrario, tempoAggiuntivo);
  return { importo, orarioDiScadenza: orarioDiScadenza(sosta.orarioDiScadenza, tempoAggiuntivo) };
}

/** SD_SOSTA_2 3.2–3.3: importo aggiuntivo e nuova scadenza, senza scritture. */
export async function calcolaImportoDelProlungamento(
  contesto: ContestoGestioneSoste,
  automobilista: number,
  sosta: number,
  tempoAggiuntivo: number,
): Promise<ImportoDelProlungamento> {
  await contesto.allineamento.allinea();
  if (!idValido(sosta)) {
    throw new ErroreGestioneSoste("SOSTA_INESISTENTE");
  }
  const letta = await trovaSosta(contesto.pool, sosta);
  return verificaECalcola(contesto, letta, automobilista, tempoAggiuntivo);
}

/**
 * SD_SOSTA_2: addebita l'importo aggiuntivo e posticipa la scadenza in un'unica transazione.
 * Con un errore, compreso il credito insufficiente (UC_SOSTA_2 5.a1), nulla cambia.
 */
export async function prolungaSosta(
  contesto: ContestoGestioneSoste,
  automobilista: number,
  sosta: number,
  tempoAggiuntivo: number,
): Promise<SostaProlungata> {
  await contesto.allineamento.allinea();
  if (!idValido(sosta)) {
    throw new ErroreGestioneSoste("SOSTA_INESISTENTE");
  }
  try {
    return await eseguiInTransazione(async (client) => {
      const bloccata = await trovaSostaPerAggiornamento(client, sosta);
      const { importo, orarioDiScadenza: nuovaScadenza } = await verificaECalcola(
        contesto,
        bloccata,
        automobilista,
        tempoAggiuntivo,
        client,
      );
      if (importo > 0) {
        await contesto.wallet.addebita(client, automobilista, importo, sosta);
      }
      // Con la riga bloccata e lo stato appena verificato l'aggiornamento non può fallire.
      if (!(await aggiornaScadenza(client, sosta, nuovaScadenza))) {
        throw new ErroreGestioneSoste("SOSTA_SCADUTA");
      }
      return { sosta, orarioDiScadenza: nuovaScadenza, importo };
    }, contesto.pool);
  } catch (errore) {
    if (errore instanceof ErroreWallet && errore.codice === "CREDITO_INSUFFICIENTE") {
      throw new ErroreGestioneSoste("CREDITO_INSUFFICIENTE", { cause: errore });
    }
    throw errore;
  }
}
