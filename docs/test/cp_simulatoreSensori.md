# cp_simulatoreSensori

Specifica dei casi di test (category partition) degli invii a giro del simulatore dei sensori: funzione pura `inviiAGiro` di `src/simulators/giroSensori.ts`, usata dalla modalità `--casuale` di `src/simulators/sensori.ts`.
Requisiti: RF_IOT_2 (stato Sconosciuto dopo 60 secondi senza rilevazioni: con il simulatore attivo ogni stallo deve ricevere una rilevazione entro 60 secondi). Task OMP-64 (COD-23, issue #44).

- **Fonti dell'esito atteso:** `RF_IOT_2`, `UC_IOT_2` (entry condition), piano approvato di OMP-64 (simulatore a giro: stalli nell'ordine di `src/simulators/dati/stalli.json`, intervallo invariato, presenza casuale, `--quante 0` senza limite).
- **File di test:** `src/simulators/giroSensori.test.ts`, eseguito da `npm test` (ambiente node, senza database né rete).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento: `RF_IOT_2` se il frame verifica che tutti gli stalli ricevano una rilevazione a ogni giro; altrimenti `COD_23` per le scelte del piano approvato di OMP-64.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_IOT_2 · TF-SIM-01 · tre stalli, sette invii → 1, 2, 3, 1, 2, 3, 1`.

## 2. Funzione verificata (firma)

```ts
// src/simulators/giroSensori.ts — nessuna dipendenza da rete, file o argomenti della riga di comando
type Invio = {
  etichetta: string;
  corpo: string;
  token?: string | null;
  httpAtteso?: number;
  codiceAtteso?: string;
  stallo?: unknown;
  presenza?: unknown;
  attesaMs?: number;
};
inviiAGiro(stalli: number[], quante: number, intervalloMs: number, casuale?: () => number): Iterable<Invio>;
```

- Gli stalli si visitano nell'ordine dell'elenco; dopo l'ultimo si riparte dal primo.
- `quante` > 0: esattamente `quante` invii. `quante` 0: invii senza limite (l'iterabile non termina; il simulatore si ferma con Ctrl+C).
- `attesaMs`: 0 per il primo invio, `intervalloMs` per gli altri.
- `presenza`: `casuale() < 0.5`; `casuale` vale `Math.random` se non indicato. Una chiamata a `casuale` per invio.
- `etichetta`: `casuale-<n>` con `n` da 1; `corpo` è la stringa vuota (il corpo con `dataOra` lo compone il simulatore all'invio).

## 3. Ambiente

Funzione pura: nessuna rete, nessun file. `casuale` è un generatore di prova che restituisce in ordine i valori indicati nel frame, ripetendoli dall'inizio quando finiscono. Per `quante` 0 il test legge solo i primi invii dell'iterabile (per esempio con un ciclo interrotto), senza esaurirlo.

## 4. Categorie e scelte

**Numero di invii rispetto agli stalli:** più di un giro · senza limite (`quante` 0) [single].

**Attesa:** primo invio · invii successivi.

**Presenza:** valore casuale sotto 0,5 → presente · da 0,5 in su → assente.

## 5. Test frame (4)

| Frame     | Chiamata                                                                                           | Esito atteso                                                                                            | Riferimento |
| :-------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :---------- |
| TF-SIM-01 | `inviiAGiro([1, 2, 3], 7, 1000, casuale)` con `casuale` che restituisce 0,2                        | 7 invii; `stallo` in ordine `[1, 2, 3, 1, 2, 3, 1]`; etichette da `casuale-1` a `casuale-7`             | RF_IOT_2    |
| TF-SIM-02 | `inviiAGiro([1, 2, 3], 4, 1500, casuale)` con `casuale` che restituisce 0,2                        | `attesaMs` in ordine `[0, 1500, 1500, 1500]`                                                            | COD_23      |
| TF-SIM-03 | `inviiAGiro([4, 5], 3, 1000, casuale)` con `casuale` che restituisce 0,2, 0,7 e 0,5                | `presenza` in ordine `[true, false, false]`                                                             | COD_23      |
| TF-SIM-04 | `inviiAGiro([1, 2, 3], 0, 1000, casuale)` con `casuale` che restituisce 0,2; letti i primi 8 invii | `stallo` in ordine `[1, 2, 3, 1, 2, 3, 1, 2]`: l'iterabile prosegue oltre il primo giro e oltre 7 invii | COD_23      |

Note:

- TF-SIM-01: RF_IOT_2. Con l'intervallo predefinito di 1 s e i 30 stalli di `stalli.json` ogni stallo riceve una rilevazione ogni 30 s circa, entro i 60 s del timeout.
- TF-SIM-03: 0,5 dà «assente» perché la regola è `casuale() < 0.5`, come nel simulatore prima della COD-23.
- TF-SIM-04: decisione A del piano di OMP-64; il predefinito di `--quante` resta 20.

## 6. Note

- La lettura degli argomenti, l'invio HTTP e il registro JSONL di `sensori.ts` non hanno frame: si verificano con l'uso del simulatore e con i test di sistema (`test_di_sistema.md` §2).
