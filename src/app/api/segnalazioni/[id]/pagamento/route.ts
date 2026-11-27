// Stato del pagamento della sosta della segnalazione (RF_OP_4, UC_OP_3; OMP-63): solo per una
// segnalazione presa in carico da chi la richiede (RAD 0.6). I controlli li fa Segnalazioni; la
// route controlla sessione, ruolo ed ente della sessione. Nessun dato del permesso nella risposta.
import { componiSottosistemi } from "../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../_errori.ts";
import { leggiId } from "../../../_http.ts";
import { richiediSessione } from "../../../_sessione.ts";

export async function GET(
  richiesta: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_OP_3", undefined, utentiAccessi);
    const id = leggiId((await params).id);
    if (id === null) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    return Response.json(await segnalazioni.statoDelPagamento(utente.utenteId, id));
  });
}
