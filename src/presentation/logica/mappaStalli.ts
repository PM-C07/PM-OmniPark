// Logica della mappa degli stalli (OMP-58, docs/test/cp_mappaInterfaccia.md): zona dalla vista,
// applicazione delle variazioni ricevute dal polling ed elementi per il componente mappa generico.
// Nessuna dipendenza da React, da Leaflet né dai sottosistemi.
import { descriviStato, type Tono } from "./statiDominio.ts";

/** Uno stallo come arriva da GET /api/stalli e /api/stalli/modifiche (cp_apiStalli.md §2). */
export type StalloDellaMappa = {
  id: number;
  numero: number;
  latitudine: number;
  longitudine: number;
  tipoDiStallo: string;
  stato: string;
  ultimaModifica: string;
  areaDiSosta: { id: number; nome: string };
  tariffa: { id: number; costoOrario: number };
};

/** Elemento del componente mappa generico (VistaMappa), senza conoscere stalli o segnalazioni. */
export type ElementoMappa = {
  id: number;
  latitudine: number;
  longitudine: number;
  tono: Tono;
  simbolo: string;
  simboloStato: string;
  etichetta: string;
  gruppo: string;
};

/** Vista iniziale fissa: Gragnano, Piazza Aubry (nessuna geolocalizzazione). */
export const VISTA_INIZIALE = { centro: [40.6884, 14.5221] as [number, number], zoom: 17 };

/** Zona della vista iniziale, usata anche quando la mappa non si carica. */
export const ZONA_INIZIALE = "40.68640,14.52010,40.69040,14.52410";

const PASSO = 1e5;
const TOLLERANZA = 1e-9;

function arrotonda(valore: number, verso: "difetto" | "eccesso", limite: number): string {
  const limitato = Math.min(limite, Math.max(-limite, valore));
  const scalato = limitato * PASSO;
  const intero = Math.round(scalato);
  // Un valore che dista meno della tolleranza da un multiplo di 0,00001 è già arrotondato.
  const arrotondato =
    Math.abs(scalato - intero) < TOLLERANZA * PASSO
      ? intero
      : verso === "difetto"
        ? Math.floor(scalato)
        : Math.ceil(scalato);
  return (arrotondato / PASSO).toFixed(5);
}

/** Parametro `zona` (latMin,lonMin,latMax,lonMax) dalla vista, arrotondato verso l'esterno. */
export function zonaDallaVista(vista: {
  sud: number;
  ovest: number;
  nord: number;
  est: number;
}): string {
  return [
    arrotonda(vista.sud, "difetto", 90),
    arrotonda(vista.ovest, "difetto", 180),
    arrotonda(vista.nord, "eccesso", 90),
    arrotonda(vista.est, "eccesso", 180),
  ].join(",");
}

function stalliUguali(a: StalloDellaMappa, b: StalloDellaMappa): boolean {
  return (
    a.id === b.id &&
    a.numero === b.numero &&
    a.latitudine === b.latitudine &&
    a.longitudine === b.longitudine &&
    a.tipoDiStallo === b.tipoDiStallo &&
    a.stato === b.stato &&
    a.ultimaModifica === b.ultimaModifica &&
    a.areaDiSosta.id === b.areaDiSosta.id &&
    a.areaDiSosta.nome === b.areaDiSosta.nome &&
    a.tariffa.id === b.tariffa.id &&
    a.tariffa.costoOrario === b.tariffa.costoOrario
  );
}

/**
 * aggiornaStato di SD_STALLI_1: ogni riga sostituisce per id lo stallo presente, senza confrontare
 * ultimaModifica (è l'inizio della transazione, non il commit); gli stalli nuovi si aggiungono.
 * Le risposte del polling arrivano in ordine. Stesso array se il contenuto non cambia.
 */
