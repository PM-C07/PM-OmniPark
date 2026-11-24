// Targhe del profilo dell'Automobilista (RF_AUTH_5, UC_AUTH_5): elenco, aggiunta e rimozione.
import { componiSottosistemi } from "../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../_errori.ts";
import { leggiCorpoJson } from "../../_http.ts";
import { richiediSessione } from "../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_AUTH_5", null, utentiAccessi);
    return Response.json({ targhe: await utentiAccessi.targhe(utente.utenteId) });
  });
}

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_AUTH_5", null, utentiAccessi);
    const corpo = await leggiCorpoJson(richiesta);
    if (!corpo || typeof corpo.targa !== "string") {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    await utentiAccessi.aggiungiTarga(utente.utenteId, corpo.targa);
    return Response.json({ targhe: await utentiAccessi.targhe(utente.utenteId) }, { status: 201 });
  });
}

export async function DELETE(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_AUTH_5", null, utentiAccessi);
    const targa = new URL(richiesta.url).searchParams.get("targa");
    if (targa === null || targa === "") {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    await utentiAccessi.rimuoviTarga(utente.utenteId, targa);
    return Response.json({ targhe: await utentiAccessi.targhe(utente.utenteId) });
  });
}
