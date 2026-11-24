// Utente della sessione corrente (RF_AUTH_4): id, ruolo ed ente, senza controllo dell'operazione.
import { ErroreUtentiAccessi } from "../../../../application/utenti-accessi/facade.ts";
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { leggiTokenDiSessione } from "../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const token = leggiTokenDiSessione(richiesta);
    if (token === null) {
      throw new ErroreUtentiAccessi("SESSIONE_NON_VALIDA");
    }
    const utente = await componiSottosistemi().utentiAccessi.utenteDellaSessione(token);
    return Response.json({
      utente: { id: utente.utenteId, ruolo: utente.ruolo, ente: utente.enteId },
    });
  });
}
