// Separazione dei marker sovrapposti nella mappa generica (OMP-61, DIF-02, decisione D1,
// docs/test/cp_mappaInterfaccia.md): si spostano solo i marker i cui centri distano meno della
// distanza minima, disponendo ogni gruppo su una griglia attorno al suo baricentro, così ogni marker
// ha il centro libero e il tocco seleziona l'elemento toccato. Coordinate in pixel alla zoom
// corrente; nessuna dipendenza da React, da Leaflet, da stalli o segnalazioni.

export type PuntoMarcatore = { id: number; x: number; y: number };

/** Lato dei marker di Mappa.tsx, in pixel: è la distanza minima tra due centri. */
export const DIMENSIONE_MARCATORE = 36;

/** Margine per gli errori di arrotondamento: due centri a esattamente la distanza minima non si coprono. */
const TOLLERANZA = 1e-9;

function distanza(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Griglia centrata sul baricentro, celle per righe nell'ordine y, x, id crescenti. */
function disponiGruppo(
  punti: readonly PuntoMarcatore[],
  indici: readonly number[],
  passo: number,
): Map<number, { x: number; y: number }> {
  const posizioni = new Map<number, { x: number; y: number }>();
  if (indici.length === 1) {
    const [unico] = indici;
    posizioni.set(unico, { x: punti[unico].x, y: punti[unico].y });
    return posizioni;
  }
  const n = indici.length;
  const colonne = Math.ceil(Math.sqrt(n));
  const righe = Math.ceil(n / colonne);
  const cx = indici.reduce((somma, i) => somma + punti[i].x, 0) / n;
  const cy = indici.reduce((somma, i) => somma + punti[i].y, 0) / n;
  const ordinati = [...indici].sort(
    (a, b) => punti[a].y - punti[b].y || punti[a].x - punti[b].x || punti[a].id - punti[b].id,
  );
  ordinati.forEach((indice, i) => {
    const riga = Math.floor(i / colonne);
    const colonna = i % colonne;
    posizioni.set(indice, {
      x: cx + (colonna - (colonne - 1) / 2) * passo,
      y: cy + (riga - (righe - 1) / 2) * passo,
    });
  });
  return posizioni;
}

/**
 * Centri dei marker senza sovrapposizioni, nello stesso ordine dei punti: i marker isolati restano
 * fermi; i gruppi di marker sovrapposti si dispongono a griglia; se un gruppo disposto copre un altro
 * marker, i due gruppi si uniscono e si ridispongono dai punti originali.
 */
export function separaMarcatori(
  punti: readonly PuntoMarcatore[],
  distanzaMinima: number,
): PuntoMarcatore[] {
  const sovrapposti = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    distanza(a, b) < distanzaMinima - TOLLERANZA;

  // Gruppi come insiemi disgiunti sugli indici dei punti.
  const padre = punti.map((_, i) => i);
  const radice = (i: number): number => {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]];
      i = padre[i];
    }
    return i;
  };
  const unisci = (a: number, b: number) => {
    padre[radice(a)] = radice(b);
  };
  for (let i = 0; i < punti.length; i++) {
    for (let j = i + 1; j < punti.length; j++) {
      if (sovrapposti(punti[i], punti[j])) {
        unisci(i, j);
      }
    }
  }

  // A ogni giro con un conflitto il numero dei gruppi scende: con un solo gruppo la griglia basta.
  for (;;) {
    const gruppi = new Map<number, number[]>();
    punti.forEach((_, i) => {
      const r = radice(i);
      gruppi.set(r, [...(gruppi.get(r) ?? []), i]);
    });
    const posizioni = new Map<number, { x: number; y: number }>();
    for (const indici of gruppi.values()) {
      for (const [indice, posizione] of disponiGruppo(punti, indici, distanzaMinima)) {
        posizioni.set(indice, posizione);
      }
    }
    const disposti = punti.map((punto, i) => posizioni.get(i) ?? punto);

    let conflitto = false;
    for (let i = 0; i < punti.length; i++) {
      for (let j = i + 1; j < punti.length; j++) {
        if (radice(i) !== radice(j) && sovrapposti(disposti[i], disposti[j])) {
          unisci(i, j);
          conflitto = true;
        }
      }
    }
    if (!conflitto) {
      return punti.map((punto, i) => ({ id: punto.id, x: disposti[i].x, y: disposti[i].y }));
    }
  }
}
