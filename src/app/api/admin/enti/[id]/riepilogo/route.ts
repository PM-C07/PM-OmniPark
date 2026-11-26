// Riepilogo di un ente: stalli gestiti, soste attive e segnalazioni aperte (UC_ADM_1, SD_ADM_1
// 4.1-4.2, RF_ADM_1), solo per l'Amministratore.
import { componiSottosistemi } from "../../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../../_errori.ts";
import { leggiId } from "../../../../_http.ts";
import { richiediSessione } from "../../../../_sessione.ts";

export async function GET(
  richiesta: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, amministrazione } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_ADM_1", null, utentiAccessi);
    const ente = leggiId((await params).id);
    if (ente === null) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    return Response.json({ ente, ...(await amministrazione.riepilogo(ente)) });
  });
}
