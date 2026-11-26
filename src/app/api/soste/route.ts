// Avvio della sosta (RF_SOSTA_1, UC_SOSTA_1, RF_WALLET_2, RF_SOSTA_5) e soste in corso
// dell'Automobilista. Il corpo dell'avvio è JSON, oppure multipart/form-data quando porta la foto
// del permesso come file (OMP-61, unica eccezione al JSON). Formato e dimensione della foto li
// controlla Gestione soste; qui si legge solo la richiesta (docs/test/cp_apiWalletSoste.md §2).
import { ErroreGestioneSoste } from "../../../application/gestione-soste/facade.ts";
import { componiSottosistemi } from "../../_composizione.ts";
import { ErroreApi, eseguiRoute } from "../_errori.ts";
import {
  leggiCorpoJson,
  leggiCorpoMultipart,
  leggiId,
  lunghezzaDichiarata,
  tipoDelCorpo,
} from "../_http.ts";
import { richiediSessione } from "../_sessione.ts";

/**
 * Corpo massimo dichiarato: la foto di 2 MB del servizio più 64 KB per i campi e i separatori,
 * sotto i 4,5 MB delle richieste di Vercel. Oltre, rifiuto anticipato senza leggere il corpo.
 */
const LIMITE_CORPO = 2 * 1024 * 1024 + 64 * 1024;

/** Minuti scritti solo con cifre (da 1 a 4); l'intervallo valido lo controlla la Facade. */
const DURATA = /^\d{1,4}$/;

type DatiDiAvvio = {
  stallo: number;
  targa: string;
  durata: number;
  dichiarazioneDiPermesso?: string;
  fotoDelPermesso?: Buffer;
};

function nonValida(): never {
  throw new ErroreApi("RICHIESTA_NON_VALIDA");
}

/** JSON come in OMP-48, senza la foto: dalla OMP-61 la foto arriva solo come file. */
async function datiDaJson(richiesta: Request): Promise<DatiDiAvvio> {
  const corpo = await leggiCorpoJson(richiesta);
  if (
    !corpo ||
    typeof corpo.stallo !== "number" ||
    typeof corpo.targa !== "string" ||
    typeof corpo.durata !== "number" ||
    (corpo.dichiarazioneDiPermesso !== undefined &&
      corpo.dichiarazioneDiPermesso !== null &&
      typeof corpo.dichiarazioneDiPermesso !== "string") ||
    Object.hasOwn(corpo, "fotoDelPermesso")
  ) {
    return nonValida();
  }
  return {
    stallo: corpo.stallo,
    targa: corpo.targa,
    durata: corpo.durata,
    dichiarazioneDiPermesso:
      typeof corpo.dichiarazioneDiPermesso === "string" ? corpo.dichiarazioneDiPermesso : undefined,
  };
}

/** Campi di testo e file della foto; un file di 0 byte è una foto assente (input vuoto). */
async function datiDaMultipart(richiesta: Request): Promise<DatiDiAvvio> {
  const modulo = await leggiCorpoMultipart(richiesta);
  if (!modulo) {
    return nonValida();
  }
  const testo = (nome: string): string | null => {
    const valore = modulo.get(nome);
    if (valore !== null && typeof valore !== "string") {
      return nonValida();
    }
    return valore;
  };
  const stallo = leggiId(testo("stallo"));
  const targa = testo("targa");
  const durata = testo("durata");
  const dichiarazione = testo("dichiarazioneDiPermesso");
  const foto = modulo.get("fotoDelPermesso");
  if (stallo === null || targa === null || durata === null || !DURATA.test(durata)) {
    return nonValida();
  }
  if (typeof foto === "string") {
    return nonValida();
  }
  return {
    stallo,
    targa,
    durata: Number(durata),
    dichiarazioneDiPermesso: dichiarazione ?? undefined,
    fotoDelPermesso:
      foto !== null && foto.size > 0 ? Buffer.from(await foto.arrayBuffer()) : undefined,
  };
}

export async function POST(richiesta: Request): Promise<Response> {
  return eseguiRoute(async () => {
    const { utentiAccessi, gestioneSoste } = componiSottosistemi();
    const utente = await richiediSessione(richiesta, "UC_SOSTA_1", null, utentiAccessi);
    const lunghezza = lunghezzaDichiarata(richiesta);
    if (lunghezza !== null && lunghezza > LIMITE_CORPO) {
      // Decisione D4 di OMP-61: nessun codice nuovo, il corpo può superare il limite solo per la foto.
      throw new ErroreGestioneSoste("PERMESSO_NON_VALIDO");
    }
    const tipo = tipoDelCorpo(richiesta);
    const dati =
      tipo === "application/json"
        ? await datiDaJson(richiesta)
        : tipo === "multipart/form-data"
          ? await datiDaMultipart(richiesta)
          : nonValida();
    const sosta = await gestioneSoste.avviaSosta({ automobilista: utente.utenteId, ...dati });
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
