# cp_rilevazioni

Specifica dei casi di test (category partition) del servizio Rilevazioni del sottosistema Gestione stalli, operazioni `registraRilevazione(rilevazione)` e, dalla COD-23, `marcaSconosciuti(adesso)` della Facade.
Requisiti: RF_IOT_1 (acquisizione dei dati dei sensori), RF_SOSTA_6 (stallo Non disponibile durante la sosta, parte), RF_IOT_2 (stato Sconosciuto dopo 60 secondi senza rilevazioni, §7). Task OMP-43 (issue #7); §7 da OMP-64 (COD-23, issue #44).

- **Fonti dell'esito atteso:** `UC_IOT_1`, `SD_IOT_1`, statechart `SCD_1` e `docs/rad/statechart/sincronizzazione_eventi.md` §1, `docs/rad/vincoli_dominio.md` §2 (VD_6, VD_11, VD_20), piano approvato di OMP-43 (tabella delle transizioni, decisioni A–C).
- **File di test:** `src/application/gestione-stalli/rilevazioni.db.test.ts` (eseguito da `npm run test:db`); TF-RIL-25 e 26, aggiunti da COD-14 (OMP-47), sono in `src/application/gestione-stalli/rilevazioni.dataFutura.db.test.ts`; TF-RIL-27…35 (§7, COD-23) in `src/application/gestione-stalli/rilevazioni.sconosciuto.db.test.ts`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_7` per le scelte di progetto dell'issue #7 e del piano approvato (pattern Observer, rilevazione superata); `COD_14` per le scelte del piano approvato di COD-14 (rilevazione con data futura); `COD_23` per le scelte del piano approvato di COD-23 (aggiornamento condizionato).

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_IOT_1 · TF-RIL-04 · stallo Occupato, nessun veicolo → Libero e notifica`.

## 2. Operazione verificata (firme)

```ts
// da src/application/gestione-stalli/facade.ts
type StatoStallo = "LIBERO" | "OCCUPATO" | "NON_DISPONIBILE" | "SCONOSCIUTO";
type RilevazioneRicevuta = { stallo?: number | null; presenza?: boolean | null; dataOra?: Date | null };
type StalloLiberato = { stallo: number };
type OsservatoreStalli = { terminaSosta(evento: StalloLiberato, esecutore: PoolClient): Promise<void> };

creaFacadeGestioneStalli(dipendenze?: { pool?: Pool; osservatori?: readonly OsservatoreStalli[]; orologio?: Orologio }): FacadeGestioneStalli; // senza orologio: orologioDiSistema
facade.registraRilevazione(rilevazione: RilevazioneRicevuta): Promise<StatoStallo>; // restituisce il nuovo stato
facade.impostaNonDisponibile(stallo: number, esecutore?: PoolClient): Promise<void>;  // solo per preparare i frame
// errori: ErroreGestioneStalli con `codice` (esportati dalla Facade)
```

- `presenza`: `true` = veicolo presente (`VEICOLO_PRESENTE`), `false` = nessun veicolo (`NESSUN_VEICOLO`).
- La rilevazione è registrata, lo stato aggiornato e gli osservatori notificati nella stessa transazione. Gli osservatori sono chiamati in ordine con l'esecutore della transazione; se uno fallisce l'errore risale invariato al chiamante e tutto è annullato.
- Liberazione = ingresso in `LIBERO` da un altro stato (azione d'ingresso `terminaSosta()` di `SCD_1`): è l'unico caso in cui gli osservatori ricevono `{ stallo }`.
- Controlli, nell'ordine: completezza (stallo, presenza, data e ora presenti; un `Date` non valido conta come mancante) → `RILEVAZIONE_INCOMPLETA`; data e ora successiva a `orologio.adesso()`, senza tolleranza (uguale è accettata, come per le letture ANPR) → `RILEVAZIONE_NON_VALIDA`; esistenza dello stallo → `STALLO_INESISTENTE`; data e ora strettamente precedente all'ultima rilevazione dello stallo → `RILEVAZIONE_SUPERATA`.

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
7. successiva all'istante corrente [error]
8. uguale all'istante corrente [single]

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

## 5. Test frame (26)

| Frame     | Stallo e stato                                                | Rilevazione                                      | Osservatori                                                  | Esito atteso                                                                                                                    | Riferimento |
| :-------- | :------------------------------------------------------------ | :----------------------------------------------- | :----------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-RIL-01 | 1, `LIBERO`                                                   | presenza vero, istante di prova                  | registro                                                     | restituisce `OCCUPATO`; stallo `OCCUPATO`, `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica        | RF_IOT_1    |
| TF-RIL-02 | 2, `LIBERO`                                                   | presenza falso, istante di prova                 | registro                                                     | `LIBERO`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; nessuna notifica                                           | RF_IOT_1    |
| TF-RIL-03 | 3, `OCCUPATO`                                                 | presenza vero, istante di prova                  | registro                                                     | `OCCUPATO`; `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica                                       | RF_IOT_1    |
| TF-RIL-04 | 4, `OCCUPATO`                                                 | presenza falso, istante di prova                 | registro                                                     | `LIBERO`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; il registro ha ricevuto una sola notifica, `{ stallo: 4 }` | RF_IOT_1    |
| TF-RIL-05 | 7, portato a `NON_DISPONIBILE` con `impostaNonDisponibile(7)` | presenza vero, istante di prova                  | registro                                                     | `NON_DISPONIBILE`; `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica                                | RF_SOSTA_6  |
| TF-RIL-06 | 8, portato a `NON_DISPONIBILE` con `impostaNonDisponibile(8)` | presenza falso, istante di prova                 | registro                                                     | `NON_DISPONIBILE`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; nessuna notifica                                  | VD_20       |
| TF-RIL-07 | 13, `SCONOSCIUTO` (rilevato alle 07:00)                       | presenza vero, istante di prova                  | registro                                                     | `OCCUPATO`; `VEICOLO_PRESENTE`, ultima rilevazione all'istante di prova; nessuna notifica                                       | RF_IOT_1    |
| TF-RIL-08 | 25, `SCONOSCIUTO`, mai rilevato                               | presenza falso, istante di prova                 | registro                                                     | rilevazione accettata: `LIBERO`; `NESSUN_VEICOLO`, ultima rilevazione all'istante di prova; una notifica, `{ stallo: 25 }`      | RF_IOT_1    |
| TF-RIL-09 | 999999                                                        | presenza vero, istante di prova                  | registro                                                     | errore `STALLO_INESISTENTE`; nessuna notifica                                                                                   | RF_IOT_1    |
| TF-RIL-10 | mancante (`stallo` assente)                                   | presenza vero, istante di prova                  | registro                                                     | errore `RILEVAZIONE_INCOMPLETA`; nessuna notifica                                                                               | RF_IOT_1    |
| TF-RIL-11 | 5, `LIBERO`                                                   | presenza mancante (`null`), istante di prova     | registro                                                     | errore `RILEVAZIONE_INCOMPLETA`; stallo 5 invariato                                                                             | RF_IOT_1    |
| TF-RIL-12 | 5, `LIBERO`                                                   | presenza vero, data e ora mancante (assente)     | registro                                                     | errore `RILEVAZIONE_INCOMPLETA`; stallo 5 invariato                                                                             | RF_IOT_1    |
| TF-RIL-13 | 5, `LIBERO`                                                   | presenza vero, data e ora `new Date(NaN)`        | registro                                                     | errore `RILEVAZIONE_INCOMPLETA`; stallo 5 invariato                                                                             | RF_IOT_1    |
| TF-RIL-14 | 6, `LIBERO` (ultima rilevazione 08:00:00)                     | presenza vero, `2026-11-15 07:59:59+01`          | registro                                                     | errore `RILEVAZIONE_SUPERATA`; stallo 6 invariato                                                                               | ISSUE_7     |
| TF-RIL-15 | 9, `LIBERO` (ultima rilevazione 08:00:00)                     | presenza vero, `2026-11-15 08:00:00+01` (uguale) | registro                                                     | rilevazione accettata: `OCCUPATO`; `VEICOLO_PRESENTE`, ultima rilevazione `2026-11-15 08:00:00+01`                              | ISSUE_7     |
| TF-RIL-16 | 11, `OCCUPATO`                                                | presenza falso, istante di prova                 | nessuno (Facade creata senza osservatori)                    | `LIBERO`, senza errori                                                                                                          | ISSUE_7     |
| TF-RIL-17 | 12, `OCCUPATO`                                                | presenza falso, istante di prova                 | registro "primo", poi registro "secondo"                     | `LIBERO`; le notifiche ricevute, in ordine, sono `primo { stallo: 12 }` e `secondo { stallo: 12 }`, una per osservatore         | ISSUE_7     |
| TF-RIL-18 | 15, `OCCUPATO`                                                | presenza falso, istante di prova                 | registro, poi guasto                                         | l'errore lanciato è quello del guasto (`osservatore guasto`); stallo 15 invariato (`OCCUPATO`, `VEICOLO_PRESENTE`, 08:00)       | ISSUE_7     |
| TF-RIL-19 | 17, `OCCUPATO`                                                | presenza falso, istante di prova                 | lettore                                                      | `LIBERO`; il lettore ha letto `LIBERO` con l'esecutore ricevuto (la modifica è visibile dentro la transazione)                  | ISSUE_7     |
| TF-RIL-20 | 18, `OCCUPATO`, con una sosta `SCADUTA` (preparazione sotto)  | presenza falso, `2026-11-20 10:20:00+01`         | Gestione soste                                               | `LIBERO`; la sosta è `TERMINATA`                                                                                                | VD_11       |
| TF-RIL-21 | 19, `OCCUPATO`, con una sosta `SCADUTA` (preparazione sotto)  | presenza falso, `2026-11-20 10:20:00+01`         | Gestione soste, poi guasto                                   | errore del guasto; stallo 19 invariato; la sosta resta `SCADUTA` (la scrittura del primo osservatore è annullata)               | ISSUE_7     |
| TF-RIL-22 | 5, `LIBERO`                                                   | presenza mancante e data e ora mancante insieme  | registro                                                     | errore `RILEVAZIONE_INCOMPLETA` (un solo errore anche con più dati mancanti); stallo 5 invariato                                | RF_IOT_1    |
| TF-RIL-23 | `0`                                                           | presenza vero, istante di prova                  | registro; Facade con il pool irraggiungibile                 | errore `STALLO_INESISTENTE` (non `DATABASE_NON_RAGGIUNGIBILE`: nessuna query); nessuna notifica                                 | RF_IOT_1    |
| TF-RIL-24 | `1.5`                                                         | presenza vero, istante di prova                  | registro; Facade con il pool irraggiungibile                 | errore `STALLO_INESISTENTE` (non `DATABASE_NON_RAGGIUNGIBILE`: nessuna query); nessuna notifica                                 | RF_IOT_1    |
| TF-RIL-25 | 5, `LIBERO`                                                   | presenza vero, `2026-11-20 09:00:01+01`          | registro; Facade con orologio fisso `2026-11-20 09:00:00+01` | errore `RILEVAZIONE_NON_VALIDA`; stallo 5 invariato                                                                             | COD_14      |
| TF-RIL-26 | 6, `LIBERO`                                                   | presenza vero, `2026-11-20 09:00:00+01` (uguale) | registro; Facade con orologio fisso `2026-11-20 09:00:00+01` | rilevazione accettata: `OCCUPATO`; `VEICOLO_PRESENTE`, ultima rilevazione `2026-11-20 09:00:00+01`                              | COD_14      |

Preparazione di TF-RIL-20 e TF-RIL-21: `creaSosta(poolDiTest(), { automobilistaId, veicoloId, stalloId, orarioDiAvvio: 2026-11-20 09:00:00+01, orarioDiScadenza: 2026-11-20 10:00:00+01, pagamento: "PAGATA" })` con automobilista 7 e veicolo 1 per lo stallo 18, automobilista 8 e veicolo 3 per lo stallo 19; poi `impostaSostaScaduta(poolDiTest(), id)`. Lo stallo resta `OCCUPATO`, come dopo il ripristino alla scadenza con veicolo presente (SC_UT_8). Lo stato della sosta si verifica con `trovaSosta`.

Note sui riferimenti:

- TF-RIL-04 e 08: la notifica è l'azione d'ingresso di `Libero` (`SCD_1`); il frame è riferito a RF_IOT_1 perché ne verifica anzitutto lo stato. Il comportamento degli osservatori è verificato da TF-RIL-16…21 (ISSUE_7, pattern Observer).
- TF-RIL-05: vincolo [if ND] con presenza vero (RF_SOSTA_6, VD_6). TF-RIL-06: VD_20, l'occupazione rilevata si conserva anche mentre lo stallo è Non disponibile.
- TF-RIL-23 e 24: uno stallo si identifica con un intero positivo, quindi un valore presente ma non intero positivo indica uno stallo che non può esistere (RF_IOT_1, «stallo inesistente»). La rilevazione è scartata prima di qualsiasi accesso al database.
- TF-RIL-14 e 15: decisione B del piano (in serverless le richieste possono arrivare fuori ordine); TF-RIL-08 copre la scelta "stallo mai rilevato".
- TF-RIL-20: VD_11 e UC_IOT_1 3.a2 (la sosta Scaduta diventa Terminata quando il veicolo lascia lo stallo), realizzato dall'osservatore nella stessa transazione.
- TF-RIL-25 e 26: decisione 3 del piano di COD-14, senza tolleranza. Una rilevazione con data futura diventerebbe l'ultima dello stallo e farebbe rifiutare come superate tutte le rilevazioni reali successive; quella all'istante corrente è accettata.

## 7. Stato Sconosciuto: `marcaSconosciuti(adesso)` (COD-23)

- **Fonti dell'esito atteso:** `RF_IOT_2`, `UC_IOT_2` (passi 1–3, flusso 2.a1), `SD_IOT_2`, statechart `SCD_1` (`Libero` e `Occupato` → `Sconosciuto` `when(nessuna rilevazione da più di 60 s)`; `Sconosciuto` → `Libero` od `Occupato` alla rilevazione), `sincronizzazione_eventi.md` §2, `vincoli_dominio.md` (vincolo 15, VD_6), issue #44, piano approvato di OMP-64.

### Operazione verificata

```ts
// da src/application/gestione-stalli/facade.ts
facade.marcaSconosciuti(adesso: Date): Promise<number[]>; // id degli stalli portati a Sconosciuto, in ordine crescente
// funzioni di persistenza usate solo nella preparazione di TF-RIL-34 (stalliTariffe.ts)
bloccaStallo(es, id): Promise<…>;
registraRilevazione(es, stalloId, { occupazioneRilevata, dataEOra, stato }): Promise<…>;
```

- Porta a `SCONOSCIUTO` gli stalli `LIBERO` od `OCCUPATO` la cui ultima rilevazione è **strettamente precedente** a `adesso − 60 s` («più di 60 secondi»: a 60 s esatti lo stallo non cambia). Occupazione rilevata e data dell'ultima rilevazione restano invariate; `ultimaModifica` avanza, così lo stallo torna tra le variazioni della mappa (`variazioniDopo`, NRF_PER_3).
- Non tocca gli stalli `NON_DISPONIBILE` (sosta `Attiva`, `UC_IOT_2` 2.a1, VD_6) né quelli già `SCONOSCIUTO`, compresi i mai rilevati.
- È un'unica istruzione condizionata: una rilevazione confermata mentre l'aggiornamento attende la riga ha la precedenza, e lo stallo resta nello stato rilevato.
- Non notifica gli osservatori (l'ingresso in `Sconosciuto` non ha azioni in `SCD_1`). L'istante è un parametro: l'operazione non legge l'orologio.

### Ambiente

- File proprio, con `preparaDatabaseDiTest()` nel `beforeAll`. Facade con il solo osservatore "registro" (§3). La prima chiamata porta a `SCONOSCIUTO` anche gli stalli del dataset (ultima rilevazione del 15/11): per questo ogni frame prepara il proprio stallo con una rilevazione e verifica la sola presenza (o assenza) dello stallo nell'elenco restituito.
- `R` = `2026-11-20 09:00:00+01` (istante di prova). Rilevazioni di preparazione con `registraRilevazione` della Facade.
- Sosta di TF-RIL-31: `creaSosta(poolDiTest(), { automobilistaId: 7, veicoloId: 1, stalloId: 7, orarioDiAvvio: R, orarioDiScadenza: 2026-11-20 12:00:00+01, pagamento: "PAGATA" })`, poi `impostaNonDisponibile(7)`.

### Categorie e scelte

**Tempo dall'ultima rilevazione a `adesso`:** meno di 60 s · esattamente 60 s [single] · più di 60 s.

**Stato dello stallo:** Libero · Occupato · Non disponibile con sosta `Attiva` → resta Non disponibile · già Sconosciuto [single] · mai rilevato [single].

**Concorrenza:** rilevazione confermata durante l'aggiornamento [single] → vince la rilevazione.

**Dopo Sconosciuto:** prima rilevazione successiva → stato rilevato.

### Test frame (9)

| Frame     | Preparazione                                                                                                                                                                                                                                                          | Chiamata                                                                                                | Esito atteso                                                                                                                                         | Riferimento |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-RIL-27 | stallo 1: rilevazione presenza falsa a `R` (`LIBERO`); letta `ultimaModifica` `u0`                                                                                                                                                                                    | `marcaSconosciuti(R + 61 s)`                                                                            | l'elenco contiene 1; stallo 1 `SCONOSCIUTO`, `NESSUN_VEICOLO`, ultima rilevazione `R`; `ultimaModifica` successiva a `u0`; nessuna notifica          | RF_IOT_2    |
| TF-RIL-28 | stallo 3: rilevazione presenza vera a `R` (`OCCUPATO`)                                                                                                                                                                                                                | `marcaSconosciuti(R + 61 s)`                                                                            | l'elenco contiene 3; stallo 3 `SCONOSCIUTO`, `VEICOLO_PRESENTE`, ultima rilevazione `R`                                                              | RF_IOT_2    |
| TF-RIL-29 | stallo 4: rilevazione presenza vera a `R` (`OCCUPATO`); letta `ultimaModifica` `u0`                                                                                                                                                                                   | `marcaSconosciuti(R + 30 s)`                                                                            | l'elenco non contiene 4; stallo 4 `OCCUPATO`, `ultimaModifica` uguale a `u0`                                                                         | RF_IOT_2    |
| TF-RIL-30 | stallo 2: rilevazione presenza falsa a `R` (`LIBERO`)                                                                                                                                                                                                                 | `marcaSconosciuti(R + 60 s)`                                                                            | l'elenco non contiene 2; stallo 2 `LIBERO`                                                                                                           | RF_IOT_2    |
| TF-RIL-31 | stallo 7: rilevazione presenza vera a `R`; sosta `ATTIVA` sullo stallo 7 e `impostaNonDisponibile(7)` (Ambiente)                                                                                                                                                      | `marcaSconosciuti(R + 61 s)`                                                                            | l'elenco non contiene 7; stallo 7 `NON_DISPONIBILE`; la sosta resta `ATTIVA`                                                                         | RF_SOSTA_6  |
| TF-RIL-32 | stallo 13 del dataset (`SCONOSCIUTO`, rilevato il 15/11 alle 07:00); letta `ultimaModifica` `u0`                                                                                                                                                                      | `marcaSconosciuti(R + 61 s)`                                                                            | l'elenco non contiene 13; stallo 13 `SCONOSCIUTO`, `ultimaModifica` uguale a `u0`                                                                    | RF_IOT_2    |
| TF-RIL-33 | stallo 25 del dataset (`SCONOSCIUTO`, mai rilevato)                                                                                                                                                                                                                   | `marcaSconosciuti(R + 61 s)`                                                                            | l'elenco non contiene 25; stallo 25 `SCONOSCIUTO`, occupazione rilevata e data dell'ultima rilevazione `null`                                        | RF_IOT_2    |
| TF-RIL-34 | stallo 8: rilevazione presenza vera a `R` (`OCCUPATO`); poi, con un client di `poolDiTest()`, `BEGIN`, `bloccaStallo(client, 8)` e `registraRilevazione(client, 8, { occupazioneRilevata: "NESSUN_VEICOLO", dataEOra: R + 90 s, stato: "LIBERO" })` della persistenza | `marcaSconosciuti(R + 120 s)` avviata senza attenderla; poi `COMMIT` del client e attesa della chiamata | l'elenco non contiene 8; stallo 8 `LIBERO`, `NESSUN_VEICOLO`, ultima rilevazione `R + 90 s`                                                          | COD_23      |
| TF-RIL-35 | stallo 9: rilevazione presenza vera a `R`; `marcaSconosciuti(R + 61 s)` (stallo 9 `SCONOSCIUTO`)                                                                                                                                                                      | rilevazione presenza falsa a `R + 90 s`                                                                 | restituisce `LIBERO`; stallo 9 `LIBERO`, `NESSUN_VEICOLO`, ultima rilevazione `R + 90 s`; il registro ha ricevuto una sola notifica, `{ stallo: 9 }` | RF_IOT_2    |

Note:

- TF-RIL-27, 28: `SCD_1` e `UC_IOT_2` passi 2–3; l'avanzamento di `ultimaModifica` è ciò che porta la variazione sulla mappa con il polling, senza ricaricare (criterio di accettazione dell'issue).
- TF-RIL-29, 30: «più di 60 secondi» (`sincronizzazione_eventi.md` §2, vincolo 15): a 60 s esatti lo stallo non cambia.
- TF-RIL-31: `UC_IOT_2` 2.a1; lo stallo esce da `Non disponibile` solo alla scadenza della sosta (`cp_scadenzaEFine.md` TF-SCA-12 per il ramo verso `Sconosciuto`).
- TF-RIL-34: l'aggiornamento attende la riga bloccata e ricontrolla la condizione sulla riga confermata (READ COMMITTED), che ha ormai una rilevazione recente. Il test non può imporre che l'aggiornamento arrivi prima del `COMMIT`; se arriva dopo, trova già la rilevazione nuova: l'esito atteso è lo stesso.
- TF-RIL-35: `SCD_1` (`Sconosciuto` → `Libero`, azione d'ingresso `terminaSosta()`). Il ramo verso `Occupato` e lo stallo mai rilevato sono già verificati da TF-RIL-07 e 08.
- Il richiamo da parte dell'allineamento temporale a ogni lettura è verificato in `cp_scadenzaEFine.md` TF-SCA-11.