export function applicaModifiche(
  stalli: readonly StalloDellaMappa[],
  righe: readonly StalloDellaMappa[],
): readonly StalloDellaMappa[] {
  if (righe.length === 0) {
    return stalli;
  }
  const perId = new Map(stalli.map((stallo) => [stallo.id, stallo]));
  let cambiato = false;
  for (const riga of righe) {
    const attuale = perId.get(riga.id);
    if (!attuale || !stalliUguali(attuale, riga)) {
      perId.set(riga.id, riga);
      cambiato = true;
    }
  }
  return cambiato ? [...perId.values()].sort((a, b) => a.id - b.id) : stalli;
}

/**
 * Stalli già visti durante l'apertura della pagina, per id (DIF-04, OMP-61): ogni riga, di qualsiasi
 * zona, sostituisce o aggiunge; nessuno stallo si toglie al cambio di zona. Senza righe, stessa mappa.
 */
export function ricordaStalli(
  noti: ReadonlyMap<number, StalloDellaMappa>,
  righe: readonly StalloDellaMappa[],
): ReadonlyMap<number, StalloDellaMappa> {
  if (righe.length === 0) {
    return noti;
  }
  const aggiornati = new Map(noti);
  for (const riga of righe) {
    aggiornati.set(riga.id, riga);
  }
  return aggiornati;
}

/** «Stallo n. 6, Piazza Aubry» per uno stallo già visto; «Stallo 19» per uno mai visto (DIF-04). */
export function descrizioneStallo(
  stalloId: number,
  noti: ReadonlyMap<number, StalloDellaMappa>,
): string {
  const noto = noti.get(stalloId);
  return noto ? `Stallo n. ${noto.numero}, ${noto.areaDiSosta.nome}` : `Stallo ${stalloId}`;
}

const SIMBOLO_STATO: Readonly<Record<string, string>> = {
  LIBERO: "✓",
  OCCUPATO: "●",
  NON_DISPONIBILE: "✕",
};

const TIPO: Readonly<Record<string, { simbolo: string; testo: string }>> = {
  ORDINARIO_A_PAGAMENTO: { simbolo: "P", testo: "a pagamento" },
  DISABILI: { simbolo: "♿", testo: "per persone con disabilità" },
  ROSA: { simbolo: "R", testo: "rosa" },
};

/** Tipo di stallo in parole e simbolo, per scheda, legenda ed elenco. */
export function descriviTipo(tipoDiStallo: string): { simbolo: string; testo: string } {
  return Object.hasOwn(TIPO, tipoDiStallo)
    ? TIPO[tipoDiStallo]
    : { simbolo: "?", testo: "di tipo non riconosciuto" };
}

/** Elemento della mappa: colore e simbolo dello stato, simbolo del tipo, etichetta accessibile. */
export function elementoDelloStallo(stallo: StalloDellaMappa): ElementoMappa {
  const stato = descriviStato("stallo", stallo.stato);
  const tipo = descriviTipo(stallo.tipoDiStallo);
  return {
    id: stallo.id,
    latitudine: stallo.latitudine,
    longitudine: stallo.longitudine,
    tono: stato.tono,
    simbolo: tipo.simbolo,
    simboloStato: Object.hasOwn(SIMBOLO_STATO, stallo.stato) ? SIMBOLO_STATO[stallo.stato] : "?",
    etichetta: `Stallo n. ${stallo.numero}, ${stallo.areaDiSosta.nome}, ${tipo.testo}, ${stato.testo}`,
    gruppo: stallo.areaDiSosta.nome,
  };
}

/** Legenda della mappa degli stalli: stati (colore e simbolo) e tipi. */
export const LEGENDA_STALLI = [
  { tono: "verde", simbolo: "✓", testo: "Libero" },
  { tono: "rosso", simbolo: "●", testo: "Occupato" },
  { tono: "arancione", simbolo: "✕", testo: "Non disponibile" },
  { tono: "grigio", simbolo: "?", testo: "Sconosciuto" },
  { simbolo: "P", testo: "Stallo a pagamento" },
  { simbolo: "♿", testo: "Stallo per persone con disabilità" },
  { simbolo: "R", testo: "Stallo rosa" },
] as const satisfies readonly { tono?: Tono; simbolo: string; testo: string }[];
