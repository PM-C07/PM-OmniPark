# cp_rilevazioni

Specifica dei casi di test (category partition) del servizio Rilevazioni del sottosistema Gestione stalli, operazione `registraRilevazione(rilevazione)` della Facade.
Requisiti: RF_IOT_1 (acquisizione dei dati dei sensori), RF_SOSTA_6 (stallo Non disponibile durante la sosta, parte). Task OMP-43 (issue #7).

- **Fonti dell'esito atteso:** `UC_IOT_1`, `SD_IOT_1`, statechart `SCD_1` e `docs/rad/statechart/sincronizzazione_eventi.md` §1, `docs/rad/vincoli_dominio.md` §2 (VD_6, VD_11, VD_20), piano approvato di OMP-43 (tabella delle transizioni, decisioni A–C).
- **File di test:** `src/application/gestione-stalli/rilevazioni.db.test.ts` (eseguito da `npm run test:db`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_7` per le scelte di progetto dell'issue #7 e del piano approvato (pattern Observer, rilevazione superata).

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_IOT_1 · TF-RIL-04 · stallo Occupato, nessun veicolo → Libero e notifica`.

## 2. Operazione verificata (firme)

```ts
// da src/application/gestione-stalli/facade.ts
type StatoStallo = "LIBERO" | "OCCUPATO" | "NON_DISPONIBILE" | "SCONOSCIUTO";
type RilevazioneRicevuta = { stallo?: number | null; presenza?: boolean | null; dataOra?: Date | null };
type StalloLiberato = { stallo: number };
type OsservatoreStalli = { terminaSosta(evento: StalloLiberato, esecutore: PoolClient): Promise<void> };

creaFacadeGestioneStalli(dipendenze?: { pool?: Pool; osservatori?: readonly OsservatoreStalli[] }): FacadeGestioneStalli;
facade.registraRilevazione(rilevazione: RilevazioneRicevuta): Promise<StatoStallo>; // restituisce il nuovo stato
facade.impostaNonDisponibile(stallo: number, esecutore?: PoolClient): Promise<void>;  // solo per preparare i frame
// errori: ErroreGestioneStalli con `codice` (esportati dalla Facade)
```

- `presenza`: `true` = veicolo presente (`VEICOLO_PRESENTE`), `false` = nessun veicolo (`NESSUN_VEICOLO`).
- La rilevazione è registrata, lo stato aggiornato e gli osservatori notificati nella stessa transazione. Gli osservatori sono chiamati in ordine con l'esecutore della transazione; se uno fallisce l'errore risale invariato al chiamante e tutto è annullato.
- Liberazione = ingresso in `LIBERO` da un altro stato (azione d'ingresso `terminaSosta()` di `SCD_1`): è l'unico caso in cui gli osservatori ricevono `{ stallo }`.
- Controlli, nell'ordine: completezza (stallo, presenza, data e ora presenti; un `Date` non valido conta come mancante) → `RILEVAZIONE_INCOMPLETA`; esistenza dello stallo → `STALLO_INESISTENTE`; data e ora strettamente precedente all'ultima rilevazione dello stallo → `RILEVAZIONE_SUPERATA`. Nessun controllo sulle date future (il servizio non ha un orologio).

Funzioni dello strato di persistenza usate dai test solo per preparare e verificare i dati (mai stub): `trovaStallo(es, id)` (stato, `occupazioneRilevata`, `dataEOraUltimaRilevazione`), `creaSosta(es, dati)`, `impostaSostaScaduta(es, id)`, `trovaSosta(es, id)`, `terminaSosteScaduteDelloStallo(es, stalloId)`, con `poolDiTest()` come esecutore.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. La Facade usa `poolDiTest()` e le sue transazioni vanno in commit: ogni frame usa uno stallo diverso, così i frame non dipendono dall'ordine.
- **Osservatore di prova "registro"**: aggiunge ogni evento ricevuto a un elenco del test (con un'etichetta, per verificare l'ordine) e non scrive nulla.
- **Osservatore di prova "lettore"**: con l'esecutore ricevuto legge lo stato dello stallo (`trovaStallo(esecutore, evento.stallo)`) e lo registra.
- **Osservatore di prova "Gestione soste"**: con l'esecutore ricevuto chiama `terminaSosteScaduteDelloStallo(esecutore, evento.stallo)` (UC_IOT_1 3.a2, sincronizzazione §1).
- **Osservatore di prova "guasto"**: lancia sempre `new Error("osservatore guasto")`.
- Salvo indicazione diversa, la Facade è creata con il solo osservatore "registro".
- Istanti: dataset `2026-11-15 08:00:00+01` (ultima rilevazione degli stalli `LIBERO` e `OCCUPATO`); di prova `2026-11-20 09:00:00+01`; per i frame con una sosta `2026-11-20 10:20:00+01`.
- "Invariato" significa: stesso `stato`, stessa `occupazioneRilevata` e stessa `dataEOraUltimaRilevazione` del dataset, e nessuna notifica.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                 | id                                 | Contenuto                                                                                                   |
| :---------------------- | :--------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| `stallo`                | 1, 2, 5, 6, 9                      | `LIBERO`, `NESSUN_VEICOLO`, ultima rilevazione all'istante del dataset                                      |
| `stallo`                | 3, 4, 7, 8, 11, 12, 15, 17, 18, 19 | `OCCUPATO`, `VEICOLO_PRESENTE`, ultima rilevazione all'istante del dataset; 18 e 19 `ORDINARIO_A_PAGAMENTO` |
| `stallo`                | 13                                 | `SCONOSCIUTO`, `VEICOLO_PRESENTE` rilevato il `2026-11-15 07:00:00+01`                                      |
| `stallo`                | 25                                 | `SCONOSCIUTO`, mai rilevato (`occupazione_rilevata` e data `NULL`)                                          |
| `automobilista_veicolo` | (7, 1), (8, 3)                     | Elena Bianchi con il veicolo 1 (`EF456GH`), Marco Rossi con il veicolo 3 (`MN234PQ`)                        |

Colonne usate dai test (lette o scritte tramite le funzioni di persistenza):

| Tabella  | Colonne                                                                                                                                                              |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stallo` | `id`, `stato`, `occupazione_rilevata`, `data_e_ora_dell_ultima_rilevazione`                                                                                          |
| `sosta`  | `id`, `automobilista_id`, `veicolo_id`, `stallo_id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`, `dichiarazione_di_permesso`, `foto_del_permesso` |

Id inesistente: `999999`.

**Pool irraggiungibile (solo TF-RIL-23 e 24).** Per verificare che non avvenga alcuna query, la Facade di questi frame è creata con un pool verso un indirizzo dove nessun database risponde: `creaPool("postgresql://prova@127.0.0.1:1/omnipark_test")` (da `src/persistence/db.ts`), chiuso con `end()` alla fine del frame. Qualsiasi accesso al database fallirebbe con l'errore di persistenza `DATABASE_NON_RAGGIUNGIBILE`, quindi ricevere `STALLO_INESISTENTE` dimostra che la rilevazione è stata scartata prima di qualsiasi query. Non è uno stub: è un pool reale senza un database raggiungibile.

## 4. Categorie e scelte

**Stallo**

1. esistente
2. inesistente [error]
3. mancante [error]
4. presente ma non intero positivo (`0`, `1.5`) [error]

**Presenza**

1. vero
2. falso
3. mancante [error]

**Data e ora**

1. successiva all'ultima rilevazione
2. uguale all'ultima rilevazione [single]
3. stallo mai rilevato [single]
4. precedente all'ultima rilevazione [error]
5. mancante [error]
6. non valida (`new Date(NaN)`) [error]

**Stato attuale dello stallo**

1. Libero
2. Occupato
3. Non disponibile [property ND]
4. Sconosciuto

Vincolo: [if ND] con presenza vero o falso lo stato resta `NON_DISPONIBILE` (SCD_1, transizione interna; UC_IOT_1 3.a1).

**Osservatori**

1. nessuno [single]
2. uno
3. due [single]
4. uno che fallisce dopo uno che ha scritto [error]

## 5. Test frame (24)

| Frame     | Stallo e stato                                                | Rilevazione                                      | Osservatori                                  | Esito atteso                                                                                                                    | Riferimento |
| :-------- | :------------------------------------------------------------ | :----------------------------------------------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-RIL-01 | 1, `LIBERO`                                                   | presenza vero, istante di prova                  | registro                                     | restituisce `OCCUPATO`; stallo `OCCUPATO`, `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica        | RF_IOT_1    |
| TF-RIL-02 | 2, `LIBERO`                                                   | presenza falso, istante di prova                 | registro                                     | `LIBERO`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; nessuna notifica                                           | RF_IOT_1    |
| TF-RIL-03 | 3, `OCCUPATO`                                                 | presenza vero, istante di prova                  | registro                                     | `OCCUPATO`; `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica                                       | RF_IOT_1    |
| TF-RIL-04 | 4, `OCCUPATO`                                                 | presenza falso, istante di prova                 | registro                                     | `LIBERO`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; il registro ha ricevuto una sola notifica, `{ stallo: 4 }` | RF_IOT_1    |
| TF-RIL-05 | 7, portato a `NON_DISPONIBILE` con `impostaNonDisponibile(7)` | presenza vero, istante di prova                  | registro                                     | `NON_DISPONIBILE`; `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica                                | RF_SOSTA_6  |
| TF-RIL-06 | 8, portato a `NON_DISPONIBILE` con `impostaNonDisponibile(8)` | presenza falso, istante di prova                 | registro                                     | `NON_DISPONIBILE`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; nessuna notifica                                  | VD_20       |
| TF-RIL-07 | 13, `SCONOSCIUTO` (rilevato alle 07:00)                       | presenza vero, istante di prova                  | registro                                     | `OCCUPATO`; `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica                                       | RF_IOT_1    |
| TF-RIL-08 | 25, `SCONOSCIUTO`, mai rilevato                               | presenza falso, istante di prova                 | registro                                     | rilevazione accettata: `LIBERO`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; una notifica, `{ stallo: 25 }`      | RF_IOT_1    |
| TF-RIL-09 | 999999                                                        | presenza vero, istante di prova                  | registro                                     | errore `STALLO_INESISTENTE`; nessuna notifica                                                                                   | RF_IOT_1    |
| TF-RIL-10 | mancante (`stallo` assente)                                   | presenza vero, istante di prova                  | registro                                     | errore `RILEVAZIONE_INCOMPLETA`; nessuna notifica                                                                               | RF_IOT_1    |
| TF-RIL-11 | 5, `LIBERO`                                                   | presenza mancante (`null`), istante di prova     | registro                                     | errore `RILEVAZIONE_INCOMPLETA`; stallo 5 invariato                                                                             | RF_IOT_1    |
| TF-RIL-12 | 5, `LIBERO`                                                   | presenza vero, data e ora mancante (assente)     | registro                                     | errore `RILEVAZIONE_INCOMPLETA`; stallo 5 invariato                                                                             | RF_IOT_1    |
| TF-RIL-13 | 5, `LIBERO`                                                   | presenza vero, data e ora `new Date(NaN)`        | registro                                     | errore `RILEVAZIONE_INCOMPLETA`; stallo 5 invariato                                                                             | RF_IOT_1    |
| TF-RIL-14 | 6, `LIBERO` (ultima rilevazione 08:00:00)                     | presenza vero, `2026-11-15 07:59:59+01`          | registro                                     | errore `RILEVAZIONE_SUPERATA`; stallo 6 invariato                                                                               | ISSUE_7     |
| TF-RIL-15 | 9, `LIBERO` (ultima rilevazione 08:00:00)                     | presenza vero, `2026-11-15 08:00:00+01` (uguale) | registro                                     | rilevazione accettata: `OCCUPATO`; `VEICOLO_PRESENTE`, ultima rilevazione `2026-11-15 08:00:00+01`                              | ISSUE_7     |
| TF-RIL-16 | 11, `OCCUPATO`                                                | presenza falso, istante di prova                 | nessuno (Facade creata senza osservatori)    | `LIBERO`, senza errori                                                                                                          | ISSUE_7     |
| TF-RIL-17 | 12, `OCCUPATO`                                                | presenza falso, istante di prova                 | registro "primo", poi registro "secondo"     | `LIBERO`; le notifiche ricevute, in ordine, sono `primo { stallo: 12 }` e `secondo { stallo: 12 }`, una per osservatore         | ISSUE_7     |
| TF-RIL-18 | 15, `OCCUPATO`                                                | presenza falso, istante di prova                 | registro, poi guasto                         | l'errore lanciato è quello del guasto (`osservatore guasto`); stallo 15 invariato (`OCCUPATO`, `VEICOLO_PRESENTE`, 08:00)       | ISSUE_7     |
| TF-RIL-19 | 17, `OCCUPATO`                                                | presenza falso, istante di prova                 | lettore                                      | `LIBERO`; il lettore ha letto `LIBERO` con l'esecutore ricevuto (la modifica è visibile dentro la transazione)                  | ISSUE_7     |
| TF-RIL-20 | 18, `OCCUPATO`, con una sosta `SCADUTA` (preparazione sotto)  | presenza falso, `2026-11-20 10:20:00+01`         | Gestione soste                               | `LIBERO`; la sosta è `TERMINATA`                                                                                                | VD_11       |
| TF-RIL-21 | 19, `OCCUPATO`, con una sosta `SCADUTA` (preparazione sotto)  | presenza falso, `2026-11-20 10:20:00+01`         | Gestione soste, poi guasto                   | errore del guasto; stallo 19 invariato; la sosta resta `SCADUTA` (la scrittura del primo osservatore è annullata)               | ISSUE_7     |
| TF-RIL-22 | 5, `LIBERO`                                                   | presenza mancante e data e ora mancante insieme  | registro                                     | errore `RILEVAZIONE_INCOMPLETA` (un solo errore anche con più dati mancanti); stallo 5 invariato                                | RF_IOT_1    |
| TF-RIL-23 | `0`                                                           | presenza vero, istante di prova                  | registro; Facade con il pool irraggiungibile | errore `STALLO_INESISTENTE` (non `DATABASE_NON_RAGGIUNGIBILE`: nessuna query); nessuna notifica                                 | RF_IOT_1    |
| TF-RIL-24 | `1.5`                                                         | presenza vero, istante di prova                  | registro; Facade con il pool irraggiungibile | errore `STALLO_INESISTENTE` (non `DATABASE_NON_RAGGIUNGIBILE`: nessuna query); nessuna notifica                                 | RF_IOT_1    |

Preparazione di TF-RIL-20 e TF-RIL-21: `creaSosta(poolDiTest(), { automobilistaId, veicoloId, stalloId, orarioDiAvvio: 2026-11-20 09:00:00+01, orarioDiScadenza: 2026-11-20 10:00:00+01, pagamento: "PAGATA" })` con automobilista 7 e veicolo 1 per lo stallo 18, automobilista 8 e veicolo 3 per lo stallo 19; poi `impostaSostaScaduta(poolDiTest(), id)`. Lo stallo resta `OCCUPATO`, come dopo il ripristino alla scadenza con veicolo presente (SC_UT_8). Lo stato della sosta si verifica con `trovaSosta`.

Note sui riferimenti:

- TF-RIL-04 e 08: la notifica è l'azione d'ingresso di `Libero` (`SCD_1`); il frame è riferito a RF_IOT_1 perché ne verifica anzitutto lo stato. Il comportamento degli osservatori è verificato da TF-RIL-16…21 (ISSUE_7, pattern Observer).
- TF-RIL-05: vincolo [if ND] con presenza vero (RF_SOSTA_6, VD_6). TF-RIL-06: VD_20, l'occupazione rilevata si conserva anche mentre lo stallo è Non disponibile.
- TF-RIL-23 e 24: uno stallo si identifica con un intero positivo, quindi un valore presente ma non intero positivo indica uno stallo che non può esistere (RF_IOT_1, «stallo inesistente»). La rilevazione è scartata prima di qualsiasi accesso al database.
- TF-RIL-14 e 15: decisione B del piano (in serverless le richieste possono arrivare fuori ordine); TF-RIL-08 copre la scelta "stallo mai rilevato".
- TF-RIL-20: VD_11 e UC_IOT_1 3.a2 (la sosta Scaduta diventa Terminata quando il veicolo lascia lo stallo), realizzato dall'osservatore nella stessa transazione.
