// Stato e tariffa di uno stallo (RF_STALLI_2, UC_STALLI_2), dopo l'allineamento temporale (RF_IOT_2).
import { componiSottosistemi } from "../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../_errori.ts";
import { leggiId } from "../../_http.ts";
import { richiediSessione } from "../../_sessione.ts";

export async function GET(
  richiesta: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneStalli, allineamento } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_STALLI_2", null, utentiAccessi);
    const id = leggiId((await params).id);
    if (id === null) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    await allineamento.allinea();
    return Response.json(await gestioneStalli.statoETariffa(id));
  });
}
