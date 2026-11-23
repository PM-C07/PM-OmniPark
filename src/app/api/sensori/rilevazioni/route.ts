// Ingresso delle rilevazioni dei sensori simulati (RF_IOT_1, UC_IOT_1).
import { osservatoreGestioneSoste } from "../../../../application/gestione-soste/facade.ts";
import {
  creaFacadeGestioneStalli,
  ErroreGestioneStalli,
} from "../../../../application/gestione-stalli/facade.ts";
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
    // La Facade si crea qui: il pool nasce alla prima richiesta, non all'import del modulo.
    const facade = creaFacadeGestioneStalli({ osservatori: [osservatoreGestioneSoste] });
    const stato = await facade.registraRilevazione({
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
