// Ingresso delle rilevazioni dei sensori simulati (RF_IOT_1, UC_IOT_1).
import { ErroreGestioneStalli } from "../../../../application/gestione-stalli/facade.ts";
import { componiSottosistemi } from "../../../_composizione.ts";
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
  if (
    !corpo ||
    typeof corpo.stallo !== "number" ||
    typeof corpo.presenza !== "boolean" ||
    !dataOra
  ) {
    const errore = new ErroreGestioneStalli("RILEVAZIONE_INCOMPLETA");
    return rispostaErrore(422, errore.codice, errore.message);
  }

  try {
    // Le Facade vengono dal punto unico di composizione: il pool nasce alla prima richiesta.
    const stato = await componiSottosistemi().gestioneStalli.registraRilevazione({
      stallo: corpo.stallo,
      presenza: corpo.presenza,
      dataOra,
    });
    return Response.json({ stato });
  } catch (errore) {
    if (errore instanceof ErroreGestioneStalli) {
      const status = errore.codice === "RILEVAZIONE_SUPERATA" ? 409 : 422;
      return rispostaErrore(status, errore.codice, errore.message);
    }
    return rispostaErroreImprevisto(errore);
  }
}
