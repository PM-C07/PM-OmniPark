// Chiusura di una segnalazione con esito (RF_OP_6, UC_OP_4, SD_OP_4). L'ente della segnalazione
// lo controlla Segnalazioni; la route controlla sessione, ruolo ed ente della sessione.
import type { Esito } from "../../../../../application/segnalazioni/facade.ts";
import { componiSottosistemi } from "../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../_errori.ts";
import { leggiCorpoJson, leggiId } from "../../../_http.ts";
import { richiediSessione } from "../../../_sessione.ts";

export async function POST(
  richiesta: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_OP_4", undefined, utentiAccessi);
    const id = leggiId((await params).id);
    const corpo = await leggiCorpoJson(richiesta);
    if (id === null || !corpo) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    // L'esito lo valida Segnalazioni (ESITO_NON_VALIDO), anche se manca o non è una stringa.
    await segnalazioni.chiudi(utente.utenteId, id, corpo.esito as Esito);
    return Response.json({});
  });
}
