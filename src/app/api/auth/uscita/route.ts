// Uscita (RF_AUTH_4, UC_AUTH_4): chiude la sessione, se c'è, e cancella il cookie. Idempotente.
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { cookieCancellato, leggiTokenDiSessione } from "../../_sessione.ts";

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const token = leggiTokenDiSessione(richiesta);
    if (token !== null) {
      await componiSottosistemi().utentiAccessi.esci(token);
    }
    return new Response(null, { status: 204, headers: { "set-cookie": cookieCancellato() } });
  });
}
