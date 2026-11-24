# cp_apiImporto

Specifica dei casi di test (category partition) della route `GET /api/soste/importo?stallo=<id>&durata=<minuti>`: importo e orario di scadenza mostrati prima della conferma dell'avvio.
Requisiti: RF_WALLET_2 (importo secondo le regole del tipo di stallo), RF_SOSTA_1 (durata entro il massimo dello stallo), NRF_SIC_1 (controllo degli accessi). Task OMP-58 (issue #29).

- **Fonti dell'esito atteso:** `UC_SOSTA_1` passo 3 («calcola l'importo secondo la tariffa dello stallo e mostra importo e orario di scadenza»), `SD_SOSTA_1` 3.2–3.3, `cp_calcoloImporto.md` §2 (regola di calcolo, durata da 15 minuti al massimo della tariffa, ordine dei controlli, stato dello stallo irrilevante), `src/app/api/_errori.ts` (tabella codice → status), categorie delle API di OMP-48 (`cp_apiWalletSoste.md`, `cp_apiStalli.md`), piano approvato di OMP-58 (punto 5).
- **File di test:** `src/app/api/soste/importo/importo.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` per le scelte dell'issue #29 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_1 · TF-API-IMP-07 · durata sotto il minimo → 422 DURATA_NON_VALIDA`.

## 2. Route verificata

| Metodo e percorso                               | Sessione e operazione        | Facade (Gestione soste)          | Risposta positiva                                                                      |
| :---------------------------------------------- | :--------------------------- | :------------------------------- | :------------------------------------------------------------------------------------- |
| `GET /api/soste/importo?stallo=<id>&durata=<m>` | `UC_SOSTA_1` (Automobilista) | `calcolaImporto(stallo, durata)` | 200, `{ importo, pagamento, orarioDiScadenza }`; importo in centesimi, orario ISO 8601 |

- **Ordine dei controlli:** prima la sessione e il ruolo (`richiediSessione`), poi i parametri, poi la Facade (prima lo stallo, poi la durata, `cp_calcoloImporto.md` §2).
- **Parametri:** `stallo` letto con `leggiId` (intero positivo scritto solo con cifre); `durata` composta da 1 a 4 cifre (`/^\d{1,4}$/`). Se uno dei due manca o non ha quel formato → 422 `RICHIESTA_NON_VALIDA`. Una durata nel formato giusto ma fuori dall'intervallo la rifiuta la Facade con `DURATA_NON_VALIDA`.
- **`orarioDiScadenza`:** orologio del server all'istante della richiesta + `durata` minuti.
- **Nessuna scrittura:** la route non crea soste, non addebita e non cambia lo stato dello stallo.
- **Errori:** 401 `SESSIONE_NON_VALIDA`; 403 `RUOLO_NON_AMMESSO`; 404 `STALLO_INESISTENTE`; 422 `DURATA_NON_VALIDA`, `RICHIESTA_NON_VALIDA`.

## 3. Ambiente

- Database di test, pool applicativo e composizione come in `cp_apiAccesso.md` §3. Nessun frame scrive: gli stalli si possono usare in più frame.
- **Sessioni:** Marco Rossi (`marco.rossi@omnipark.example`, Automobilista, saldo 600 nel dataset), Paolo Ferri (`paolo.ferri@omnipark.example`, Ausiliario, ruolo non ammesso), sessione scaduta dell'utente 8 inserita con la persistenza come in `cp_apiAccesso.md` §3.
- **Orario di scadenza atteso:** `prima` = `Date.now()` prima della richiesta, `dopo` = `Date.now()` dopo la risposta; `orarioDiScadenza` è un istante ISO 8601 valido compreso tra `prima + durata` e `dopo + durata` (estremi inclusi). Il database e l'applicazione condividono l'orologio di sistema della macchina dei test.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella   | id   | Contenuto                                             |
| :-------- | :--- | :---------------------------------------------------- |
| `stallo`  | 3    | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, tariffa 1        |
| `stallo`  | 16   | `ORDINARIO_A_PAGAMENTO`, `LIBERO`, tariffa 1          |
| `stallo`  | 15   | `ROSA`, `OCCUPATO`, tariffa 1                         |
| `stallo`  | 14   | `DISABILI`, `LIBERO`, tariffa 1                       |
| `tariffa` | 1    | 150 centesimi l'ora, durata massima 180 minuti        |
| `utente`  | 2, 8 | Paolo Ferri (Ausiliario), Marco Rossi (Automobilista) |

Colonne lette per le verifiche di «nessuna scrittura»: `stallo` (`id`, `stato`), `sosta` (`stallo_id`, `stato`), `saldo_wallet_virtuale` del wallet di Marco Rossi.

## 4. Categorie e scelte

**Sessione:** valida · assente [error] → 401 · scaduta [error] → 401.

**Ruolo:** Automobilista · Ausiliario [error] → 403.

**Ente dei dati:** non applicabile.

**`stallo`:** esistente · inesistente [error] → 404 · non intero [error] → 422 · mancante [error] → 422.

**`durata`:** 15 minuti · intermedia · massima della tariffa · sotto il minimo [error] → 422 · oltre la massima [error] → 422 · non intera [error] → 422 `RICHIESTA_NON_VALIDA` · mancante [error] → 422.

**Tipo di stallo:** a pagamento · rosa · per persone con disabilità → 0, `GRATUITA`.

**Stato dello stallo:** Occupato · Libero [single] → l'importo si calcola comunque.

## 5. Test frame (17)

