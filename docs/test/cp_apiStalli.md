# cp_apiStalli

Specifica dei casi di test (category partition) del gruppo di API Stalli: `GET /api/stalli?zona=`, `GET /api/stalli/modifiche?zona=&dopo=` e `GET /api/stalli/<id>`.
Requisiti: RF_STALLI_1 (mappa degli stalli e stato), NRF_PER_3 (aggiornamento entro 2 secondi, come base), RF_STALLI_2 (stato e tariffa dello stallo), NRF_SIC_1 (controllo degli accessi). Task OMP-48 (issue #27).

- **Fonti dell'esito atteso:** `UC_STALLI_1`, `SD_STALLI_1`, `UC_STALLI_2`, TCS dei servizi (`cp_mappa.md`, compresi TF-MAP-17…24, e `cp_statoPerLaSosta.md`), `cp_persistenza_stalli_tariffe.md` §6 (cursore), issue #27 (cursore letto dal database, margine di 5 s, risposte idempotenti), piano approvato di OMP-48 (formato di `zona`, risposte delle route).
- **File di test:** `src/app/api/stalli/stalli.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_27` per le scelte dell'issue #27 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `NRF_PER_3 · TF-API-STA-12 · variazione confermata con ritardo entro il margine → restituita`.

## 2. Route verificate

| Metodo e percorso                                          | Sessione e operazione         | Facade (Gestione stalli)     | Risposta positiva                                                                                                       |
| :--------------------------------------------------------- | :---------------------------- | :--------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| `GET /api/stalli?zona=<latMin>,<lonMin>,<latMax>,<lonMax>` | `UC_STALLI_1` (Automobilista) | `fotografiaZona(zona)`       | 200, `{ stalli, cursore }`                                                                                              |
| `GET /api/stalli/modifiche?zona=…&dopo=<ISO 8601>`         | `UC_STALLI_1`                 | `variazioniDopo(zona, dopo)` | 200, `{ stalli, cursore }`: stalli della zona con `ultimaModifica` > `dopo` − 5 s, per id                               |
| `GET /api/stalli/<id>`                                     | `UC_STALLI_2`                 | `statoETariffa(id)`          | 200, `{ stallo, tipoDiStallo, stato, tariffa: { costoOrario, orarioInizioVigenza, orarioFineVigenza, durataMassima } }` |

- **Stallo nelle risposte:** `{ id, numero, latitudine, longitudine, tipoDiStallo, stato, ultimaModifica, areaDiSosta: { id, nome }, tariffa: { id, costoOrario } }`; istanti in ISO 8601.
- **Cursore:** istante letto dal database prima delle righe, in ISO 8601. Il client lo usa come `dopo` della richiesta successiva; le righe già viste possono tornare e il client le applica per id.
- **Parametri:** `zona` sono quattro numeri separati da virgole, in quest'ordine; se manca o non ha quattro numeri → 422 `ZONA_NON_VALIDA`, così come una zona con valori incoerenti (controllo della Facade). `dopo` in ISO 8601 completo con fuso orario (stessa regola di `leggiDataOra` di OMP-47); se manca o non è valido → 422 `ISTANTE_NON_VALIDO`. Un `<id>` non intero → 422 `RICHIESTA_NON_VALIDA`.
- **Errori:** 401 `SESSIONE_NON_VALIDA`; 403 `RUOLO_NON_AMMESSO`; 404 `STALLO_INESISTENTE`; 422 `ZONA_NON_VALIDA`, `ISTANTE_NON_VALIDO`, `RICHIESTA_NON_VALIDA`.

## 3. Ambiente

- Database di test, pool applicativo e composizione come in `cp_apiAccesso.md` §3. Le variazioni vanno in commit: ogni frame che modifica stalli usa una zona propria.
- **Sessione:** accesso come `marco.rossi@omnipark.example` (Automobilista) e come `paolo.ferri@omnipark.example` (Ausiliario, ruolo non ammesso). Sessione scaduta inserita con la persistenza come in `cp_apiAccesso.md` §3.
- **Variazione di uno stallo:** `impostaStatoStallo(pool, id, "NON_DISPONIBILE")` della persistenza.
- **Variazione confermata con ritardo:** un client della seconda connessione `poolDiTest().connect()` esegue `BEGIN`, poi `impostaStatoStallo(client, id, "NON_DISPONIBILE")`; il `COMMIT` arriva dopo la lettura indicata nel frame. Il client si rilascia alla fine del frame.
- **Cursore + 6 s:** si calcola dal cursore restituito, senza attese.
- Nessuna attesa reale nei test.

### Zone usate (formato `latMin,lonMin,latMax,lonMax`)

| Nome                 | Valore                            | Stalli  |
| :------------------- | :-------------------------------- | :------ |
| Piazza Aubry         | `40.688,14.522,40.689,14.5223`    | 14…21   |
| Mare                 | `40.0,14.0,40.1,14.1`             | nessuno |
| Viviani              | `40.7077,14.5033,40.7079,14.5034` | 7, 8, 9 |
| Via Roma             | `40.6913,14.5161,40.6915,14.5162` | 10…13   |
| Giovanni Paolo II    | `40.7804,14.7706,40.7806,14.7707` | 22…25   |
| Penta                | `40.7673,14.7972,40.7675,14.7973` | 26, 27  |
| Latitudini invertite | `40.689,14.522,40.688,14.5223`    | —       |

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella   | id            | Contenuto                                              |
| :-------- | :------------ | :----------------------------------------------------- |
| `stallo`  | 14            | Piazza Aubry n. 1, `DISABILI`, `LIBERO`, tariffa 1     |
| `stallo`  | 9, 10, 22, 27 | stalli delle zone delle variazioni                     |
| `tariffa` | 1             | 150 centesimi l'ora, `08:00:00`–`20:00:00`, 180 minuti |
| `utente`  | 2, 8          | Paolo Ferri (Ausiliario), Marco Rossi (Automobilista)  |

Colonne usate dai test: `stallo` (`id`, `numero`, `latitudine`, `longitudine`, `tipo_di_stallo`, `stato`, `ultima_modifica`, `area_di_sosta_id`, `tariffa_id`), `area_di_sosta` (`id`, `nome`), `tariffa` (`id`, `costo_orario`, `orario_inizio_vigenza`, `orario_fine_vigenza`, `durata_massima`), `sessione`.

## 4. Categorie e scelte

**Sessione:** valida · assente [error] → 401 · scaduta [error] → 401.

**Ruolo:** Automobilista · Ausiliario [error] → 403.

**Ente dei dati:** non applicabile.

**`zona`:** con stalli · senza stalli · mancante [error] · malformata [error] · incoerente [error].

**`dopo` (modifiche)**

1. precedente a una variazione
2. cursore appena restituito, con una variazione negli ultimi 5 s (margine)
3. successivo all'ultima variazione di più di 5 s (cursore + 6 s) → nessuna riga
4. mancante [error]
5. non valido [error]

**Variazione confermata con ritardo entro il margine** [single] → restituita.

**`<id>`:** esistente · inesistente [error] → 404 · non intero [error] → 422.

## 5. Test frame (22)

| Frame         | Richiesta e preparazione                                                                                                                                                                 | Esito atteso                                                                                                                                                                        | Riferimento |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-API-STA-01 | Marco Rossi; `GET /api/stalli?zona=<Piazza Aubry>`                                                                                                                                       | 200; 8 stalli, id 14…21 in ordine; il 14 `DISABILI`, `LIBERO`, `areaDiSosta` `{ 5, "Piazza Aubry" }`, `tariffa` `{ 1, 150 }`; `cursore` istante ISO 8601 valido                     | RF_STALLI_1 |
| TF-API-STA-02 | Marco Rossi; `GET /api/stalli?zona=<Mare>`                                                                                                                                               | 200; `stalli: []` e `cursore` valido                                                                                                                                                | RF_STALLI_1 |
| TF-API-STA-03 | `GET /api/stalli?zona=<Piazza Aubry>` senza cookie                                                                                                                                       | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                           | NRF_SIC_1   |
| TF-API-STA-04 | sessione scaduta dell'utente 8; `GET /api/stalli?zona=<Piazza Aubry>`                                                                                                                    | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                           | NRF_SIC_1   |
| TF-API-STA-05 | Paolo Ferri; `GET /api/stalli?zona=<Piazza Aubry>`                                                                                                                                       | 403 `RUOLO_NON_AMMESSO`                                                                                                                                                             | NRF_SIC_1   |
| TF-API-STA-06 | Marco Rossi; `GET /api/stalli` senza `zona`                                                                                                                                              | 422 `ZONA_NON_VALIDA`                                                                                                                                                               | ISSUE_27    |
| TF-API-STA-07 | Marco Rossi; `GET /api/stalli?zona=40.688,14.522,abc`                                                                                                                                    | 422 `ZONA_NON_VALIDA`                                                                                                                                                               | ISSUE_27    |
| TF-API-STA-08 | Marco Rossi; `GET /api/stalli?zona=<Latitudini invertite>`                                                                                                                               | 422 `ZONA_NON_VALIDA`                                                                                                                                                               | ISSUE_27    |
| TF-API-STA-09 | Marco Rossi; `c0` = cursore di `GET /api/stalli?zona=<Viviani>`; variazione dello stallo 9; `GET /api/stalli/modifiche?zona=<Viviani>&dopo=c0`                                           | 200; tra gli stalli c'è il 9 con stato `NON_DISPONIBILE`; `cursore` non precedente a `c0`                                                                                           | NRF_PER_3   |
| TF-API-STA-10 | Marco Rossi; `c0` da `GET /api/stalli?zona=<Via Roma>`; variazione dello stallo 10; `r1` = modifiche dopo `c0`; `r2` = modifiche dopo `r1.cursore`                                       | `r1` e `r2`: 200, entrambe contengono lo stallo 10 `NON_DISPONIBILE` (margine di 5 s: la riga già vista torna)                                                                      | ISSUE_27    |
| TF-API-STA-11 | Marco Rossi; `c0` da `GET /api/stalli?zona=<Giovanni Paolo II>`; variazione dello stallo 22; `r1` = modifiche dopo `c0`; `r2` = modifiche dopo `r1.cursore` + 6 s                        | `r1` contiene lo stallo 22; `r2`: 200, `stalli: []`, `cursore` valido                                                                                                               | NRF_PER_3   |
| TF-API-STA-12 | Marco Rossi; `c0` da `GET /api/stalli?zona=<Penta>`; seconda connessione: `BEGIN` e variazione dello stallo 27; `r1` = modifiche dopo `c0`; `COMMIT`; `r2` = modifiche dopo `r1.cursore` | `r1` non contiene lo stallo 27; `r2` contiene lo stallo 27 `NON_DISPONIBILE`                                                                                                        | NRF_PER_3   |
| TF-API-STA-13 | Marco Rossi; `GET /api/stalli/modifiche?zona=<Piazza Aubry>` senza `dopo`                                                                                                                | 422 `ISTANTE_NON_VALIDO`                                                                                                                                                            | ISSUE_27    |
| TF-API-STA-14 | Marco Rossi; `GET /api/stalli/modifiche?zona=<Piazza Aubry>&dopo=ieri`                                                                                                                   | 422 `ISTANTE_NON_VALIDO`                                                                                                                                                            | ISSUE_27    |
| TF-API-STA-15 | Marco Rossi; `GET /api/stalli/modifiche?dopo=2026-11-20T09:00:00+01:00` senza `zona`                                                                                                     | 422 `ZONA_NON_VALIDA`                                                                                                                                                               | ISSUE_27    |
| TF-API-STA-16 | `GET /api/stalli/modifiche?zona=<Piazza Aubry>&dopo=2026-11-20T09:00:00+01:00` senza cookie                                                                                              | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                           | NRF_SIC_1   |
| TF-API-STA-17 | Paolo Ferri; `GET /api/stalli/modifiche?zona=<Piazza Aubry>&dopo=2026-11-20T09:00:00+01:00`                                                                                              | 403 `RUOLO_NON_AMMESSO`                                                                                                                                                             | NRF_SIC_1   |
| TF-API-STA-18 | Marco Rossi; `GET /api/stalli/14`                                                                                                                                                        | 200, `{ stallo: 14, tipoDiStallo: "DISABILI", stato: "LIBERO", tariffa: { costoOrario: 150, orarioInizioVigenza: "08:00:00", orarioFineVigenza: "20:00:00", durataMassima: 180 } }` | RF_STALLI_2 |
| TF-API-STA-19 | Marco Rossi; `GET /api/stalli/999999`                                                                                                                                                    | 404 `STALLO_INESISTENTE`                                                                                                                                                            | RF_STALLI_2 |
| TF-API-STA-20 | Marco Rossi; `GET /api/stalli/abc`                                                                                                                                                       | 422 `RICHIESTA_NON_VALIDA`                                                                                                                                                          | ISSUE_27    |
| TF-API-STA-21 | `GET /api/stalli/14` senza cookie                                                                                                                                                        | 401 `SESSIONE_NON_VALIDA`                                                                                                                                                           | NRF_SIC_1   |
| TF-API-STA-22 | Paolo Ferri; `GET /api/stalli/14`                                                                                                                                                        | 403 `RUOLO_NON_AMMESSO`                                                                                                                                                             | NRF_SIC_1   |

Totale 22: 8 sulla mappa, 9 sulle modifiche (compreso [single] della variazione ritardata), 5 sul dettaglio.

Note sui riferimenti:

- TF-API-STA-09, 11, 12: NRF_PER_3 e criterio di accettazione dell'issue («una variazione confermata dopo la lettura precedente compare nella risposta `modifiche` successiva, anche se la sua transazione era iniziata prima del cursore»). TF-API-STA-11: correzione 2 del piano (cursore successivo all'ultima variazione di più di 5 s → nessuna riga).
- TF-API-STA-10: issue #27 (le righe già viste possono tornare; risposte idempotenti).
- TF-API-STA-06…08, 13…15, 20: formato dei parametri (issue #27, «mancanti o non validi → 422»; correzione 3 del piano per l'`<id>` non intero).
- TF-API-STA-18, 19: `UC_STALLI_2` («stato e tariffa»).

## 6. Note

- **Già verificati altrove** (nessun frame qui): contenuto della mappa, zone non valide, `variazioniDopo` e `fotografiaZona` a livello di Facade, `cp_mappa.md` (TF-MAP-01…24); stato e tariffa, `cp_statoPerLaSosta.md` TF-SOS-01, 02; istante del database, `cp_persistenza_base.md` TF-BASE-48, 49.
- Una transazione che dura più di 5 s resta un limite residuo del cursore (`cp_persistenza_stalli_tariffe.md` §6).
- Il formato di `zona` (`latMin,lonMin,latMax,lonMax`) e la zona obbligatoria anche in `modifiche` sono scelte del piano (D6).
