// Presa in carico di una segnalazione (RF_OP_3, UC_OP_2, SCD_3; OMP-63). Stato, assegnatario ed ente
// della segnalazione li controlla Segnalazioni; la route controlla sessione, ruolo ed ente della sessione.
import { componiSottosistemi } from "../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../_errori.ts";
import { leggiId } from "../../../_http.ts";
import { richiediSessione } from "../../../_sessione.ts";

export async function POST(
  richiesta: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_OP_2", undefined, utentiAccessi);
    const id = leggiId((await params).id);
    if (id === null) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    return Response.json({ segnalazione: await segnalazioni.prendiInCarico(utente.utenteId, id) });
  });
}
