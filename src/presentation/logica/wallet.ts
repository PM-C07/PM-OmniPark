// Logica del wallet nell'interfaccia (OMP-58, docs/test/cp_walletInterfaccia.md, UC_WALLET_1):
// tagli della ricarica ed esito di POST /api/wallet/ricarica; dalla OMP-61 messaggio della ricarica
// approvata e riquadro della ricarica nei flussi di avvio e prolungamento (DIF-03).
import { formattaEuro } from "./importi.ts";
import { interpretaRisposta, type EsitoRisposta } from "./risposteApi.ts";

/**
 * Tagli della ricarica in centesimi (UC_WALLET_1 passo 1: 5, 10 o 20 €). Costante duplicata solo per
 * l'interfaccia: il server resta l'autorità e rifiuta gli altri importi con IMPORTO_NON_PREVISTO.
 */
export const TAGLI_RICARICA: readonly number[] = [500, 1000, 2000];

export function eTaglioPrevisto(importo: number): boolean {
  return TAGLI_RICARICA.includes(importo);
}

export type EsitoRicarica =
  | { esito: "approvata"; saldo: number }
  | { esito: "rifiutata"; messaggio: string }
  | { esito: "errore"; messaggio: string }
  | { esito: "sessioneScaduta" };

/** Il rifiuto del pagamento ha un esito proprio; gli altri codici sono errori generali. */
export const CAMPI_RICARICA: Readonly<Record<string, string>> = {
  PAGAMENTO_RIFIUTATO: "rifiutata",
};

const MESSAGGIO_GENERICO = "Si è verificato un errore. Riprova più tardi.";

/** Esito della ricarica a partire dall'esito già interpretato (anche un errore di rete). */
export function esitoRicaricaDa(esito: EsitoRisposta): EsitoRicarica {
  if (esito.esito === "successo") {
    const saldo = (esito.dati as { saldo?: unknown } | null)?.saldo;
    return typeof saldo === "number" && Number.isInteger(saldo)
      ? { esito: "approvata", saldo }
      : { esito: "errore", messaggio: MESSAGGIO_GENERICO };
  }
  if (esito.esito === "sessioneScaduta") {
    return esito;
  }
  return esito.campo === "rifiutata"
    ? { esito: "rifiutata", messaggio: esito.messaggio }
    : { esito: "errore", messaggio: esito.messaggio };
}

/** Esito della ricarica: approvata con il saldo, rifiutata (On failure di UC_WALLET_1) o errore. */
export function esitoRicarica(status: number, corpo: unknown): EsitoRicarica {
  return esitoRicaricaDa(interpretaRisposta(status, corpo, CAMPI_RICARICA));
}

/** «Ricarica di 5,00 € approvata. Nuovo saldo: 5,00 €.» (UC_WALLET_1 passo 4). */
export function messaggioRicaricaApprovata(importo: number, saldo: number): string {
  return `Ricarica di ${formattaEuro(importo)} approvata. Nuovo saldo: ${formattaEuro(saldo)}.`;
}

export type RiquadroRicarica = "proposta" | "approvata" | "nessuno";

/**
 * Cosa mostra il riquadro della ricarica nella conferma dell'avvio o del prolungamento: la proposta
 * con il credito insufficiente (UC_SOSTA_1 e UC_SOSTA_2, 5.a1); dopo una ricarica approvata che
 * basta, il messaggio con il nuovo saldo (UC_WALLET_1 passo 4, DIF-03); altrimenti nulla.
 */
export function riquadroRicarica(stato: {
  creditoScarso: boolean;
  erroreCredito: boolean;
  ricaricaApprovata: boolean;
}): RiquadroRicarica {
  if (stato.creditoScarso || stato.erroreCredito) {
    return "proposta";
  }
  return stato.ricaricaApprovata ? "approvata" : "nessuno";
}
