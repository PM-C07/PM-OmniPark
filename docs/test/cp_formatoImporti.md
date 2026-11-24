# cp_formatoImporti

Specifica dei casi di test (category partition) del formato di importi e orari nell'interfaccia: funzioni pure di `src/presentation/logica/importi.ts`, usate dalla scheda dello stallo, dall'avvio della sosta, da «La mia sosta» e dal wallet.
Requisiti: RF_WALLET_2 (importo della sosta mostrato prima del pagamento), RF_WALLET_1 (saldo e ricarica), RF_SOSTA_1 (orario di scadenza mostrato all'avvio). Task OMP-58 (issue #29).

- **Fonti dell'esito atteso:** `UC_SOSTA_1` passo 3 («mostra importo e orario di scadenza»), scenari `SC_UT_2` e `SC_UT_5` (importi nella forma `3,00 €`, orari `10:42`), AGENTS.md (importi in centesimi interi), issue #29 («gli importi arrivano in centesimi e si mostrano in euro con due decimali»), piano approvato di OMP-58 (punto 9 e decisione D4: `Intl.NumberFormat("it-IT")`).
- **File di test:** `src/presentation/logica/importi.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` per le scelte dell'issue #29 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_WALLET_2 · TF-FMT-03 · 300 centesimi → 3,00 €`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/importi.ts — nessuna dipendenza da React né dai sottosistemi
formattaEuro(centesimi: number): string; // Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" })
formattaOra(istante: string | Date): string; // ore e minuti a due cifre, fuso Europe/Rome
```

- **`formattaEuro`:** formato italiano con due decimali, separatore decimale `,`, punto come separatore delle migliaia da cinque cifre intere in su (regola CLDR per l'italiano), simbolo `€` dopo l'importo separato da uno **spazio indivisibile** (U+00A0). Negli esiti attesi lo spazio indivisibile è scritto ` `.
- **`formattaOra`:** `HH:MM` nel fuso `Europe/Rome`, qualunque sia il fuso del dispositivo; accetta un istante ISO 8601 (come arriva dalle API) o un `Date`.

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM. Node.js con i dati di localizzazione completi (Node 26, `.nvmrc`).

## 4. Categorie e scelte

**Importo in centesimi:** zero · meno di un euro · intero di euro · con decimali e più di quattro cifre intere [single] · con separatore delle migliaia [single].

**Istante:** ora solare · ora legale [single] · dopo la mezzanotte di Roma, prima in UTC [single] · `Date` invece della stringa.

## 5. Test frame (9)

| Frame     | Chiamata                                            | Esito atteso     | Riferimento |
| :-------- | :-------------------------------------------------- | :--------------- | :---------- |
| TF-FMT-01 | `formattaEuro(0)`                                   | `"0,00 €"`       | RF_WALLET_2 |
| TF-FMT-02 | `formattaEuro(5)`                                   | `"0,05 €"`       | RF_WALLET_2 |
| TF-FMT-03 | `formattaEuro(300)`                                 | `"3,00 €"`       | RF_WALLET_2 |
| TF-FMT-04 | `formattaEuro(123456)`                              | `"1234,56 €"`    | ISSUE_29    |
| TF-FMT-05 | `formattaEuro(12345678)`                            | `"123.456,78 €"` | ISSUE_29    |
| TF-FMT-06 | `formattaOra("2026-11-20T09:42:00.000Z")`           | `"10:42"`        | RF_SOSTA_1  |
| TF-FMT-07 | `formattaOra("2026-07-20T08:05:00.000Z")`           | `"10:05"`        | RF_SOSTA_1  |
| TF-FMT-08 | `formattaOra("2026-11-20T23:30:00.000Z")`           | `"00:30"`        | RF_SOSTA_1  |
| TF-FMT-09 | `formattaOra(new Date("2026-11-20T09:42:00.000Z"))` | `"10:42"`        | RF_SOSTA_1  |

Totale 9: 5 sugli importi, 4 sugli orari.

Note sui riferimenti:

- TF-FMT-01…03: RF_WALLET_2 (importo prima del pagamento, `UC_SOSTA_1` passo 3; `SC_UT_2` «3,00 €»); lo stesso formato vale per saldo e ricarica (RF_WALLET_1).
- TF-FMT-04, 05: decisione D4 del piano (formato di `Intl` it-IT, senza regole scritte a mano).
- TF-FMT-06…09: orario di scadenza (`UC_SOSTA_1` passo 3, `SC_UT_2` «scadenza alle 10:42»).

## 6. Note

- La scritta del pulsante «Conferma e paga (3,00 €)» è verificata in `cp_avvioInterfaccia.md`.
