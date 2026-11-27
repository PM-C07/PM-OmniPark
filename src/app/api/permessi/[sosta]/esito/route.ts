// Esito della verifica del permesso di una sosta (RF_OP_5, UC_OP_5 passi 3–4, SD_OP_5; OMP-63
// parte B). Con esito non conforme Segnalazioni crea la segnalazione Chiusa accertata nella stessa
// transazione. La route controlla sessione, ruolo ed ente della sessione; il resto Segnalazioni.
import type { EsitoVerifica } from "../../../../../application/segnalazioni/facade.ts";
import { componiSottosistemi } from "../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../_errori.ts";
import { leggiCorpoJson, leggiId } from "../../../_http.ts";
import { richiediSessione } from "../../../_sessione.ts";

export async function POST(
  richiesta: Request,
  { params }: { params: Promise<{ sosta: string }> },
): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_OP_5", undefined, utentiAccessi);
    const sosta = leggiId((await params).sosta);
    const corpo = await leggiCorpoJson(richiesta);
    if (sosta === null || !corpo) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    // L'esito lo valida Segnalazioni (ESITO_VERIFICA_NON_VALIDO), anche se manca.
    return Response.json(
      await segnalazioni.registraEsitoVerifica(
        utente.utenteId,
        sosta,
        corpo.esito as EsitoVerifica,
      ),
    );
  });
}
