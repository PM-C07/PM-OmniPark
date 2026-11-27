# cp_prolungamento

Specifica dei casi di test (category partition) del servizio Prolungamento del sottosistema Gestione soste, operazioni `prolungaSosta(automobilista, sosta, tempoAggiuntivo)` e `calcolaImportoDelProlungamento(automobilista, sosta, tempoAggiuntivo)` della Facade, e della scadenza condizionata dell'allineamento temporale (`scadenzaRaggiunta`).
Requisiti: RF_SOSTA_2 (prolungamento della sosta), RF_WALLET_2 (addebito della sosta), RF_SOSTA_7 (scadenza della sosta). Task OMP-61 (issue #33), sotto-task 1; TF-PRO-18, 19 (messaggio con il tempo disponibile) nel blocco A dei sotto-task 2–5.

- **Fonti dell'esito atteso:** `UC_SOSTA_2` (passi 2–6, flussi 2.a1, 2.a2, 5.a1, exit condition), `SD_SOSTA_2` (2.1, 2.2, 3.1–3.3, 5.1–5.4, 6.1), statechart `SCD_2` (`prolungamento / aggiornaScadenza()` in `Attiva`, `at(orario di scadenza)`), `docs/rad/statechart/sincronizzazione_eventi.md` §2 (`at(orario di scadenza)` posticipato a ogni prolungamento), `docs/rad/vincoli_dominio.md` (VD_9, VD_10), issue #33, piano approvato del sotto-task 1 (sequenza, codici di errore, tempo aggiuntivo minimo di 15 minuti come per l'avvio, sosta di un altro Automobilista trattata come inesistente).
- **File di test:** `src/application/gestione-soste/prolungamento.db.test.ts` (eseguito con `npx vitest run --config vitest.db.config.ts <file>`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_33` per le scelte dell'issue #33 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_2 · TF-PRO-03 · durata totale oltre il massimo → DURATA_OLTRE_IL_MASSIMO`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/gestione-soste/facade.ts
type SostaProlungata = {
  sosta: number;
  orarioDiScadenza: Date; // nuova scadenza
  importo: number; // importo aggiuntivo in centesimi (0 per le soste GRATUITA)
};
type ImportoDelProlungamento = { importo: number; orarioDiScadenza: Date };
facade.prolungaSosta(automobilista: number, sosta: number, tempoAggiuntivo: number): Promise<SostaProlungata>; // minuti
facade.calcolaImportoDelProlungamento(automobilista: number, sosta: number, tempoAggiuntivo: number): Promise<ImportoDelProlungamento>;
// errori: ErroreGestioneSoste con `codice` e `message`; per DURATA_OLTRE_IL_MASSIMO anche `tempoDisponibile` (minuti)

// da src/application/allineamento-temporale/allineamento.ts
scadenzaRaggiunta(contesto: { pool; orologio; gestioneStalli }, sosta: number): Promise<"SCADUTA" | "ANOMALA" | "GIA_ALLINEATA">;
```

Sequenza (piano approvato), con l'errore di ciascun passo:

| Passo | Controllo o azione                                                                                                                                    | Errore                                         |
| :---- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------- |
| 0     | allineamento temporale: tutte le soste attive con scadenza raggiunta passano a `SCADUTA`, di qualsiasi Automobilista, non solo quella della richiesta | —                                              |
| 1     | lettura della sosta con blocco della riga; la sosta esiste ed è dell'Automobilista                                                                    | `SOSTA_INESISTENTE`                            |
| 2     | sosta `ATTIVA` con scadenza successiva all'istante corrente                                                                                           | `SOSTA_SCADUTA`, `SOSTA_TERMINATA`             |
| 3     | tempo aggiuntivo intero, di almeno 15 minuti                                                                                                          | `DURATA_NON_VALIDA`                            |
| 4     | (scadenza − avvio) + tempo aggiuntivo ≤ durata massima della tariffa dello stallo                                                                     | `DURATA_OLTRE_IL_MASSIMO` (`tempoDisponibile`) |
| 5     | importo aggiuntivo: 0 se la sosta è `GRATUITA`, altrimenti `floor((costoOrario × tempoAggiuntivo + 30) / 60)`                                         | —                                              |
| 6     | addebito sul wallet se l'importo è maggiore di 0                                                                                                      | `CREDITO_INSUFFICIENTE`                        |
| 7     | nuova scadenza = scadenza attuale + tempo aggiuntivo                                                                                                  | —                                              |

Messaggio di `DURATA_OLTRE_IL_MASSIMO` (piano approvato dei sotto-task 2–5, decisione D3), composto da `ErroreGestioneSoste` con `tempoDisponibile`:

- `tempoDisponibile` ≥ 15: `"Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di <N> minuti."`;
- `tempoDisponibile` < 15 (nessun prolungamento possibile, il minimo è 15 minuti): `"La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo."`.

I passi 1–7 sono in un'unica transazione: un errore la annulla per intero. `calcolaImportoDelProlungamento` esegue i passi 0–5 senza scritture (salvo l'allineamento del passo 0) e restituisce importo e nuova scadenza. `tempoDisponibile` = durata massima − (scadenza − avvio), in minuti.

Scadenza condizionata: `scadenzaRaggiunta` porta la sosta da `ATTIVA` a `SCADUTA` solo se l'orario di scadenza è ancora ≤ all'istante dell'orologio dell'allineamento; altrimenti restituisce `GIA_ALLINEATA` e non tocca lo stallo.

Funzioni usate dai test solo per preparare e verificare i dati (mai stub):

- persistenza: `creaAutomobilista`, `trovaOCreaVeicolo`, `associaVeicolo` (`utentiEntiVeicoli.ts`); `creaWallet`, `registraRicarica`, `trovaWalletDiAutomobilista`, `movimenti`, `creaSosta`, `impostaSostaScaduta`, `trovaSosta` (`walletSoste.ts`); `trovaStallo` (`stalliTariffe.ts`); con `poolDiTest()` come esecutore;
- Facade di Gestione stalli creata con `creaFacadeGestioneStalli({ pool: poolDiTest(), osservatori: [osservatoreGestioneSoste] })`: `registraRilevazione` e `impostaNonDisponibile`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni della Facade vanno in commit: ogni frame usa stalli, automobilisti e veicoli propri, indicati nella tabella dei frame, e nessun frame ne riusa un altro.
- Orologio di prova fisso: `adesso() = 2026-11-20 10:00:00+01` (`T`). La Facade di Gestione soste e quella del Wallet ricevono lo stesso orologio: `creaFacadeGestioneSoste({ pool: poolDiTest(), orologio, wallet: creaFacadeWallet({ pagamento: new SimulatorePagamento({ latenzaMs: 0 }), pool: poolDiTest(), orologio }) })`.
- **Dalla COD-23 (RF_IOT_2):** dopo `preparaDatabaseDiTest()`, `rilevazioniAllIstante(poolDiTest(), T)` (`src/persistence/test/datiDiProva.ts`) porta a `T` l'ultima rilevazione degli stalli rilevati e lo stallo si porta a `OCCUPATO` con una rilevazione a `T`: uno stallo resta `Libero` od `Occupato` solo con una rilevazione degli ultimi 60 secondi. Gli esiti non cambiano.
- **Automobilista di prova `P<n>`** (preparazione con la persistenza): `creaAutomobilista(pool, { email: "prolunga.<n>@test.example", hashPassword: "hash-di-prova" })`; `creaWallet`; se il saldo indicato è maggiore di 0, `registraRicarica` di quell'importo con `dataEOra` `2026-11-20 08:00:00+01`; veicolo con la targa indicata (`trovaOCreaVeicolo` e `associaVeicolo`). Salvo indicazione diversa la targa di `P<n>` è `PR0` seguito da `<n>` su due cifre e da `AA` (per esempio `PR001AA`, `PR017AA`) e il saldo è 1000.
- **Sosta di prova `S`** di `P<n>`: `creaSosta(pool, { automobilistaId, veicoloId, stalloId, orarioDiAvvio, orarioDiScadenza, pagamento: "PAGATA" })` dalle `09:30` alle `10:30` (60 minuti), poi `impostaNonDisponibile(stallo)` della Facade di Gestione stalli, salvo indicazione diversa nella riga. «Scaduta» aggiunge `impostaSostaScaduta(pool, id)` e non imposta lo stallo Non disponibile.
- **Stallo «portato a `OCCUPATO`»:** `registraRilevazione({ stallo, presenza: true, dataOra: 2026-11-20 09:00:00+01 })` della Facade di Gestione stalli.
- **Permesso completo:** dichiarazione `Dichiaro di esporre il permesso previsto per lo stallo` e foto `Buffer.alloc(1024, 0xff)`.
- Tutti gli orari sono del `2026-11-20`, `+01`.

### Verifiche

- **Prolungamento riuscito (`OK`)**, con i valori della riga: `prolungaSosta` restituisce `{ sosta, orarioDiScadenza, importo }`; `trovaSosta(sosta)` è `ATTIVA` con la nuova scadenza e con automobilista, veicolo, stallo, orario di avvio, pagamento, dichiarazione e foto invariati; lo stallo è `NON_DISPONIBILE`; se l'importo è maggiore di 0 il wallet ha un nuovo movimento `ADDEBITO` con l'importo, `sostaId` della sosta e `dataEOra` `T`, e il saldo è diminuito dell'importo; con importo 0 nessun movimento nuovo e saldo invariato.
- **Nessun effetto (`N`)**: l'errore è quello indicato (con `tempoDisponibile` dove indicato); stato e orario di scadenza della sosta sono quelli della preparazione (salvo TF-PRO-06, dove agisce l'allineamento); saldo e movimenti del wallet di ogni automobilista del frame sono quelli della preparazione; lo stato dello stallo è quello della preparazione.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella           | id                                  | Contenuto                                                                                                 |
| :---------------- | :---------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `stallo`          | 3, 7, 8, 11, 12, 17, 18, 19, 20, 21 | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, `VEICOLO_PRESENTE`, tariffa 1                                        |
| `stallo`          | 23, 26                              | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, `VEICOLO_PRESENTE`, tariffa 3                                        |
| `stallo`          | 27                                  | `ORDINARIO_A_PAGAMENTO`, `LIBERO`, tariffa 3                                                              |
| `stallo`          | 4                                   | `ROSA`, `OCCUPATO`, tariffa 2                                                                             |
| `stallo`          | 29                                  | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, tariffa 4                                                            |
| `stallo`          | 15                                  | `ROSA`, `OCCUPATO`, tariffa 1                                                                             |
| `stallo`          | 14                                  | `DISABILI`, `LIBERO`, tariffa 1                                                                           |
| `tariffa`         | 1, 2, 3, 4                          | 1: 150 centesimi l'ora, massimo 180 minuti; 2 e 3: 100 centesimi, 120 minuti; 4: 80 centesimi, 240 minuti |
| `sosta`           | 1                                   | automobilista 8, stallo 10, `TERMINATA`, `09:00` → `10:00` del `2026-10-31`, `PAGATA`                     |
| `wallet_virtuale` | 2                                   | dell'automobilista 8, saldo 600                                                                           |

Colonne usate dai test (lette o scritte tramite le funzioni di persistenza o le Facade):

| Tabella                                    | Colonne                                                                                                                                                              |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stallo`                                   | `id`, `tipo_di_stallo`, `stato`, `occupazione_rilevata`, `tariffa_id`                                                                                                |
| `tariffa`                                  | `id`, `costo_orario`, `durata_massima`                                                                                                                               |
| `utente`, `automobilista`                  | `id`, `email`, `hash_password`, `ruolo`                                                                                                                              |
| `veicolo`, `automobilista_veicolo`         | `id`, `targa`, `automobilista_id`, `veicolo_id`                                                                                                                      |
| `wallet_virtuale`, `saldo_wallet_virtuale` | `id`, `automobilista_id`, `wallet_virtuale_id`, `saldo`                                                                                                              |
| `movimento_del_wallet`                     | `id`, `wallet_virtuale_id`, `tipo_di_movimento`, `importo`, `data_e_ora`, `sosta_id`                                                                                 |
| `sosta`                                    | `id`, `automobilista_id`, `veicolo_id`, `stallo_id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`, `dichiarazione_di_permesso`, `foto_del_permesso` |

Id inesistente: `999999`.

## 4. Categorie e scelte

**Stato della sosta**

1. Attiva
2. Scaduta [error]
3. Terminata [error]
4. Attiva con scadenza raggiunta, non ancora allineata [single]

**Proprietario**

1. lo stesso Automobilista
2. un altro Automobilista [error]
3. sosta inesistente [error]

**Tempo aggiuntivo**

1. intero, di almeno 15 minuti
2. inferiore a 15 minuti [error]
3. non intero [error]

**Durata totale**

1. entro il massimo della tariffa
2. uguale al massimo [single]
3. oltre il massimo [error]
4. oltre il massimo con meno di 15 minuti disponibili [single] [error]

**Tipo di stallo e pagamento della sosta**

1. a pagamento → `PAGATA`
2. rosa → `PAGATA`
3. disabili → `GRATUITA` [property GRATUITA]

**Credito**

1. sufficiente
2. insufficiente [error]
3. non rilevante [if GRATUITA]: saldo 0

**Concorrenza**

1. richiesta singola
2. due prolungamenti simultanei della stessa sosta [single]

**Scadenza durante il prolungamento**

1. nessuna
2. allineamento che aveva letto la sosta prima del prolungamento [single]

**Operazione**

1. `prolungaSosta`
2. `calcolaImportoDelProlungamento` [single]

## 5. Test frame (19)

Tempo aggiuntivo in minuti; saldo iniziale in centesimi. Dove non indicato: automobilista `P<n>` con la targa predefinita e saldo 1000, sosta `S` di `P<n>` dalle `09:30` alle `10:30` con lo stallo Non disponibile, richiesta di `P<n>` sulla sosta `S` con `prolungaSosta`.

| Frame     | Preparazione                                                                                                                | Richiesta                                                                            | Esito atteso                                                                                                                                                                   | Riferimento |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-PRO-01 | `P1`, `S` sullo stallo 3 (tariffa 1)                                                                                        | +60                                                                                  | `OK`: importo 150, scadenza `11:30`; saldo 850                                                                                                                                 | RF_SOSTA_2  |
| TF-PRO-02 | `P2`, `S` sullo stallo 7 (tariffa 1, massimo 180)                                                                           | +120 (totale 180)                                                                    | `OK`: importo 300, scadenza `12:30`; saldo 700                                                                                                                                 | RF_SOSTA_2  |
| TF-PRO-03 | `P3`, `S` sullo stallo 8 (tariffa 1, massimo 180)                                                                           | +121 (totale 181)                                                                    | errore `DURATA_OLTRE_IL_MASSIMO`, `tempoDisponibile` 120; `N`                                                                                                                  | RF_SOSTA_2  |
| TF-PRO-04 | `P4`, `S` sullo stallo 11 dalle `08:00` alle `09:00`, scaduta (stallo 11 `OCCUPATO`)                                        | +30                                                                                  | errore `SOSTA_SCADUTA`; `N` (S `SCADUTA`, stallo 11 `OCCUPATO`)                                                                                                                | RF_SOSTA_2  |
| TF-PRO-05 | nessuna (sosta 1 del dataset, `TERMINATA`, dell'automobilista 8)                                                            | automobilista 8, sosta 1, +30                                                        | errore `SOSTA_TERMINATA`; `N` (sosta 1 `TERMINATA`, scadenza `2026-10-31 10:00`; saldo del wallet 2 600, movimenti invariati; stallo 10 invariato)                             | RF_SOSTA_2  |
| TF-PRO-06 | `P6`, `S` sullo stallo 12 dalle `09:00` alle `10:00`, con lo stallo Non disponibile (non ancora allineata)                  | +30                                                                                  | errore `SOSTA_SCADUTA`; S `SCADUTA` con scadenza `10:00`; stallo 12 `OCCUPATO`; nessun movimento nuovo, saldo 1000                                                             | RF_SOSTA_7  |
| TF-PRO-07 | `P7` e `P7b` (`prolunga.7b@test.example`, targa `PR007BB`); `S` di `P7b` sullo stallo 17                                    | `P7`, sosta `S`, +30                                                                 | errore `SOSTA_INESISTENTE`; `N` per `P7` e `P7b` (S `ATTIVA`, scadenza `10:30`)                                                                                                | RF_SOSTA_2  |
| TF-PRO-08 | `P8`, nessuna sosta                                                                                                         | `P8`, sosta 999999, +30                                                              | errore `SOSTA_INESISTENTE`; `N` (saldo 1000, solo la ricarica)                                                                                                                 | ISSUE_33    |
| TF-PRO-09 | `P9` con saldo 100, `S` sullo stallo 18 (tariffa 1)                                                                         | +60 (importo 150)                                                                    | errore `CREDITO_INSUFFICIENTE`; `N`: saldo 100, solo la ricarica iniziale, scadenza `10:30`                                                                                    | RF_WALLET_2 |
| TF-PRO-10 | `P10`, `S` sullo stallo 19                                                                                                  | +14                                                                                  | errore `DURATA_NON_VALIDA`; `N`                                                                                                                                                | ISSUE_33    |
| TF-PRO-11 | `P11`, `S` sullo stallo 20                                                                                                  | +30.5                                                                                | errore `DURATA_NON_VALIDA`; `N`                                                                                                                                                | ISSUE_33    |
| TF-PRO-12 | `P12`, `S` sullo stallo 15 (rosa, tariffa 1)                                                                                | +60                                                                                  | `OK`: importo 150, pagamento `PAGATA` invariato, scadenza `11:30`; saldo 850                                                                                                   | VD_10       |
| TF-PRO-13 | `P13` con saldo 0; stallo 14 (disabili) portato a `OCCUPATO`; `S` `GRATUITA` con permesso completo sullo stallo 14          | +60                                                                                  | `OK`: importo 0, pagamento `GRATUITA` invariato, scadenza `11:30`; dichiarazione e foto invariate; nessun movimento, saldo 0                                                   | VD_10       |
| TF-PRO-14 | `P14`, `S` sullo stallo 21 (tariffa 1)                                                                                      | due richieste +60 avviate insieme (`Promise.allSettled`)                             | entrambe `OK` con importo 150; S `ATTIVA` con scadenza `12:30`; due nuovi movimenti `ADDEBITO` da 150 per S; saldo 700; le due scadenze restituite sono `11:30` e `12:30`      | RF_SOSTA_2  |
| TF-PRO-15 | `P15`, `S` sullo stallo 23 (tariffa 3, massimo 120)                                                                         | +30; dopo la conferma `scadenzaRaggiunta(S)` di un allineamento con orologio `10:45` | prolungamento `OK`: importo 50, scadenza `11:00`, saldo 950; poi `scadenzaRaggiunta` restituisce `GIA_ALLINEATA`; S `ATTIVA` con scadenza `11:00`; stallo 23 `NON_DISPONIBILE` | RF_SOSTA_7  |
| TF-PRO-16 | `P16`, `S` sullo stallo 26 (tariffa 3)                                                                                      | `calcolaImportoDelProlungamento`, +30                                                | restituisce importo 50 e scadenza `11:00`; S `ATTIVA` con scadenza `10:30`; nessun movimento nuovo, saldo 1000                                                                 | RF_SOSTA_2  |
| TF-PRO-17 | `P17`, `S` sullo stallo 29 (tariffa 4, massimo 240) dalle `09:30` alle `13:20` (230 minuti)                                 | +15 (totale 245)                                                                     | errore `DURATA_OLTRE_IL_MASSIMO`, `tempoDisponibile` 10; `N`                                                                                                                   | RF_SOSTA_2  |
| TF-PRO-18 | `P18`, `S` sullo stallo 4 (rosa, tariffa 2, massimo 120)                                                                    | +61 (totale 121)                                                                     | errore `DURATA_OLTRE_IL_MASSIMO`, `tempoDisponibile` 60, messaggio `"Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 60 minuti."`; `N`   | RF_SOSTA_2  |
| TF-PRO-19 | `P19`; stallo 27 (tariffa 3, massimo 120) portato a `OCCUPATO`; `S` sullo stallo 27 dalle `09:30` alle `11:20` (110 minuti) | +15 (totale 125)                                                                     | errore `DURATA_OLTRE_IL_MASSIMO`, `tempoDisponibile` 10, messaggio `"La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo."`; `N`             | RF_SOSTA_2  |

Totale 19: 5 prolungamenti riusciti (TF-PRO-01, 02, 12, 13, 14), 1 calcolo senza scritture (TF-PRO-16), 12 errori, 1 frame [single] di scadenza condizionata (TF-PRO-15). Ogni frame di errore viola un solo controllo; gli altri dati della richiesta sono validi.

Note sui riferimenti:

- TF-PRO-01, 02: RF_SOSTA_2 («entro il limite massimo previsto per lo stallo, aggiornandone l'orario di scadenza e ricalcolando l'importo addebitato») e `UC_SOSTA_2` exit condition (On success). La nuova scadenza parte dalla scadenza attuale, non dall'istante corrente (`SD_SOSTA_2` 6.1, `sincronizzazione_eventi.md` §2).
- TF-PRO-03, 17: RF_SOSTA_2, VD_9 e `UC_SOSTA_2` 2.a2 («indicando il tempo ancora disponibile»). TF-PRO-17 verifica che il tempo disponibile sia restituito anche quando è inferiore al minimo di 15 minuti, e quindi nessun prolungamento è più possibile.
- TF-PRO-18, 19: RF_SOSTA_2 e `UC_SOSTA_2` 2.a2 («lo segnala indicando il tempo ancora disponibile»): il tempo disponibile arriva all'Automobilista nel messaggio, perché la risposta delle API ha solo `codice` e `messaggio`. Il testo con meno di 15 minuti è la decisione D3 del piano approvato. TF-PRO-03 e 17 restano invariati (codice e `tempoDisponibile`).
- TF-PRO-04, 05: `UC_SOSTA_2` 2.a1 e regole di dominio («una sosta `Scaduta` non si prolunga»); `SCD_2`: `prolungamento` è un evento interno solo dello stato `Attiva`.
- TF-PRO-06: l'allineamento all'inizio dell'operazione (issue #9, ripreso nel piano) porta la sosta a `SCADUTA` prima del controllo dello stato; RF_SOSTA_7.
- TF-PRO-07, 08: `UC_SOSTA_2` entry condition («una propria sosta `Attiva`»); piano approvato: la sosta di un altro Automobilista è trattata come inesistente, per non rivelarne l'esistenza.
- TF-PRO-09: RF_WALLET_2 («negare l'operazione se il credito non è sufficiente») e `UC_SOSTA_2` 5.a1 («la scadenza non cambia»).
- TF-PRO-10, 11: piano approvato (risposta 1): tempo aggiuntivo minimo di 15 minuti e minuti interi, come per l'avvio (issue #9).
- TF-PRO-12, 13: VD_10 (gratuità negli stalli per disabili, tariffa negli stalli rosa). Il pagamento è quello scritto all'avvio e non cambia (trigger `sosta_pagamento_immutabile`).
- TF-PRO-14: criterio di accettazione dell'issue #33 («due prolungamenti simultanei della stessa sosta non producono scadenze o addebiti incoerenti»). Con il blocco della riga della sosta la seconda richiesta aspetta la prima e parte dalla scadenza già prolungata; senza blocco entrambe leggerebbero `10:30` e scriverebbero `11:30` con due addebiti (aggiornamento perso). Totale 180 = massimo della tariffa 1.
- TF-PRO-15: criterio di accettazione dell'issue #33 («una sosta appena prolungata non risulta Scaduta») e `sincronizzazione_eventi.md` §2. Il frame riproduce in modo deterministico un allineamento che aveva letto S tra le soste da scadere prima del prolungamento: chiama `scadenzaRaggiunta` dopo la conferma, con l'orologio dell'allineamento a `10:45` (dopo la vecchia scadenza, prima della nuova). Con due richieste davvero contemporanee l'ordine non è prevedibile: in READ COMMITTED l'aggiornamento condizionato aspetta il blocco della riga e rivaluta la condizione sulla versione confermata, con lo stesso esito.
- TF-PRO-16: `SD_SOSTA_2` 3.2–3.3 (calcolo dell'importo aggiuntivo e nuova scadenza mostrati prima della conferma).

## 6. Note

- **Comportamenti già verificati altrove** (nessun frame qui):
  - addebito con saldo uguale, insufficiente e concorrente sullo stesso wallet, importo 0: `cp_addebito.md`;
  - `aggiornaScadenza` della persistenza (solo soste `ATTIVA`, scadenza dopo l'avvio): `cp_persistenza_wallet_soste.md`;
  - formula dell'importo e arrotondamento: `cp_calcoloImporto.md`;
  - scadenza delle soste non prolungate (orario precedente, coincidente, successivo) e concorrenza tra due allineamenti: `cp_scadenzaEFine.md` TF-SCA-01…10, che restano validi con la condizione sull'orario.
- **Fasce orarie** fuori ambito (COD-24): l'importo aggiuntivo usa solo il costo orario.
- **Annullamento (`UC_SOSTA_2` 4.a1)** e **proposta di ricarica (5.a1)** sono comportamenti della schermata (sotto-task 3): nel servizio l'annullamento corrisponde a non chiamare `prolungaSosta`.
