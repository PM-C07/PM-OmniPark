// Importo e orario di scadenza prima della conferma dell'avvio (RF_WALLET_2, UC_SOSTA_1 passo 3,
// SD_SOSTA_1 3.2–3.3, OMP-58): nessuna scrittura, il calcolo resta nella Facade di Gestione soste.
import { componiSottosistemi } from "../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../_errori.ts";
import { leggiId } from "../../_http.ts";
import { richiediSessione } from "../../_sessione.ts";

/** Minuti scritti solo con cifre (da 1 a 4); l'intervallo valido lo controlla la Facade. */
const DURATA = /^\d{1,4}$/;

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneSoste } = componiSottosistemi();
    await richiediSessione(richiesta, "UC_SOSTA_1", null, utentiAccessi);
    const parametri = new URL(richiesta.url).searchParams;
    const stallo = leggiId(parametri.get("stallo"));
    const durata = parametri.get("durata");
    if (stallo === null || durata === null || !DURATA.test(durata)) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    return Response.json(await gestioneSoste.calcolaImporto(stallo, Number(durata)));
  });
}
