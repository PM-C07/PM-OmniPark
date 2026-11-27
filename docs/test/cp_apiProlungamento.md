# cp_apiProlungamento

Specifica dei casi di test (category partition) delle route del prolungamento della sosta: `GET /api/soste/<id>/prolungamento?tempoAggiuntivo=<minuti>` (importo aggiuntivo e nuova scadenza prima della conferma) e `POST /api/soste/<id>/prolungamento` (conferma, addebito e nuova scadenza).
Requisiti: RF_SOSTA_2 (prolungamento della sosta), RF_WALLET_2 (addebito, credito insufficiente), NRF_SIC_1 (controllo degli accessi). Task OMP-61 (issue #33), blocco A dei sotto-task 2–5.

- **Fonti dell'esito atteso:** `UC_SOSTA_2` (passi 1–6, flussi 2.a1, 2.a2, 5.a1, exit condition), `SD_SOSTA_2`, `cp_prolungamento.md` §2 (sequenza, codici, `tempoDisponibile` e messaggio di `DURATA_OLTRE_IL_MASSIMO`), `src/app/api/_errori.ts` (tabella codice → status), categorie delle API di OMP-48 e OMP-58 (`cp_apiWalletSoste.md`, `cp_apiImporto.md`), issue #33, piano approvato di OMP-61 (decisioni D2: route `GET` per l'anteprima; D3: messaggio con meno di 15 minuti disponibili).
- **File di test:** `src/app/api/soste/[id]/prolungamento/prolungamento.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_33` per le scelte dell'issue #33 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_2 · TF-API-PRO-09 · durata totale oltre il massimo → 422 DURATA_OLTRE_IL_MASSIMO con i minuti disponibili`.

## 2. Route verificate

| Metodo e percorso                                       | Corpo                 | Sessione e operazione        | Facade (Gestione soste)                                                 | Risposta positiva                                               |
| :------------------------------------------------------ | :-------------------- | :--------------------------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------- |
| `GET /api/soste/<id>/prolungamento?tempoAggiuntivo=<m>` | —                     | `UC_SOSTA_2` (Automobilista) | `calcolaImportoDelProlungamento(automobilista, sosta, tempoAggiuntivo)` | 200, `{ importo, orarioDiScadenza }`; nessuna scrittura         |
| `POST /api/soste/<id>/prolungamento`                    | `{ tempoAggiuntivo }` | `UC_SOSTA_2` (Automobilista) | `prolungaSosta(automobilista, sosta, tempoAggiuntivo)`                  | 200, `{ sosta, orarioDiScadenza, importo }` (`SostaProlungata`) |

