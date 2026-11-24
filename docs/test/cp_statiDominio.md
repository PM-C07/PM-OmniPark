# cp_statiDominio

Specifica dei casi di test (category partition) della descrizione degli stati per il componente BadgeStato: funzione pura `descriviStato` di `src/presentation/logica/statiDominio.ts`.
Requisiti: RF_STALLI_1 (stato degli stalli), RF_OP_1 (stato delle segnalazioni), NRF_USA_1 (stati mai indicati solo con il colore). Task OMP-57 (issue #28).

- **Fonti dell'esito atteso:** statechart `SCD_1` (stallo: Libero, Occupato, Non disponibile, Sconosciuto), `SCD_2` (sosta: Attiva, Scaduta, Terminata), `SCD_3` (segnalazione: Aperta, Presa in carico, Chiusa), scenario SC_UT_4 (stallo Sconosciuto in grigio), issue #28 (BadgeStato con colore e testo, mai solo colore), piano approvato di OMP-57 (tabella dei toni).
- **File di test:** `src/presentation/logica/statiDominio.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_28` per le scelte dell'issue #28 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_STALLI_1 · TF-STA-UI-04 · stallo SCONOSCIUTO → Sconosciuto, grigio`.

## 2. Funzione verificata (firma)

```ts
// src/presentation/logica/statiDominio.ts — nessuna dipendenza da React né dai sottosistemi
type TipoStato = "stallo" | "sosta" | "segnalazione";
type Tono = "verde" | "rosso" | "arancione" | "grigio" | "blu" | "viola"; // viola: solo motivo «targa non corrispondente» (OMP-59), mai restituito da descriviStato
descriviStato(tipo: TipoStato, stato: string): { testo: string; tono: Tono };
```

Uno stato non previsto per il tipo restituisce `{ testo: "Stato non riconosciuto", tono: "grigio" }`: il badge mostra comunque un testo.

## 3. Ambiente

Funzione pura: nessun database, nessuna rete, nessun DOM.

## 4. Categorie e scelte

**Tipo:** stallo · sosta · segnalazione.

**Stato:** ciascuno degli stati del tipo · stato non previsto per il tipo [error].

## 5. Test frame (12)

| Frame        | Chiamata                                           | Esito atteso                                          | Riferimento |
| :----------- | :------------------------------------------------- | :---------------------------------------------------- | :---------- |
| TF-STA-UI-01 | `descriviStato("stallo", "LIBERO")`                | `{ testo: "Libero", tono: "verde" }`                  | RF_STALLI_1 |
| TF-STA-UI-02 | `descriviStato("stallo", "OCCUPATO")`              | `{ testo: "Occupato", tono: "rosso" }`                | RF_STALLI_1 |
| TF-STA-UI-03 | `descriviStato("stallo", "NON_DISPONIBILE")`       | `{ testo: "Non disponibile", tono: "arancione" }`     | RF_STALLI_1 |
| TF-STA-UI-04 | `descriviStato("stallo", "SCONOSCIUTO")`           | `{ testo: "Sconosciuto", tono: "grigio" }`            | RF_STALLI_1 |
| TF-STA-UI-05 | `descriviStato("sosta", "ATTIVA")`                 | `{ testo: "Attiva", tono: "verde" }`                  | ISSUE_28    |
| TF-STA-UI-06 | `descriviStato("sosta", "SCADUTA")`                | `{ testo: "Scaduta", tono: "arancione" }`             | ISSUE_28    |
| TF-STA-UI-07 | `descriviStato("sosta", "TERMINATA")`              | `{ testo: "Terminata", tono: "grigio" }`              | ISSUE_28    |
| TF-STA-UI-08 | `descriviStato("segnalazione", "APERTA")`          | `{ testo: "Aperta", tono: "rosso" }`                  | RF_OP_1     |
| TF-STA-UI-09 | `descriviStato("segnalazione", "PRESA_IN_CARICO")` | `{ testo: "Presa in carico", tono: "blu" }`           | RF_OP_1     |
| TF-STA-UI-10 | `descriviStato("segnalazione", "CHIUSA")`          | `{ testo: "Chiusa", tono: "grigio" }`                 | RF_OP_1     |
| TF-STA-UI-11 | `descriviStato("stallo", "ATTIVA")`                | `{ testo: "Stato non riconosciuto", tono: "grigio" }` | NRF_USA_1   |
| TF-STA-UI-12 | `descriviStato("segnalazione", "")`                | `{ testo: "Stato non riconosciuto", tono: "grigio" }` | NRF_USA_1   |

Totale 12: 4 stati di stallo, 3 di sosta, 3 di segnalazione, 2 stati non previsti.

Note sui riferimenti:

- TF-STA-UI-01…04: RF_STALLI_1 (stati dello stallo sulla mappa, `SCD_1`); il grigio dello stato Sconosciuto viene da SC_UT_4.
- TF-STA-UI-05…07: stati della sosta (`SCD_2`), usati dalle schermate di COD-17 e COD-18.
- TF-STA-UI-11, 12: NRF_USA_1, il badge non resta mai senza testo.

## 6. Note

- Il contrasto e la resa dei toni nel componente si verificano a mano e, in modo automatico, con COD-27.
