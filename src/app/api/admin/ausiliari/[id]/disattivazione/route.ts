// Disattivazione dell'account di un Ausiliario al posto dell'eliminazione (UC_ADM_2 3.a1 e 3.a2,
// SD_ADM_2, VD_19), solo per l'Amministratore. La conferma la chiede la schermata.
import { componiSottosistemi } from "../../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../../_errori.ts";
import { leggiId } from "../../../../_http.ts";
import { richiediSessione } from "../../../../_sessione.ts";

export async function POST(
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
    return Response.json({ ausiliario: await utentiAccessi.disattivaAusiliario(id) });
  });
}
