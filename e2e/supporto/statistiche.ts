// Calcoli della misura di NRF_PER_3 (TS-11, docs/test/test_di_sistema.md §6): abbinamento tra
// rilevazioni inviate e comparse sulla mappa, massimo, mediana e 95° percentile. Funzioni pure.

/** Rilevazione inviata dal simulatore, con l'etichetta del marker attesa dopo la variazione. */
export type Invio = {
  indice: number;
  stallo: number;
  inviatoIl: number; // millisecondi, orologio del PC
  etichettaAttesa: string | null; // null: invio non riuscito o esito inatteso, non misurabile
};

/** Cambio dell'etichetta di un marker registrato nella pagina. */
export type Osservazione = { etichetta: string; t: number };

export type Abbinamento = { indice: number; stallo: number; ritardoMs: number | null };

/**
 * Per ogni invio misurabile, il ritardo della prima comparsa dell'etichetta attesa dopo l'invio e
 * prima del successivo invio sullo stesso stallo (o del limite). null: non comparsa.
 */
export function abbinaComparse(
  invii: readonly Invio[],
  osservazioni: readonly Osservazione[],
  limiteMs: number,
): Abbinamento[] {
  const ordinate = [...osservazioni].sort((a, b) => a.t - b.t);
  return invii
    .filter((invio) => invio.etichettaAttesa !== null)
    .map((invio) => {
      const successivo = invii.find(
        (altro) => altro.stallo === invio.stallo && altro.inviatoIl > invio.inviatoIl,
      );
      const fine = Math.min(successivo?.inviatoIl ?? Infinity, invio.inviatoIl + limiteMs);
      const comparsa = ordinate.find(
        (o) => o.t >= invio.inviatoIl && o.t < fine && o.etichetta === invio.etichettaAttesa,
      );
      return {
        indice: invio.indice,
        stallo: invio.stallo,
        ritardoMs: comparsa ? comparsa.t - invio.inviatoIl : null,
      };
    });
}

export function massimo(valori: readonly number[]): number {
  if (valori.length === 0) {
    throw new Error("Nessun valore.");
  }
  return Math.max(...valori);
}

/** Mediana; con un numero pari di valori, la media dei due centrali. */
export function mediana(valori: readonly number[]): number {
  if (valori.length === 0) {
    throw new Error("Nessun valore.");
  }
  const ordinati = [...valori].sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 === 1 ? ordinati[meta] : (ordinati[meta - 1] + ordinati[meta]) / 2;
}

/** Percentile per rango più vicino: il valore di posto ceil(p/100 · n). */
export function percentile(valori: readonly number[], p: number): number {
  if (valori.length === 0) {
    throw new Error("Nessun valore.");
  }
  if (!(p > 0 && p <= 100)) {
    throw new Error("Percentile fuori da (0, 100].");
  }
  const ordinati = [...valori].sort((a, b) => a - b);
  return ordinati[Math.ceil((p / 100) * ordinati.length) - 1];
}

/**
 * Sostituisce in un file Markdown la sezione tra `<!-- nome -->` e `<!-- /nome -->`, o la aggiunge
 * in fondo (stesso formato di scripts/misuraAnpr.ts per docs/misure.md).
 */
export function sostituisciSezione(testo: string, nome: string, righe: readonly string[]): string {
  const inizio = `<!-- ${nome} -->`;
  const fine = `<!-- /${nome} -->`;
  const sezione = [inizio, ...righe, fine].join("\n");
  const da = testo.indexOf(inizio);
  const a = testo.indexOf(fine);
  return da >= 0 && a > da
    ? `${testo.slice(0, da)}${sezione}${testo.slice(a + fine.length)}`
    : `${testo.trimEnd()}\n\n${sezione}\n`;
}
