# cp_apiSegnalazioni

Specifica dei casi di test (category partition) del gruppo di API Segnalazioni dell'Ausiliario del Traffico: `GET /api/ausiliario/segnalazioni`, `GET /api/ausiliario/segnalazioni/modifiche?dopo=` e `POST /api/segnalazioni/<id>/chiusura`.
Requisiti: RF_OP_1 (mappa delle segnalazioni), RF_OP_6 (chiusura con esito), NRF_SIC_1 (controllo degli accessi per ruolo ed ente), NRF_PER_3 (aggiornamento, come base). Task OMP-48 (issue #27).

- **Fonti dell'esito atteso:** `UC_OP_1`, `SD_OP_1`, `UC_OP_4`, `SD_OP_4`, `docs/rad/vincoli_dominio.md` (VD_18, VD_19), TCS dei servizi (`cp_segnalazioniEnte.md`, compresi TF-ENT-14…22, e `cp_chiusuraSegnalazione.md`), `cp_persistenza_stalli_tariffe.md` §6 (cursore), issue #27, piano approvato di OMP-48.
- **File di test:** `src/app/api/ausiliario/segnalazioni.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_27` per le scelte dell'issue #27 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `NRF_SIC_1 · TF-API-SEG-24 · chiusura di una segnalazione di un altro ente → 403 ENTE_NON_AMMESSO`.

## 2. Route verificate

| Metodo e percorso                                                   | Corpo o parametri   | Sessione e operazione                                     | Facade (Segnalazioni)                      | Risposta positiva                                                                                                         |
| :------------------------------------------------------------------ | :------------------ | :-------------------------------------------------------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/ausiliario/segnalazioni[?ente=<id>]`                      | `ente` facoltativo  | `UC_OP_1`; ente = `ente` indicato o quello della sessione | `fotografiaSegnalazioni(ausiliario, ente)` | 200, `{ segnalazioni, cursore }`                                                                                          |
| `GET /api/ausiliario/segnalazioni/modifiche?dopo=<ISO>[&ente=<id>]` | `dopo` obbligatorio | `UC_OP_1`, come sopra                                     | `variazioniDopo(ausiliario, ente, dopo)`   | 200, `{ segnalazioni, cursore }`: segnalazioni dell'ente, in qualsiasi stato, con `ultimaModifica` > `dopo` − 5 s, per id |
| `POST /api/segnalazioni/<id>/chiusura`                              | `{ esito }`         | `UC_OP_4`; ente della sessione                            | `chiudi(ausiliario, id, esito)`            | 200, `{}`                                                                                                                 |

- L'Ausiliario è sempre quello della sessione. Con `?ente=` diverso dal suo, `verificaAutorizzazione` risponde `ENTE_NON_AMMESSO`; per la chiusura, l'ente della segnalazione lo controlla Segnalazioni (`ENTE_NON_AMMESSO`).
- **Segnalazione nelle risposte:** `{ id, stalloId, numeroStallo, latitudine, longitudine, stato, motivo, targaRilevata, dataEOraDellaLettura, ausiliarioId, ultimaModifica }`; istanti in ISO 8601. Cursore: istante letto dal database prima delle righe, in ISO 8601.
- **Parametri:** `ente` non intero → 422 `RICHIESTA_NON_VALIDA`; `dopo` mancante o non ISO 8601 con fuso → 422 `ISTANTE_NON_VALIDO`; `<id>` non intero → 422 `RICHIESTA_NON_VALIDA`; corpo della chiusura non JSON → 422 `RICHIESTA_NON_VALIDA`; `esito` mancante o non previsto → 422 `ESITO_NON_VALIDO` (dalla Facade).
- **Errori:** 401 `SESSIONE_NON_VALIDA`; 403 `RUOLO_NON_AMMESSO`, `ENTE_NON_AMMESSO`; 404 `SEGNALAZIONE_INESISTENTE`; 409 `SEGNALAZIONE_GIA_CHIUSA`, `SEGNALAZIONE_PRESA_DA_ALTRI`; 422 `RICHIESTA_NON_VALIDA`, `ISTANTE_NON_VALIDO`, `ESITO_NON_VALIDO`.

## 3. Ambiente

- Database di test, pool applicativo e composizione come in `cp_apiAccesso.md` §3. Le scritture vanno in commit. L'ordine fisso vale solo per i frame che leggono il dataset: le letture dell'ente 1 (TF-API-SEG-01, 02) precedono le chiusure dell'ente 1, e quella dell'ente 3 (TF-API-SEG-04) precede le segnalazioni create sull'ente 3. I frame che scrivono usano segnalazioni, stalli e targhe propri, così un fallimento non si propaga.
- **Sessioni:** accesso con la password dimostrativa `Demo-Ausiliario-2026` per Paolo Ferri (2, ente 1), Sara Galli (3, ente 1), Anna Moretti (5, ente 2), Giorgio Marino (6, ente 3); Marco Rossi (Automobilista, ruolo non ammesso). Sessione scaduta inserita con la persistenza come in `cp_apiAccesso.md` §3. **Sessione dell'Ausiliario disattivato:** `creaSessione(pool, { utenteId: 4, hashToken: calcolaHashToken("disattivato-08"), scadenza: 2027-01-01 00:00:00+01 })`, cookie `disattivato-08`.
- **Segnalazione di prova:** `creaSegnalazioneDaLettura(pool, { stalloId, targa, dataEOra: 2026-11-20 09:00:00+01, motivo: "SOSTA_ASSENTE" })`, `APERTA`.
- **Segnalazione confermata con ritardo:** un client della seconda connessione `poolDiTest().connect()` esegue `BEGIN` e `creaSegnalazioneDaLettura(client, …)`; il `COMMIT` arriva dopo la lettura indicata nel frame. Il client si rilascia alla fine del frame.
- **Cursore + 6 s:** calcolato dal cursore restituito, senza attese.
- **Invariata:** `dettaglioSegnalazione(id)` dopo la richiesta ha stato, assegnatario, esito e `ultimaModifica` uguali a prima.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                   | id                                            | Contenuto                                   |
| :------------------------ | :-------------------------------------------- | :------------------------------------------ |
| `ausiliario_del_traffico` | 2, 3                                          | Paolo Ferri, Sara Galli: ente 1, `ATTIVO`   |
| `ausiliario_del_traffico` | 4                                             | Luca Russo: ente 1, `DISATTIVATO`           |
| `ausiliario_del_traffico` | 5                                             | Anna Moretti: ente 2, `ATTIVO`              |
| `ausiliario_del_traffico` | 6                                             | Giorgio Marino: ente 3, `ATTIVO`            |
| `segnalazione`            | 4, 10                                         | ente 1, `PRESA_IN_CARICO` dall'Ausiliario 3 |
| `segnalazione`            | 5                                             | ente 1, `PRESA_IN_CARICO` dall'Ausiliario 2 |
| `segnalazione`            | 11                                            | ente 1, `APERTA`                            |
| `segnalazione`            | 1                                             | ente 1, `CHIUSA`                            |
| `segnalazione`            | 12                                            | ente 2, `APERTA`                            |
| `stallo`                  | 16 (ente 1), 22, 24 (ente 2), 28, 29 (ente 3) | stalli delle segnalazioni di prova          |

Colonne usate dai test: `segnalazione` (`id`, `stallo_id`, `stato`, `motivo`, `targa_rilevata`, `data_e_ora_della_lettura`, `ausiliario_del_traffico_id`, `esito`, `data_e_ora_della_chiusura`, `ultima_modifica`), `sessione`, `ausiliario_del_traffico` (`id`, `ente_preposto_id`, `stato_dell_account`).

## 4. Categorie e scelte

**Sessione:** valida · assente [error] → 401 · scaduta [error] → 401 · di un Ausiliario disattivato [error] → 401.

**Ruolo:** Ausiliario · Automobilista [error] → 403.

**Ente dei dati:** quello della sessione (parametro assente) · lo stesso indicato · un altro [error] → 403 · non intero [error] → 422.

**Ente:** con segnalazioni · senza segnalazioni.

**`dopo` (modifiche)**

1. precedente a una variazione
2. cursore appena restituito, con una variazione negli ultimi 5 s (margine)
3. successivo all'ultima variazione di più di 5 s (cursore + 6 s) → nessuna riga
4. mancante [error]
5. non valido [error]

**Variazione confermata con ritardo entro il margine** [single] → restituita.

**Chiusura — stato:** Aperta · Presa in carico dallo stesso · Presa da un altro [error] · Chiusa [error] · inesistente [error].

**Chiusura — esito:** previsto · non previsto [error] · mancante [error]; corpo non JSON [error].

**Chiusura — `<id>`:** intero · non intero [error].

## 5. Test frame (31)

| Frame         | Richiesta e preparazione                                                                                                                                                         | Esito atteso                                                                      | Riferimento |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :---------- |
| TF-API-SEG-01 | Paolo Ferri; `GET /api/ausiliario/segnalazioni`                                                                                                                                  | 200; id `[4, 5, 10, 11]` in ordine, nessuna chiusa; `cursore` ISO 8601 valido     | RF_OP_1     |
| TF-API-SEG-02 | Paolo Ferri; `GET /api/ausiliario/segnalazioni?ente=1`                                                                                                                           | 200; id `[4, 5, 10, 11]`                                                          | RF_OP_1     |
| TF-API-SEG-03 | Paolo Ferri; `GET /api/ausiliario/segnalazioni?ente=2`                                                                                                                           | 403 `ENTE_NON_AMMESSO`                                                            | NRF_SIC_1   |
| TF-API-SEG-04 | Giorgio Marino; `GET /api/ausiliario/segnalazioni`                                                                                                                               | 200; `segnalazioni: []`, `cursore` valido                                         | RF_OP_1     |
| TF-API-SEG-05 | `GET /api/ausiliario/segnalazioni` senza cookie                                                                                                                                  | 401 `SESSIONE_NON_VALIDA`                                                         | NRF_SIC_1   |
| TF-API-SEG-06 | sessione scaduta dell'utente 2; `GET /api/ausiliario/segnalazioni`                                                                                                               | 401 `SESSIONE_NON_VALIDA`                                                         | NRF_SIC_1   |
| TF-API-SEG-07 | Marco Rossi; `GET /api/ausiliario/segnalazioni`                                                                                                                                  | 403 `RUOLO_NON_AMMESSO`                                                           | NRF_SIC_1   |
| TF-API-SEG-08 | sessione valida dell'Ausiliario disattivato 4; `GET /api/ausiliario/segnalazioni`                                                                                                | 401 `SESSIONE_NON_VALIDA`                                                         | VD_19       |
| TF-API-SEG-09 | Paolo Ferri; `GET /api/ausiliario/segnalazioni?ente=abc`                                                                                                                         | 422 `RICHIESTA_NON_VALIDA`                                                        | ISSUE_27    |
| TF-API-SEG-10 | Anna Moretti; `c0` dalla lista; segnalazione di prova sullo stallo 22, targa `SG10AA`; `GET …/modifiche?dopo=c0`                                                                 | 200; contiene la segnalazione `SG10AA`, `APERTA`; `cursore` non precedente a `c0` | NRF_PER_3   |
| TF-API-SEG-11 | Anna Moretti; `c0` dalla lista; segnalazione di prova sullo stallo 24, targa `SG11AA`; `r1` = modifiche dopo `c0`; `r2` = modifiche dopo `r1.cursore`                            | `r1` e `r2` contengono la segnalazione `SG11AA` (margine di 5 s)                  | ISSUE_27    |
| TF-API-SEG-12 | Giorgio Marino; `c0` dalla lista; segnalazione di prova sullo stallo 28, targa `SG12AA`; `r1` = modifiche dopo `c0`; `r2` = modifiche dopo `r1.cursore` + 6 s                    | `r1` contiene `SG12AA`; `r2`: 200, `segnalazioni: []`, `cursore` valido           | NRF_PER_3   |
| TF-API-SEG-13 | Giorgio Marino; `c0` dalla lista; seconda connessione: `BEGIN` e segnalazione `SG13AA` sullo stallo 29; `r1` = modifiche dopo `c0`; `COMMIT`; `r2` = modifiche dopo `r1.cursore` | `r1` non contiene `SG13AA`; `r2` la contiene, `APERTA`                            | NRF_PER_3   |
| TF-API-SEG-14 | Paolo Ferri; `GET /api/ausiliario/segnalazioni/modifiche` senza `dopo`                                                                                                           | 422 `ISTANTE_NON_VALIDO`                                                          | ISSUE_27    |
| TF-API-SEG-15 | Paolo Ferri; `GET …/modifiche?dopo=ieri`                                                                                                                                         | 422 `ISTANTE_NON_VALIDO`                                                          | ISSUE_27    |
| TF-API-SEG-16 | Paolo Ferri; `GET …/modifiche?dopo=2026-11-20T09:00:00%2B01:00&ente=2`                                                                                                           | 403 `ENTE_NON_AMMESSO`                                                            | NRF_SIC_1   |
| TF-API-SEG-17 | Marco Rossi; `GET …/modifiche?dopo=2026-11-20T09:00:00%2B01:00`                                                                                                                  | 403 `RUOLO_NON_AMMESSO`                                                           | NRF_SIC_1   |
| TF-API-SEG-18 | `GET …/modifiche?dopo=2026-11-20T09:00:00%2B01:00` senza cookie                                                                                                                  | 401 `SESSIONE_NON_VALIDA`                                                         | NRF_SIC_1   |
| TF-API-SEG-19 | segnalazione di prova S sullo stallo 16, targa `SG19AA`; Paolo Ferri; `POST /api/segnalazioni/S/chiusura` con `{ esito: "SOSTA_IRREGOLARE_ACCERTATA" }`                          | 200; S `CHIUSA`, assegnata all'Ausiliario 2, esito `SOSTA_IRREGOLARE_ACCERTATA`   | RF_OP_6     |
| TF-API-SEG-20 | Paolo Ferri; `POST /api/segnalazioni/5/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                                               | 200; la 5 `CHIUSA`, assegnata all'Ausiliario 2, esito `NON_CONFERMATA`            | RF_OP_6     |
| TF-API-SEG-21 | Paolo Ferri; `POST /api/segnalazioni/4/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                                               | 409 `SEGNALAZIONE_PRESA_DA_ALTRI`; la 4 invariata                                 | RF_OP_6     |
| TF-API-SEG-22 | Paolo Ferri; `POST /api/segnalazioni/1/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                                               | 409 `SEGNALAZIONE_GIA_CHIUSA`; la 1 invariata                                     | RF_OP_6     |
| TF-API-SEG-23 | Paolo Ferri; `POST /api/segnalazioni/999999/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                                          | 404 `SEGNALAZIONE_INESISTENTE`                                                    | RF_OP_6     |
| TF-API-SEG-24 | Anna Moretti; `POST /api/segnalazioni/10/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                                             | 403 `ENTE_NON_AMMESSO`; la 10 invariata                                           | NRF_SIC_1   |
| TF-API-SEG-25 | Sara Galli; `POST /api/segnalazioni/10/chiusura` con `{ esito: "ALTRO" }`                                                                                                        | 422 `ESITO_NON_VALIDO`; la 10 invariata                                           | RF_OP_6     |
| TF-API-SEG-26 | Sara Galli; `POST /api/segnalazioni/10/chiusura` con `{}`                                                                                                                        | 422 `ESITO_NON_VALIDO`; la 10 invariata                                           | RF_OP_6     |
| TF-API-SEG-27 | Sara Galli; `POST /api/segnalazioni/10/chiusura` con corpo non JSON                                                                                                              | 422 `RICHIESTA_NON_VALIDA`; la 10 invariata                                       | ISSUE_27    |
| TF-API-SEG-28 | Paolo Ferri; `POST /api/segnalazioni/abc/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                                             | 422 `RICHIESTA_NON_VALIDA`                                                        | ISSUE_27    |
| TF-API-SEG-29 | `POST /api/segnalazioni/10/chiusura` con `{ esito: "NON_CONFERMATA" }` senza cookie                                                                                              | 401 `SESSIONE_NON_VALIDA`; la 10 invariata                                        | NRF_SIC_1   |
| TF-API-SEG-30 | Marco Rossi; `POST /api/segnalazioni/10/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                                              | 403 `RUOLO_NON_AMMESSO`; la 10 invariata                                          | NRF_SIC_1   |
| TF-API-SEG-31 | sessione scaduta dell'utente 3; `POST /api/segnalazioni/10/chiusura` con `{ esito: "NON_CONFERMATA" }`                                                                           | 401 `SESSIONE_NON_VALIDA`; la 10 invariata                                        | NRF_SIC_1   |

Totale 31: 9 sulla lista, 9 sulle modifiche (compreso [single] della variazione ritardata), 13 sulla chiusura.

Note sui riferimenti:

- TF-API-SEG-01, 02, 04: RF_OP_1 e `UC_OP_1` (segnalazioni `Aperte` e `Prese in carico` del comune; ente senza segnalazioni → elenco vuoto, 2.a1).
- TF-API-SEG-03, 16, 24: NRF_SIC_1, VD_18 e criterio di accettazione dell'issue («un Ausiliario non vede né chiude segnalazioni di un altro ente»).
- TF-API-SEG-08: VD_19; la sessione di un Ausiliario disattivato la rifiuta già Utenti e accessi (`SESSIONE_NON_VALIDA`), quindi `AUSILIARIO_NON_ATTIVO` di Segnalazioni non è raggiungibile da queste route.
- TF-API-SEG-10, 12, 13: NRF_PER_3 e criterio di accettazione dell'issue sulla variazione confermata dopo la lettura precedente; TF-API-SEG-12: correzione 2 del piano. TF-API-SEG-11: issue #27 (le righe già viste possono tornare).
- TF-API-SEG-19…23, 25, 26: RF_OP_6 e `UC_OP_4` (2.a1, 3.a2), con lo status della tabella comune; criterio di accettazione («una segnalazione chiusa non può essere chiusa di nuovo; una presa in carico da altri non può essere chiusa»).

## 6. Note

- **Codici non raggiungibili da queste route** e coperti dal test della tabella e dai test del servizio: `AUSILIARIO_NON_ATTIVO` (vedi TF-API-SEG-08), `LETTURA_INCOMPLETA`, `LETTURA_NON_VALIDA`, `TARGA_NON_VALIDA` e `STALLO_INESISTENTE` di Segnalazioni (riscontro ANPR, ingresso dei simulatori di OMP-47).
- **Già verificati altrove** (nessun frame qui): contenuto delle segnalazioni dell'ente e `variazioniDopo` a livello di Facade, `cp_segnalazioniEnte.md` (TF-ENT-01…22); sequenza della chiusura e concorrenza, `cp_chiusuraSegnalazione.md`.
- Una transazione che dura più di 5 s resta un limite residuo del cursore (`cp_persistenza_stalli_tariffe.md` §6).
