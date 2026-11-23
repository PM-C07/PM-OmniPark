# cp_statoPerLaSosta

Specifica dei casi di test (category partition) del servizio Stato per la sosta del sottosistema Gestione stalli, operazioni `statoETariffa(stallo, esecutore?)`, `impostaNonDisponibile(stallo, esecutore?)` e `ripristinaStatoRilevato(stallo, esecutore?)` della Facade.
Requisiti: RF_SOSTA_6 (stallo Non disponibile durante la sosta), RF_SOSTA_1 (avvio della sosta, per lo stato e la tariffa dello stallo). Task OMP-43 (issue #7).

- **Fonti dell'esito atteso:** `UC_SOSTA_1` passi 2 e 6 e flusso 2.a1, `SD_SOSTA_1` (2.1, 2.2, 3.1, 6.3), `UC_SOSTA_7`, `SD_SOSTA_7` (3.1, 3.2, 3.a1), statechart `SCD_1` (`avvioSosta`, `scadenzaSosta`, `entry / terminaSosta()` di Libero), `docs/rad/statechart/sincronizzazione_eventi.md` §1, `docs/rad/vincoli_dominio.md` (VD_6, VD_11, VD_20), piano approvato di OMP-43 (decisioni D, I).
- **File di test:** `src/application/gestione-stalli/statoPerLaSosta.db.test.ts` (eseguito da `npm run test:db`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_7` per le scelte dell'issue #7 e del piano approvato (esecutore esterno, pattern Observer).

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_1 · TF-SOS-04 · Non disponibile da Libero → STALLO_NON_OCCUPATO`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/gestione-stalli/facade.ts
type StatoETariffa = {
  stallo: number;
  tipoDiStallo: "ORDINARIO_A_PAGAMENTO" | "DISABILI" | "ROSA";
  stato: "LIBERO" | "OCCUPATO" | "NON_DISPONIBILE" | "SCONOSCIUTO";
  tariffa: { costoOrario: number; orarioInizioVigenza: string; orarioFineVigenza: string; durataMassima: number };
  // costo in centesimi, orari "HH:MM:SS", durata in minuti
};
type StalloLiberato = { stallo: number };
type OsservatoreStalli = { terminaSosta(evento: StalloLiberato, esecutore: PoolClient): Promise<void> };

creaFacadeGestioneStalli(dipendenze?: { pool?: Pool; osservatori?: readonly OsservatoreStalli[] }): FacadeGestioneStalli;
facade.statoETariffa(stallo: number, esecutore?: PoolClient): Promise<StatoETariffa>;
facade.impostaNonDisponibile(stallo: number, esecutore?: PoolClient): Promise<void>;          // OCCUPATO → NON_DISPONIBILE
facade.ripristinaStatoRilevato(stallo: number, esecutore?: PoolClient): Promise<StatoStallo>; // restituisce il nuovo stato
facade.registraRilevazione(rilevazione): Promise<StatoStallo>; // solo per preparare i frame
// errori: ErroreGestioneStalli con `codice` (esportati dalla Facade)
```

- **Esecutore.** Senza `esecutore` l'operazione apre una propria transazione. Con l'`esecutore` (il client di una transazione del chiamante, per esempio di Gestione soste) lavora in quella transazione e passa lo stesso esecutore agli osservatori: il commit o il rollback li decide il chiamante.
- **`impostaNonDisponibile`:** aggiornamento condizionato sullo stato `OCCUPATO`, in un'unica istruzione SQL. Su uno stallo in un altro stato restituisce `STALLO_NON_OCCUPATO`, su uno inesistente `STALLO_INESISTENTE`. Non notifica.
- **`ripristinaStatoRilevato`:** da `NON_DISPONIBILE` porta lo stallo a `OCCUPATO` se l'occupazione rilevata è `VEICOLO_PRESENTE`, a `LIBERO` se è `NESSUN_VEICOLO`. Nel secondo caso notifica gli osservatori con `{ stallo }` (ingresso in Libero, `SCD_1`). Da un altro stato restituisce `STALLO_NON_IMPEGNATO`, su uno stallo inesistente `STALLO_INESISTENTE`. Il ramo `[nessuna rilevazione da più di 60 s] → Sconosciuto` è fuori ambito (RF_IOT_2, priorità Media).

Funzioni dello strato di persistenza usate dai test solo per preparare e verificare i dati (mai stub): `trovaStallo(es, id)`, `eseguiInTransazione(op, poolDiTest())`, `creaSosta(es, dati)`, `impostaSostaScaduta(es, id)`, `trovaSosta(es, id)`, `terminaSosteScaduteDelloStallo(es, stalloId)`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. La Facade usa `poolDiTest()` e le sue transazioni vanno in commit: ogni frame usa uno stallo diverso.
- **Osservatore di prova "registro"**: registra gli eventi ricevuti e non scrive nulla.
- **Osservatore di prova "Gestione soste"**: con l'esecutore ricevuto chiama `terminaSosteScaduteDelloStallo(esecutore, evento.stallo)`.
- **Osservatore di prova "guasto"**: lancia sempre `new Error("osservatore guasto")`.
- Salvo indicazione diversa, la Facade è creata con il solo osservatore "registro".
- **Errore di prova "annulla"**: `new Error("annulla")`, lanciato dal test dentro `eseguiInTransazione` per far annullare la transazione esterna.
- Istanti: dataset `2026-11-15 08:00:00+01`; di prova per le rilevazioni `2026-11-20 09:00:00+01`; sosta di TF-SOS-15 dalle `2026-11-20 08:00:00+01` alle `2026-11-20 09:00:00+01`.
- "Stallo `NON_DISPONIBILE` con nessun veicolo" si prepara con `impostaNonDisponibile(id)` e poi `registraRilevazione({ stallo: id, presenza: false, dataOra: istante di prova })`, che lascia lo stallo `NON_DISPONIBILE` (`cp_rilevazioni.md` TF-RIL-06).

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                 | id                                | Contenuto                                                 |
| :---------------------- | :-------------------------------- | :-------------------------------------------------------- |
| `stallo`                | 14                                | Piazza Aubry n. 1, `DISABILI`, `LIBERO`, tariffa 1        |
| `stallo`                | 16                                | Piazza Aubry n. 3, `LIBERO`, `NESSUN_VEICOLO`             |
| `stallo`                | 3, 17, 18, 19, 20, 21, 23, 26, 29 | `OCCUPATO`, `VEICOLO_PRESENTE`; 3 `ORDINARIO_A_PAGAMENTO` |
| `stallo`                | 13                                | `SCONOSCIUTO`, `VEICOLO_PRESENTE`                         |
| `tariffa`               | 1                                 | 150 centesimi l'ora, `08:00:00`–`20:00:00`, 180 minuti    |
| `automobilista_veicolo` | (7, 1)                            | Elena Bianchi con il veicolo 1 (`EF456GH`)                |

Colonne usate dai test (lette o scritte tramite le funzioni di persistenza o la Facade):

| Tabella   | Colonne                                                                                                                                                              |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stallo`  | `id`, `tipo_di_stallo`, `stato`, `occupazione_rilevata`, `data_e_ora_dell_ultima_rilevazione`, `tariffa_id`                                                          |
| `tariffa` | `id`, `costo_orario`, `orario_inizio_vigenza`, `orario_fine_vigenza`, `durata_massima`                                                                               |
| `sosta`   | `id`, `automobilista_id`, `veicolo_id`, `stallo_id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`, `dichiarazione_di_permesso`, `foto_del_permesso` |

Id inesistente: `999999`.

## 4. Categorie e scelte

**statoETariffa — Stallo**

1. esistente
2. inesistente [error]

**impostaNonDisponibile — Stato di partenza**

1. Occupato
2. Libero [error]
3. già Non disponibile [error]
4. Sconosciuto [error]
5. stallo inesistente [error]

**impostaNonDisponibile — Esecutore**

1. assente (transazione propria)
2. di una transazione esterna confermata [single]
3. di una transazione esterna annullata [single]

**ripristinaStatoRilevato — Stato di partenza e occupazione rilevata**

1. Non disponibile con veicolo presente
2. Non disponibile con nessun veicolo
3. non Non disponibile (Occupato) [error]
4. stallo inesistente [error]

**ripristinaStatoRilevato — Osservatori ed esecutore**

1. registro, senza esecutore
2. registro, poi guasto [error]
3. Gestione soste, con l'esecutore di una transazione esterna [single]

## 5. Test frame (15)

| Frame     | Operazione e scelte                                                                                                                                                           | Esito atteso                                                                                                                                                                   | Riferimento |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-SOS-01 | `statoETariffa(14)`                                                                                                                                                           | `{ stallo: 14, tipoDiStallo: "DISABILI", stato: "LIBERO", tariffa: { costoOrario: 150, orarioInizioVigenza: "08:00:00", orarioFineVigenza: "20:00:00", durataMassima: 180 } }` | RF_SOSTA_1  |
| TF-SOS-02 | `statoETariffa(999999)`                                                                                                                                                       | errore `STALLO_INESISTENTE`                                                                                                                                                    | RF_SOSTA_1  |
| TF-SOS-03 | `impostaNonDisponibile(17)` (`OCCUPATO`)                                                                                                                                      | stallo 17 `NON_DISPONIBILE`, occupazione `VEICOLO_PRESENTE` invariata; nessuna notifica                                                                                        | RF_SOSTA_6  |
| TF-SOS-04 | `impostaNonDisponibile(16)` (`LIBERO`)                                                                                                                                        | errore `STALLO_NON_OCCUPATO`; stallo 16 resta `LIBERO`                                                                                                                         | RF_SOSTA_1  |
| TF-SOS-05 | `impostaNonDisponibile(18)`, poi di nuovo `impostaNonDisponibile(18)`                                                                                                         | la seconda chiamata: errore `STALLO_NON_OCCUPATO`; stallo 18 resta `NON_DISPONIBILE`                                                                                           | RF_SOSTA_1  |
| TF-SOS-06 | `impostaNonDisponibile(13)` (`SCONOSCIUTO`)                                                                                                                                   | errore `STALLO_NON_OCCUPATO`; stallo 13 resta `SCONOSCIUTO`                                                                                                                    | RF_SOSTA_1  |
| TF-SOS-07 | `impostaNonDisponibile(999999)`                                                                                                                                               | errore `STALLO_INESISTENTE`                                                                                                                                                    | RF_SOSTA_1  |
| TF-SOS-08 | in `eseguiInTransazione`: `impostaNonDisponibile(19, client)`, poi `statoETariffa(19, client)`; la transazione va in commit                                                   | dentro la transazione `statoETariffa` restituisce `NON_DISPONIBILE`; dopo il commit lo stallo 19 è `NON_DISPONIBILE`                                                           | ISSUE_7     |
| TF-SOS-09 | in `eseguiInTransazione`: `impostaNonDisponibile(20, client)`, poi il test lancia l'errore "annulla"                                                                          | `eseguiInTransazione` rilancia "annulla"; lo stallo 20 resta `OCCUPATO`                                                                                                        | ISSUE_7     |
| TF-SOS-10 | stallo 21 portato a `NON_DISPONIBILE` con `impostaNonDisponibile(21)`; `ripristinaStatoRilevato(21)`                                                                          | restituisce `OCCUPATO`; stallo 21 `OCCUPATO`, `VEICOLO_PRESENTE`; nessuna notifica                                                                                             | RF_SOSTA_6  |
| TF-SOS-11 | stallo 23 `NON_DISPONIBILE` con nessun veicolo; `ripristinaStatoRilevato(23)`                                                                                                 | restituisce `LIBERO`; stallo 23 `LIBERO`, `NESSUN_VEICOLO`; il registro ha ricevuto una sola notifica, `{ stallo: 23 }`                                                        | RF_SOSTA_6  |
| TF-SOS-12 | `ripristinaStatoRilevato(26)` (`OCCUPATO`)                                                                                                                                    | errore `STALLO_NON_IMPEGNATO`; stallo 26 resta `OCCUPATO`; nessuna notifica                                                                                                    | RF_SOSTA_6  |
| TF-SOS-13 | `ripristinaStatoRilevato(999999)`                                                                                                                                             | errore `STALLO_INESISTENTE`; nessuna notifica                                                                                                                                  | RF_SOSTA_6  |
| TF-SOS-14 | stallo 29 `NON_DISPONIBILE` con nessun veicolo; Facade con registro, poi guasto; `ripristinaStatoRilevato(29)`                                                                | l'errore lanciato è quello del guasto; stallo 29 resta `NON_DISPONIBILE` con `NESSUN_VEICOLO`                                                                                  | ISSUE_7     |
| TF-SOS-15 | preparazione sotto; Facade con l'osservatore Gestione soste; in `eseguiInTransazione`: `impostaSostaScaduta(client, sosta)`, poi `ripristinaStatoRilevato(3, client)`; commit | restituisce `LIBERO`; dopo il commit stallo 3 `LIBERO` e sosta `TERMINATA`                                                                                                     | VD_11       |

Preparazione di TF-SOS-15 (scenario di `UC_SOSTA_7` 3.a1):

1. `creaSosta(poolDiTest(), { automobilistaId: 7, veicoloId: 1, stalloId: 3, orarioDiAvvio: 2026-11-20 08:00:00+01, orarioDiScadenza: 2026-11-20 09:00:00+01, pagamento: "PAGATA" })`.
2. `impostaNonDisponibile(3)`.
3. `registraRilevazione({ stallo: 3, presenza: false, dataOra: istante di prova })`: lo stallo resta `NON_DISPONIBILE` con nessun veicolo.

Lo stato della sosta si verifica con `trovaSosta`.

Note sui riferimenti:

- TF-SOS-01 e 02: `SD_SOSTA_1` 2.1, 2.2 e 3.1 (stato, durata massima, costo orario e orari di vigenza dello stallo).
- TF-SOS-04…07: `UC_SOSTA_1` 2.a1 (lo stallo non è `Occupato`).
- TF-SOS-08, 09: decisione D del piano. Lo stallo diventa `Non disponibile` nella stessa transazione in cui Gestione soste crea la sosta (`SD_SOSTA_1` 6.1–6.3).
- TF-SOS-10, 11: RF_SOSTA_6 («riportarlo alla scadenza allo stato rilevato dal sensore»), VD_20.
- TF-SOS-12: decisione I del piano. `scadenzaSosta` esce solo da `Non disponibile` (`SCD_1`).
- TF-SOS-15: VD_11. La sosta diventa `Terminata` quando lo stallo risulta libero, nella transazione della scadenza.

## 6. Indicazione per Gestione soste: chi porta la sosta a Terminata

`SD_SOSTA_7` (3.a1.2–3.a1.3) fa portare la sosta a `Terminata` da `ControlloScadenza` subito dopo `impostaStato(Libero)`. Secondo `SCD_1` e `sincronizzazione_eventi.md` §1, invece, è l'azione d'ingresso di `Libero` (`terminaSosta()`) a portare a `Terminata` tutte le soste `Scadute` dello stallo. In Gestione stalli questa azione è la notifica agli osservatori, e TF-SOS-11 e 15 lo verificano.

Gestione soste deve quindi farlo in un solo punto. Indicazione: nella scadenza, `ControlloScadenza` porta la sosta a `Scaduta` e chiama `ripristinaStatoRilevato(stallo, esecutore)` nella propria transazione. Se lo stallo torna `LIBERO`, la porta a `Terminata` il suo osservatore (`terminaSosta`), lo stesso che serve per `UC_IOT_1` 3.a2. `ControlloScadenza` non la porta a `Terminata` da sé. La funzione `terminaSosteScaduteDelloStallo` aggiorna solo le soste `SCADUTA`, quindi una doppia chiamata non avrebbe effetti, ma resterebbe una duplicazione rispetto al modello.
