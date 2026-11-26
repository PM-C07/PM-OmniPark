# cp_sostaInCorso

Specifica dei casi di test (category partition) della logica di «La mia sosta» nell'interfaccia: funzioni pure di `src/presentation/logica/sostaInCorso.ts`, usate dal pannello della sosta in corso del boundary `:MappaStalli` (`MU_2`).
Requisiti: RF_SOSTA_7 (la sosta passa a Scaduta all'orario di fine), RF_SOSTA_1 (sosta avviata con orario di scadenza), RF_SOSTA_2 (conferma del prolungamento). Task OMP-58 (issue #29); dalla OMP-61 (issue #33, blocco B) visibilità del messaggio di conferma (osservazione di `test_di_sistema.md` §8), TF-SIC-16…21.

- **Fonti dell'esito atteso:** statechart `SCD_2` (`Attiva --> Scaduta : at(orario di scadenza)`), `UC_SOSTA_7`, `np_01_automobilista` («Sosta in corso: stato e orario di scadenza»), `cp_apiWalletSoste.md` §2 (`GET /api/soste`), issue #29 (categoria minima «tempo rimanente: positivo; zero → Scaduta»; la sosta risulta Scaduta senza ricaricare la pagina), piano approvato di OMP-58 (punto 7: timer locale e scarto dell'orologio stimato dall'intestazione `Date`); dalla OMP-61: `UC_SOSTA_1` passo 6 («conferma l'orario di scadenza»), `UC_SOSTA_2` passo 6, `UC_SOSTA_7` passo 2, issue #33 («il messaggio «Sosta avviata: scade alle …» non deve restare visibile quando la sosta è Scaduta»), `test_di_sistema.md` §8 (osservazione sulla prova manuale di TS-02).
- **File di test:** `src/presentation/logica/sostaInCorso.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` o `ISSUE_33` per le scelte delle issue #29 e #33 e dei piani approvati di OMP-58 e OMP-61.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_7 · TF-SIC-05 · scadenza raggiunta → Scaduta`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/sostaInCorso.ts — nessuna dipendenza da React né dai sottosistemi
tempoRimanente(scadenzaMs: number, adessoMs: number): { secondi: number; scaduta: boolean; testo: string };
statoMostrato(stato: string, scaduta: boolean): string;
scartoOrologio(dataServer: string | null, inviataMs: number, ricevutaMs: number): number; // millisecondi
// dalla OMP-61
confermaVisibile(sostaConfermata: number | null, soste: readonly { id: number; stato: string; orarioDiScadenza: string }[], adessoMs: number): boolean;
```

- **`tempoRimanente`:** `secondi` = secondi interi rimanenti arrotondati per eccesso, mai negativi (`max(0, ceil((scadenza − adesso) / 1000))`); `scaduta` = `secondi === 0`. `testo`:
  - `"Scaduta"` se `secondi` è 0;
  - `"<s> s"` sotto il minuto;
  - `"<m> min <ss> s"` sotto l'ora, con i secondi a due cifre;
  - `"<h> h <mm> min"` da un'ora in su, con i minuti a due cifre (i secondi si tralasciano).
- **`statoMostrato`:** una sosta `ATTIVA` con `scaduta` vera si mostra `"SCADUTA"` (passaggio locale a zero, prima della conferma del server); in tutti gli altri casi lo stato ricevuto.
- **`scartoOrologio`:** differenza stimata tra l'orologio del server e quello del dispositivo: `(Date.parse(dataServer) + 500) − (inviataMs + ricevutaMs) / 2`. I 500 ms compensano l'intestazione `Date`, che ha la precisione del secondo. Con `dataServer` `null` o non leggibile → `0`. Il pannello usa `adesso = Date.now() + scarto`.
- **`confermaVisibile`** (dalla OMP-61): il messaggio di conferma («Sosta avviata: scade alle …» dopo l'avvio, «Sosta prolungata: scade alle …» dopo il prolungamento) riguarda la sosta `sostaConfermata` e si mostra solo finché quella sosta è mostrata `ATTIVA`. Regole in quest'ordine: `sostaConfermata` `null` → `false`; la sosta non è (ancora) tra le `soste` lette → `true` (la lettura successiva all'avvio non è ancora arrivata); altrimenti `statoMostrato(stato, tempoRimanente(Date.parse(orarioDiScadenza), adessoMs).scaduta) === "ATTIVA"`.

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM, nessun timer. Gli istanti sono numeri di millisecondi.

- `S = Date.parse("2026-11-20T10:42:00.000Z")` (scadenza).
- `A = Date.parse("2026-11-20T09:00:00.000Z")` (istante di riferimento delle richieste).

## 4. Categorie e scelte

**Tempo rimanente:** più di un'ora · meno di un'ora · meno di un minuto · meno di un secondo [single] · zero → Scaduta · scadenza superata [single].

**Stato ricevuto e timer:** `ATTIVA` non scaduta · `ATTIVA` con timer a zero → Scaduta · `SCADUTA` dal server.

**Orologio del dispositivo:** indietro rispetto al server · avanti · intestazione `Date` assente [error] · non leggibile [error].

**Messaggio di conferma** (dalla OMP-61): nessuna conferma · sosta confermata `ATTIVA` con tempo rimanente · sosta confermata `ATTIVA` con il timer a zero · sosta confermata `SCADUTA` dal server · sosta confermata non ancora letta [single] · conferma di un'altra sosta [single].

## 5. Test frame (21)

| Frame     | Chiamata                                                                                                 | Esito atteso                                             | Riferimento |
| :-------- | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- | :---------- |
| TF-SIC-01 | `tempoRimanente(S, S - 3_900_000)`                                                                       | `{ secondi: 3900, scaduta: false, testo: "1 h 05 min" }` | RF_SOSTA_7  |
| TF-SIC-02 | `tempoRimanente(S, S - 7_200_000)`                                                                       | `{ secondi: 7200, scaduta: false, testo: "2 h 00 min" }` | RF_SOSTA_7  |
| TF-SIC-03 | `tempoRimanente(S, S - 270_000)`                                                                         | `{ secondi: 270, scaduta: false, testo: "4 min 30 s" }`  | RF_SOSTA_7  |
| TF-SIC-04 | `tempoRimanente(S, S - 65_000)`                                                                          | `{ secondi: 65, scaduta: false, testo: "1 min 05 s" }`   | RF_SOSTA_7  |
| TF-SIC-05 | `tempoRimanente(S, S - 45_000)`                                                                          | `{ secondi: 45, scaduta: false, testo: "45 s" }`         | RF_SOSTA_7  |
| TF-SIC-06 | `tempoRimanente(S, S - 400)`                                                                             | `{ secondi: 1, scaduta: false, testo: "1 s" }`           | RF_SOSTA_7  |
| TF-SIC-07 | `tempoRimanente(S, S)`                                                                                   | `{ secondi: 0, scaduta: true, testo: "Scaduta" }`        | RF_SOSTA_7  |
| TF-SIC-08 | `tempoRimanente(S, S + 5_000)`                                                                           | `{ secondi: 0, scaduta: true, testo: "Scaduta" }`        | RF_SOSTA_7  |
| TF-SIC-09 | `statoMostrato("ATTIVA", false)`                                                                         | `"ATTIVA"`                                               | RF_SOSTA_7  |
| TF-SIC-10 | `statoMostrato("ATTIVA", true)`                                                                          | `"SCADUTA"`                                              | RF_SOSTA_7  |
| TF-SIC-11 | `statoMostrato("SCADUTA", false)`                                                                        | `"SCADUTA"`                                              | RF_SOSTA_7  |
| TF-SIC-12 | `scartoOrologio("Fri, 20 Nov 2026 09:00:10 GMT", A, A + 1_000)`                                          | `10000`                                                  | ISSUE_29    |
| TF-SIC-13 | `scartoOrologio("Fri, 20 Nov 2026 09:00:00 GMT", A + 30_000, A + 30_200)`                                | `-29600`                                                 | ISSUE_29    |
| TF-SIC-14 | `scartoOrologio(null, A, A + 1_000)`                                                                     | `0`                                                      | ISSUE_29    |
| TF-SIC-15 | `scartoOrologio("ieri", A, A + 1_000)`                                                                   | `0`                                                      | ISSUE_29    |
| TF-SIC-16 | `confermaVisibile(null, [{ id: 41, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }], A)` | `false`                                                  | ISSUE_33    |
| TF-SIC-17 | `confermaVisibile(41, [{ id: 41, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }], A)`   | `true`                                                   | RF_SOSTA_1  |
| TF-SIC-18 | `confermaVisibile(41, [{ id: 41, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }], S)`   | `false`                                                  | RF_SOSTA_7  |
| TF-SIC-19 | `confermaVisibile(41, [{ id: 41, stato: "SCADUTA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }], A)`  | `false`                                                  | RF_SOSTA_7  |
| TF-SIC-20 | `confermaVisibile(41, [], A)`                                                                            | `true`                                                   | ISSUE_33    |
| TF-SIC-21 | `confermaVisibile(41, [{ id: 40, stato: "ATTIVA", orarioDiScadenza: "2026-11-20T10:42:00.000Z" }], A)`   | `true`                                                   | ISSUE_33    |

Totale 21: 8 sul tempo rimanente, 3 sullo stato mostrato, 4 sullo scarto dell'orologio, 6 sul messaggio di conferma.

Note sui riferimenti:

- TF-SIC-01…08: RF_SOSTA_7 e `SCD_2` (`at(orario di scadenza)`); categoria minima dell'issue «tempo rimanente: positivo; zero → Scaduta». TF-SIC-06: un frammento di secondo conta ancora come tempo rimanente.
- TF-SIC-09…11: la sosta risulta Scaduta senza ricaricare la pagina (criterio di accettazione dell'issue); lo stato `SCADUTA` del server prevale sempre.
- TF-SIC-12…15: piano approvato, punto 7 (differenza tra l'orologio del telefono e quello del server). TF-SIC-12: dispositivo indietro di 10 s; TF-SIC-13: dispositivo avanti di 29,6 s.
- TF-SIC-17: `UC_SOSTA_1` passo 6 (la conferma dell'orario di scadenza resta visibile mentre la sosta è `Attiva`). TF-SIC-18, 19 riproducono l'**osservazione** di `test_di_sistema.md` §8 (in OMP-58 il messaggio restava visibile anche con la sosta `Scaduta`): allo zero del timer (`SCD_2`, `at(orario di scadenza)`) e con lo stato `SCADUTA` del server il messaggio non si mostra più. TF-SIC-20: subito dopo l'avvio la lettura delle soste non è ancora tornata e la conferma deve comparire (TS-01 passo 6). TF-SIC-21: la sosta confermata non è tra quelle lette, anche se ce ne sono altre (per esempio di un'altra targa): stessa regola di TF-SIC-20.

## 6. Note

- **Già verificati altrove** (nessun frame qui): passaggio a `SCADUTA` lato server e allineamento alla lettura, `cp_scadenzaEFine.md` e `cp_consultazione.md`; contenuto di `GET /api/soste`, `cp_apiWalletSoste.md`; formato dell'orario di scadenza, `cp_formatoImporti.md`.
- Il timer da un secondo del pannello e la richiesta di conferma a `GET /api/soste` alla scadenza si verificano a mano sull'anteprima.
