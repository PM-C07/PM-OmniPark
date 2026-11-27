// Logica della voce «Permessi da verificare» della pagina dell'Ausiliario (OMP-63 parte B,
// docs/test/cp_permessiInterfaccia.md): descrizione del permesso nell'elenco, etichette dei due esiti
// e risposta alla registrazione dell'esito (UC_OP_5 passo 4, 2.a1, 4.a1, 4.a2; np_02 ErrPermesso).
// L'esito non conforme genera una segnalazione di sosta irregolare accertata, non una sanzione.
// Nessuna dipendenza da React né dai sottosistemi.
import { descriviTipo } from "./mappaStalli.ts";
import type { EsitoRisposta } from "./risposteApi.ts";

/** Un permesso come arriva da GET /api/ausiliario/permessi. */
export type PermessoDellElenco = {
  sostaId: number;
  stalloId: number;
  numeroStallo: number;
  tipoDiStallo: string;
  latitudine: number;
  longitudine: number;
  targa: string;
  dichiarazioneDiPermesso: string;
};

export type EsitoVerifica = "CONFORME" | "NON_CONFORME";

export const ESITI_VERIFICA: Readonly<Record<EsitoVerifica, string>> = {
  CONFORME: "Conforme",
  NON_CONFORME: "Non conforme",
};

/** Riga dell'elenco: numero e tipo di stallo, targa della sosta (UC_OP_1 3.a1). */
export function descriviPermesso(permesso: PermessoDellElenco): string {
  return `Stallo n. ${permesso.numeroStallo} ${descriviTipo(permesso.tipoDiStallo).testo} · targa ${permesso.targa}`;
}

/** Codici di POST /api/permessi/<sosta>/esito per cui il permesso non è più da verificare. */
export const CAMPI_ESITO_VERIFICA: Readonly<Record<string, string>> = {
  VERIFICA_GIA_REGISTRATA: "giaRegistrata",
  SOSTA_NON_ATTIVA: "nonAttiva",
  NESSUN_PERMESSO_DA_VERIFICARE: "nessunPermesso",
};

const NON_PIU_DA_VERIFICARE = new Set(Object.values(CAMPI_ESITO_VERIFICA));

export type EsitoDellaVerifica =
  | { tipo: "registrato"; messaggio: string }
  | { tipo: "nonDisponibile"; messaggio: string }
  | { tipo: "sessioneScaduta" }
  | { tipo: "errore"; messaggio: string };

/**
 * Risposta alla registrazione dell'esito: registrato (con esito non conforme anche la segnalazione
 * accertata, 4.a1); non più da verificare (2.a1, 4.a2: l'elenco si ricarica e il permesso esce);
 * sessione scaduta; altri errori da riprovare.
 */
export function rispostaAllEsito(esito: EsitoRisposta, scelto: EsitoVerifica): EsitoDellaVerifica {
  switch (esito.esito) {
    case "successo":
      return {
        tipo: "registrato",
        messaggio:
          scelto === "NON_CONFORME"
            ? "Esito registrato: permesso non conforme. È stata registrata una segnalazione di sosta irregolare accertata, già chiusa."
            : "Esito registrato: permesso conforme.",
      };
    case "sessioneScaduta":
      return { tipo: "sessioneScaduta" };
    case "errore":
      return NON_PIU_DA_VERIFICARE.has(esito.campo)
        ? { tipo: "nonDisponibile", messaggio: esito.messaggio }
        : { tipo: "errore", messaggio: esito.messaggio };
  }
}
