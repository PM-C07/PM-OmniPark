// Ingresso delle letture della telecamera ANPR simulata (RF_ANPR_1, UC_ANPR_1).
import { creaFacadeGestioneSoste } from "../../../../application/gestione-soste/facade.ts";
import {
  creaFacadeSegnalazioni,
  ErroreSegnalazioni,
} from "../../../../application/segnalazioni/facade.ts";
import { creaFacadeWallet } from "../../../../application/wallet/facade.ts";
import { SimulatorePagamento } from "../../../../simulators/pagamento/simulatorePagamento.ts";
import {
  leggiCorpoJson,
  leggiDataOra,
  rispostaErrore,
  rispostaErroreImprevisto,
  rispostaTokenNonValido,
  tokenValido,
} from "../../_ingressoSimulatori.ts";

export async function POST(richiesta: Request): Promise<Response> {
  if (!tokenValido(richiesta)) {
    return rispostaTokenNonValido();
  }

  const corpo = await leggiCorpoJson(richiesta);
  const dataOra = leggiDataOra(corpo?.dataOra);
  if (!corpo || typeof corpo.targa !== "string" || typeof corpo.stallo !== "number" || !dataOra) {
    const errore = new ErroreSegnalazioni("LETTURA_INCOMPLETA");
    return rispostaErrore(422, errore.codice, errore.message);
  }

  try {
    // Le Facade si creano qui: il pool nasce alla prima richiesta, non all'import del modulo.
    const wallet = creaFacadeWallet({ pagamento: new SimulatorePagamento() });
    const gestioneSoste = creaFacadeGestioneSoste({ wallet });
    const esito = await creaFacadeSegnalazioni({ gestioneSoste }).elaboraLettura({
      targa: corpo.targa,
      stallo: corpo.stallo,
      dataOra,
    });
    return Response.json(esito);
  } catch (errore) {
    if (errore instanceof ErroreSegnalazioni) {
      return rispostaErrore(422, errore.codice, errore.message);
    }
    return rispostaErroreImprevisto(errore);
  }
}