- L'automobilista è sempre quello della sessione; il percorso indica solo la sosta.
- **Ordine dei controlli:** prima la sessione e il ruolo (`richiediSessione`), poi l'id della sosta, poi il corpo o il parametro, poi la Facade (`cp_prolungamento.md` §2).
- **Id della sosta:** letto con `leggiId` (intero positivo scritto solo con cifre); altrimenti 422 `RICHIESTA_NON_VALIDA`.
- **`GET`:** `tempoAggiuntivo` composto da 1 a 4 cifre (`/^\d{1,4}$/`, come `durata` in `cp_apiImporto.md`); se manca o non ha quel formato → 422 `RICHIESTA_NON_VALIDA`.
- **`POST`:** corpo JSON con `tempoAggiuntivo` numero; corpo non JSON, campo mancante o non numero → 422 `RICHIESTA_NON_VALIDA`. Un numero non intero o sotto i 15 minuti lo rifiuta la Facade con `DURATA_NON_VALIDA`.
- **Importi** in centesimi, **orari** in ISO 8601. Il formato della risposta è quello della Facade, senza campi aggiunti.
- **Errori:** 401 `SESSIONE_NON_VALIDA`; 403 `RUOLO_NON_AMMESSO`; 404 `SOSTA_INESISTENTE` (anche per la sosta di un altro Automobilista); 409 `SOSTA_SCADUTA`, `SOSTA_TERMINATA`, `CREDITO_INSUFFICIENTE`; 422 `DURATA_NON_VALIDA`, `DURATA_OLTRE_IL_MASSIMO`, `RICHIESTA_NON_VALIDA`. Il messaggio di `DURATA_OLTRE_IL_MASSIMO` contiene i minuti ancora disponibili (`cp_prolungamento.md` §2).

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`; pool applicativo e composizione come in `cp_apiAccesso.md` §3; il servizio di pagamento è il `SimulatorePagamento` del punto di composizione. Le scritture vanno in commit: ogni frame che scrive usa il proprio automobilista e il proprio stallo.
- **Orologio:** quello di sistema, condiviso da applicazione e database. `A` è `Date.now()` letto all'inizio della preparazione del frame.
- **Dalla COD-23 (RF_IOT_2):** prima di ogni frame (`beforeEach`) `rilevazioniAllIstante(poolDiTest(), new Date())` (`src/persistence/test/datiDiProva.ts`) porta all'istante corrente l'ultima rilevazione degli stalli rilevati, così l'allineamento delle route non li porta a `Sconosciuto`. Gli esiti non cambiano.
- **Automobilista nuovo del frame `n`:** `POST /api/auth/registrazione` con email `api.pro<n>@test.example`, password `parola-di-prova-lunga` e targa `AP0<n>XX`, con il numero del frame su due cifre (per esempio `AP001XX`); nasce con il wallet a saldo 0 e con il cookie di sessione. **Saldo di preparazione:** `registraRicarica` della persistenza sul suo wallet, dell'importo indicato (1000 se non indicato).
- **Sosta di prova `S`** dell'automobilista del frame, sullo stallo indicato (`OCCUPATO` nel dataset): `creaSosta` della persistenza con il veicolo della sua targa, `orarioDiAvvio` `A − 30 min`, `orarioDiScadenza` `A + 30 min` (60 minuti), `pagamento` `PAGATA`, poi `impostaNonDisponibile(stallo)` della Facade di Gestione stalli composta con `osservatoreGestioneSoste`; orari diversi dove indicato. «Scaduta» aggiunge `impostaSostaScaduta` e non imposta lo stallo Non disponibile.
- **Sessioni:** Marco Rossi (`marco.rossi@omnipark.example`, Automobilista 8, saldo 600, sosta 1 `TERMINATA` nel dataset), Paolo Ferri (`paolo.ferri@omnipark.example`, Ausiliario, ruolo non ammesso).
- **Nessun effetto (`N`):** dopo un errore, stato e orario di scadenza della sosta sono quelli della preparazione; saldo e movimenti del wallet dell'automobilista (e del proprietario della sosta, se diverso) sono quelli della preparazione; lo stato dello stallo è quello della preparazione.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                             | id                                  | Contenuto                                                                 |
| :---------------------------------- | :---------------------------------- | :------------------------------------------------------------------------ |
| `stallo`                            | 3, 7, 8, 11, 12, 17, 18, 19, 20, 21 | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, tariffa 1 (150 c/h, massimo 180 min) |
| `stallo`                            | 23, 26                              | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, tariffa 3 (100 c/h, massimo 120 min) |
| `automobilista` / `wallet_virtuale` | 8 / 2                               | Marco Rossi, saldo 600                                                    |
| `sosta`                             | 1                                   | di Marco Rossi, stallo 10, `TERMINATA`, scadenza `2026-10-31 10:00+01`    |
| `utente`                            | 2                                   | Paolo Ferri (Ausiliario)                                                  |

Colonne usate dai test: `sosta` (`id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`), `movimento_del_wallet` (`tipo_di_movimento`, `importo`, `sosta_id`), `wallet_virtuale` e `saldo_wallet_virtuale`, `stallo` (`id`, `stato`).

Id inesistente: `999999`.

## 4. Categorie e scelte

**Sessione:** valida · assente [error] → 401.

**Ruolo:** Automobilista · Ausiliario [error] → 403.

**Ente dei dati:** non applicabile.

**Metodo:** `POST` (conferma) · `GET` (anteprima senza scritture).

**Id della sosta:** propria · di un altro Automobilista [error] → 404 · inesistente [error] → 404 · non numerico [error] → 422.

**Stato della sosta:** Attiva · Scaduta [error] → 409 · Terminata [error] → 409.

**Tempo aggiuntivo:** valido · sotto i 15 minuti [error] → 422 · non numero o mancante [error] → 422.

**Durata totale:** entro il massimo · oltre il massimo con almeno 15 minuti disponibili [error] → 422 con i minuti nel messaggio · oltre il massimo con meno di 15 minuti disponibili [error] → 422 con il messaggio della decisione D3.

**Credito:** sufficiente · insufficiente [error] → 409, nessun effetto.

**Concorrenza:** richiesta singola · due `POST` simultanei della stessa sosta [single].

## 5. Test frame (19)

Tempo aggiuntivo in minuti; saldo in centesimi. Dove non indicato: automobilista nuovo del frame con saldo 1000, sosta `S` di quell'automobilista, richiesta con la sua sessione. `S + m` indica l'orario di scadenza di `S` della preparazione più `m` minuti.

- **Richieste che riusano la sosta di un frame precedente** (nessun automobilista nuovo per questi frame): TF-API-PRO-15 con la sessione dell'automobilista di TF-API-PRO-14, proprietario della sosta; TF-API-PRO-17 senza cookie; TF-API-PRO-18 con la sessione di Paolo Ferri; TF-API-PRO-19 con la sessione del primo automobilista di TF-API-PRO-04 (non proprietario della sosta).
- **Secondo automobilista di TF-API-PRO-04:** saldo 1000, il valore predefinito del §3.

| Frame         | Preparazione e richiesta                                                                                                                                                                | Esito atteso                                                                                                                                                                                                          | Riferimento |
| :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-API-PRO-01 | `S` sullo stallo 3; `POST` con `{ tempoAggiuntivo: 30 }`                                                                                                                                | 200, `{ sosta: <id di S>, orarioDiScadenza: S + 30, importo: 75 }`; `S` `ATTIVA` con scadenza `S + 30`; un nuovo movimento `ADDEBITO` da 75 con `sostaId` di `S`; `GET /api/wallet` → 925; stallo 3 `NON_DISPONIBILE` | RF_SOSTA_2  |
| TF-API-PRO-02 | `S` sullo stallo 7; `GET ?tempoAggiuntivo=30`                                                                                                                                           | 200, `{ importo: 75, orarioDiScadenza: S + 30 }`; `N` (nessuna scrittura: scadenza invariata, saldo 1000, solo la ricarica)                                                                                           | RF_SOSTA_2  |
| TF-API-PRO-03 | `S` sullo stallo 8; due `POST` con `{ tempoAggiuntivo: 30 }` avviati insieme (`Promise.allSettled`)                                                                                     | entrambe 200 con `importo: 75`; le due scadenze restituite sono `S + 30` e `S + 60`; `S` `ATTIVA` con scadenza `S + 60`; due nuovi movimenti `ADDEBITO` da 75 per `S`; saldo 850                                      | RF_SOSTA_2  |
| TF-API-PRO-04 | automobilista del frame e un secondo automobilista (`api.pro04b@test.example`, targa `AP004YY`); `S` del secondo sullo stallo 11; `POST` del primo con `{ tempoAggiuntivo: 30 }` su `S` | 404 `SOSTA_INESISTENTE`; `N` per entrambi                                                                                                                                                                             | RF_SOSTA_2  |
| TF-API-PRO-05 | nessuna sosta; `POST /api/soste/999999/prolungamento` con `{ tempoAggiuntivo: 30 }`                                                                                                     | 404 `SOSTA_INESISTENTE`; saldo 1000, solo la ricarica                                                                                                                                                                 | ISSUE_33    |
| TF-API-PRO-06 | `S` sullo stallo 12 dalle `A − 90 min` alle `A − 30 min`, scaduta; `POST` con `{ tempoAggiuntivo: 30 }`                                                                                 | 409 `SOSTA_SCADUTA`; `N` (`S` `SCADUTA`, stallo 12 `OCCUPATO`)                                                                                                                                                        | RF_SOSTA_2  |
| TF-API-PRO-07 | Marco Rossi; `POST /api/soste/1/prolungamento` con `{ tempoAggiuntivo: 30 }`                                                                                                            | 409 `SOSTA_TERMINATA`; la sosta 1 resta `TERMINATA` con scadenza `2026-10-31 10:00+01`; saldo 600, movimenti invariati                                                                                                | RF_SOSTA_2  |
| TF-API-PRO-08 | saldo 50; `S` sullo stallo 17; `POST` con `{ tempoAggiuntivo: 30 }` (importo 75)                                                                                                        | 409 `CREDITO_INSUFFICIENTE`; `N` (saldo 50, scadenza `S`)                                                                                                                                                             | RF_WALLET_2 |
| TF-API-PRO-09 | `S` sullo stallo 18 (massimo 180, 60 minuti già usati); `POST` con `{ tempoAggiuntivo: 121 }`                                                                                           | 422 `DURATA_OLTRE_IL_MASSIMO`, messaggio `"Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 120 minuti."`; `N`                                                                   | RF_SOSTA_2  |
| TF-API-PRO-10 | `S` sullo stallo 19 dalle `A − 30 min` alle `A + 145 min` (175 minuti); `POST` con `{ tempoAggiuntivo: 15 }`                                                                            | 422 `DURATA_OLTRE_IL_MASSIMO`, messaggio `"La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo."`; `N`                                                                              | RF_SOSTA_2  |
| TF-API-PRO-11 | `S` sullo stallo 20; `GET ?tempoAggiuntivo=121`                                                                                                                                         | 422 `DURATA_OLTRE_IL_MASSIMO`, messaggio `"Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 120 minuti."`; `N`                                                                   | RF_SOSTA_2  |
| TF-API-PRO-12 | `S` sullo stallo 21; `POST` con `{ tempoAggiuntivo: 14 }`                                                                                                                               | 422 `DURATA_NON_VALIDA`; `N`                                                                                                                                                                                          | ISSUE_33    |
| TF-API-PRO-13 | nessuna sosta; `POST /api/soste/abc/prolungamento` con `{ tempoAggiuntivo: 30 }`                                                                                                        | 422 `RICHIESTA_NON_VALIDA`; saldo 1000, solo la ricarica                                                                                                                                                              | ISSUE_33    |
| TF-API-PRO-14 | `S` sullo stallo 23; `POST` con `{ tempoAggiuntivo: "30" }`                                                                                                                             | 422 `RICHIESTA_NON_VALIDA`; `N`                                                                                                                                                                                       | ISSUE_33    |
| TF-API-PRO-15 | `S` sullo stallo 23 di TF-API-PRO-14 (nessuna scrittura); `GET` senza `tempoAggiuntivo`                                                                                                 | 422 `RICHIESTA_NON_VALIDA`; `N`                                                                                                                                                                                       | ISSUE_33    |
| TF-API-PRO-16 | `S` sullo stallo 26; `POST` con `{ tempoAggiuntivo: 30 }` senza cookie                                                                                                                  | 401 `SESSIONE_NON_VALIDA`; `N`                                                                                                                                                                                        | NRF_SIC_1   |
| TF-API-PRO-17 | `S` sullo stallo 26 di TF-API-PRO-16 (nessuna scrittura); `GET ?tempoAggiuntivo=30` senza cookie                                                                                        | 401 `SESSIONE_NON_VALIDA`; `N`                                                                                                                                                                                        | NRF_SIC_1   |
| TF-API-PRO-18 | `S` sullo stallo 26 di TF-API-PRO-16; Paolo Ferri; `POST` con `{ tempoAggiuntivo: 30 }`                                                                                                 | 403 `RUOLO_NON_AMMESSO`; `N`                                                                                                                                                                                          | NRF_SIC_1   |
| TF-API-PRO-19 | `S` del secondo automobilista di TF-API-PRO-04 (nessuna scrittura); `GET ?tempoAggiuntivo=30` del primo                                                                                 | 404 `SOSTA_INESISTENTE`; `N` per entrambi                                                                                                                                                                             | RF_SOSTA_2  |

Totale 19: 2 prolungamenti riusciti (TF-API-PRO-01 e 03 [single] di concorrenza), 1 anteprima riuscita (TF-API-PRO-02), 16 errori. TF-API-PRO-15, 17, 18 e 19 riusano la sosta di un frame precedente del file, che non scrive. Ogni frame di errore viola un solo controllo.

Note sui riferimenti:

- TF-API-PRO-01: RF_SOSTA_2 e `UC_SOSTA_2` exit condition, attraverso la route; la nuova scadenza parte dalla scadenza attuale (`cp_prolungamento.md` TF-PRO-01).
- TF-API-PRO-02, 11: `UC_SOSTA_2` passo 3 («mostra importo e nuovo orario di scadenza») e 2.a2, con la route `GET` della decisione D2; nessuna scrittura.
- TF-API-PRO-03: criterio di accettazione dell'issue #33 («due prolungamenti simultanei della stessa sosta non producono scadenze o addebiti incoerenti»), attraverso la route (blocco della riga, `cp_prolungamento.md` TF-PRO-14).
- TF-API-PRO-04, 19: `UC_SOSTA_2` entry condition («una propria sosta»); la sosta di un altro Automobilista risulta inesistente, per non rivelarne l'esistenza (piano approvato del sotto-task 1).
- TF-API-PRO-06, 07: `UC_SOSTA_2` 2.a1 e regole di dominio; status 409 della tabella delle API (conflitto di stato).
- TF-API-PRO-08: RF_WALLET_2 e `UC_SOSTA_2` 5.a1 («la scadenza non cambia»).
- TF-API-PRO-09, 10: `UC_SOSTA_2` 2.a2 («indicando il tempo ancora disponibile»), con il messaggio di `cp_prolungamento.md` §2 (TF-PRO-18, 19 lo verificano nel servizio).
- TF-API-PRO-12…15: lettura della richiesta (§2) e durata minima di 15 minuti (`cp_prolungamento.md` TF-PRO-10).
- TF-API-PRO-16…18: NRF_SIC_1 (solo l'Automobilista autenticato).

## 6. Note

- **Già verificati altrove** (nessun frame qui): sequenza del servizio, sosta `Attiva` con scadenza raggiunta non ancora allineata, soste gratuite e rosa, tempo aggiuntivo non intero, scadenza condizionata, `cp_prolungamento.md`; tabella codice → status, `src/app/api/_errori.test.ts`.
- **Fasce orarie** fuori ambito (COD-24): l'importo aggiuntivo usa solo il costo orario.
- **Annullamento** (`UC_SOSTA_2` 4.a1) e **proposta di ricarica** (5.a1) sono della schermata (blocco B): annullare corrisponde a non inviare il `POST`.
