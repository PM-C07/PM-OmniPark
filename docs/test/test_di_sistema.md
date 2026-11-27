# Piano dei test di sistema

Test di sistema di OmniPark: flussi principali da capo a capo, come li usano Automobilista e Ausiliario del Traffico, sull'anteprima pubblicata, con i simulatori che inviano rilevazioni e letture attraverso le API. Comprende i casi di test per le misure di NRF_PER_3 e NRF_USA_2.
Task OMP-60 (issue #32, COD-19); TS-09 automatizzato e TS-13 aggiunti con OMP-62 (issue #39, COD-21); TS-06 aggiornato e TS-16 aggiunto con OMP-63 (issue #40, COD-22). Gli esiti delle misure sono in `docs/test/report_requisiti_non_funzionali.md`. Aggiornato con OMP-61 (issue #33, COD-20): TS-14 e TS-15, TS-01 con le verifiche delle correzioni di DIF-02, DIF-03 e DIF-04, esecuzione in §7.

- **Fonti dell'esito atteso:** casi d'uso a priorità Alta in `docs/rad/uc/` (UC_AUTH_1, UC_AUTH_4, UC_WALLET_1, UC_SOSTA_1, UC_SOSTA_7, UC_IOT_1, UC_STALLI_1, UC_ANPR_1, UC_OP_1, UC_OP_4), requisiti in `docs/rad/requisiti.md`, vincoli di dominio in `docs/rad/vincoli_dominio.md`, statechart `SCD_1`, `SCD_2`, `SCD_3`, scenari `docs/rad/scenari_ut.md` e `docs/rad/scenari_op_adm.md`, navigation path `np_01_automobilista` e `np_02_ausiliario`, formato delle API nelle TCS `cp_api*.md`.
- **Strumento:** Playwright (`@playwright/test` 1.65.1), solo Chromium, profilo mobile Pixel 7, `locale` `it-IT`, fuso `Europe/Rome`. Configurazione in `playwright.config.ts`, test in `e2e/*.spec.ts`.
- **Fuori ambito:** accessibilità WCAG 2.2 e prove sui browser (NRF_USA_1, NRF_IMP_1: COD-27); requisiti a priorità Media e loro verifiche (COD-21…COD-27; prolungamento e sosta con permesso di COD-20 in TS-15 e TS-14); lo stato Sconosciuto dopo 60 s (RF_IOT_2, COD-23) si verifica con i test sul database a orologio fisso e a mano sull'anteprima, senza un caso di test automatico.

## 1. Tracciabilità e nomi

Ogni caso di test ha un identificativo `TS-NN`, i casi d'uso e i requisiti verificati. Il nome del test Playwright è `TS-NN · <requisito principale> · <descrizione> → <esito>`, per esempio `TS-06 · RF_ANPR_1 · lettura senza sosta → segnalazione nell'ente 1, chiusa con esito`. Le fasi di un caso di test che verificano altri requisiti sono `test.step` con il requisito nel nome, per esempio `RF_WALLET_1 · ricarica di 5 € dalla scheda dello stallo`.

| TS    | Casi d'uso                         | Requisiti                                                              | Tipo                                            | File                          |
| :---- | :--------------------------------- | :--------------------------------------------------------------------- | :---------------------------------------------- | :---------------------------- |
| TS-01 | UC_AUTH_1, UC_WALLET_1, UC_SOSTA_1 | RF_SOSTA_1, RF_AUTH_1, RF_AUTH_5, RF_WALLET_1, RF_WALLET_2, RF_SOSTA_6 | automatico                                      | `e2e/sosta.spec.ts`           |
| TS-02 | UC_SOSTA_7, UC_IOT_1 (3.a1, 3.a2)  | RF_SOSTA_7, RF_SOSTA_6                                                 | automatico, lento                               | `e2e/sosta.spec.ts`           |
| TS-03 | UC_IOT_1, UC_STALLI_1              | RF_IOT_1, RF_STALLI_1                                                  | automatico                                      | `e2e/mappa.spec.ts`           |
| TS-04 | UC_IOT_1 (3.a1)                    | RF_SOSTA_6                                                             | automatico                                      | `e2e/sosta.spec.ts`           |
| TS-05 | UC_STALLI_1 (4.a1)                 | RF_STALLI_1                                                            | automatico                                      | `e2e/mappa.spec.ts`           |
| TS-06 | UC_ANPR_1, UC_OP_1, UC_OP_2, UC_OP_4 | RF_ANPR_1, RF_OP_1, RF_OP_3, RF_OP_6 | automatico                                      | `e2e/segnalazioni.spec.ts`    |
| TS-07 | UC_ANPR_1 (2.a1, 4.a1)             | RF_ANPR_1, NRF_AFF_2 (riscontro)                                       | automatico                                      | `e2e/sosta.spec.ts`           |
| TS-08 | UC_AUTH_4                          | RF_AUTH_4, NRF_SIC_1                                                   | automatico                                      | `e2e/accesso.spec.ts`         |
| TS-09 | UC_AUTH_4                          | RF_AUTH_4                                                              | automatico, con la password dell'Amministratore | `e2e/amministrazione.spec.ts` |
| TS-10 | UC_OP_1, UC_OP_4                   | NRF_SIC_1                                                              | automatico                                      | `e2e/accesso.spec.ts`         |
| TS-11 | UC_IOT_1, UC_STALLI_1              | NRF_PER_3                                                              | automatico, misura                              | `e2e/misure.spec.ts`          |
| TS-12 | UC_SOSTA_1                         | NRF_USA_2                                                              | automatico, misura                              | `e2e/misure.spec.ts`          |
| TS-13 | UC_ADM_2, UC_AUTH_4 (2.a2)         | RF_ADM_2, RF_AUTH_4, VD_19                                             | automatico, con la password dell'Amministratore | `e2e/amministrazione.spec.ts` |
| TS-14 | UC_SOSTA_1 (4.a3), UC_SOSTA_5      | RF_SOSTA_5                                                             | automatico                                      | `e2e/permesso.spec.ts`        |
| TS-15 | UC_SOSTA_2                         | RF_SOSTA_2, RF_WALLET_2                                                | automatico                                      | `e2e/sosta.spec.ts`           |
| TS-16 | UC_OP_2, UC_OP_3, UC_OP_4 | RF_OP_3, RF_OP_4, RF_OP_6, NRF_SIC_1 | automatico | `e2e/segnalazioni.spec.ts` |

Corrispondenza con gli scenari dell'issue #32:

| Scenario dell'issue                                                                            | Casi di test               |
| :--------------------------------------------------------------------------------------------- | :------------------------- |
| Registrazione, ricarica, avvio e pagamento di una sosta, scadenza                              | TS-01, TS-02               |
| Rilevazione del sensore, variazione sulla mappa, stallo Non disponibile e ripristino alla fine | TS-03, TS-04, TS-02, TS-05 |
| Lettura ANPR, segnalazione nell'ente corretto, chiusura con esito                              | TS-06, TS-07               |
| Presa in carico, stato del pagamento e chiusura con due Ausiliari (OMP-63)                     | TS-16                      |
| Accesso per ruolo e rifiuto dell'accesso ai dati di un altro ente                              | TS-08, TS-09, TS-10        |
| Gestione degli account degli Ausiliari (OMP-62)                                                | TS-13                      |

## 2. Ambiente

### Dove si eseguono

- **Anteprima pubblicata** del branch su Vercel, con il database delle anteprime (Neon, branch `preview`): ambiente delle esecuzioni registrate in §7 e delle misure TS-11 e TS-12.
- **Locale** (`npm run dev` o `next start` su `http://localhost:3000`, database di sviluppo): solo per provare i test durante la scrittura.
- **Mai la produzione.** `playwright.config.ts` controlla l'indirizzo prima di ogni test con la guardia di `e2e/supporto/ambiente.ts` e rifiuta di partire con il dominio di produzione `omnipark-two.vercel.app`, con l'alias del branch `main`, con i link unici dei deploy (non distinguibili da quelli di produzione) e con qualsiasi host diverso da `localhost`, `127.0.0.1` e dagli alias di branch delle anteprime. La guardia ha i suoi test Vitest (`e2e/supporto/ambiente.test.ts`).

### Variabili d'ambiente

Si impostano nel terminale; i test non leggono il file `.env` e nessun valore è scritto nel repository.

| Variabile                              | Uso                                                                                                | Obbligatoria                                        |
| :------------------------------------- | :------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| `OMNIPARK_E2E_URL`                     | indirizzo dell'applicazione: alias di branch dell'anteprima o `http://localhost:3000`              | no (predefinito localhost)                          |
| `SIMULATORE_TOKEN`                     | token dei simulatori configurato nell'ambiente di destinazione                                     | sì (TS-02…07, TS-11, TS-12)                         |
| `OMNIPARK_E2E_PASSWORD_AUSILIARIO`     | password dimostrativa degli Ausiliari del README                                                   | sì (TS-06, TS-07, TS-08, TS-10)                     |
| `OMNIPARK_E2E_ANTICIPO_MS`             | millisecondi sottratti al `dataOra` di rilevazioni e letture, per un orologio del PC in anticipo   | no (predefinito 1000)                               |
| `OMNIPARK_E2E_PASSWORD_AMMINISTRATORE` | password dell'Amministratore, da impostare con `read -rs` (non resta nella cronologia della shell) | no: senza, TS-09 e TS-13 sono saltati con il motivo |

La password dell'Amministratore non compare in nessun file: la usano solo TS-09 e TS-13, che la leggono da `OMNIPARK_E2E_PASSWORD_AMMINISTRATORE` se è impostata e altrimenti sono saltati (registrati come «non eseguito»). La impostano solo i PM.

### Comandi

| Comando                  | Casi di test                                                                            | Durata indicativa |
| :----------------------- | :-------------------------------------------------------------------------------------- | :---------------- |
| `npm run test:e2e`       | TS-01, TS-03…08, TS-10, TS-14, TS-15, TS-16; TS-09 e TS-13 con la password dell'Amministratore | qualche minuto    |
| `npm run test:e2e:lenta` | TS-02                                                                                   | circa 17 minuti   |
| `npm run misura:e2e`     | TS-11, TS-12 (scrivono i file delle misure)                                             | circa 3 minuti    |

Esecuzione seriale (`workers: 1`), nessun nuovo tentativo automatico (`retries: 0`): un fallimento intermittente resta visibile. Report HTML in `e2e-report/`, tracce e schermate dei fallimenti in `e2e-risultati/` (entrambe ignorate da Git).

### Simulatori

Rilevazioni e letture passano sempre dai simulatori di COD-14, lanciati dai test come processi figli con uno scenario generato per l'esecuzione (in `e2e-risultati/`) e con `SIMULATORE_TOKEN` dall'ambiente:

- sensori: `node src/simulators/sensori.ts --url <indirizzo> --scenario <file> --anticipo-ms <n>`, oppure `--invalide` per le rilevazioni non valide;
- ANPR: `node src/simulators/anpr.ts --url <indirizzo> --scenario <file>`.

I test leggono gli esiti dal registro JSONL del simulatore in `.simulatori/`.

## 3. Dati e ripetibilità

Il database delle anteprime è condiviso: nessun reset, nessuna scrittura diretta, tutto passa dalle API. Ogni esecuzione crea dati propri e unici, così si può ripetere quante volte si vuole.

- **Identificativo dell'esecuzione** `<id>`: istante in base 36 seguito da 4 caratteri casuali.
- **Automobilisti:** sempre nuovi, registrati da `/registrazione` o da `POST /api/auth/registrazione`, con email `e2e.<id>.<n>@test.example`, password casuale generata nell'esecuzione e targa casuale nel formato `AB123CD` che inizia con `Z`.
- **Targhe delle letture ANPR senza registrazione:** `E2E<id>` in maiuscolo, con un suffisso per lettura.
- **Ausiliari del dataset:** Paolo Ferri (ente 1, Gragnano), Anna Moretti (ente 2, Fisciano), Luca Russo (ente 1, disattivato), con la password di `OMNIPARK_E2E_PASSWORD_AUSILIARIO`.
- **Pulizia:** le segnalazioni create dai test sono chiuse dai test stessi; quelle rimaste aperte per un fallimento sono chiuse in `afterAll` da Paolo Ferri con esito «non confermata». Le soste non si possono terminare dalle API: durano 15 minuti (60 in TS-12) e scadono da sole.

### Stalli usati

Tutti di Gragnano (ente 1) e nella vista iniziale della mappa, tranne quelli delle letture ANPR.

| Uso                                          | Stalli                                                         | Regola                                                                                                                                                                                                                                                                               |
| :------------------------------------------- | :------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variazioni dei sensori (TS-03, TS-05, TS-11) | 1, 3 (Via Tommaso Sorrentino), 16 (Piazza Aubry n. 3)          | nessun test vi avvia soste; ogni rilevazione porta lo stallo nello stato opposto a quello letto                                                                                                                                                                                      |
| Soste (TS-01, TS-02, TS-04, TS-12, TS-15)    | candidati 17…21 (Piazza Aubry n. 4…8)                          | all'inizio il test legge `GET /api/stalli` e prende il primo candidato non `Non disponibile`, poi invia «veicolo presente» per portarlo a `Occupato`. Se tutti hanno una sosta in corso, il test si ferma con il messaggio «nessuno stallo candidato senza sosta: riprova più tardi» |
| Soste con permesso (TS-14)                   | 15 (rosa, Piazza Aubry n. 2), 14 (disabili, Piazza Aubry n. 1) | dalla OMP-61; il test porta lo stallo a `Occupato` con «veicolo presente»; se ha una sosta in corso (Non disponibile) si ferma con «nessuno stallo candidato senza sosta in corso: riprova più tardi»                                                                                |
| Letture ANPR (TS-06, TS-07, TS-10, TS-16)           | 7, 8, 9 (Via Raffaele Viviani)                                 | lo stato dello stallo non conta per il riscontro                                                                                                                                                                                                                                     |

### Timeout di 60 secondi (RF_IOT_2)

Dalla COD-23 uno stallo senza rilevazioni da più di 60 secondi passa a `Sconosciuto` alla prima lettura successiva (allineamento temporale, senza timer: DIF-01 corretto, §8). I test sono scritti per restare validi: inviano una rilevazione fresca prima di usare uno stallo, i flussi rapidi durano molto meno di 60 secondi e TS-02 invia «veicolo presente» ogni 30 secondi per tutta la durata della sosta.

### Fascia a pagamento

L'importo si calcola sulla parte di durata nella fascia della tariffa (stalli 17…21: tariffa 1, 1,50 €/h dalle 08:00 alle 20:00). TS-01 e TS-12 richiedono un importo maggiore di zero: fuori dalla fascia (prima delle 08:00 o dopo le 19:45, ora italiana) vengono saltati con il motivo, e l'esito registrato è «non eseguito».

### Interferenze

Altri membri del team possono usare l'anteprima negli stessi momenti (per esempio `sim:sensori --casuale`, che tocca tutti i 30 stalli). Un cambio di stato non inviato dal test viene riconosciuto e riportato come «variazione estranea», distinto dai difetti; in quel caso il caso di test si ripete.

### Sfondo della mappa

Le tile di OpenStreetMap sono bloccate in tutti i casi di test tranne TS-12, per non caricare i server di OpenStreetMap e per non far dipendere i tempi dallo sfondo. Con lo sfondo bloccato la pagina mostra l'avviso «Lo sfondo della mappa non è disponibile», previsto.

## 4. Casi di test dell'Automobilista e dei sensori

### TS-01 · Registrazione, ricarica, avvio e pagamento della sosta

- **Casi d'uso e requisiti:** UC_AUTH_1, UC_WALLET_1, UC_SOSTA_1 (5.a1 con estensione `Credito insufficiente`); RF_AUTH_1, RF_AUTH_5, RF_WALLET_1, RF_SOSTA_1, RF_WALLET_2, RF_SOSTA_6.
- **Tipo:** automatico. Tutti i passi sono azioni sull'interfaccia ed esiti visibili o leggibili dalle API.
- **Precondizioni:** nessuna sessione; uno stallo candidato portato a `Occupato` (§3); orario nella fascia a pagamento.
- **Passi ed esito atteso:**

| #   | Passo                                                                                  | Esito atteso                                                                                                                                                                                                         |
| :-- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Apre `/registrazione`, inserisce email, password e targa dell'esecuzione, «Registrati» | Si apre `/mappa` (UC_AUTH_1 passo 3); il menu mostra il ruolo Automobilista                                                                                                                                          |
| 2   | Apre `/profilo`                                                                        | La targa compare tra le targhe del profilo; saldo `0,00 €` (UC_AUTH_1 exit condition)                                                                                                                                |
| 3   | Torna su `/mappa` e tocca il centro del marker dello stallo candidato                  | Il centro del marker non è coperto da un marker vicino (DIF-02); si apre la scheda «Stallo n. X» con stato Occupato e tariffa                                                                                        |
| 4   | «Avvia sosta», sceglie la durata 15 min                                                | Targa proposta; importo e scadenza calcolati dal server (UC_SOSTA_1 passo 3); avviso «Credito insufficiente»; «Conferma e paga» disabilitato (5.a1)                                                                  |
| 5   | Nella ricarica della scheda sceglie 5 € e «Conferma la ricarica»                       | «Ricarica di 5,00 € approvata. Nuovo saldo: 5,00 €.» resta visibile nella scheda (DIF-03); targa e durata restano quelle scelte; «Conferma e paga» abilitato (UC_WALLET_1 passo 4, ritorno al passo 4 di UC_SOSTA_1) |
| 6   | «Conferma e paga (importo)»                                                            | «La mia sosta» mostra la targa, lo stato Attiva, lo stallo come «Stallo n. X, Piazza Aubry» (DIF-04) e «Sosta avviata: scade alle HH:MM» (passo 6)                                                                   |
| 7   | Attende l'aggiornamento della mappa, senza ricaricare                                  | Lo stallo è Non disponibile sul marker e nell'elenco (RF_SOSTA_6)                                                                                                                                                    |
| 8   | Ricarica la pagina                                                                     | «La mia sosta» indica ancora lo stallo come «Stallo n. X, Piazza Aubry» (DIF-04)                                                                                                                                     |
| 9   | Apre `/profilo`                                                                        | Saldo uguale a 5,00 € meno l'importo mostrato al passo 6 (addebito, RF_WALLET_2)                                                                                                                                     |

La sosta di TS-01 resta Attiva per 15 minuti e serve a TS-04 e TS-07, che sono nello stesso file e si eseguono subito dopo: se TS-01 non avvia la sosta, TS-04 e TS-07 risultano «non eseguito» con il motivo, non «falliti».

### TS-02 · Scadenza della sosta e ripristino dello stallo

- **Casi d'uso e requisiti:** UC_SOSTA_7 (passi 1–3), UC_IOT_1 (3.a1, 3.a2); RF_SOSTA_7, RF_SOSTA_6.
- **Tipo:** automatico e lento (circa 17 minuti, tag `@lenta`, comando `npm run test:e2e:lenta`). La durata minima della sosta è 15 minuti e la scadenza non si può anticipare dall'esterno.
- **Precondizioni:** Automobilista nuovo con una ricarica di 5 € fatta dalle API; stallo candidato portato a `Occupato`.
- **Passi ed esito atteso:**

| #   | Passo                                                                                  | Esito atteso                                                                                                                                                                                                         |
| :-- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Da `/mappa` avvia una sosta di 15 minuti sullo stallo                                  | Sosta Attiva in «La mia sosta», stallo Non disponibile                                                                                                                                                               |
| 2   | Lascia la pagina aperta; il test invia «veicolo presente» sullo stallo ogni 30 secondi | Lo stallo resta Non disponibile per tutta la durata (UC_IOT_1 3.a1); il tempo rimanente scende                                                                                                                       |
| 3   | Attende l'orario di scadenza, senza ricaricare la pagina                               | «La mia sosta» mostra Scaduta entro pochi secondi dalla scadenza (UC_SOSTA_7 passo 2)                                                                                                                                |
| 4   | Attende l'aggiornamento della mappa                                                    | Lo stallo torna Occupato, lo stato dell'ultima rilevazione (passo 3)                                                                                                                                                 |
| 5   | Il test invia «nessun veicolo» sullo stallo                                            | Lo stallo diventa Libero; la sosta passa a Terminata ed esce da `GET /api/soste` (UC_IOT_1 3.a2). «La mia sosta» rilegge le soste solo all'apertura: la sosta non compare più dopo un nuovo caricamento della pagina |

### TS-03 · Rilevazione del sensore e variazione sulla mappa

- **Casi d'uso e requisiti:** UC_IOT_1 (passi 1–4, 2.a1), UC_STALLI_1 (passi 2–4); RF_IOT_1, RF_STALLI_1.
- **Tipo:** automatico.
- **Precondizioni:** Automobilista nuovo con la sessione aperta su `/mappa`; stalli 1, 3 e 16 senza sosta in corso.
- **Passi ed esito atteso:**

| #   | Passo                                                                                                                                  | Esito atteso                                                                                                                                                               |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Apre `/mappa`                                                                                                                          | Marker ed elenco mostrano gli stalli della zona con tipo e stato in testo (UC_STALLI_1 passo 3)                                                                            |
| 2   | Il simulatore invia per lo stallo 16 la rilevazione opposta allo stato mostrato                                                        | Risposta 200 con il nuovo stato; marker e riga dell'elenco cambiano senza ricaricare la pagina (UC_IOT_1 passo 4, UC_STALLI_1 passo 4)                                     |
| 3   | Il simulatore invia di nuovo la rilevazione opposta                                                                                    | Lo stallo torna allo stato iniziale, sempre senza ricaricare                                                                                                               |
| 4   | Il simulatore invia le rilevazioni non valide (`--invalide`: token assente o errato, dati incompleti, data futura, stallo inesistente) | Ogni invio ha l'esito previsto (401 `TOKEN_NON_VALIDO`, 422 `RILEVAZIONE_INCOMPLETA`, `RILEVAZIONE_NON_VALIDA`, `STALLO_INESISTENTE`); lo stallo 1 non cambia stato (2.a1) |

### TS-04 · Stallo Non disponibile durante la sosta

- **Casi d'uso e requisiti:** UC_IOT_1 (3.a1); RF_SOSTA_6.
- **Tipo:** automatico. Usa la sosta Attiva di TS-01 e si esegue subito dopo, nello stesso file: se TS-01 non avvia la sosta, TS-04 risulta «non eseguito» con il motivo.
- **Precondizioni:** sosta Attiva di TS-01 sullo stallo candidato.
- **Passi ed esito atteso:**

| #   | Passo                                                         | Esito atteso                                                                          |
| :-- | :------------------------------------------------------------ | :------------------------------------------------------------------------------------ |
| 1   | Il simulatore invia «nessun veicolo» sullo stallo della sosta | Risposta 200 con stato `NON_DISPONIBILE`; sulla mappa lo stallo resta Non disponibile |
| 2   | Il simulatore invia «veicolo presente»                        | Lo stallo resta Non disponibile; «La mia sosta» mostra ancora la sosta Attiva         |

### TS-05 · Connessione al servizio di aggiornamento interrotta

- **Casi d'uso e requisiti:** UC_STALLI_1 (4.a1); RF_STALLI_1.
- **Tipo:** automatico. L'interruzione si simula nel browser bloccando le richieste a `/api/stalli/modifiche`, senza toccare l'anteprima.
- **Precondizioni:** Automobilista nuovo su `/mappa`, fotografia della zona caricata.
- **Passi ed esito atteso:**

| #   | Passo                                                                                | Esito atteso                                                                                     |
| :-- | :----------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| 1   | Il test blocca le richieste delle variazioni                                         | Compare l'avviso «Gli stati mostrati potrebbero non essere aggiornati: nuovo tentativo in corso» |
| 2   | Il simulatore invia una variazione per lo stallo 3, poi il test sblocca le richieste | L'avviso sparisce e la variazione compare sulla mappa senza ricaricare (si riprende dal passo 4) |

### TS-15 · Prolungamento della sosta

- **Casi d'uso e requisiti:** UC_SOSTA_2 (passi 1–6, 4.a1); RF_SOSTA_2, RF_WALLET_2. Task OMP-61 (COD-20).
- **Tipo:** automatico. Orario nella fascia a pagamento (§3).
- **Precondizioni:** Automobilista nuovo con una ricarica di 5 € fatta dalle API; stallo candidato portato a `Occupato`; sosta di 15 minuti avviata dalle API (`POST /api/soste`).
- **Passi ed esito atteso:**

| #   | Passo                         | Esito atteso                                                                                                                                                                                                                        |
| :-- | :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Apre `/mappa`                 | «La mia sosta» mostra la sosta Attiva con «Prolunga»                                                                                                                                                                                |
| 2   | «Prolunga», poi «Annulla»     | Il pannello si chiude; la scadenza in `GET /api/soste` non cambia (4.a1)                                                                                                                                                            |
| 3   | «Prolunga», sceglie 15 minuti | Importo aggiuntivo e nuova scadenza (scadenza + 15 min) calcolati dal server; «Conferma e paga (importo)» abilitato (passo 3)                                                                                                       |
| 4   | «Conferma e paga (importo)»   | «Sosta prolungata: scade alle HH:MM» e la nuova scadenza nella riga; in `GET /api/soste` la sosta è Attiva con la scadenza posticipata di 15 minuti; saldo = 5 € − importo dell'avvio − importo aggiuntivo (passi 5–6, RF_WALLET_2) |

### TS-14 · Sosta con dichiarazione e foto del permesso

- **Casi d'uso e requisiti:** UC_SOSTA_1 (4.a3 del RAD 0.6, nel repository 2.a4), UC_SOSTA_5 (passi 1–3, 2.a1); RF_SOSTA_5, RD_06, RD_07. Task OMP-61 (COD-20).
- **Tipo:** automatico. La foto si carica con `setInputFiles`; la verifica da telefono (fotocamera e galleria) è manuale.
- **Precondizioni:** stalli 15 (rosa) e 14 (disabili) senza sosta in corso, portati a `Occupato` (§3); due Automobilisti nuovi: il primo con una ricarica di 5 €, il secondo con saldo 0.
- **Passi ed esito atteso:**

| #   | Passo                                                                                      | Esito atteso                                                                                                                                   |
| :-- | :----------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Primo Automobilista: seleziona lo stallo 15 nell'elenco, «Avvia sosta», durata 15 min      | Compare «Dichiarazione e foto del permesso»; «Conferma» disabilitato; «Scatta una foto» ha `capture="environment"`, «Scegli dalla galleria» no |
| 2   | Sceglie dalla galleria un file GIF non leggibile come immagine                             | «La foto deve essere un'immagine JPEG o PNG.»; «Conferma» resta disabilitato (UC_SOSTA_5 2.a1)                                                 |
| 3   | Spunta la dichiarazione del permesso rosa e sceglie una foto PNG                           | «Foto del permesso pronta.»; «Conferma» abilitato                                                                                              |
| 4   | Conferma                                                                                   | «La mia sosta» mostra la sosta Attiva; in `GET /api/soste` è sullo stallo 15 con pagamento `PAGATA` (RD_07)                                    |
| 5   | Secondo Automobilista: stallo 14, durata 15 min, dichiarazione e foto da «Scatta una foto» | Il pulsante è «Conferma (senza addebito)»                                                                                                      |
| 6   | Conferma                                                                                   | Sosta Attiva sullo stallo 14 con pagamento `GRATUITA`; saldo 0,00 € (RD_06)                                                                    |

## 5. Casi di test dell'Ausiliario del Traffico e degli accessi

### TS-06 · Lettura ANPR, segnalazione nell'ente corretto, presa in carico e chiusura con esito

- **Casi d'uso e requisiti:** UC_ANPR_1 (passi 1–6), UC_OP_1 (passi 1–4), UC_OP_2 (passi 1–3), UC_OP_4 (passi 1–4); RF_ANPR_1, RF_OP_1, RF_OP_3, RF_OP_6.
- **Tipo:** automatico. Aggiornato con OMP-63 (RAD 0.6): la chiusura segue la presa in carico.
- **Precondizioni:** targa `E2E<id>A` senza soste e senza segnalazioni.
- **Passi ed esito atteso:**

| #   | Passo | Esito atteso |
| :-- | :-- | :-- |
| 1   | Il simulatore ANPR invia la lettura della targa sullo stallo 7 (Via Raffaele Viviani n. 3) | Risposta 200 `SEGNALAZIONE_CREATA` con motivo `SOSTA_ASSENTE` e l'id della segnalazione (passi 2–5) |
| 2   | Paolo Ferri (ente 1) accede | Si apre `/ausiliario`; nell'elenco c'è la riga della segnalazione con stallo, motivo «sosta assente» e ora della lettura (UC_OP_1 passo 2, UC_ANPR_1 passo 6) |
| 3   | Seleziona la segnalazione | Il dettaglio mostra targa, stallo, tipo di stallo («a pagamento»), motivo, data e ora della lettura e stato Aperta (UC_OP_1 passo 4); non ci sono i comandi della chiusura |
| 4   | «Prendi in carico» (OMP-63) | Il dettaglio e la riga mostrano «Presa in carico»; compaiono «Verifica il pagamento» e i due esiti (UC_OP_2 passo 3) |
| 5   | «Sosta irregolare accertata», poi «Annulla» | La conferma si chiude e la segnalazione resta Presa in carico (UC_OP_4 3.a1) |
| 6   | «Sosta irregolare accertata», poi «Conferma» | Si torna alla mappa con il messaggio di chiusura; la segnalazione non è più nell'elenco (UC_OP_4 passo 4) |
| 7   | Il test ricarica la pagina | La segnalazione non ricompare (stato Chiusa, esclusa dalla mappa) |

### TS-16 · Presa in carico vista da un altro Ausiliario, stato del pagamento e chiusura

- **Casi d'uso e requisiti:** UC_OP_2 (passi 1–3), UC_OP_3 (passi 1–3), UC_OP_4 (passi 1–4); RF_OP_3, RF_OP_4, RF_OP_6, NRF_SIC_1. Aggiunto con OMP-63 (issue #40).
- **Tipo:** automatico (`e2e/segnalazioni.spec.ts`), con due browser: Paolo Ferri e Sara Galli, entrambi dell'ente 1 (Gragnano).
- **Precondizioni:** targa `E2E<id>D` senza soste e senza segnalazioni.
- **Passi ed esito atteso:**

| #   | Passo | Esito atteso |
| :-- | :-- | :-- |
| 1   | Il simulatore ANPR invia la lettura della targa sullo stallo 8 (Via Raffaele Viviani n. 4) | 200 `SEGNALAZIONE_CREATA` |
| 2   | Paolo Ferri e Sara Galli accedono, ciascuno nel suo browser | Entrambi vedono la segnalazione Aperta (UC_OP_1) |
| 3   | Paolo Ferri la seleziona e sceglie «Prendi in carico» | Da lui la segnalazione è Presa in carico, con «Verifica il pagamento» e gli esiti (UC_OP_2 passo 3) |
| 4   | Sara Galli, senza ricaricare la pagina, guarda la riga e apre il dettaglio | La riga mostra «Presa in carico» (polling); il dettaglio mostra «Presa in carico da un altro Ausiliario.» senza «Prendi in carico» né esiti (UC_OP_2 Regole di dominio) |
| 5   | Paolo Ferri sceglie «Verifica il pagamento» | «Per la targa non risulta alcuna sosta su questo stallo.» (UC_OP_3 passo 3) |
| 6   | Paolo Ferri chiude con «Non confermata», poi «Conferma» | La segnalazione esce dalla mappa di Paolo Ferri e, con il polling, da quella di Sara Galli (UC_OP_4 passo 4) |

Gli stati della sosta (Attiva, Scaduta, Terminata, pagata o gratuita) sono coperti dai test sul database (`cp_statoDelPagamento.md`): sull'anteprima condivisa non si prepara una sosta già scaduta o terminata senza attese.

### TS-07 · Lettura ANPR con sosta attiva e lettura duplicata

- **Casi d'uso e requisiti:** UC_ANPR_1 (2.a1, 4.a1); RF_ANPR_1. Riscontro sull'anteprima di NRF_AFF_2: non entra nella percentuale della misura, che si fa con `npm run misura:anpr` (report).
- **Tipo:** automatico. È in `e2e/sosta.spec.ts`, subito dopo TS-04, perché usa la sosta di TS-01: se TS-01 non avvia la sosta, TS-07 risulta «non eseguito» con il motivo.
- **Precondizioni:** sosta Attiva di TS-01 (targa e stallo noti); targa `E2E<id>B` senza segnalazioni.
- **Passi ed esito atteso:**

| #   | Passo                                                            | Esito atteso                                                                              |
| :-- | :--------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| 1   | Lettura della targa di TS-01 sullo stallo della sua sosta        | 200 `NESSUNA_SEGNALAZIONE` (2.a1); nessuna nuova riga sulla mappa di Paolo Ferri          |
| 2   | Lettura di `E2E<id>B` sullo stallo 8                             | 200 `SEGNALAZIONE_CREATA`, motivo `SOSTA_ASSENTE`                                         |
| 3   | Seconda lettura di `E2E<id>B` sullo stallo 9                     | 200 `LETTURA_SCARTATA`; resta una sola segnalazione non chiusa per la targa (4.a1, VD_16) |
| 4   | Pulizia: Paolo Ferri chiude la segnalazione con «non confermata» | 200; la segnalazione esce dalla mappa                                                     |

### TS-08 · Accesso per ruolo e uscita

- **Casi d'uso e requisiti:** UC_AUTH_4 (passi 1–3, 2.a1, 2.a2, 3.a1); RF_AUTH_4, NRF_SIC_1.
- **Tipo:** automatico.
- **Precondizioni:** Automobilista nuovo registrato dalle API; Ausiliari del dataset.
- **Passi ed esito atteso:**

| #   | Passo                                                       | Esito atteso                                                                        |
| :-- | :---------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| 1   | Senza sessione apre `/mappa`                                | Si apre `/accesso?da=%2Fmappa`                                                      |
| 2   | Accede con l'email dell'Automobilista e una password errata | Accesso negato con un messaggio che non indica quale dato è sbagliato (2.a1)        |
| 3   | Accede come Automobilista con la password giusta            | Si apre `/mappa`, la schermata iniziale del ruolo (passo 3)                         |
| 4   | Apre `/ausiliario`                                          | Si apre `/accesso-negato` (NRF_SIC_1)                                               |
| 5   | «Esci», poi apre `/mappa`                                   | Dopo l'uscita si apre `/accesso`; `/mappa` riporta su `/accesso?da=%2Fmappa` (3.a1) |
| 6   | Accede come Paolo Ferri                                     | Si apre `/ausiliario`; il menu indica Ausiliario del Traffico e l'ente              |
| 7   | Apre `/mappa`                                               | Si apre `/accesso-negato`                                                           |
| 8   | Esce e accede come Luca Russo (disattivato)                 | Accesso negato con il messaggio dell'account disattivato (2.a2); nessuna sessione   |

### TS-09 · Accesso dell'Amministratore

- **Casi d'uso e requisiti:** UC_AUTH_4 (passo 3, 3.a1), UC_ADM_1 (passi 1–4); RF_AUTH_4, RF_ADM_1, NRF_SIC_1.
- **Tipo:** automatico (OMP-62), con la password dell'Amministratore da `OMNIPARK_E2E_PASSWORD_AMMINISTRATORE`; senza la variabile il test è saltato con il motivo. In COD-19 era manuale e rinviato a COD-21.
- **Precondizioni:** nessuna sessione; la variabile impostata da un PM.
- **Passi ed esito atteso:**

| #   | Passo                                                          | Esito atteso                                                                            |
| :-- | :------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| 1   | Apre `/accesso` e accede con `marco.esposito@omnipark.example` | Si apre `/admin` con il titolo «Panoramica degli enti»; il menu indica «Amministratore» |
| 2   | Guarda la riga del Comune di Gragnano                          | Stalli gestiti, soste attive e segnalazioni aperte sono numeri (UC_ADM_1 passo 4)       |
| 3   | Apre `/mappa`, poi `/ausiliario`                               | Entrambe portano su `/accesso-negato`                                                   |
| 4   | Torna su `/admin` e sceglie «Esci»                             | Si apre `/accesso`; aprendo `/admin` si torna su `/accesso?da=%2Fadmin`                 |

### TS-13 · Gestione dell'account di un Ausiliario

- **Casi d'uso e requisiti:** UC_ADM_2 (passi 3–7, 3.a1), UC_AUTH_4 (2.a2); RF_ADM_2, RF_AUTH_4, VD_19.
- **Tipo:** automatico (OMP-62), con la password dell'Amministratore come TS-09; senza la variabile il test è saltato con il motivo.
- **Precondizioni:** nessuna sessione. L'Ausiliario creato ha email `e2e.<id>.ts13@test.example`, password casuale dell'esecuzione ed ente Comune di Baronissi; resta nel database delle anteprime come account disattivato.
- **Passi ed esito atteso:**

| #   | Passo                                                                                                                          | Esito atteso                                                                                                                                                                                                                                           |
| :-- | :----------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | L'Amministratore apre `/admin/ausiliari`, «Nuovo Ausiliario», compila nome, cognome, email, password iniziale ed ente, «Salva» | «Account di … creato»; l'Ausiliario compare nell'elenco del suo ente con lo stato Attivo (passi 4–7)                                                                                                                                                   |
| 2   | In un altro browser il nuovo Ausiliario accede                                                                                 | Si apre `/ausiliario`                                                                                                                                                                                                                                  |
| 3   | L'Amministratore sceglie «Modifica», cambia il cognome, «Salva»                                                                | «Account di … aggiornato»; l'elenco mostra il nuovo cognome                                                                                                                                                                                            |
| 4   | «Disattiva», poi «Annulla»                                                                                                     | La richiesta di conferma si chiude e l'account resta Attivo                                                                                                                                                                                            |
| 5   | «Disattiva», poi «Conferma la disattivazione»                                                                                  | «Account di … disattivato»; stato Disattivato, nessun comando «Disattiva» (3.a1)                                                                                                                                                                       |
| 6   | Con la sessione dell'Ausiliario si chiede `GET /api/auth/io`; poi, da un browser nuovo, l'Ausiliario prova ad accedere         | `GET /api/auth/io` → 401 (sessione chiusa, VD_19); accesso → 403 `ACCOUNT_DISATTIVATO` con il messaggio «L'account è stato disattivato.» (UC_AUTH_4 2.a2). Il ritorno automatico all'accesso dopo il 401 è coperto dai test dell'interfaccia di OMP-57 |

Il rifiuto della disattivazione con segnalazioni prese in carico (3.a2) dipende dai dati dell'anteprima condivisa e si verifica a mano e con i test sul database (`cp_gestioneAusiliari.md` TF-GAU-27, `cp_apiAmministrazione.md` TF-API-ADM-29).

### TS-10 · Segregazione per ente e per ruolo

- **Casi d'uso e requisiti:** UC_OP_1 (Regole di dominio), UC_OP_4; NRF_SIC_1, VD_18.
- **Tipo:** automatico. Le chiamate alle API si fanno con la sessione del browser (`page.request`), come le farebbe la pagina.
- **Precondizioni:** segnalazione Aperta dell'ente 1 creata con una lettura ANPR di `E2E<id>C` sullo stallo 9.
- **Passi ed esito atteso:**

| #   | Passo                                                                                | Esito atteso                                         |
| :-- | :----------------------------------------------------------------------------------- | :--------------------------------------------------- |
| 1   | Anna Moretti (ente 2) accede e apre `/ausiliario`                                    | La segnalazione dell'ente 1 non compare nell'elenco  |
| 2   | Con la sessione di Anna Moretti: `GET /api/ausiliario/segnalazioni?ente=1`           | 403 `ENTE_NON_AMMESSO`                               |
| 3   | Con la sessione di Anna Moretti: `POST /api/segnalazioni/<id>/chiusura` con un esito | 403 `ENTE_NON_AMMESSO`; la segnalazione resta Aperta |
| 4   | Con la sessione di un Automobilista: `GET /api/ausiliario/segnalazioni`              | 403 `RUOLO_NON_AMMESSO`                              |
| 5   | Con la sessione di Paolo Ferri: `GET /api/wallet`                                    | 403 `RUOLO_NON_AMMESSO`                              |
| 6   | Pulizia: Paolo Ferri chiude la segnalazione con «non confermata»                     | 200                                                  |

## 6. Casi di test delle misure

Procedura, valori ed esiti sono riportati nel report `docs/test/report_requisiti_non_funzionali.md`; qui ci sono i casi di test che li producono.

### TS-11 · NRF_PER_3: ritardo tra rilevazione e mappa

- **Casi d'uso e requisiti:** UC_IOT_1 (passo 4), UC_STALLI_1 (passo 4); NRF_PER_3.
- **Tipo:** automatico (tag `@misura`, comando `npm run misura:e2e`).
- **Precondizioni:** Automobilista nuovo su `/mappa`; stalli 1, 3 e 16 senza sosta in corso.
- **Procedura:**
  1. La pagina registra con un `MutationObserver` ogni cambio dell'etichetta dei marker (stallo, area e stato) con l'istante `Date.now()`.
  2. Il test genera uno scenario per il simulatore dei sensori: 3 variazioni di riscaldamento non contate, poi 33 variazioni (11 per stallo, a turno, 3 secondi tra un invio e l'altro), ciascuna verso lo stato opposto a quello attuale.
  3. Il simulatore invia lo scenario e registra l'orario di invio (`inviatoIl`) di ogni rilevazione.
  4. Per ogni invio con risposta 200 il ritardo è l'istante della prima comparsa dello stato restituito su quel marker, dopo l'invio e prima dell'invio successivo sullo stesso stallo, meno `inviatoIl`. Simulatore e browser girano sullo stesso PC e leggono lo stesso orologio.
  5. Una variazione che non compare entro 10 secondi è «non comparsa». Un cambio non inviato dal test è una «variazione estranea» e non entra nella misura.
- **Esito atteso:** ogni variazione compare entro 2000 ms (NRF_PER_3: «ogni variazione valida»). Si riportano massimo, mediana e 95° percentile (per rango più vicino).
- **Dati prodotti:** `docs/test/misure/nrf_per_3.csv` (valori grezzi) e la sezione `misura:per3` di `docs/misure.md`.

### TS-12 · NRF_USA_2: sosta avviata e pagata in tre interazioni

- **Casi d'uso e requisiti:** UC_SOSTA_1 (Special requirements); NRF_USA_2.
- **Tipo:** automatico (tag `@misura`). Le schermate salvate si possono rivedere per confermare il conteggio.
- **Precondizioni:** Automobilista nuovo autenticato, con 10 € ricaricati dalle API (fuori dal conteggio); stallo candidato `Occupato` nella vista iniziale; orario nella fascia a pagamento; sfondo della mappa attivo.
- **Procedura:** il conteggio parte da `/mappa`, la schermata principale dopo l'accesso. Ogni azione dell'utente passa da una sola funzione, che la conta e salva la schermata prima di eseguirla.

| Interazione | Azione                                                   | Schermata              |
| :---------- | :------------------------------------------------------- | :--------------------- |
| —           | (schermata principale)                                   | `01-mappa.jpg`         |
| 1           | Tocco sulla riga dello stallo nell'elenco                | `02-scheda-stallo.jpg` |
| 2           | «Avvia sosta» (targa e durata di 60 minuti già proposte) | `03-conferma.jpg`      |
| 3           | «Conferma e paga (1,50 €)»                               | `04-sosta-pagata.jpg`  |

- **Selezione dalla riga dell'elenco.** Alla vista iniziale gli stalli 17…21 distano circa 5,5 m (circa 6 px a zoom 17) e i marker sono larghi 36 px: si coprono a vicenda e il tocco al centro di un marker può selezionare quello vicino. Il test seleziona lo stallo dalla riga dell'elenco «Stalli della zona», raggiunta scorrendo la pagina (lo scorrimento non è un'interazione con l'interfaccia), e registra se il marker dello stallo è coperto al centro. Se l'esecuzione lo conferma, il caso diventa DIF-02 (§8). Dalla COD-20 (OMP-61) DIF-02 è corretto e il tocco al centro del marker si verifica in TS-01 passo 3; TS-12 non è stato rieseguito.
- **Esito atteso:** contatore uguale a 3 e sosta Attiva in «La mia sosta» e in `GET /api/soste`.
- **Dati prodotti:** schermate JPEG in `docs/test/schermate/nrf_usa_2/` (viewport Pixel 7, qualità 70, meno di 0,5 MB in tutto).

## 7. Registro degli esiti

Compilato a ogni esecuzione registrata sull'anteprima. Esito: superato, non superato (con il riferimento al difetto), non eseguito (con il motivo).

| TS    | Data       | Commit  | Ambiente                                            | Modalità                                                                        | Esito               | Note                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| :---- | :--------- | :------ | :-------------------------------------------------- | :------------------------------------------------------------------------------ | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-01 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            | Primo giro fallito per un errore nel test (attendeva il messaggio della ricarica, che esce dalla scheda: DIF-03); superato al rilancio con il test corretto                                                                                                                                                                                                                                                                                  |
| TS-02 | 25/11/2026 | 9db8757 | anteprima del branch                                | manuale, con Marco Rossi                                                        | superato (parziale) | Eseguiti i passi 1 e 3: sosta di 15 minuti sullo stallo 19 (Piazza Aubry n. 6), scadenza alle 14:02; il tempo rimanente scende a zero e alle 14:02 la sosta diventa Scaduta senza ricaricare. **Non eseguiti** i passi 2, 4 e 5 (stallo Non disponibile con le rilevazioni, ritorno a Occupato, poi Libero e Terminata); il test automatico `test:e2e:lenta` non è stato eseguito. Osservazioni: DIF-04 e §8, nota sul messaggio di conferma |
| TS-03 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            |                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| TS-04 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            | Al primo giro «non eseguito» (TS-01 fallito); superato al rilancio                                                                                                                                                                                                                                                                                                                                                                           |
| TS-05 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            |                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| TS-06 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            |                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| TS-07 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            | Al primo giro «non eseguito» (TS-01 fallito); superato al rilancio                                                                                                                                                                                                                                                                                                                                                                           |
| TS-08 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            |                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| TS-09 | 26/11/2026 | f4a58e9 | anteprima del branch OMP-62, con la migrazione 0003 | automatico (`e2e/amministrazione.spec.ts`), con la password dell'Amministratore | superato            | Superato al primo giro; in un'esecuzione successiva l'ultimo passo è fallito per una corsa tra il redirect di «Esci» e quello dei 401 delle richieste ancora in corso (/accesso?da=%2Fadmin): il test ora accetta /accesso con o senza ?da=%2Fadmin. In COD-19 era rinviato a COD-21                                                                                                                                                         |
| TS-10 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`test:e2e`)                                                         | superato            |                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| TS-11 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`misura:e2e`)                                                       | superato            | NRF_PER_3: 33 variazioni, massimo 1480 ms, mediana 771 ms, 95° percentile 1312 ms (report §3)                                                                                                                                                                                                                                                                                                                                                |
| TS-12 | 24/11/2026 | 9db8757 | anteprima del branch                                | automatico (`misura:e2e`)                                                       | superato            | NRF_USA_2: 3 interazioni; marker dello stallo coperto al centro: sì (DIF-02)                                                                                                                                                                                                                                                                                                                                                                 |
| TS-13 | 26/11/2026 | f4a58e9 | anteprima del branch OMP-62, con la migrazione 0003 | automatico (`e2e/amministrazione.spec.ts`), con la password dell'Amministratore | superato            | Superato dopo tre correzioni del test: localizzatore esatto del campo «Ente» (prima trovava anche la sezione «… per ente»); accesso finale da un contesto del browser nuovo, invece che dalla pagina con il polling; compilazione del modulo di accesso verificata con toHaveValue prima di «Accedi». Nessun difetto del codice. Le esecuzioni hanno lasciato Ausiliari di prova disattivati a Baronissi                                     |
| TS-16 | — | — | — | — | non eseguito: in attesa di esecuzione | Aggiunto con OMP-63: da eseguire sull'anteprima del branch OMP-63 con `npm run test:e2e`, insieme a TS-06 aggiornato |

