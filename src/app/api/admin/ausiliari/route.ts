// Elenco e creazione degli account degli Ausiliari del Traffico (UC_ADM_2, SD_ADM_2 2.1 e 7.1),
// solo per l'Amministratore. L'Amministratore della sessione «gestisce l'account di» chi crea.
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { leggiCorpoJson } from "../../_http.ts";
import { richiediSessione } from "../../_sessione.ts";
import { leggiDatiNuovoAusiliario } from "../_corpoAusiliario.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_ADM_2", null, utentiAccessi);
    return Response.json({ ausiliari: await utentiAccessi.ausiliariPerEnte() });
  });
}

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi } = componiSottosistemi();
    const amministratore = await richiediSessione(richiesta, "UC_ADM_2", null, utentiAccessi);
    const dati = leggiDatiNuovoAusiliario(await leggiCorpoJson(richiesta));
    const ausiliario = await utentiAccessi.creaAusiliario(amministratore.utenteId, dati);
    return Response.json({ ausiliario }, { status: 201 });
  });
}
