// Avvio della sosta (RF_SOSTA_1, UC_SOSTA_1, RF_WALLET_2) e soste in corso dell'Automobilista.
import { componiSottosistemi } from "../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../_errori.ts";
import { leggiCorpoJson } from "../_http.ts";
import { richiediSessione } from "../_sessione.ts";

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Foto del permesso in base64, se presente; ErroreApi se il formato non è valido. */
function leggiFoto(valore: unknown): Buffer | undefined {
  if (valore === undefined || valore === null) {
    return undefined;
  }
  if (typeof valore !== "string" || !BASE64.test(valore)) {
    throw new ErroreApi("RICHIESTA_NON_VALIDA");
  }
  return Buffer.from(valore, "base64");
}

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneSoste } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_SOSTA_1", null, utentiAccessi);
    const corpo = await leggiCorpoJson(richiesta);
    if (
      !corpo ||
      typeof corpo.stallo !== "number" ||
      typeof corpo.targa !== "string" ||
      typeof corpo.durata !== "number" ||
      (corpo.dichiarazioneDiPermesso !== undefined &&
        corpo.dichiarazioneDiPermesso !== null &&
        typeof corpo.dichiarazioneDiPermesso !== "string")
    ) {
      throw new ErroreApi("RICHIESTA_NON_VALIDA");
    }
    const fotoDelPermesso = leggiFoto(corpo.fotoDelPermesso);
    const sosta = await gestioneSoste.avviaSosta({
      automobilista: utente.utenteId,
      stallo: corpo.stallo,
      targa: corpo.targa,
      durata: corpo.durata,
      dichiarazioneDiPermesso:
        typeof corpo.dichiarazioneDiPermesso === "string"
          ? corpo.dichiarazioneDiPermesso
          : undefined,
      fotoDelPermesso,
    });
    return Response.json(sosta, { status: 201 });
  });
}

export async function GET(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneSoste } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_SOSTA_1", null, utentiAccessi);
    const soste = await gestioneSoste.sosteDellAutomobilista(utente.utenteId);
    // Dichiarazione e foto del permesso non escono dal server.
    return Response.json({
      soste: soste.map((s) => ({
        id: s.id,
        stato: s.stato,
        targa: s.targa,
        stalloId: s.stalloId,
        orarioDiAvvio: s.orarioDiAvvio,
        orarioDiScadenza: s.orarioDiScadenza,
        pagamento: s.pagamento,
      })),
    });
  });
}
