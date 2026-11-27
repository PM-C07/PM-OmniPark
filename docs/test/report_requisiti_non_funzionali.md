# Report dei requisiti non funzionali a priorità Alta

Misura dei requisiti non funzionali che sono criteri di successo del RAD: NRF_PER_3, NRF_USA_2, NRF_AFF_2 e NRF_SUP_3. Task OMP-60 (issue #32, COD-19). I casi di test che producono le misure TS-11 e TS-12 sono in `docs/test/test_di_sistema.md` §6; i riepiloghi scritti in automatico dagli script sono in `docs/misure.md`. In fondo, NRF_SIC_1 (priorità Media), aggiunto con COD-25.

> Misure eseguite il 24 e il 25/11/2026. Tutte e quattro le soglie sono superate.
>
> NRF_USA_2: flusso invariato, misure del 24–25/11 valide; prova di riavvio spostata a COD-28.

## 1. Riepilogo

| Requisito | Soglia                                                                | Valore ottenuto                                                         | Esito        |
| :-------- | :-------------------------------------------------------------------- | :---------------------------------------------------------------------- | :----------- |
| NRF_PER_3 | ogni variazione sulla mappa entro 2 s dalla rilevazione               | 33 variazioni, massimo 1480 ms (mediana 771 ms, 95° percentile 1312 ms) | **superato** |
| NRF_USA_2 | al massimo 3 interazioni dalla schermata principale alla sosta pagata | 3 interazioni                                                           | **superato** |
| NRF_AFF_2 | almeno il 98% delle letture valide associate correttamente            | 100,00% (260 su 260)                                                    | **superato** |
| NRF_SUP_3 | almeno l'80% del codice eseguibile dei componenti dei requisiti Alta  | righe 95,40%, istruzioni 95,42%                                         | **superato** |
| NRF_SIC_1 | ogni cella applicabile di `matrice_accessi.md` verificata da un test  | 35 righe, 67/67 celle coperte, 5 test aggiunti (§8)                     | **superato** |

## 2. Ambienti

| Voce                     | Valore                                                                                                                                                                                                            |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch e commit misurati | `OMP-60-test-di-sistema`, commit 9db8757 (deploy dell'anteprima e copia locale per NRF_AFF_2 e NRF_SUP_3). Il codice dell'applicazione (`src/`) è uguale a `main` 3836063: OMP-60 aggiunge solo strumenti di test |
| Anteprima                | alias di branch dell'anteprima su Vercel (regione `fra1`); l'indirizzo non è riportato nel repository                                                                                                             |
| Database dell'anteprima  | Neon, branch `preview`, database `omnipark` (condiviso da tutte le anteprime)                                                                                                                                     |
| Database di test         | database personale `omnipark_<nome>_test` sul branch Neon `dev-teamc07` (`DATABASE_URL_TEST`)                                                                                                                     |
| PC delle misure          | Chromebook, Linux Debian 13; Node.js 26.13.0; Chromium di Playwright 1.65.1 (versione del browser non rilevata); profilo Pixel 7                                                                                  |

Le misure NRF_PER_3 e NRF_USA_2 si eseguono sull'anteprima pubblicata, con il database delle anteprime. NRF_AFF_2 e NRF_SUP_3 si eseguono sul database di test, per i motivi indicati nelle rispettive sezioni. Nessuna misura usa la produzione: `playwright.config.ts` rifiuta di partire con un indirizzo diverso da localhost e dagli alias di branch delle anteprime.

## 3. NRF_PER_3 – Aggiornamento dello stato sulla mappa

- **Requisito:** ogni variazione valida dello stato di occupazione di uno stallo, rilevata da un sensore simulato, compare sulla mappa dell'Automobilista entro 2 secondi dalla rilevazione, senza aggiornamento manuale.
- **Soglia:** ritardo massimo ≤ 2000 ms su almeno 30 variazioni; si riportano anche mediana e 95° percentile (per rango più vicino).
- **Data:** 24/11/2026, 16:39 UTC (17:39 ora italiana).
- **Ambiente:** anteprima del branch, database delle anteprime.
- **Procedura** (TS-11):
  1. un Automobilista nuovo apre `/mappa`; la pagina registra con un `MutationObserver` ogni cambio dell'etichetta dei marker con `Date.now()`;
  2. il simulatore dei sensori (`src/simulators/sensori.ts`), lanciato dal test con uno scenario generato, invia 3 variazioni di riscaldamento e 33 variazioni misurate sugli stalli 1, 3 e 16, una ogni 3 secondi, ciascuna verso lo stato opposto, e registra l'orario di invio (`inviatoIl`) nel suo registro JSONL;
  3. il ritardo di una variazione è l'istante della prima comparsa del nuovo stato sul marker meno `inviatoIl`. Simulatore e browser girano sullo stesso PC: i due istanti vengono dallo stesso orologio;
  4. una variazione non comparsa entro 10 secondi conta come non superata; un invio con errore o con un esito diverso da quello atteso (per esempio una sosta avviata nel frattempo da altri) è escluso e riportato.
- **Comando:**

  ```bash
  export OMNIPARK_E2E_URL=<alias di branch dell'anteprima>
  export SIMULATORE_TOKEN=<token dei simulatori dell'anteprima>
  npm run misura:e2e -- --grep TS-11
  ```

- **Valori:** 33 variazioni misurate più 3 di riscaldamento, sugli stalli 1, 3 e 16; 0 non comparse entro 10 s; 0 invii esclusi. Ritardo **massimo 1480 ms**, mediana 771 ms, 95° percentile 1312 ms. Valori grezzi in `docs/test/misure/nrf_per_3.csv`, riepilogo nella sezione `misura:per3` di `docs/misure.md`.
- **Esito:** **superato**: tutte le 33 variazioni sono comparse entro 2000 ms (margine minimo 520 ms).
- **Limiti:** il ritardo comprende la latenza di rete dal PC all'anteprima e l'avvio a freddo delle funzioni (attenuato dal riscaldamento). Altre attività sull'anteprima condivisa possono cambiare gli stessi stalli: i loro effetti sono esclusi e contati a parte.

## 4. NRF_USA_2 – Procedura di sosta in tre interazioni

- **Requisito:** un Automobilista autenticato avvia e paga la sosta con al massimo 3 interazioni con l'interfaccia, a partire dalla schermata principale.
- **Soglia:** 3 interazioni.
- **Data:** 24/11/2026, 16:39 UTC (17:39 ora italiana).
- **Ambiente:** anteprima del branch, database delle anteprime, sfondo della mappa attivo, viewport Pixel 7.
- **Procedura** (TS-12): Automobilista nuovo con 10 € ricaricati dalle API (fuori dal conteggio) e stallo candidato `Occupato` nella vista iniziale. Dalla schermata principale `/mappa`, ogni azione passa da una funzione che la conta; le schermate si salvano prima di ogni interazione e alla fine.

| Interazione | Azione                                                   | Schermata                                            |
| :---------- | :------------------------------------------------------- | :--------------------------------------------------- |
| —           | schermata principale                                     | `docs/test/schermate/nrf_usa_2/01-mappa.jpg`         |
| 1           | tocco sulla riga dello stallo nell'elenco                | `docs/test/schermate/nrf_usa_2/02-scheda-stallo.jpg` |
| 2           | «Avvia sosta» (targa e durata di 60 minuti già proposte) | `docs/test/schermate/nrf_usa_2/03-conferma.jpg`      |
| 3           | «Conferma e paga»                                        | `docs/test/schermate/nrf_usa_2/04-sosta-pagata.jpg`  |

- **Comando:**

  ```bash
  npm run misura:e2e -- --grep TS-12
  ```

  Si esegue tra le 08:00 e le 19:45 (ora italiana): fuori dalla fascia a pagamento l'importo sarebbe zero e il caso di test viene saltato.

- **Valori:** 3 interazioni; sosta Attiva in «La mia sosta» e in `GET /api/soste`; stallo n. 5 di Piazza Aubry; sfondo della mappa caricato; marker dello stallo coperto al centro da un marker vicino: **sì** (DIF-02). Riepilogo nella sezione `misura:usa2` di `docs/misure.md`; schermate in `docs/test/schermate/nrf_usa_2/` (4 file JPEG, 176 KB in tutto).
- **Esito:** **superato** (3 interazioni, soglia 3), con la selezione dalla riga dell'elenco; con il tocco sul marker la prima interazione non è affidabile finché non si risolve DIF-02.
- **Limiti:** lo stallo si seleziona dalla riga dell'elenco, raggiunta scorrendo la pagina (lo scorrimento non è contato come interazione), perché alla vista iniziale i marker degli stalli vicini si coprono (eventuale DIF-02 in `docs/test/test_di_sistema.md` §8). Il conteggio presuppone uno stallo visibile nella vista iniziale e un credito sufficiente.

## 5. NRF_AFF_2 – Accuratezza dell'associazione targa-sosta

- **Requisito:** in almeno il 98% delle letture valide del modulo ANPR simulato la targa è associata alla sosta attiva corrispondente, se presente; in assenza di corrispondenza non è associata a soste di altri veicoli.
- **Soglia:** 98% delle letture valide con esito corretto.
- **Data:** 25/11/2026, 12:08 UTC.
- **Ambiente:** database di test personale (`DATABASE_URL_TEST`), build di produzione dell'applicazione servita in locale sul PC.
- **Procedura** (`scripts/misuraAnpr.ts`, comando `npm run misura:anpr`, invariato da COD-14), nell'ordine in cui lo script la esegue:
  1. rifiuta di partire se `DATABASE_URL_TEST` manca, se il nome del database non finisce con `_test` o se coincide con `DATABASE_URL` (stessa protezione di `npm run test:db`);
  2. controlla il dataset `src/simulators/dati/letture-anpr.json`: ogni lettura ha un id unico e un esito atteso completo;
  3. compila l'applicazione con `next build`;
  4. ricrea schema e dati di esempio sul database di test (`preparaDatabaseDiTest`);
  5. prepara le soste **chiamando direttamente le Facade** sul database di test (Utenti e accessi, Wallet con il simulatore di pagamento senza latenza, Gestione soste, Gestione stalli), con un orologio spostabile: registra un Automobilista con le targhe del dataset, ricarica il wallet, registra le presenze sugli stalli, avvia soste di 15 minuti a partire da 24 ore prima (che risultano Scadute all'istante reale) e soste di 120 minuti ancora Attive;
  6. avvia la build con `next start` su `127.0.0.1`, collegata al database di test e con un `SIMULATORE_TOKEN` casuale, e controlla con `GET /api/health/db` che il server sia collegato proprio al database di test;
  7. invia tutte le letture del dataset con il simulatore ANPR (`src/simulators/anpr.ts`), **via HTTP verso `POST /api/anpr/letture` della build servita**: il codice misurato (riscontro e creazione delle segnalazioni) gira quindi nella build di produzione, non nelle Facade chiamate dallo script;
  8. per ogni lettura confronta status HTTP, esito e motivo (o codice d'errore) del registro con l'esito atteso; per ogni segnalazione creata controlla la riga nel database con la persistenza (stato Aperta, stallo, targa normalizzata, motivo, data e ora della lettura, nessun Ausiliario); controlla che le nuove segnalazioni non chiuse siano esattamente quelle create e che ogni targa ne abbia al più una;
  9. calcola l'accuratezza sulle letture valide (le rifiutate sono escluse dalla percentuale e contate a parte) e scrive la sezione `misura:anpr` di `docs/misure.md`.
- **Differenza dalla nota dell'issue** («le misure si eseguono sull'anteprima pubblicata»): la misura richiede uno stato iniziale noto (dati di esempio appena ricreati e soste avviate nel passato con un orologio spostabile tramite le Facade), che sul database condiviso delle anteprime non si può ottenere senza un reset, vietato. La preparazione scrive sul database direttamente e richiederebbe la stringa di connessione delle anteprime, che non deve comparire in nessun file. Il codice misurato è quello dello stesso commit, nella build di produzione. Come riscontro sull'anteprima vera, TS-07 verifica l'associazione con sosta attiva e la deduplicazione (non entra nella percentuale).
- **Comando:**

  ```bash
  npm run misura:anpr
  ```

- **Valori:** letture valide con esito corretto **260 su 260 (100,00%)**; letture rifiutate correttamente 27 su 27 (escluse dalla percentuale); composizione del dataset: nessuna segnalazione 60, targa non corrispondente 64, sosta scaduta 52, lettura scartata 34, sosta assente 50, lettura rifiutata 27; 166 segnalazioni create, coerenti con le letture e con il vincolo di una sola non chiusa per targa. Sezione `misura:anpr` di `docs/misure.md`. Un primo tentativo si è interrotto per un errore di rete del PC (`EAI_AGAIN`, risoluzione dei nomi), non del sistema; la misura riportata è la seconda esecuzione, completa.
- **Esito:** **superato** (soglia 98%).
- **Limiti:** la misura non applica le fasce orarie di UC_ANPR_1 2.a2 (COD-23): va ripetuta dopo COD-23.

## 6. NRF_SUP_3 – Copertura dei test automatici

- **Requisito:** i test funzionali automatici coprono almeno l'80% del codice eseguibile dei componenti che implementano i requisiti funzionali a priorità Alta; la copertura è misurata con strumenti di analisi durante l'esecuzione dei test.
- **Soglia:** 80% di righe e istruzioni sull'insieme dei componenti dei requisiti Alta; rami e funzioni sono riportati come informazione.
- **Data:** 25/11/2026.
- **Ambiente:** PC delle misure, database di test personale (`DATABASE_URL_TEST`, ricreato all'inizio di ogni file di test sul database).
- **Procedura:** `vitest.copertura.config.ts` esegue in un'unica esecuzione i test unitari (`src/**/*.test.ts`) e i test sul database (`src/**/*.db.test.ts`, un file alla volta) con la copertura V8. L'esecuzione fallisce se righe o istruzioni sono sotto l'80%.
- **Componenti dei requisiti Alta** (`coverage.include`):
  - `src/application/**` (Utenti e accessi, Gestione stalli, Gestione soste, allineamento temporale, Wallet, Segnalazioni), escluso `gestione-stalli/conteggio.ts` (RF_ADM_1, Media);
  - `src/persistence/accessoDati/**` e `src/persistence/db.ts`;
  - `src/app/api/**` (route e moduli comuni), escluso `health/` (stato del database, infrastruttura);
  - `src/app/_composizione.ts`;
  - `src/presentation/logica/**` (logica pura delle interfacce).
- **Esclusi:** migrazioni, comandi `db:migrate` e `db:reset` e guardia del reset (infrastruttura, NRF_PKG_1 Media); strumenti dei test in `src/persistence/test/`; componenti React `.tsx` e pagine, che non hanno test di componente e sono verificati dai test di sistema, non strumentati per la copertura.
- **Comando:**

  ```bash
  time npm run test:copertura
  ```

- **Valori:** 61 file di test, 1042 test superati. **Istruzioni 95,42% (1211/1269), righe 95,40% (1184/1241)**, rami 88,5%, funzioni 98,54%. File sotto la media, riportati come informazione: `src/presentation/logica/risposteApi.ts` 58,8% (le chiamate di rete dal browser sono esercitate solo dai test di sistema, non strumentati), `src/application/allineamento-temporale/allineamento.ts` 75%, `src/application/wallet/addebito.ts` 76%. **Durata dell'esecuzione:** 7 min 31 s (`real`). **Database usato:** database di test personale. Un primo tentativo si è interrotto per errori di rete verso Neon (`ETIMEDOUT`, `ENETUNREACH`) su un file, senza tabella di copertura; la misura riportata è la seconda esecuzione, completa.
- **Esito:** **superato** (soglia 80% su righe e istruzioni).
- **Limiti:** la CI non esegue i test sul database né controlla la soglia: è una proposta per l'issue sulla CI. I componenti React non entrano nella misura.

## 7. Ripetibilità

Le misure si ripetono con i comandi di ciascuna sezione. TS-11 e TS-12 creano dati propri e unici a ogni esecuzione (Automobilisti nuovi, targhe casuali) e non resettano il database delle anteprime; le soste avviate scadono da sole. `misura:anpr` e `test:copertura` ricreano il database di test personale e non toccano gli altri database.

## 8. NRF_SIC_1 – Controllo degli accessi

- **Requisito:** il sistema consente a ciascun utente autenticato di accedere solo alle funzioni e ai dati previsti dal proprio ruolo e dall'ente di appartenenza (priorità Media). Task OMP-66 (issue #46, COD-25).
- **Soglia:** il requisito non fissa un valore numerico. Criterio di COD-25: ogni route API rifiuta la richiesta senza sessione (401), con un ruolo non ammesso (403) e, per le operazioni sui dati di un ente, con un ente diverso (403 o 404); ogni cella applicabile della matrice è verificata da un test esistente con quell'esito.
- **Data:** 28/11/2026 (esecuzione dei test); matrice compilata e test aggiunti il 27/11/2026.
- **Ambiente:** database di test personale (`DATABASE_URL_TEST`); test di route sul database, che chiamano gli handler con una `Request` reale.
- **Procedura:** `docs/test/matrice_accessi.md` riporta una riga per ogni metodo e percorso di `src/app/api/`, con i ruoli ammessi e, per ogni cella, il file e il frame del test che la verifica. Le route pubbliche (registrazione, accesso, uscita, stato del database) e quelle dei simulatori (cella «senza token → 401») sono nella matrice con la loro protezione reale. Per le celle senza test sono stati aggiunti i frame nelle `cp_` delle route; una revisione indipendente ha controllato che ogni cella citi un test reale con l'esito della cella.
- **Comando:**

  ```bash
  npx vitest run --config vitest.db.config.ts src/app/api src/application/segnalazioni/verificaPermesso.db.test.ts
  ```

- **Valori:** 35 righe (30 file di route), **67/67 celle coperte** (62 da test già presenti, 5 dai test aggiunti: TF-ACC-44, 45 e 46 in `cp_apiAccesso.md`, TF-API-ADM-35 in `cp_apiAmministrazione.md`, TF-API-PRO-20 in `cp_apiProlungamento.md`), **5 test aggiunti**. Nessuna route senza il controllo di sessione, ruolo o ente previsto.
- **Esito:** **superato**: il comando, eseguito il 28/11/2026, termina con 11 file di test e 308 test superati, 0 falliti; `npm run lint`, `npm run format:check` e `npm test` sono verdi.
- **Limiti:** la matrice verifica le route API, non le pagine (protette in modo ottimistico dal proxy, TF-ACC-32…43). L'ente diverso a livello di sistema è verificato da TS-10 (`docs/test/test_di_sistema.md`). Fuori ambito: test di penetrazione, attacchi alla sessione, limiti di frequenza.
