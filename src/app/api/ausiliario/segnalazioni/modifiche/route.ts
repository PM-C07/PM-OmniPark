// Variazioni delle segnalazioni dell'ente dopo il cursore (RF_OP_1, NRF_PER_3, issue #27): righe
// con ultima modifica successiva al cursore meno il margine di Segnalazioni e nuovo cursore.
import { ErroreSegnalazioni } from "../../../../../application/segnalazioni/facade.ts";
import { componiSottosistemi } from "../../../../_composizione.ts";
import { eseguiRoute } from "../../../_errori.ts";
import { leggiDataOra } from "../../../_http.ts";
import { richiediSessioneDellAusiliario } from "../../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessioneDellAusiliario(richiesta, "UC_OP_1", utentiAccessi);
    const dopo = leggiDataOra(new URL(richiesta.url).searchParams.get("dopo"));
    if (!dopo) {
      throw new ErroreSegnalazioni("ISTANTE_NON_VALIDO");
    }
    return Response.json(await segnalazioni.variazioniDopo(utente.utenteId, utente.enteId, dopo));
  });
}
