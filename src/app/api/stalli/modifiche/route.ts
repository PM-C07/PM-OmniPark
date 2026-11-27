// Variazioni degli stalli di una zona dopo il cursore (NRF_PER_3, issue #27): righe con ultima
// modifica successiva al cursore meno il margine di Gestione stalli e nuovo cursore del database.
// L'allineamento temporale viene prima: un passaggio a Sconosciuto compare in questa risposta.
import { ErroreGestioneStalli } from "../../../../application/gestione-stalli/facade.ts";
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { leggiDataOra, leggiZona } from "../../_http.ts";
import { richiediSessione } from "../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneStalli, allineamento } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_STALLI_1", null, utentiAccessi);
    const parametri = new URL(richiesta.url).searchParams;
    const zona = leggiZona(parametri.get("zona"));
    if (!zona) {
      throw new ErroreGestioneStalli("ZONA_NON_VALIDA");
    }
    const dopo = leggiDataOra(parametri.get("dopo"));
    if (!dopo) {
      throw new ErroreGestioneStalli("ISTANTE_NON_VALIDO");
    }
    await allineamento.allinea();
    return Response.json(await gestioneStalli.variazioniDopo(zona, dopo));
  });
}
