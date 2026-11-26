// Prolungamento della sosta (RF_SOSTA_2, UC_SOSTA_2, SD_SOSTA_2, RF_WALLET_2, OMP-61):
// GET mostra importo aggiuntivo e nuova scadenza senza scritture (passo 3, decisione D2), POST
// conferma, addebita e posticipa la scadenza (passi 4–6). Le regole sono della Facade di Gestione
// soste; qui si leggono solo sessione, id della sosta e tempo aggiuntivo
// (docs/test/cp_apiProlungamento.md §2).
import { componiSottosistemi } from "../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../_errori.ts";
import { leggiCorpoJson, leggiId } from "../../../_http.ts";
import { richiediSessione } from "../../../_sessione.ts";

type Contesto = { params: Promise<{ id: string }> };

/** Minuti scritti solo con cifre (da 1 a 4), come la durata di GET /api/soste/importo. */
const TEMPO_AGGIUNTIVO = /^\d{1,4}$/;

async function idDellaSosta(contesto: Contesto): Promise<number> {
  const id = leggiId((await contesto.params).id);
  if (id === null) {
    throw new ErroreApi("RICHIESTA_NON_VALIDA");
  }
  return id;
}

export async function GET(richiesta: Request, contesto: Contesto): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneSoste } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_SOSTA_2", null, utentiAccessi);
    const sosta = await idDellaSosta(contesto);
    const tempoAggiuntivo = new URL(richiesta.url).searchParams.get("tempoAggiuntivo");
    if (tempoAggiuntivo === null || !TEMPO_AGGIUNTIVO.test(tempoAggiuntivo)) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    return Response.json(
      await gestioneSoste.calcolaImportoDelProlungamento(
        utente.utenteId,
        sosta,
        Number(tempoAggiuntivo),
      ),
    );
  });
}

export async function POST(richiesta: Request, contesto: Contesto): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneSoste } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_SOSTA_2", null, utentiAccessi);
    const sosta = await idDellaSosta(contesto);
    const corpo = await leggiCorpoJson(richiesta);
    if (!corpo || typeof corpo.tempoAggiuntivo !== "number") {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    return Response.json(
      await gestioneSoste.prolungaSosta(utente.utenteId, sosta, corpo.tempoAggiuntivo),
    );
  });
}