| Frame         | Richiesta e preparazione                                                    | Esito atteso                                                                                                                                                                                                   | Riferimento |
| :------------ | :-------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-API-IMP-01 | Marco Rossi; `GET /api/soste/importo?stallo=3&durata=60`                    | 200, `{ importo: 150, pagamento: "PAGATA", orarioDiScadenza }` con l'orario atteso del §3; nessuna scrittura: stallo 3 ancora `OCCUPATO`, nessuna sosta non terminata sullo stallo 3, saldo di Marco Rossi 600 | RF_WALLET_2 |
| TF-API-IMP-02 | Marco Rossi; `GET /api/soste/importo?stallo=3&durata=15`                    | 200, `importo: 38`, `pagamento: "PAGATA"`                                                                                                                                                                      | RF_WALLET_2 |
| TF-API-IMP-03 | Marco Rossi; `GET /api/soste/importo?stallo=3&durata=180`                   | 200, `importo: 450`, `pagamento: "PAGATA"`                                                                                                                                                                     | RF_SOSTA_1  |
| TF-API-IMP-04 | Marco Rossi; `GET /api/soste/importo?stallo=15&durata=120`                  | 200, `importo: 300`, `pagamento: "PAGATA"`                                                                                                                                                                     | VD_10       |
| TF-API-IMP-05 | Marco Rossi; `GET /api/soste/importo?stallo=14&durata=60`                   | 200, `importo: 0`, `pagamento: "GRATUITA"`                                                                                                                                                                     | VD_10       |
| TF-API-IMP-06 | Marco Rossi; `GET /api/soste/importo?stallo=16&durata=60`                   | 200, `importo: 150`, `pagamento: "PAGATA"` (stallo `LIBERO`: lo stato non conta)                                                                                                                               | ISSUE_29    |
| TF-API-IMP-07 | Marco Rossi; `GET /api/soste/importo?stallo=3&durata=14`                    | 422 `DURATA_NON_VALIDA`                                                                                                                                                                                        | RF_SOSTA_1  |
| TF-API-IMP-08 | Marco Rossi; `GET /api/soste/importo?stallo=3&durata=181`                   | 422 `DURATA_NON_VALIDA`                                                                                                                                                                                        | RF_SOSTA_1  |
| TF-API-IMP-09 | Marco Rossi; `GET /api/soste/importo?stallo=999999&durata=60`               | 404 `STALLO_INESISTENTE`                                                                                                                                                                                       | RF_SOSTA_1  |
| TF-API-IMP-10 | Marco Rossi; `GET /api/soste/importo?stallo=abc&durata=60`                  | 422 `RICHIESTA_NON_VALIDA`                                                                                                                                                                                     | ISSUE_29    |
| TF-API-IMP-11 | Marco Rossi; `GET /api/soste/importo?durata=60` (senza `stallo`)            | 422 `RICHIESTA_NON_VALIDA`                                                                                                                                                                                     | ISSUE_29    |
| TF-API-IMP-12 | Marco Rossi; `GET /api/soste/importo?stallo=3&durata=60.5`                  | 422 `RICHIESTA_NON_VALIDA`                                                                                                                                                                                     | ISSUE_29    |
| TF-API-IMP-13 | Marco Rossi; `GET /api/soste/importo?stallo=3` (senza `durata`)             | 422 `RICHIESTA_NON_VALIDA`                                                                                                                                                                                     | ISSUE_29    |
| TF-API-IMP-14 | `GET /api/soste/importo?stallo=3&durata=60` senza cookie                    | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                                                      | NRF_SIC_1   |
| TF-API-IMP-15 | `GET /api/soste/importo?stallo=abc&durata=60` senza cookie                  | 401 `SESSIONE_NON_VALIDA` (la sessione si controlla prima dei parametri)                                                                                                                                       | NRF_SIC_1   |
| TF-API-IMP-16 | sessione scaduta dell'utente 8; `GET /api/soste/importo?stallo=3&durata=60` | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                                                      | NRF_SIC_1   |
| TF-API-IMP-17 | Paolo Ferri; `GET /api/soste/importo?stallo=3&durata=60`                    | 403 `RUOLO_NON_AMMESSO`                                                                                                                                                                                        | NRF_SIC_1   |

Totale 17: 6 sul calcolo (tre tipi di stallo, durata minima, intermedia e massima, stato irrilevante), 3 sugli errori di dominio, 4 sui parametri, 4 su sessione e ruolo.

Note sui riferimenti:

- TF-API-IMP-01…03: RF_WALLET_2 e `UC_SOSTA_1` passo 3; `importo = floor((150 × durata + 30) / 60)`: 60 min → 150, 15 min → 38, 180 min → 450 (`cp_calcoloImporto.md` §2). TF-API-IMP-01 verifica anche che la route non scriva.
- TF-API-IMP-04, 05: VD_10 (stallo rosa a tariffa, stallo per disabili gratuito).
- TF-API-IMP-06: `cp_calcoloImporto.md` §2 (lo stato dello stallo non conta per il calcolo; l'avvio lo controlla `POST /api/soste`).
- TF-API-IMP-07, 08: RF_SOSTA_1 (durata entro il massimo) e durata minima di 15 minuti.
- TF-API-IMP-10…13: formato dei parametri, come le altre route di OMP-48 («mancanti o non validi → 422»).

## 6. Note

- **Già verificati altrove** (nessun frame qui): regola di calcolo e arrotondamenti, `cp_calcoloImporto.md`; tabella codice → status, `src/app/api/_errori.test.ts`.
- L'orologio del server rende l'orario di scadenza indipendente dall'orologio del dispositivo (`cp_sostaInCorso.md` per lo scarto usato da «La mia sosta»).
