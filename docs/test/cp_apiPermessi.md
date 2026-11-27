# cp_apiPermessi

Specifica dei casi di test (category partition) del gruppo di API della verifica del permesso dell'Ausiliario del Traffico: `GET /api/ausiliario/permessi`, `GET /api/permessi/<sosta>/foto` e `POST /api/permessi/<sosta>/esito`.
Requisiti: RF_OP_2, RF_OP_5, NRF_LEG_2, NRF_SIC_1. Task OMP-63 (issue #40, parte B). Convenzioni delle API di OMP-48 (issue #27, `cp_apiSegnalazioni.md`).

- **Fonti dell'esito atteso:** `UC_OP_1` 3.a1, `UC_OP_5` (passi 2–4, 2.a1, 4.a1, 4.a2), `SD_OP_5` con la nota di OMP-63, `cp_verificaPermesso.md` (controlli e codici del servizio), tabella comune codice → status di `src/app/api/_errori.ts`, issue #40 («Foto del permesso: API che controlla ruolo ed ente, con `Cache-Control: no-store`; non disponibile quando la sosta è terminata»), piano approvato di OMP-63 parte B.
- **File di test:** `src/app/api/ausiliario/permessi.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_27` per le convenzioni delle API o `ISSUE_40` per le scelte di OMP-63.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `NRF_LEG_2 · TF-API-PER-04 · foto del permesso di una sosta attiva → 200 image/jpeg, no-store`.

## 2. Route verificate

| Metodo e percorso                  | Corpo o parametri | Sessione e operazione          | Facade (Segnalazioni)                             | Risposta positiva                                                                                   |
| :--------------------------------- | :---------------- | :----------------------------- | :------------------------------------------------ | :-------------------------------------------------------------------------------------------------- |
| `GET /api/ausiliario/permessi`     | —                 | `UC_OP_1`; ente della sessione | `permessiDaVerificare(ausiliario)`                | 200 `{ permessi: PermessoDaVerificare[] }` (§2 di `cp_verificaPermesso.md`), senza foto             |
| `GET /api/permessi/<sosta>/foto`   | —                 | `UC_OP_5`; ente della sessione | `fotoDelPermesso(ausiliario, sosta)`              | 200, corpo binario della foto, `Content-Type` `image/jpeg` o `image/png`, `Cache-Control: no-store` |
| `POST /api/permessi/<sosta>/esito` | `{ esito }`       | `UC_OP_5`; ente della sessione | `registraEsitoVerifica(ausiliario, sosta, esito)` | 200 `{ verifica, segnalazione }` (`segnalazione` `null` con esito conforme)                         |

- Le route controllano sessione, ruolo ed ente della sessione con `richiediSessione` (il proxy non tocca `/api`); ente della sosta, stato e permesso li controlla Segnalazioni.
- **Foto:** ogni risposta, anche d'errore, ha `Cache-Control: no-store`.
- **Parametri:** `<sosta>` non intero → 422 `RICHIESTA_NON_VALIDA`; corpo dell'esito non JSON → 422 `RICHIESTA_NON_VALIDA`; `esito` mancante o non previsto → 422 `ESITO_VERIFICA_NON_VALIDO` (dalla Facade).
- **Errori:** 401 `SESSIONE_NON_VALIDA`; 403 `RUOLO_NON_AMMESSO`, `ENTE_NON_AMMESSO`; 404 `SOSTA_INESISTENTE`; 409 `SOSTA_NON_ATTIVA`, `NESSUN_PERMESSO_DA_VERIFICARE`, `VERIFICA_GIA_REGISTRATA`; 422 `RICHIESTA_NON_VALIDA`, `ESITO_VERIFICA_NON_VALIDO`. Corpo `{ errore: { codice, messaggio } }`.

## 3. Ambiente

- Database di test, pool applicativo, composizione e sessioni come in `cp_apiSegnalazioni.md` §3: Paolo Ferri (2, ente 1), Anna Moretti (5, ente 2), Marco Rossi (Automobilista, ruolo non ammesso). Le scritture vanno in commit. Le route usano l'orologio di sistema e non chiamano l'allineamento: lo stato degli stalli non conta e non serve `rilevazioniAllIstante`.
- **Permesso:** dichiarazione e foto JPEG come in `cp_verificaPermesso.md` §3.
- **Soste di prova** (automobilista `creaAutomobilista(pool, { email: "api.per<n>@test.example", hashPassword: "hash-di-prova" })` e veicolo con la targa indicata, `trovaOCreaVeicolo`, `associaVeicolo`; `creaSosta` con avvio un'ora prima dell'istante corrente e scadenza due ore dopo), create nel `beforeAll` dopo `preparaDatabaseDiTest()`:
  - **A:** stallo 15 (`ROSA`, ente 1), targa `PE01AA`, `PAGATA`, con permesso JPEG.
  - **B:** stallo 14 (`DISABILI`, ente 1), targa `PE02AA`, `GRATUITA`, con permesso JPEG, poi `impostaSostaScaduta` (scaduta).
  - **C:** stallo 16 (`ORDINARIO_A_PAGAMENTO`, ente 1), targa `PE03AA`, `PAGATA`, senza permesso.
- **Ordine fisso:** TF-API-PER-01 (elenco con A) precede TF-API-PER-12 (esito registrato su A); TF-API-PER-18 (seconda verifica di A) segue TF-API-PER-12. Gli altri frame non cambiano i dati.

Id inesistente: `999999`.

## 4. Categorie e scelte

Test proporzionati dell'issue #40: un caso riuscito per route e un frame per ogni codice d'errore raggiungibile, compreso l'altro ente. La logica è verificata in `cp_verificaPermesso.md`.

**Richiedente:** Ausiliario dell'ente · senza sessione [error] · Automobilista [error] · Ausiliario di un altro ente [error].

**Sosta (foto ed esito):** A attiva con permesso · inesistente [error] · B scaduta [error] · C senza permesso [error] · A già verificata [error, solo esito].

**Richiesta:** id intero · id non intero [error]; corpo JSON con esito previsto · esito non previsto [error] · corpo non JSON [error].

## 5. Test frame (21)

| Frame         | Richiesta                                                                                 | Esito atteso                                                                                                                                                                                | Riferimento |
| :------------ | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-API-PER-01 | Paolo Ferri; `GET /api/ausiliario/permessi`                                               | 200 `{ permessi }` con la sosta A: `sostaId`, `stalloId` 15, `numeroStallo` 2, `tipoDiStallo` `ROSA`, targa `PE01AA`, la dichiarazione; nessun elemento per B e C; nessun campo con la foto | RF_OP_2     |
| TF-API-PER-02 | `GET /api/ausiliario/permessi` senza cookie                                               | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                                   | NRF_SIC_1   |
| TF-API-PER-03 | Marco Rossi; `GET /api/ausiliario/permessi`                                               | 403 `RUOLO_NON_AMMESSO`                                                                                                                                                                     | NRF_SIC_1   |
| TF-API-PER-04 | Paolo Ferri; `GET /api/permessi/A/foto`                                                   | 200; `Content-Type` `image/jpeg`; `Cache-Control` `no-store`; corpo uguale ai byte della foto di A                                                                                          | NRF_LEG_2   |
| TF-API-PER-05 | `GET /api/permessi/A/foto` senza cookie                                                   | 401 `SESSIONE_NON_VALIDA`, con `Cache-Control` `no-store`                                                                                                                                   | NRF_SIC_1   |
| TF-API-PER-06 | Marco Rossi; `GET /api/permessi/A/foto`                                                   | 403 `RUOLO_NON_AMMESSO`                                                                                                                                                                     | NRF_SIC_1   |
| TF-API-PER-07 | Anna Moretti; `GET /api/permessi/A/foto`                                                  | 403 `ENTE_NON_AMMESSO`                                                                                                                                                                      | NRF_SIC_1   |
| TF-API-PER-08 | Paolo Ferri; `GET /api/permessi/999999/foto`                                              | 404 `SOSTA_INESISTENTE`                                                                                                                                                                     | RF_OP_2     |
| TF-API-PER-09 | Paolo Ferri; `GET /api/permessi/B/foto`                                                   | 409 `SOSTA_NON_ATTIVA`                                                                                                                                                                      | NRF_LEG_2   |
| TF-API-PER-10 | Paolo Ferri; `GET /api/permessi/C/foto`                                                   | 409 `NESSUN_PERMESSO_DA_VERIFICARE`                                                                                                                                                         | RF_OP_2     |
| TF-API-PER-11 | Paolo Ferri; `GET /api/permessi/abc/foto`                                                 | 422 `RICHIESTA_NON_VALIDA`                                                                                                                                                                  | ISSUE_27    |
| TF-API-PER-12 | Paolo Ferri; `POST /api/permessi/A/esito` con `{ esito: "NON_CONFORME" }`                 | 200 `{ verifica, segnalazione }` con due id interi; `dettaglioSegnalazione(segnalazione)`: `CHIUSA`, `SOSTA_IRREGOLARE_ACCERTATA`, assegnata a 2, stallo 15, targa rilevata `null`          | RF_OP_5     |
| TF-API-PER-13 | `POST /api/permessi/A/esito` con `{ esito: "CONFORME" }` senza cookie                     | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                                   | NRF_SIC_1   |
| TF-API-PER-14 | Marco Rossi; `POST /api/permessi/A/esito` con `{ esito: "CONFORME" }`                     | 403 `RUOLO_NON_AMMESSO`                                                                                                                                                                     | NRF_SIC_1   |
| TF-API-PER-15 | Anna Moretti; `POST /api/permessi/A/esito` con `{ esito: "CONFORME" }`                    | 403 `ENTE_NON_AMMESSO`                                                                                                                                                                      | NRF_SIC_1   |
| TF-API-PER-16 | Paolo Ferri; `POST /api/permessi/999999/esito` con `{ esito: "CONFORME" }`                | 404 `SOSTA_INESISTENTE`                                                                                                                                                                     | RF_OP_5     |
| TF-API-PER-17 | Paolo Ferri; `POST /api/permessi/B/esito` con `{ esito: "CONFORME" }`                     | 409 `SOSTA_NON_ATTIVA`                                                                                                                                                                      | RF_OP_5     |
| TF-API-PER-18 | dopo TF-API-PER-12; Paolo Ferri; `POST /api/permessi/A/esito` con `{ esito: "CONFORME" }` | 409 `VERIFICA_GIA_REGISTRATA`                                                                                                                                                               | VD_12       |
| TF-API-PER-19 | Paolo Ferri; `POST /api/permessi/C/esito` con `{ esito: "CONFORME" }`                     | 409 `NESSUN_PERMESSO_DA_VERIFICARE`                                                                                                                                                         | RF_OP_5     |
| TF-API-PER-20 | Paolo Ferri; `POST /api/permessi/C/esito` con `{}`                                        | 422 `ESITO_VERIFICA_NON_VALIDO`                                                                                                                                                             | RF_OP_5     |
| TF-API-PER-21 | Paolo Ferri; `POST /api/permessi/A/esito` con corpo non JSON                              | 422 `RICHIESTA_NON_VALIDA`                                                                                                                                                                  | ISSUE_27    |

Totale 21: 3 sull'elenco, 8 sulla foto, 10 sull'esito.

Note sui riferimenti:

- TF-API-PER-04, 05, 09: NRF_LEG_2 e issue #40 (foto con `no-store`, mai a sosta non più attiva); TF-API-PER-05 verifica il `no-store` anche su un errore.
- TF-API-PER-07, 15: NRF_SIC_1 e criterio di accettazione dell'issue #40 («Nessun Ausiliario vede segnalazioni, soste o foto di un altro ente»).
- TF-API-PER-12, 18: `UC_OP_5` 4.a1 e 4.a2. TF-API-PER-20: l'esito si valida prima della sosta (`cp_verificaPermesso.md` §2, passo 2), quindi anche su C si ottiene `ESITO_VERIFICA_NON_VALIDO`.
