// Accesso con le credenziali (RF_AUTH_4, UC_AUTH_4): apre la sessione e imposta il cookie.
import { componiSottosistemi } from "../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../_errori.ts";
import { leggiCorpoJson } from "../../_http.ts";
import { cookieDiSessione } from "../../_sessione.ts";

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const corpo = await leggiCorpoJson(richiesta);
    if (!corpo || typeof corpo.email !== "string" || typeof corpo.password !== "string") {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    const sessione = await componiSottosistemi().utentiAccessi.accedi(corpo.email, corpo.password);
    return Response.json(
      { utente: { id: sessione.utenteId, ruolo: sessione.ruolo, ente: sessione.enteId } },
      { headers: { "set-cookie": cookieDiSessione(sessione.token) } },
    );
  });
}
