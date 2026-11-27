// Servizio Verifica del permesso (UC_OP_5, SD_OP_5, RF_OP_2, RF_OP_5; OMP-63, CR_01,
// docs/test/cp_verificaPermesso.md): elenco dei permessi da verificare dell'ente, foto del permesso
// e registrazione dell'esito. La sosta si legge tramite la Facade di Gestione soste, con la riga
// bloccata nella transazione; l'API usa l'id della sosta (nota di SD_OP_5). Con esito non conforme
// la segnalazione nasce Chiusa e accertata nella stessa transazione della verifica (VD_13, SCD_3).
import type { PoolClient } from "pg";
import { ErroreDominio } from "../../persistence/accessoDati/errori.ts";
import {
  creaSegnalazioneDaVerifica,
  permessiDaVerificare as permessiDaVerificareDellEnte,
  registraVerifica,
  type EsitoVerifica,
  type PermessoDaVerificare,
} from "../../persistence/accessoDati/segnalazioniVerifiche.ts";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import { bloccaAusiliarioInCondivisione } from "../../persistence/accessoDati/utentiEntiVeicoli.ts";
import type { SostaConPermesso } from "../gestione-soste/facade.ts";
import { enteDellAusiliario } from "./ausiliario.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";
import { ErroreSegnalazioni } from "./errori.ts";

export type { EsitoVerifica, PermessoDaVerificare };

const ESITI_VERIFICA: readonly string[] = ["CONFORME", "NON_CONFORME"];
const STALLI_RISERVATI: readonly string[] = ["DISABILI", "ROSA"];

/** Permessi da verificare dell'ente dell'Ausiliario attivo (UC_OP_1 passo 2, VD derivato RF_OP_2). */
export async function permessiDaVerificare(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
): Promise<PermessoDaVerificare[]> {
  const ente = await enteDellAusiliario(contesto, ausiliario);
  return permessiDaVerificareDellEnte(contesto.pool, ente, contesto.orologio.adesso());
}

/**
 * Controlli comuni a foto ed esito, dentro la transazione del chiamante: Ausiliario attivo (riga in
 * condivisione, come la presa in carico), sosta esistente (bloccata), stesso ente prima di rivelarne
 * lo stato (VD_18), stallo riservato, sosta Attiva con scadenza non raggiunta (UC_OP_5 2.a1,
 * NRF_LEG_2), dichiarazione e foto presenti.
 */
async function sostaConPermessoAttiva(
  contesto: ContestoSegnalazioni,
  client: PoolClient,
  ausiliario: number,
  sosta: number,
  verificaEsito?: () => void,
): Promise<SostaConPermesso> {
  const richiedente =
    Number.isSafeInteger(ausiliario) && ausiliario > 0
      ? await bloccaAusiliarioInCondivisione(client, ausiliario)
      : null;
  if (!richiedente || richiedente.statoDellAccount !== "ATTIVO") {
    throw new ErroreSegnalazioni("AUSILIARIO_NON_ATTIVO");
  }
  verificaEsito?.();
  const trovata = await contesto.gestioneSoste.sostaConPermesso(sosta, client);
  if (!trovata) {
    throw new ErroreSegnalazioni("SOSTA_INESISTENTE");
  }
  if (trovata.enteId !== richiedente.enteId) {
    throw new ErroreSegnalazioni("ENTE_NON_AMMESSO");
  }
  if (!STALLI_RISERVATI.includes(trovata.tipoDiStallo)) {
    throw new ErroreSegnalazioni("NESSUN_PERMESSO_DA_VERIFICARE");
  }
  if (
    trovata.stato !== "ATTIVA" ||
    trovata.orarioDiScadenza.getTime() <= contesto.orologio.adesso().getTime()
  ) {
    throw new ErroreSegnalazioni("SOSTA_NON_ATTIVA");
  }
  if (trovata.dichiarazioneDiPermesso === null || trovata.fotoDelPermesso === null) {
    throw new ErroreSegnalazioni("NESSUN_PERMESSO_DA_VERIFICARE");
  }
  return trovata;
}

/**
 * Foto del permesso con il tipo ricavato dai primi byte (UC_OP_5 passo 2). Disponibile solo finché
 * la sosta è Attiva, anche dopo la verifica (NRF_LEG_2: mai a sosta terminata).
 */
export async function fotoDelPermesso(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  sosta: number,
): Promise<{ dati: Buffer; tipo: "image/jpeg" | "image/png" }> {
  const trovata = await eseguiInTransazione(
    (client) => sostaConPermessoAttiva(contesto, client, ausiliario, sosta),
    contesto.pool,
  );
  if (!trovata.fotoDelPermesso || !trovata.tipoDellaFoto) {
    throw new ErroreSegnalazioni("NESSUN_PERMESSO_DA_VERIFICARE");
  }
  return { dati: trovata.fotoDelPermesso, tipo: trovata.tipoDellaFoto };
}

/**
 * Registra l'esito della verifica (UC_OP_5 passi 3–4, SD_OP_5 4.1–4.3) in un'unica transazione; con
 * esito non conforme crea la segnalazione Chiusa con esito accertato, assegnata all'Ausiliario,
 * senza targa rilevata (4.a1, VD_13). Vale il primo esito registrato (4.a2, VD_12).
 */
export async function registraEsitoVerifica(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  sosta: number,
  esito: EsitoVerifica,
): Promise<{ verifica: number; segnalazione: number | null }> {
  return eseguiInTransazione(async (client) => {
    const trovata = await sostaConPermessoAttiva(contesto, client, ausiliario, sosta, () => {
      if (typeof esito !== "string" || !ESITI_VERIFICA.includes(esito)) {
        throw new ErroreSegnalazioni("ESITO_VERIFICA_NON_VALIDO");
      }
    });
    const dataEOra = contesto.orologio.adesso();
    let verifica: number;
    try {
      verifica = await registraVerifica(client, {
        sostaId: trovata.id,
        ausiliarioId: ausiliario,
        esito,
        dataEOra,
      });
    } catch (errore) {
      if (errore instanceof ErroreDominio && errore.codice === "VERIFICA_GIA_REGISTRATA") {
        throw new ErroreSegnalazioni("VERIFICA_GIA_REGISTRATA", { cause: errore });
      }
      throw errore;
    }
    const segnalazione =
      esito === "NON_CONFORME"
        ? await creaSegnalazioneDaVerifica(client, {
            verificaId: verifica,
            stalloId: trovata.stalloId,
            ausiliarioId: ausiliario,
            dataEOra,
          })
        : null;
    return { verifica, segnalazione };
  }, contesto.pool);
}
