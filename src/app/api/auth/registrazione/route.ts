// Registrazione dell'Automobilista (RF_AUTH_1, UC_AUTH_1): account, prima targa, wallet e sessione.
import { componiSottosistemi } from "../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../_errori.ts";
import { leggiCorpoJson } from "../../_http.ts";
import { cookieDiSessione } from "../../_sessione.ts";

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const corpo = await leggiCorpoJson(richiesta);
    if (
      !corpo ||
      typeof corpo.email !== "string" ||
      typeof corpo.password !== "string" ||
      typeof corpo.targa !== "string"
    ) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    const sessione = await componiSottosistemi().utentiAccessi.registraAutomobilista(
      corpo.email,
      corpo.password,
      corpo.targa,
    );
    return Response.json(
      { utente: { id: sessione.utenteId, ruolo: sessione.ruolo, ente: sessione.enteId } },
      { status: 201, headers: { "set-cookie": cookieDiSessione(sessione.token) } },
    );
  });
}
