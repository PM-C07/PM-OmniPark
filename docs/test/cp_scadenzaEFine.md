# cp_scadenzaEFine

Specifica dei casi di test (category partition) dei servizi Scadenza e Fine della sosta:

- **Scadenza** (attore Time): operazione `allinea()` del modulo di allineamento temporale `src/application/allineamento-temporale/allineamento.ts`;
- **Fine**: osservatore `osservatoreGestioneSoste` di Gestione soste (`terminaSosta`), notificato da Gestione stalli quando uno stallo entra in `Libero`.

Requisiti: RF_SOSTA_7 (scadenza della sosta), RF_SOSTA_6 (ritorno dello stallo allo stato rilevato), NRF_LEG_2 (dichiarazione e foto eliminate al termine). Task OMP-45 (issue #9).

- **Fonti dell'esito atteso:** `UC_SOSTA_7` (passi 1–3, flusso 3.a1), `SD_SOSTA_7`, `UC_IOT_1` 3.a1 e 3.a2, statechart `SCD_1` (`scadenzaSosta`, `entry / terminaSosta()` di Libero) e `SCD_2` (`at(orario di scadenza)`, `terminaSosta`), `docs/rad/statechart/sincronizzazione_eventi.md` §1 e §2, `docs/rad/vincoli_dominio.md` (VD_6, VD_11, VD_20), `docs/test/cp_statoPerLaSosta.md` §6, issue #9, piano approvato di OMP-45 (decisioni 6 e 7, risposta D4).
- **File di test:** `src/application/allineamento-temporale/allineamento.db.test.ts` (TF-SCA) e `src/application/gestione-soste/fineSosta.db.test.ts` (TF-FIN), eseguiti con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_9` per le scelte dell'issue #9 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_7 · TF-SCA-02 · scadenza uguale all'istante corrente → SCADUTA`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/allineamento-temporale/allineamento.ts
type EsitoAllineamento = {
  sosteScadute: number[];     // soste portate da ATTIVA a SCADUTA da questa chiamata (comprese le anomale)
  sosteInConflitto: number[]; // soste lasciate ATTIVA per un CONFLITTO_DI_CONCORRENZA, riprese alla lettura successiva
  sosteAnomale: number[];     // sottoinsieme di sosteScadute: lo stallo non era Non disponibile e resta com'è
};
type AllineamentoTemporale = { allinea(): Promise<EsitoAllineamento> };
creaAllineamentoTemporale(dipendenze: { gestioneStalli: FacadeGestioneStalli; pool?: Pool; orologio?: Orologio }): AllineamentoTemporale;

// da src/application/gestione-soste/facade.ts
const osservatoreGestioneSoste: OsservatoreStalli; // terminaSosta(evento, esecutore): soste SCADUTA dello stallo → TERMINATA
```

Comportamento atteso di `allinea()` (piano approvato):

- prende le soste `ATTIVA` con orario di scadenza ≤ `orologio.adesso()` e tratta ciascuna in una transazione propria;
- passaggio `ATTIVA` → `SCADUTA` condizionato allo stato `ATTIVA`: se un'altra transazione l'ha già fatta scadere, la sosta non compare nell'esito e non c'è errore;
- poi `ripristinaStatoRilevato(stallo, esecutore)` della Facade di Gestione stalli: lo stallo torna `OCCUPATO` se l'ultima rilevazione indica un veicolo, `LIBERO` se non lo indica. Nel secondo caso l'osservatore di Gestione soste, nella stessa transazione, porta a `TERMINATA` tutte le soste `SCADUTA` dello stallo, compresa quella appena scaduta, ed elimina dichiarazione e foto;
- se lo stallo non è `NON_DISPONIBILE` (`STALLO_NON_IMPEGNATO`, dati incoerenti), la sosta passa comunque a `SCADUTA`, lo stallo resta com'è e l'id va anche in `sosteAnomale` (risposta D4);
- `allinea()` non termina mai una sosta da sé: lo fa solo l'osservatore (`cp_statoPerLaSosta.md` §6).

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaAutomobilista`, `trovaOCreaVeicolo`, `associaVeicolo`, `creaSosta`, `impostaSostaScaduta`, `trovaSosta`, `trovaStallo`, con `poolDiTest()` come esecutore; Facade di Gestione stalli `registraRilevazione` e `impostaNonDisponibile`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll` di ciascun file. Le transazioni vanno in commit: ogni frame usa stalli, automobilisti e veicoli propri.
- Facade di Gestione stalli dei test: `creaFacadeGestioneStalli({ pool: poolDiTest(), osservatori: [osservatoreGestioneSoste] })`, cioè con l'osservatore reale di Gestione soste.
- TF-SCA: `creaAllineamentoTemporale({ gestioneStalli, pool: poolDiTest(), orologio })` con orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`).
- **Automobilista di prova:** `creaAutomobilista(pool, { email, hashPassword: "hash-di-prova" })`, veicolo con la targa indicata (`trovaOCreaVeicolo`, `associaVeicolo`); nessun wallet. TF-SCA-n usa `scadenza.<n>@test.example` e la targa `SC0` seguito da `<n>` su due cifre e da `AA` (per esempio `SC001AA`, `SC010AA`); TF-FIN-n usa `fine.<n>@test.example` e `FI00<n>AA`; il secondo automobilista di TF-FIN-04 usa `fine.4b@test.example` e `FI004BB`.
- **Sosta preesistente:** `creaSosta(pool, { automobilistaId, veicoloId, stalloId, orarioDiAvvio, orarioDiScadenza, pagamento })`, `PAGATA` salvo indicazione; «con lo stallo Non disponibile» aggiunge `impostaNonDisponibile(stallo)`; «scaduta» aggiunge `impostaSostaScaduta(pool, id)`.
- **Rilevazioni di preparazione:** `registraRilevazione({ stallo, presenza, dataOra })` della Facade di Gestione stalli, con gli orari indicati.
- **Permesso completo:** dichiarazione `Dichiaro di esporre il permesso previsto per lo stallo` e foto `Buffer.alloc(1024, 0xff)`.
- Tutti gli orari sono del `2026-11-20`, `+01`. «Non compare» significa che l'id non è in nessuna delle tre liste dell'esito.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella  | id                                      | Contenuto                                                                  |
| :------- | :-------------------------------------- | :------------------------------------------------------------------------- |
| `stallo` | 3, 7, 8, 17, 18, 19, 20, 21, 23, 12, 29 | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, `VEICOLO_PRESENTE`                    |
| `stallo` | 14                                      | `DISABILI`, `LIBERO`                                                       |
| `stallo` | 4, 15                                   | `ROSA`, `OCCUPATO`, `VEICOLO_PRESENTE`                                     |
| `stallo` | 10                                      | `LIBERO`; ha la sosta 1 del dataset                                        |
| `sosta`  | 1                                       | automobilista 8, stallo 10, `TERMINATA`, scadenza `2026-10-31 10:00:00+01` |