Il commit è quello del deploy dell'anteprima su cui si è eseguito. Al rilancio di TS-01, TS-04 e TS-07 il test di TS-01 conteneva già la correzione del passo della ricarica, integrata nel secondo commit di OMP-60; il codice dell'applicazione è invariato.

### Esecuzione di COD-20 (OMP-61)

Anteprima del branch `OMP-61-prolungamento-permesso`, dopo la correzione di DIF-02, DIF-03 e DIF-04 (issue #33). Esecuzione del 26/11/2026 sull'anteprima dopo il merge con main (commit 4b883bc): 10 su 10 superati; TS-09 e TS-13 saltati; TS-02, TS-11 e TS-12 non eseguiti.

| TS    | Data       | Commit  | Ambiente                                     | Modalità                | Esito        | Note                                                                                                                                           |
| :---- | :--------- | :------ | :------------------------------------------- | :---------------------- | :----------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-01 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Passo 3 dal marker (DIF-02), passo 5 con la conferma della ricarica (DIF-03), passi 6 e 8 con numero e area dello stallo (DIF-04)              |
| TS-02 | —          | —       | —                                            | —                       | non eseguito | Non eseguito in questa issue: il controllo di «Sosta avviata» alla scadenza resta coperto dai test unitari (`cp_sostaInCorso.md` TF-SIC-16…21) |
| TS-03 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Regressione (`Mappa.tsx` modificato)                                                                                                           |
| TS-04 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     |                                                                                                                                                |
| TS-05 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Regressione (`Mappa.tsx` modificato)                                                                                                           |
| TS-06 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Regressione della mappa dell'Ausiliario (`Mappa.tsx` condiviso)                                                                                |
| TS-07 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     |                                                                                                                                                |
| TS-08 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Prima esecuzione (commit f2936c5) non superata per timeout sul passo «Ausiliario disattivato»; risolto con l'allineamento a main (OMP-62)      |
| TS-09 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | non eseguito | Saltato: richiede la password dell'Amministratore; esito nel registro di OMP-62                                                                |
| TS-10 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Regressione della mappa dell'Ausiliario (`Mappa.tsx` condiviso)                                                                                |
| TS-11 | —          | —       | —                                            | —                       | non eseguito | Misura non ripetuta in questa issue                                                                                                            |
| TS-12 | —          | —       | —                                            | —                       | non eseguito | Flusso invariato, misure del 24–25/11 valide; il tocco al centro del marker si verifica in TS-01 (DIF-02)                                      |
| TS-13 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | non eseguito | Saltato: richiede la password dell'Amministratore; esito nel registro di OMP-62                                                                |
| TS-14 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Nuovo (sosta con permesso)                                                                                                                     |
| TS-15 | 26/11/2026 | 4b883bc | anteprima del branch, dopo il merge con main | automatico (`test:e2e`) | superato     | Nuovo (prolungamento)                                                                                                                          |

### Esecuzioni del 26/11/2026 (OMP-62)

Anteprima del branch OMP-62, con la migrazione 0003 applicata; codice dell'applicazione del commit f4a58e9 (deploy dell'anteprima), test dalla copia locale con le correzioni del commit «OMP-62: correzioni dei test di sistema e registro di TS-09 e TS-13». I test sono stati rieseguiti per la modifica dell'helper `compilaAccesso` (`e2e/supporto/pagina.ts`), che ora ripete compilazione e clic finché parte la richiesta di accesso.

