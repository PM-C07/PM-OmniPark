// Logica di «La mia sosta» (OMP-58, docs/test/cp_sostaInCorso.md, SCD_2, RF_SOSTA_7): tempo
// rimanente, passaggio locale a Scaduta senza ricaricare la pagina e scarto tra l'orologio del
// dispositivo e quello del server, stimato dall'intestazione Date di una risposta.

/** Secondi rimanenti (per eccesso, mai negativi) e testo: «1 h 05 min», «4 min 30 s», «45 s», «Scaduta». */
export function tempoRimanente(
  scadenzaMs: number,
  adessoMs: number,
): { secondi: number; scaduta: boolean; testo: string } {
  const secondi = Math.max(0, Math.ceil((scadenzaMs - adessoMs) / 1000));
  if (secondi === 0) {
    return { secondi, scaduta: true, testo: "Scaduta" };
  }
  const ore = Math.floor(secondi / 3600);
  const minuti = Math.floor((secondi % 3600) / 60);
  const resto = secondi % 60;
  const dueCifre = (n: number) => String(n).padStart(2, "0");
  const testo =
    ore > 0
      ? `${ore} h ${dueCifre(minuti)} min`
      : minuti > 0
        ? `${minuti} min ${dueCifre(resto)} s`
        : `${resto} s`;
  return { secondi, scaduta: false, testo };
}

/** Una sosta ATTIVA con il timer a zero si mostra Scaduta, prima della conferma del server. */
export function statoMostrato(stato: string, scaduta: boolean): string {
  return stato === "ATTIVA" && scaduta ? "SCADUTA" : stato;
}

/**
 * Ora del server − ora del dispositivo, in millisecondi: (Date + 500) − punto medio della richiesta.
 * I 500 ms compensano la precisione al secondo dell'intestazione Date; senza Date leggibile, 0.
 */
export function scartoOrologio(
  dataServer: string | null,
  inviataMs: number,
  ricevutaMs: number,
): number {
  const oraServer = dataServer === null ? Number.NaN : Date.parse(dataServer);
  if (Number.isNaN(oraServer)) {
    return 0;
  }
  return oraServer + 500 - (inviataMs + ricevutaMs) / 2;
}
