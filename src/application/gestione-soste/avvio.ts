// Servizio Avvio (UC_SOSTA_1, SD_SOSTA_1, RF_SOSTA_1, RF_SOSTA_5, RF_SOSTA_6, RF_WALLET_2).
// Controlli nell'ordine dell'issue #9, poi un'unica transazione: sosta, addebito, stallo Non
// disponibile. Le corse tra controlli e transazione le chiude il database e annullano tutto.
// Dalla OMP-61 (CR_01) il permesso è obbligatorio sugli stalli per disabili e rosa.
import { ErroreDominio } from "../../persistence/accessoDati/errori.ts";
import { eseguiInTransazione } from "../../persistence/accessoDati/transazione.ts";
import {
  creaSosta,
  sostaAttivaPerVeicolo,
  sostaAttivaSuStallo,
  type Pagamento,
} from "../../persistence/accessoDati/walletSoste.ts";
import { ErroreGestioneStalli, type TipoDiStallo } from "../gestione-stalli/facade.ts";
import { normalizzaTarga } from "../utenti-accessi/facade.ts";
import { ErroreWallet } from "../wallet/facade.ts";
import {
  importoDellaSosta,
  orarioDiScadenza as calcolaScadenza,
  statoETariffaDelloStallo,
  verificaDurata,
} from "./calcoloImporto.ts";
import type { ContestoGestioneSoste } from "./contesto.ts";
import { ErroreGestioneSoste } from "./errori.ts";

/** Limite della foto del permesso, uguale al vincolo sosta_foto_dimensione dello schema. */
const FOTO_MASSIMA = 2 * 1024 * 1024;

/** Firme dei formati ammessi per la foto del permesso (issue #33): JPEG e PNG. */
const FIRME_FOTO: readonly (readonly number[])[] = [
  [0xff, 0xd8, 0xff],
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
];

export type RichiestaDiAvvio = {
  automobilista: number;
  stallo: number;
  targa: string;
  durata: number;
  dichiarazioneDiPermesso?: string;
  fotoDelPermesso?: Buffer;
};

export type SostaAvviata = {
  sosta: number;
  orarioDiAvvio: Date;
  orarioDiScadenza: Date;
  importo: number;
  pagamento: Pagamento;
};

type Permesso = { dichiarazioneDiPermesso?: string; fotoDelPermesso?: Buffer };

function dichiarazioneValida(dichiarazione: unknown): dichiarazione is string {
  return typeof dichiarazione === "string" && dichiarazione.trim() !== "";
}

function fotoPresente(foto: unknown): foto is Buffer {
  return Buffer.isBuffer(foto) && foto.length > 0;
}

/** JPEG o PNG riconosciuti dai primi byte del contenuto, non dal nome del file. */
function formatoAmmesso(foto: Buffer): boolean {
  return FIRME_FOTO.some(
    (firma) => foto.length >= firma.length && firma.every((byte, i) => foto[i] === byte),
  );
}

/**
 * Permesso secondo il tipo di stallo (cp_avvioSosta.md §2, CR_01), senza verifica di autenticità
 * (UC_SOSTA_5, la verifica sul posto è dell'Ausiliario): non previsto sugli stalli a pagamento
 * (VD_8), obbligatorio su disabili e rosa con dichiarazione e foto JPEG o PNG di al massimo 2 MB.
 */
function verificaPermesso(tipoDiStallo: TipoDiStallo, richiesta: RichiestaDiAvvio): Permesso {
  const { dichiarazioneDiPermesso: dichiarazione, fotoDelPermesso: foto } = richiesta;

  if (tipoDiStallo === "ORDINARIO_A_PAGAMENTO") {
    const arrivato =
      (dichiarazione !== undefined && dichiarazione !== null) ||
      (foto !== undefined && foto !== null);
    if (arrivato) {
      throw new ErroreGestioneSoste("PERMESSO_NON_PREVISTO");
    }
    return {};
  }
  // DISABILI e ROSA (UC_SOSTA_5 2.a1).
  if (!dichiarazioneValida(dichiarazione) || !fotoPresente(foto)) {
    throw new ErroreGestioneSoste("PERMESSO_MANCANTE");
  }
  if (foto.length > FOTO_MASSIMA || !formatoAmmesso(foto)) {
    throw new ErroreGestioneSoste("PERMESSO_NON_VALIDO");
  }
  return { dichiarazioneDiPermesso: dichiarazione, fotoDelPermesso: foto };
}

