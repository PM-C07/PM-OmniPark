// Segnalazioni non chiuse dell'ente dell'Ausiliario (RF_OP_1, UC_OP_1, SD_OP_1) con il cursore
// iniziale per le richieste periodiche di /api/ausiliario/segnalazioni/modifiche.
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { richiediSessioneDellAusiliario } from "../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessioneDellAusiliario(richiesta, "UC_OP_1", utentiAccessi);
    return Response.json(await segnalazioni.fotografiaSegnalazioni(utente.utenteId, utente.enteId));
  });
}
