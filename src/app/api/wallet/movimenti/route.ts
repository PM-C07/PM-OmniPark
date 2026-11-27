// Cronologia dei movimenti del wallet dell'Automobilista (RF_WALLET_3, UC_WALLET_3, SD_WALLET_3).
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { richiediSessione } from "../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, wallet } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_WALLET_3", null, utentiAccessi);
    return Response.json({ movimenti: await wallet.movimenti(utente.utenteId) });
  });
}