- TS-08, TS-09, TS-13 (`npx playwright test e2e/accesso.spec.ts e2e/amministrazione.spec.ts --grep "TS-08|TS-09|TS-13"`): 3 su 3 superati. TS-08 in precedenza falliva nell'accesso dell'Ausiliario disattivato dopo «Esci», per il modulo compilato prima che React prendesse in carico i campi; nessun difetto del codice.
- `npm run test:e2e` (TS-01, TS-03…10, TS-13, con la password dell'Amministratore): 10 su 10 superati, in 1,8 minuti.
- Correzioni dei test di questa issue: localizzatore esatto del campo «Ente» (TS-13); accesso finale di TS-13 da un contesto del browser nuovo; dopo «Esci» si accetta `/accesso` con o senza `?da=<pagina>` (TS-08, TS-09); `compilaAccesso` verifica i valori e ripete compilazione e clic finché la richiesta di accesso parte (tutti i test che la usano).

## 8. Difetti rilevati

I difetti non si correggono in questo task: ciascuno diventa una segnalazione al responsabile dell'issue interessata.

| ID     | Caso di test                                                    | Requisito / caso d'uso                                                           | Issue interessata                                    | Ambiente e commit                                                        | Passi per riprodurre                                                                                                                                                                                                                     | Atteso                                                                                                                                                                       | Ottenuto                                                                                                                                                                                                                                                                                                                                                         | Gravità | Stato              |
| :----- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------- | :--------------------------------------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------ | :----------------- |
| DIF-01 | progettazione di TS-02 e TS-03 (§3, timeout)                    | RF_IOT_2, UC_IOT_2                                                               | COD-23 (RF_IOT_2); README, sezione «Dati di esempio» | `main` 3836063, lettura del codice                                       | 1. Leggere nel README «Dati di esempio» il «limite noto» sul timeout di 60 secondi. 2. Leggere `src/application/allineamento-temporale/allineamento.ts`, fine di `allinea()`. 3. Su un ambiente senza simulatori attivi aprire `/mappa`. | Il README descrive il comportamento del codice: gli stalli diventano Sconosciuti dopo 60 secondi senza rilevazioni, oppure il README dice che il timeout arriverà con COD-22 | Il README afferma che «con il timeout di 60 secondi di RF_IOT_2 gli stalli risultano Sconosciuti finché i simulatori dei sensori non inviano nuove rilevazioni», ma il codice non implementa il timeout (commento «COD-22 (RF_IOT_2): qui si aggiungerà il passaggio a Sconosciuto»): gli stalli mostrano lo stato dell'ultima rilevazione, anche del 15/11/2026 | minore  | corretto in COD-23 |
| DIF-02 | TS-12 (annotazione «marker dello stallo coperto al centro: sì») | NRF_USA_2, UC_STALLI_1, UC_SOSTA_1                                               | COD-17 (OMP-58)                                      | anteprima del branch OMP-60, commit 9db8757, 24/11/2026, profilo Pixel 7 | 1. Automobilista apre `/mappa` sul telefono (vista iniziale, zoom 17). 2. Tocca il marker di uno degli stalli 17…21 di Piazza Aubry (per esempio il n. 5).                                                                               | Il tocco sul marker seleziona lo stallo voluto, che è la prima delle tre interazioni (NRF_USA_2, UC_SOSTA_1 entry condition)                                                 | Gli stalli vicini distano circa 5,5 m (circa 6 px a zoom 17) e i marker sono larghi 36 px: si sovrappongono, e al centro del marker dello stallo c'è il marker di un altro stallo. Il tocco al centro seleziona lo stallo sbagliato; resta possibile scegliere dalla riga dell'elenco «Stalli della zona»                                                        | minore  | corretto in COD-20 |
| DIF-03 | TS-01, passo 5                                                  | UC_WALLET_1 passo 4, UC_SOSTA_1 5.a1                                             | COD-17 (OMP-58)                                      | anteprima del branch OMP-60, commit 9db8757                              | 1. Automobilista con saldo 0,00 € apre uno stallo Occupato e «Avvia sosta». 2. Compare «Credito insufficiente» con la ricarica. 3. Sceglie 5 € e «Conferma la ricarica».                                                                 | Il Sistema registra la ricarica, aggiorna il saldo e **lo mostra**, poi torna alla conferma della sosta (UC_WALLET_1 passo 4)                                                | La ricarica è registrata (200, saldo 500) e si torna alla conferma con targa e durata conservate, ma il riquadro della ricarica esce dalla scheda appena il credito basta: il messaggio «Ricarica di 5,00 € approvata» e il nuovo saldo non restano visibili (`SchedaStallo.tsx`, `proponiRicarica`)                                                             | minore  | corretto in COD-20 |
| DIF-04 | TS-02 (prova manuale, 25/11/2026)                               | RF_SOSTA_1, `np_01_automobilista` («Sosta in corso: stato e orario di scadenza») | COD-17 (OMP-58)                                      | anteprima del branch OMP-60, commit 9db8757, 25/11/2026                  | 1. Marco Rossi apre `/mappa` e avvia una sosta sullo stallo 19 (Piazza Aubry n. 6), che è nella zona della mappa. 2. Guarda «La mia sosta».                                                                                              | «La mia sosta» indica lo stallo come «Stallo n. 6, Piazza Aubry» (comportamento documentato in OMP-58: numero e area quando lo stallo è nella zona della mappa)              | «La mia sosta» mostra «Stallo 19», cioè l'id interno, pur con lo stallo nella zona della mappa. Causa da analizzare (`descriviStallo` in `MappaStalli.tsx`)                                                                                                                                                                                                      | minore  | corretto in COD-20 |

**Correzioni di COD-20 (OMP-61, issue #33).** DIF-02: i marker che si sovrappongono si dispongono a griglia attorno alla loro posizione (`cp_mappaInterfaccia.md` TF-MARC-01…09; tocco al centro del marker in TS-01 passo 3). DIF-03: dopo la ricarica restano visibili la conferma e il nuovo saldo (`cp_walletInterfaccia.md` TF-WALUI-13…19; TS-01 passo 5). DIF-04: la pagina ricorda gli stalli già visti, così «La mia sosta» indica numero e area anche dopo un cambio di zona; la causa del difetto osservato non è accertata (`cp_mappaInterfaccia.md` TF-MAPUI-19…25; TS-01 passi 6 e 8, con il ricaricamento della pagina). Esiti in §7.

**Correzione di COD-23 (OMP-64, issue #44).** DIF-01: l'allineamento temporale porta a `Sconosciuto` gli stalli senza rilevazioni da più di 60 secondi a ogni lettura di mappa, scheda dello stallo e soste (`cp_rilevazioni.md` TF-RIL-27…35, `cp_scadenzaEFine.md` TF-SCA-11, 12); il README descrive questo comportamento. Verifica sull'anteprima fermando il simulatore dei sensori per più di 60 secondi.

**Osservazione non registrata come difetto (da valutare con COD-17).** Nella prova manuale di TS-02 l'avviso «Fatto · Sosta avviata: scade alle 14:02.» resta visibile in «La mia sosta» anche dopo che la sosta è diventata Scaduta. Il comportamento non contrasta con un caso d'uso o un requisito (il messaggio conferma l'avvio, e lo stato mostrato è corretto), ma l'accostamento può confondere: è riportato nei Limiti della PR come proposta di miglioramento. **Corretta in COD-20 (OMP-61):** il messaggio di conferma si mostra solo finché la sosta è mostrata Attiva (`cp_sostaInCorso.md` TF-SIC-16…21).