/** Errori della transazione tradotti nei codici di Gestione soste; gli altri risalgono invariati. */
function traduciErroreDellaTransazione(errore: unknown): unknown {
  if (errore instanceof ErroreDominio) {
    if (errore.codice === "SOSTA_GIA_ATTIVA_PER_VEICOLO") {
      return new ErroreGestioneSoste("SOSTA_GIA_ATTIVA", { cause: errore });
    }
    if (errore.codice === "SOSTA_GIA_ATTIVA_PER_STALLO") {
      return new ErroreGestioneSoste("STALLO_CON_SOSTA_ATTIVA", { cause: errore });
    }
  }
  if (errore instanceof ErroreWallet && errore.codice === "CREDITO_INSUFFICIENTE") {
    return new ErroreGestioneSoste("CREDITO_INSUFFICIENTE", { cause: errore });
  }
  if (errore instanceof ErroreGestioneStalli) {
    if (errore.codice === "STALLO_NON_OCCUPATO") {
      return new ErroreGestioneSoste("STALLO_NON_OCCUPATO", { cause: errore });
    }
    if (errore.codice === "STALLO_INESISTENTE") {
      return new ErroreGestioneSoste("STALLO_INESISTENTE", { cause: errore });
    }
  }
  return errore;
}

/** SD_SOSTA_1: avvia la sosta e restituisce sosta, orari, importo e pagamento. */
export async function avviaSosta(
  contesto: ContestoGestioneSoste,
  richiesta: RichiestaDiAvvio,
): Promise<SostaAvviata> {
  const { automobilista, stallo, durata } = richiesta;
  await contesto.allineamento.allinea();

  // 1. La targa è del profilo dell'Automobilista (VD_3).
  const targa = typeof richiesta.targa === "string" ? normalizzaTarga(richiesta.targa) : "";
  const profilo = Number.isSafeInteger(automobilista)
    ? await contesto.utentiAccessi.targhe(automobilista)
    : [];
  const veicolo = profilo.find((voce) => voce.targa === targa)?.veicolo;
  if (veicolo === undefined) {
    throw new ErroreGestioneSoste("TARGA_NON_NEL_PROFILO");
  }

  // 2. Lo stallo esiste ed è Occupato (UC_SOSTA_1 2.a1).
  const { stato, tipoDiStallo, tariffa } = await statoETariffaDelloStallo(contesto, stallo);
  if (stato !== "OCCUPATO") {
    throw new ErroreGestioneSoste("STALLO_NON_OCCUPATO");
  }

  // 3. Nessuna sosta attiva per la targa (UC_SOSTA_1 2.a3) né per lo stallo.
  if (await sostaAttivaPerVeicolo(contesto.pool, veicolo)) {
    throw new ErroreGestioneSoste("SOSTA_GIA_ATTIVA");
  }
  if (await sostaAttivaSuStallo(contesto.pool, stallo)) {
    throw new ErroreGestioneSoste("STALLO_CON_SOSTA_ATTIVA");
  }

  // 4. Durata tra il minimo e il massimo della tariffa (UC_SOSTA_1 2.a2).
  verificaDurata(durata, tariffa.durataMassima);

  // 5. Permesso secondo il tipo di stallo.
  const permesso = verificaPermesso(tipoDiStallo, richiesta);

  // 6. Importo (SD_SOSTA_1 3.2).
  const { importo, pagamento } = importoDellaSosta(tipoDiStallo, tariffa.costoOrario, durata);
  const orarioDiAvvio = contesto.orologio.adesso();
  const orarioDiScadenza = calcolaScadenza(orarioDiAvvio, durata);

  // 7. Sosta, addebito e stallo Non disponibile in un'unica transazione (prima la sosta: D3).
  try {
    const sosta = await eseguiInTransazione(async (client) => {
      const id = await creaSosta(client, {
        automobilistaId: automobilista,
        veicoloId: veicolo,
        stalloId: stallo,
        orarioDiAvvio,
        orarioDiScadenza,
        pagamento,
        ...permesso,
      });
      if (pagamento === "PAGATA") {
        await contesto.wallet.addebita(client, automobilista, importo, id);
      }
      await contesto.gestioneStalli.impostaNonDisponibile(stallo, client);
      return id;
    }, contesto.pool);
    return { sosta, orarioDiAvvio, orarioDiScadenza, importo, pagamento };
  } catch (errore) {
    throw traduciErroreDellaTransazione(errore);
  }
}
