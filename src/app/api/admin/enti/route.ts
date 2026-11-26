// Elenco degli enti clienti per la panoramica (UC_ADM_1, SD_ADM_1 2.1-2.2), solo per l'Amministratore.
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { richiediSessione } from "../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, amministrazione } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_ADM_1", null, utentiAccessi);
    return Response.json({ enti: await amministrazione.enti() });
  });
}
