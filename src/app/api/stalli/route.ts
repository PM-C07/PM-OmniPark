// Mappa degli stalli di una zona (RF_STALLI_1, UC_STALLI_1, SD_STALLI_1) con il cursore iniziale
// per le richieste periodiche di /api/stalli/modifiche (NRF_PER_3). Prima della lettura,
// l'allineamento temporale (soste scadute e stalli Sconosciuti, RF_IOT_2).
import { ErroreGestioneStalli } from "../../../application/gestione-stalli/facade.ts";
import { componiSottosistemi } from "../../_composizione.ts";
import { eseguiRoute } from "../_errori.ts";
import { leggiZona } from "../_http.ts";
import { richiediSessione } from "../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneStalli, allineamento } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_STALLI_1", null, utentiAccessi);
    const zona = leggiZona(new URL(richiesta.url).searchParams.get("zona"));
    if (!zona) {
      throw new ErroreGestioneStalli("ZONA_NON_VALIDA");
    }
    await allineamento.allinea();
    return Response.json(await gestioneStalli.fotografiaZona(zona));
  });
}
