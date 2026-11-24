// Ricarica simulata del wallet (RF_WALLET_1, UC_WALLET_1): il pagamento passa dal servizio creato
// nel punto di composizione (DG_10).
import { componiSottosistemi } from "../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../_errori.ts";
import { leggiCorpoJson } from "../../_http.ts";
import { richiediSessione } from "../../_sessione.ts";

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, wallet } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_WALLET_1", null, utentiAccessi);
    const corpo = await leggiCorpoJson(richiesta);
    if (!corpo || typeof corpo.importo !== "number") {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    return Response.json({ saldo: await wallet.ricarica(utente.utenteId, corpo.importo) });
  });
}
