// Servizio Stato del pagamento (UC_OP_3, RF_OP_4; OMP-63, docs/test/cp_statoDelPagamento.md): solo
// su una segnalazione presa in carico dallo stesso Ausiliario (RAD 0.6). La sosta è la più recente
// della targa rilevata sullo stallo della segnalazione, in qualsiasi stato, letta tramite la Facade
// di Gestione soste dopo l'allineamento temporale. Dichiarazione e foto del permesso non escono.
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import type { Pagamento, StatoSosta } from "../gestione-soste/facade.ts";
import { segnalazioneBloccata, verificaPresaDalRichiedente } from "./bloccoSegnalazione.ts";
import type { ContestoSegnalazioni } from "./contesto.ts";

export type StatoDelPagamento = {
  sosta: {
    stato: StatoSosta;
    orarioDiAvvio: Date;
    orarioDiScadenza: Date;
    pagamento: Pagamento;
  } | null;
};

export async function statoDelPagamento(
  contesto: ContestoSegnalazioni,
  ausiliario: number,
  segnalazione: number,
): Promise<StatoDelPagamento> {
  // I controlli si fanno con le righe bloccate; la lettura della sosta, dopo, in Gestione soste.
  const dettaglio = await eseguiInTransazione(async (client) => {
    const trovata = await segnalazioneBloccata(client, ausiliario, segnalazione);
    verificaPresaDalRichiedente(trovata, ausiliario);
    return trovata;
  }, contesto.pool);

  const sosta =
    dettaglio.targaRilevata === null
      ? null
      : await contesto.gestioneSoste.sostaDellaTargaSulloStallo(
          dettaglio.targaRilevata,
          dettaglio.stalloId,
        );
  return {
    sosta: sosta
      ? {
          stato: sosta.stato,
          orarioDiAvvio: sosta.orarioDiAvvio,
          orarioDiScadenza: sosta.orarioDiScadenza,
          pagamento: sosta.pagamento,
        }
      : null,
  };
}
