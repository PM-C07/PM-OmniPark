// Logica dell'avvio della sosta nella scheda dello stallo (OMP-58, docs/test/cp_avvioInterfaccia.md,
// UC_SOSTA_1, NRF_USA_2): disponibilità di «Avvia sosta», durata proposta, controllo anticipato del
// credito, campi degli errori e corpo di POST /api/soste (JSON, oppure multipart con la foto del
// permesso dalla OMP-61). Il server resta l'autorità su ogni controllo.
import { formattaEuro } from "./importi.ts";

export type Disponibilita = { disponibile: true } | { disponibile: false; motivo: string };

const NON_AVVIABILE = "La sosta non si può avviare su questo stallo.";

const MOTIVO_PER_STATO: Readonly<Record<string, string>> = {
  LIBERO: "Lo stallo risulta libero: la sosta si avvia quando il sensore rileva il veicolo.",
  NON_DISPONIBILE: "Sullo stallo c'è già una sosta in corso.",
  SCONOSCIUTO: "Lo stato dello stallo non è affidabile: la sosta non si può avviare.",
};

/** Tipi di stallo su cui si avvia la sosta; su disabili e rosa con il permesso (OMP-61, CR_01). */
const TIPI_AVVIABILI: readonly string[] = ["ORDINARIO_A_PAGAMENTO", "DISABILI", "ROSA"];

/**
 * «Avvia sosta» solo su uno stallo Occupato (UC_SOSTA_1, entry condition e 2.a1) di un tipo
 * previsto; sugli stalli riservati porta al passaggio del permesso (richiedePermesso). Prima lo
 * stato, poi il tipo.
 */
export function disponibilitaAvvio(stato: string, tipoDiStallo: string): Disponibilita {
  if (stato !== "OCCUPATO") {
    return {
      disponibile: false,
      motivo: Object.hasOwn(MOTIVO_PER_STATO, stato) ? MOTIVO_PER_STATO[stato] : NON_AVVIABILE,
    };
  }
  return TIPI_AVVIABILI.includes(tipoDiStallo)
    ? { disponibile: true }
    : { disponibile: false, motivo: NON_AVVIABILE };
}

const PASSO_DURATA = 15;
const DURATA_PROPOSTA = 60;

/** Durate sceglibili in minuti: multipli di 15 fino alla durata massima, più la massima. */
export function opzioniDurata(durataMassima: number): number[] {
  const opzioni: number[] = [];
  for (let minuti = PASSO_DURATA; minuti <= durataMassima; minuti += PASSO_DURATA) {
    opzioni.push(minuti);
  }
  if (durataMassima >= PASSO_DURATA && durataMassima % PASSO_DURATA !== 0) {
    opzioni.push(durataMassima);
  }
  return opzioni;
}

/** Durata già proposta (NRF_USA_2): 60 minuti, o la massima se è minore; null sotto i 15. */
export function durataPredefinita(durataMassima: number): number | null {
  if (durataMassima < PASSO_DURATA) {
    return null;
  }
  return Math.min(DURATA_PROPOSTA, durataMassima);
}

/** «45 min», «2 h», «1 h 30 min». */
export function etichettaDurata(minuti: number): string {
  const ore = Math.floor(minuti / 60);
  const resto = minuti % 60;
  if (ore === 0) {
    return `${resto} min`;
  }
  return resto === 0 ? `${ore} h` : `${ore} h ${resto} min`;
}

/** Controllo anticipato del credito (UC_SOSTA_1 5.a1); CREDITO_INSUFFICIENTE resta del server. */
export function creditoSufficiente(saldo: number, importo: number): boolean {
  return saldo >= importo;
}

/**
 * Testo del pulsante dell'interazione 3 (e della conferma del prolungamento): «Conferma e paga
 * (3,00 €)»; senza importo, per le soste gratuite, «Conferma (senza addebito)».
 */
export function etichettaConferma(importo: number): string {
  return importo > 0 ? `Conferma e paga (${formattaEuro(importo)})` : "Conferma (senza addebito)";
}

/** Codici di POST /api/soste e GET /api/soste/importo → campo del modulo; gli altri vanno su "generale". */
export const CAMPI_AVVIO_SOSTA: Readonly<Record<string, string>> = {
  CREDITO_INSUFFICIENTE: "credito",
  DURATA_NON_VALIDA: "durata",
  TARGA_NON_NEL_PROFILO: "targa",
  SOSTA_GIA_ATTIVA: "targa",
  PERMESSO_MANCANTE: "permesso",
  PERMESSO_NON_VALIDO: "permesso",
};

/** Dichiarazione e foto del permesso per l'avvio su uno stallo riservato (UC_SOSTA_5). */
export type PermessoDiAvvio = { dichiarazione: string; foto: Blob };

/**
 * Richiesta di POST /api/soste: JSON senza permesso; con il permesso multipart/form-data, con la
 * foto come file (cp_apiWalletSoste.md §2). Il content-type del multipart lo imposta il browser.
 */
export function richiestaDiAvvio(dati: {
  stallo: number;
  targa: string;
  durata: number;
  permesso?: PermessoDiAvvio;
}): RequestInit {
  const { stallo, targa, durata, permesso } = dati;
  if (!permesso) {
    return {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stallo, targa, durata }),
    };
  }
  const modulo = new FormData();
  modulo.set("stallo", String(stallo));
  modulo.set("targa", targa);
  modulo.set("durata", String(durata));
  modulo.set("dichiarazioneDiPermesso", permesso.dichiarazione);
  const nome = permesso.foto.type === "image/png" ? "permesso.png" : "permesso.jpg";
  modulo.set("fotoDelPermesso", permesso.foto, nome);
  return { method: "POST", body: modulo };
}
