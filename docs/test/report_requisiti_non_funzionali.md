# Report dei requisiti non funzionali a priorità Alta

Misura dei requisiti non funzionali che sono criteri di successo del RAD: NRF_PER_3, NRF_USA_2, NRF_AFF_2 e NRF_SUP_3. Task OMP-60 (issue #32, COD-19). I casi di test che producono le misure TS-11 e TS-12 sono in `docs/test/test_di_sistema.md` §6; i riepiloghi scritti in automatico dagli script sono in `docs/misure.md`.

> Stato del documento: **scheletro**. I campi «da compilare» si riempiono con i valori delle esecuzioni.

## 1. Riepilogo

| Requisito | Soglia                                                                | Valore ottenuto | Esito        |
| :-------- | :-------------------------------------------------------------------- | :-------------- | :----------- |
| NRF_PER_3 | ogni variazione sulla mappa entro 2 s dalla rilevazione               | da compilare    | da compilare |
| NRF_USA_2 | al massimo 3 interazioni dalla schermata principale alla sosta pagata | da compilare    | da compilare |
| NRF_AFF_2 | almeno il 98% delle letture valide associate correttamente            | da compilare    | da compilare |
| NRF_SUP_3 | almeno l'80% del codice eseguibile dei componenti dei requisiti Alta  | da compilare    | da compilare |

## 2. Ambienti

| Voce                     | Valore                                                                                                                   |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| Branch e commit misurati | `OMP-60-test-di-sistema`, commit da compilare (`git rev-parse --short HEAD`, uguale al commit del deploy dell'anteprima) |
| Anteprima                | alias di branch dell'anteprima su Vercel (regione `fra1`); l'indirizzo non è riportato nel repository                    |
| Database dell'anteprima  | Neon, branch `preview`, database `omnipark` (condiviso da tutte le anteprime)                                            |
| Database di test         | database personale `omnipark_<nome>_test` sul branch Neon `dev-teamc07` (`DATABASE_URL_TEST`)                            |
| PC delle misure          | Chromebook, Linux Debian 13; Node.js 26.13.0; Chromium di Playwright 1.65.1 (versione da compilare); profilo Pixel 7     |

Le misure NRF_PER_3 e NRF_USA_2 si eseguono sull'anteprima pubblicata, con il database delle anteprime. NRF_AFF_2 e NRF_SUP_3 si eseguono sul database di test, per i motivi indicati nelle rispettive sezioni. Nessuna misura usa la produzione: `playwright.config.ts` rifiuta di partire con un indirizzo diverso da localhost e dagli alias di branch delle anteprime.

## 3. NRF_PER_3 – Aggiornamento dello stato sulla mappa

- **Requisito:** ogni variazione valida dello stato di occupazione di uno stallo, rilevata da un sensore simulato, compare sulla mappa dell'Automobilista entro 2 secondi dalla rilevazione, senza aggiornamento manuale.
- **Soglia:** ritardo massimo ≤ 2000 ms su almeno 30 variazioni; si riportano anche mediana e 95° percentile (per rango più vicino).
- **Data:** da compilare.
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

- **Valori:** da compilare (variazioni misurate, non comparse, esclusi, massimo, mediana, 95° percentile). Valori grezzi in `docs/test/misure/nrf_per_3.csv`, riepilogo nella sezione `misura:per3` di `docs/misure.md`.
- **Esito:** da compilare.
- **Limiti:** il ritardo comprende la latenza di rete dal PC all'anteprima e l'avvio a freddo delle funzioni (attenuato dal riscaldamento). Altre attività sull'anteprima condivisa possono cambiare gli stessi stalli: i loro effetti sono esclusi e contati a parte.

## 4. NRF_USA_2 – Procedura di sosta in tre interazioni

- **Requisito:** un Automobilista autenticato avvia e paga la sosta con al massimo 3 interazioni con l'interfaccia, a partire dalla schermata principale.
- **Soglia:** 3 interazioni.
- **Data:** da compilare.
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

- **Valori:** da compilare (interazioni contate, sosta Attiva, marker dello stallo coperto al centro sì/no). Riepilogo nella sezione `misura:usa2` di `docs/misure.md`.
- **Esito:** da compilare.
- **Limiti:** lo stallo si seleziona dalla riga dell'elenco, raggiunta scorrendo la pagina (lo scorrimento non è contato come interazione), perché alla vista iniziale i marker degli stalli vicini si coprono (eventuale DIF-02 in `docs/test/test_di_sistema.md` §8). Il conteggio presuppone uno stallo visibile nella vista iniziale e un credito sufficiente.

## 5. NRF_AFF_2 – Accuratezza dell'associazione targa-sosta

- **Requisito:** in almeno il 98% delle letture valide del modulo ANPR simulato la targa è associata alla sosta attiva corrispondente, se presente; in assenza di corrispondenza non è associata a soste di altri veicoli.
- **Soglia:** 98% delle letture valide con esito corretto.
- **Data:** da compilare.
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

- **Valori:** da compilare dalla sezione `misura:anpr` di `docs/misure.md` (letture valide corrette, accuratezza, rifiutate correttamente, composizione del dataset, coerenza delle segnalazioni).
- **Esito:** da compilare.
- **Limiti:** la misura non applica le fasce orarie di UC_ANPR_1 2.a2 (COD-23): va ripetuta dopo COD-23.

## 6. NRF_SUP_3 – Copertura dei test automatici

- **Requisito:** i test funzionali automatici coprono almeno l'80% del codice eseguibile dei componenti che implementano i requisiti funzionali a priorità Alta; la copertura è misurata con strumenti di analisi durante l'esecuzione dei test.
- **Soglia:** 80% di righe e istruzioni sull'insieme dei componenti dei requisiti Alta; rami e funzioni sono riportati come informazione.
- **Data:** da compilare.
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

- **Valori:** da compilare (righe, istruzioni, rami e funzioni dal riepilogo `text-summary`; file sotto l'80% dal report `coverage/sistema/`). **Durata dell'esecuzione:** da compilare (`real` di `time`). **Database usato:** database di test personale.
- **Esito:** da compilare.
- **Limiti:** la CI non esegue i test sul database né controlla la soglia: è una proposta per l'issue sulla CI. I componenti React non entrano nella misura.

## 7. Ripetibilità

Le misure si ripetono con i comandi di ciascuna sezione. TS-11 e TS-12 creano dati propri e unici a ogni esecuzione (Automobilisti nuovi, targhe casuali) e non resettano il database delle anteprime; le soste avviate scadono da sole. `misura:anpr` e `test:copertura` ricreano il database di test personale e non toccano gli altri database.
