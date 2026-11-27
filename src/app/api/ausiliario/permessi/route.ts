// Permessi da verificare dell'ente dell'Ausiliario (RF_OP_2, UC_OP_1 3.a1, SD_OP_1 2.3; OMP-63
// parte B). L'ente è quello della sessione; la route controlla sessione e ruolo, Segnalazioni
// l'Ausiliario attivo. Nessuna foto nell'elenco: si legge da /api/permessi/<sosta>/foto.
import { componiSottosistemi } from "../../../_composizione.ts";
import { eseguiRoute } from "../../_errori.ts";
import { richiediSessione } from "../../_sessione.ts";

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, segnalazioni } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_OP_1", undefined, utentiAccessi);
    return Response.json({ permessi: await segnalazioni.permessiDaVerificare(utente.utenteId) });
  });
}
