// Invii del simulatore dei sensori in modalità --casuale (COD-23, docs/test/cp_simulatoreSensori.md):
// gli stalli si visitano a giro, così con l'intervallo predefinito ognuno riceve una rilevazione
// entro i 60 secondi di RF_IOT_2; la presenza resta casuale. Funzione pura, senza rete né file.

export type Invio = {
  etichetta: string;
  corpo: string;
  token?: string | null;
  httpAtteso?: number;
  codiceAtteso?: string;
  stallo?: unknown;
  presenza?: unknown;
  attesaMs?: number;
};

/** Invii a giro sugli stalli; con quante 0 l'iterabile non termina (il simulatore si ferma con Ctrl+C). */
export function* inviiAGiro(
  stalli: number[],
  quante: number,
  intervalloMs: number,
  casuale: () => number = Math.random,
): Generator<Invio> {
  for (let indice = 0; quante === 0 || indice < quante; indice += 1) {
    yield {
      etichetta: `casuale-${indice + 1}`,
      corpo: "",
      stallo: stalli[indice % stalli.length],
      presenza: casuale() < 0.5,
      attesaMs: indice === 0 ? 0 : intervalloMs,
    };
  }
}
