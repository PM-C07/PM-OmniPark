// Foto del permesso di una sosta (RF_OP_2, UC_OP_5 passo 2, NRF_LEG_2; OMP-63 parte B): solo per
// l'Ausiliario dell'ente e solo finché la sosta è Attiva. La route controlla sessione, ruolo ed
// ente della sessione; ente della sosta, stato e permesso li controlla Segnalazioni. Ogni risposta,
// anche d'errore, ha Cache-Control: no-store, così la foto non resta in nessuna cache.
import { componiSottosistemi } from "../../../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../../../_errori.ts";
import { leggiId } from "../../../_http.ts";
import { richiediSessione } from "../../../_sessione.ts";

export async function GET(
  richiesta: Request,
  { params }: { params: Promise<{ sosta: string }> },
): Promise<Response> {
  const risposta = await eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_OP_5", undefined, utentiAccessi);
    const sosta = leggiId((await params).sosta);
    if (sosta === null) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    const foto = await segnalazioni.fotoDelPermesso(utente.utenteId, sosta);
    return new Response(new Uint8Array(foto.dati), { headers: { "Content-Type": foto.tipo } });
  });
  risposta.headers.set("Cache-Control", "no-store");
  return risposta;
}
