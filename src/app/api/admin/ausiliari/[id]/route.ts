// Modifica dell'account di un Ausiliario del Traffico: nome, cognome, email ed ente (UC_ADM_2,
// SD_ADM_2 7.1 aggiorna), solo per l'Amministratore.
import { componiSottosistemi } from "../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../_errori.ts";
import { leggiCorpoJson, leggiId } from "../../../_http.ts";
import { richiediSessione } from "../../../_sessione.ts";
import { leggiDatiAusiliario } from "../../_corpoAusiliario.ts";

export async function PUT(
  richiesta: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_ADM_2", null, utentiAccessi);
    const id = leggiId((await params).id);
    if (id === null) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    const dati = leggiDatiAusiliario(await leggiCorpoJson(richiesta));
    return Response.json({ ausiliario: await utentiAccessi.aggiornaAusiliario(id, dati) });
  });
}