Colonne usate dai test:

| Tabella                                                       | Colonne                                                                                                                                                              |
| :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stallo`                                                      | `id`, `stato`, `occupazione_rilevata`, `data_e_ora_dell_ultima_rilevazione`                                                                                          |
| `sosta`                                                       | `id`, `automobilista_id`, `veicolo_id`, `stallo_id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`, `dichiarazione_di_permesso`, `foto_del_permesso` |
| `utente`, `automobilista`, `veicolo`, `automobilista_veicolo` | colonne per la preparazione degli automobilisti di prova                                                                                                             |

## 4. Categorie e scelte

**Scadenza — Orario di scadenza rispetto all'istante corrente**

1. precedente
2. coincidente [single]
3. successivo

**Scadenza — Stato della sosta**

1. Attiva
2. Scaduta
3. Terminata

**Scadenza — Ultima rilevazione dello stallo Non disponibile**

1. veicolo presente
2. nessun veicolo
3. lo stallo non è Non disponibile (dati incoerenti) [single]

**Scadenza — Altre soste**

1. nessuna
2. un'altra sosta scaduta da allineare su un altro stallo
3. una sosta già `SCADUTA` sullo stesso stallo [single]

**Scadenza — Concorrenza**

1. un solo allineamento
2. due allineamenti contemporanei sulla stessa sosta [single]

**Fine — Sosta sullo stallo liberato**

1. nessuna
2. Attiva
3. Scaduta, con permesso
4. più soste Scadute [single]

## 5. Test frame (14)

### Scadenza (`allinea()`, istante `T` = `10:00`)

| Frame     | Preparazione                                                                                                                                                                                                                                                                   | Esito atteso                                                                                                                                                                                                    | Riferimento |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-SCA-01 | sosta S sullo stallo 3, `08:00` → `09:00`, con lo stallo Non disponibile                                                                                                                                                                                                       | S in `sosteScadute`, non in `sosteAnomale`; S `SCADUTA`; stallo 3 `OCCUPATO`, `VEICOLO_PRESENTE`                                                                                                                | RF_SOSTA_7  |
| TF-SCA-02 | sosta S sullo stallo 7, `08:00` → `10:00`, con lo stallo Non disponibile                                                                                                                                                                                                       | S in `sosteScadute`; S `SCADUTA`; stallo 7 `OCCUPATO`                                                                                                                                                           | RF_SOSTA_7  |
| TF-SCA-03 | sosta S sullo stallo 8, `09:00` → `10:00:01`, con lo stallo Non disponibile                                                                                                                                                                                                    | S non compare; S `ATTIVA`; stallo 8 `NON_DISPONIBILE`                                                                                                                                                           | RF_SOSTA_7  |
| TF-SCA-04 | stallo 14 (disabili): rilevazione presenza vera alle `09:00`; sosta S `GRATUITA` con permesso completo, `09:00` → `10:00`, con lo stallo Non disponibile; rilevazione presenza falsa alle `09:30`                                                                              | S in `sosteScadute`; S `TERMINATA`, dichiarazione e foto `null`, pagamento `GRATUITA` invariato; stallo 14 `LIBERO`, `NESSUN_VEICOLO`                                                                           | RF_SOSTA_6  |
| TF-SCA-05 | sosta S sullo stallo 17, `08:00` → `09:00`, scaduta (lo stallo resta `OCCUPATO`)                                                                                                                                                                                               | S non compare; S resta `SCADUTA`; stallo 17 `OCCUPATO`                                                                                                                                                          | VD_11       |
| TF-SCA-06 | nessuna (sosta 1 del dataset, `TERMINATA`)                                                                                                                                                                                                                                     | la sosta 1 non compare e resta `TERMINATA`; stallo 10 `LIBERO`                                                                                                                                                  | VD_11       |
| TF-SCA-07 | sosta S1 sullo stallo 18, `08:00` → `09:00`, con lo stallo Non disponibile; sosta S2 sullo stallo 19 (secondo automobilista `scadenza.7b@test.example`, targa `SC007BB`), `08:00` → `09:30`, con lo stallo Non disponibile, poi rilevazione presenza falsa sul 19 alle `09:30` | S1 e S2 in `sosteScadute`; S1 `SCADUTA` e stallo 18 `OCCUPATO`; S2 `TERMINATA` e stallo 19 `LIBERO`                                                                                                             | RF_SOSTA_7  |
| TF-SCA-08 | stallo 20: sosta S1 `08:00` → `08:30`, scaduta; sosta S2 dello stesso veicolo `08:45` → `09:45`, con lo stallo Non disponibile; rilevazione presenza falsa alle `09:30`                                                                                                        | S2 in `sosteScadute`, S1 non compare; S1 e S2 `TERMINATA`; stallo 20 `LIBERO`                                                                                                                                   | VD_11       |
| TF-SCA-09 | sosta S sullo stallo 21, `08:00` → `09:00`, **senza** Non disponibile (lo stallo resta `OCCUPATO`)                                                                                                                                                                             | S in `sosteScadute` e in `sosteAnomale`; S `SCADUTA`; stallo 21 `OCCUPATO`, invariato                                                                                                                           | ISSUE_9     |
| TF-SCA-10 | sosta S sullo stallo 23, `08:00` → `09:00`, con lo stallo Non disponibile; due allineamenti creati separatamente con le stesse dipendenze, `allinea()` di entrambi avviati insieme (`Promise.all`)                                                                             | entrambe le chiamate terminano senza errore; S compare in `sosteScadute` di una sola delle due e non compare in `sosteAnomale` né in `sosteInConflitto` di nessuna delle due; S `SCADUTA`; stallo 23 `OCCUPATO` | ISSUE_9     |

### Fine (`registraRilevazione` della Facade di Gestione stalli con l'osservatore di Gestione soste, presenza falsa alle `10:30`)

| Frame     | Preparazione                                                                                                                     | Esito atteso                                                                                                       | Riferimento |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-FIN-01 | stallo 29, nessuna sosta                                                                                                         | `registraRilevazione` restituisce `LIBERO`, senza errore; stallo 29 `LIBERO`                                       | RF_IOT_1    |
| TF-FIN-02 | sosta S sullo stallo 12, `09:00` → `12:00`, con lo stallo Non disponibile                                                        | restituisce `NON_DISPONIBILE`; S resta `ATTIVA` con orari invariati; stallo 12 `NON_DISPONIBILE`, `NESSUN_VEICOLO` | VD_20       |
| TF-FIN-03 | stallo 15 (rosa): sosta S con permesso completo, `08:00` → `09:00`, scaduta                                                      | restituisce `LIBERO`; S `TERMINATA`, dichiarazione e foto `null`; stallo 15 `LIBERO`                               | NRF_LEG_2   |
| TF-FIN-04 | stallo 4: sosta S1 (`FI004AA`) `07:00` → `08:00`, creata e scaduta; poi sosta S2 (`FI004BB`) `08:00` → `09:00`, creata e scaduta | restituisce `LIBERO`; S1 e S2 `TERMINATA`; stallo 4 `LIBERO`                                                       | VD_11       |

Totale 14: 10 di scadenza (3 sull'orario, 2 sugli stati non `Attiva`, 4 sulla rilevazione e sulle altre soste, 1 di concorrenza) e 4 di fine.

Note sui riferimenti:

- TF-SCA-01…03: `at(orario di scadenza)` scatta all'istante uguale all'orario di scadenza (`sincronizzazione_eventi.md` §2): coincidente → `SCADUTA`; un secondo dopo l'istante corrente → ancora `ATTIVA`. Lo stallo torna allo stato dell'ultima rilevazione (RF_SOSTA_6, `UC_SOSTA_7` passo 3).
- TF-SCA-04: RF_SOSTA_6 e `UC_SOSTA_7` 3.a1: con l'ultima rilevazione «nessun veicolo» lo stallo torna `Libero` e la sosta passa a `Terminata` nella stessa transazione; dichiarazione e foto sono eliminate (NRF_LEG_2).
- TF-SCA-05, 06: VD_11 e `SCD_2`: solo le soste `Attiva` scadono; `Scaduta` e `Terminata` non cambiano.
- TF-SCA-08: `sincronizzazione_eventi.md` §1: `terminaSosta` porta a `Terminata` tutte le soste `Scadute` dello stallo, anche quella scaduta in precedenza (VD_11).
- TF-SCA-09: risposta D4 del piano. Lo stallo con una sosta attiva è sempre `Non disponibile` (VD_6): il caso si costruisce saltando `impostaNonDisponibile`.
- TF-SCA-10: decisione 7. Il passaggio a `SCADUTA` è condizionato: la seconda transazione aspetta la prima, rivaluta la condizione e non trova righe. Il test non può imporre l'ordine con cui le due transazioni arrivano al database: se la seconda parte quando la prima ha già confermato, non trova la sosta tra quelle da scadere. In entrambi i casi l'esito atteso è lo stesso. Che S non compaia in `sosteAnomale` dimostra che l'allineamento che trova la sosta già scaduta non chiama `ripristinaStatoRilevato`: lo chiama solo se il passaggio `ATTIVA` → `SCADUTA` ha aggiornato la riga (altrimenti riceverebbe `STALLO_NON_IMPEGNATO` e la segnerebbe come anomala).
- TF-FIN-01: RF_IOT_1: la liberazione di uno stallo senza soste non produce errori nell'osservatore.
- TF-FIN-02: VD_20 e decisione 6: se il veicolo lascia lo stallo durante una sosta `Attiva`, la sosta resta `Attiva` fino alla scadenza e lo stallo resta `Non disponibile` (`UC_IOT_1` 3.a1); l'osservatore non è chiamato.
- TF-FIN-03, 04: `UC_IOT_1` 3.a2 e `sincronizzazione_eventi.md` §1, con l'osservatore reale.

## 6. Note

- **L'allineamento scrive le soste tramite la persistenza (discrepanza 10 del piano).** Il modulo di allineamento sta sopra Gestione stalli, ma è chiamato da Gestione soste all'inizio delle sue letture. Se scrivesse le soste tramite la Facade di Gestione soste nascerebbe un ciclo di dipendenze (Gestione soste → allineamento → Gestione soste). Per questo il passaggio `ATTIVA` → `SCADUTA` usa direttamente `sosteDaScadere` e `impostaSostaScadutaSeRaggiunta` di `walletSoste.ts` (dalla OMP-61: condizionato anche all'orario di scadenza, così una sosta appena prolungata non scade, `cp_prolungamento.md` TF-PRO-15; `impostaSostaScaduta`, senza condizione sull'orario, resta solo per preparare i dati nei test); il ripristino dello stallo passa dalla Facade di Gestione stalli e la terminazione dall'osservatore di Gestione soste.
- **Chi porta la sosta a `Terminata`.** `SD_SOSTA_7` (3.a1.2) la fa terminare da `ControlloScadenza`; `SCD_1` e `sincronizzazione_eventi.md` dall'azione d'ingresso di `Libero`. Come indicato in `cp_statoPerLaSosta.md` §6 e nella decisione 6, lo fa solo l'osservatore (TF-SCA-04, 07, 08). L'issue #9 dice «la sosta attiva o scaduta passa a Terminata»; i modelli (VD_20, sincronizzazione §1) terminano solo le soste `Scadute`, ed è questo che verifica TF-FIN-02.
- **Conflitti di concorrenza.** Un `CONFLITTO_DI_CONCORRENZA` (SQLSTATE 40001 o 40P01) su una sosta la lascia `ATTIVA` e ne mette l'id in `sosteInConflitto`; `allinea()` prosegue con le altre e non fallisce. Con l'aggiornamento condizionato in READ COMMITTED il conflitto non si produce in modo deterministico: nessun frame lo verifica.
- **Prima lettura dopo la scadenza.** Che la sosta risulti `Scaduta` alla prima lettura successiva tramite la Facade di Gestione soste (criterio di accettazione dell'issue) lo verificano `cp_consultazione.md` TF-CNS-06 e TF-CNS-14 e `cp_avvioSosta.md` TF-AVV-08.
- **Stato Sconosciuto.** Il ramo `scadenzaSosta [nessuna rilevazione da più di 60 s] → Sconosciuto` di `SCD_1` è fuori ambito (RF_IOT_2, COD-22).
- **Comportamenti già verificati altrove:** ripristino dello stallo da `Non disponibile` e notifica agli osservatori, `cp_statoPerLaSosta.md` TF-SOS-10…15; `sosteDaScadere`, `impostaSostaScaduta` e `terminaSosteScaduteDelloStallo`, `cp_persistenza_wallet_soste.md` TF-WS-36…43; `impostaSostaScadutaSeRaggiunta`, `cp_persistenza_wallet_soste.md` TF-WS-55, 56; rilevazione su stallo `Non disponibile`, `cp_rilevazioni.md`.
