# cp_gestioneAusiliari

Specifica dei casi di test (category partition) del servizio Gestione degli Ausiliari del sottosistema Utenti e accessi: operazioni `ausiliariPerEnte()`, `creaAusiliario(amministratore, dati)`, `aggiornaAusiliario(ausiliario, dati)` e `disattivaAusiliario(ausiliario)` della Facade.
Requisiti: RF_ADM_2 (gestione degli account degli Ausiliari), RF_AUTH_4 (accesso negato all'account disattivato), NRF_SIC_1 (l'ente dell'account stabilisce i dati accessibili). Task OMP-62 (issue #39).

- **Fonti dell'esito atteso:** `UC_ADM_2` (passi 2–7, flussi 2.a1, 3.a1, 3.a2, 6.a1, Regole di dominio), `SD_ADM_2` (2.1 `ausiliariPerEnte()`, 3.a1.5 `segnalazioniPreseInCarico()`, 3.a1.6 `disattiva()`, 6.1 `verificaCompletezza`, 6.2 `emailRegistrata`, 7.1 `aggiorna` e `<<create>>`), `UC_AUTH_4` 2.a2, class diagram (`Utente.password`, `Amministratore "gestisce l'account di" Ausiliario`, `StatoAccount`), `docs/rad/vincoli_dominio.md` (VD_1, VD_17, VD_18, VD_19), `cp_registraAutomobilista.md` (regole di email e password), `cp_accedi.md` TF-06, `cp_persistenza_utenti_enti_veicoli.md` TF-UEV-26, 33, 37…49, issue #39 (categorie minime), piano approvato di OMP-62 (decisioni D1, D2).
- **File di test:** `src/application/utenti-accessi/gestioneAusiliari.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_39` per le scelte dell'issue #39 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `VD_19 · TF-GAU-27 · Ausiliario con segnalazioni prese in carico → AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/utenti-accessi/facade.ts (operazioni nuove)
type AusiliarioConEnte = {
  id: number; email: string; nome: string; cognome: string;
  enteId: number; ente: string; statoDellAccount: "ATTIVO" | "DISATTIVATO";
};
facade.ausiliariPerEnte(): Promise<AusiliarioConEnte[]>;        // per nome dell'ente, cognome, nome, id
facade.creaAusiliario(
  amministratore: number,
  dati: { nome: string; cognome: string; email: string; password: string; ente: number | null },
): Promise<AusiliarioConEnte>;
facade.aggiornaAusiliario(
  ausiliario: number,
  dati: { nome: string; cognome: string; email: string; ente: number | null },
): Promise<AusiliarioConEnte>;
facade.disattivaAusiliario(ausiliario: number): Promise<AusiliarioConEnte>;
// errori: ErroreUtentiAccessi con `codice` (esportato dalla Facade)
```

**`creaAusiliario`**, controlli in quest'ordine:

1. nome e cognome non vuoti dopo `trim`, email e password non vuote, ente presente → altrimenti `DATI_INCOMPLETI`;
2. email nel formato della registrazione (`/^[^@\s]+@[^@\s]+$/`) → `EMAIL_NON_VALIDA`;
3. password di almeno 8 caratteri Unicode → `PASSWORD_TROPPO_CORTA`;
4. email non usata da nessun utente, senza distinzione tra maiuscole e minuscole → `EMAIL_GIA_REGISTRATA`;
5. ente esistente (id intero positivo tra gli enti preposti) → `ENTE_INESISTENTE`.

Poi calcola l'hash della password con `calcolaHashPassword` (scrypt, lo stesso della registrazione) e crea utente, Ausiliario `ATTIVO` e associazione «gestisce l'account di» con l'`amministratore` (persistenza `creaAusiliario`). Nome e cognome si salvano senza spazi ai lati. Due creazioni concorrenti con la stessa email: la seconda riceve `EMAIL_GIA_REGISTRATA` dal vincolo dello schema.

**`aggiornaAusiliario`**, in un'unica transazione: blocca la riga dell'Ausiliario (`bloccaAusiliario`, `FOR UPDATE`); se non esiste (anche un id di un utente con un altro ruolo) → `AUSILIARIO_INESISTENTE`. Poi i controlli 1, 2, 4 e 5 di `creaAusiliario` (senza password); l'email è «di un altro utente» solo se `trovaUtentePerEmail` trova un utente con un id diverso, quindi l'email invariata, anche con maiuscole diverse, è accettata. Se l'ente cambia e l'Ausiliario ha segnalazioni `PRESA_IN_CARICO` → `CAMBIO_ENTE_NON_CONSENTITO`. Aggiorna nome, cognome, email ed ente; lo stato dell'account e la password non cambiano. Un Ausiliario `DISATTIVATO` si può modificare (non riattivare).

**`disattivaAusiliario`**, in un'unica transazione: blocca la riga dell'Ausiliario; se non esiste → `AUSILIARIO_INESISTENTE`; se è già `DISATTIVATO` → `AUSILIARIO_GIA_DISATTIVATO`; se ha segnalazioni `PRESA_IN_CARICO` (`contaSegnalazioniPreseInCarico`) → `AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO`. Altrimenti porta l'account a `DISATTIVATO` ed elimina tutte le sue sessioni (`eliminaSessioniUtente`). Segnalazioni e verifiche dell'Ausiliario non si toccano.

Codici nuovi di `ErroreUtentiAccessi`: `DATI_INCOMPLETI`, `ENTE_INESISTENTE`, `AUSILIARIO_INESISTENTE`, `AUSILIARIO_GIA_DISATTIVATO`, `AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO`, `CAMBIO_ENTE_NON_CONSENTITO`.

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaSessione`, `trovaSessione`, `trovaUtentePerEmail`, `trovaAusiliario`, `chiudiSegnalazione`, `dettaglioSegnalazione`, `contaSegnalazioniPreseInCarico`; `calcolaHashToken` di `crittografia.ts`; `facade.accedi` per verificare password e stato dell'account; una `SELECT` su `gestione_account_ausiliario`, `utente.hash_password` e `verifica_del_permesso`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni vanno in commit: **i frame si eseguono nell'ordine della tabella**. TF-GAU-01 legge l'elenco del dataset prima delle creazioni; i frame che scrivono usano email e Ausiliari propri, indicati nella tabella.
- Facade: `creaFacadeUtentiAccessi({ pool: poolDiTest(), orologio })` con orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`).
- **Dati validi predefiniti** del frame `n`: `{ nome: "Nome<n>", cognome: "Cognome<n>", email: "gau.<n>@test.example", password: "parola-di-prova-lunga", ente: 2 }`, con `<n>` su due cifre; ogni frame indica solo il valore che cambia. Amministratore: 1.
- **Sessione di prova:** `creaSessione(pool, { utenteId, hashToken: calcolaHashToken("gau-<n>-<k>"), scadenza: T + 1 h })`; «valida» = `trovaSessione(hash, T)` non è `null`.
- **Invariato:** dopo un errore, `trovaAusiliario(id)` restituisce gli stessi dati di prima; per la creazione, il numero di Ausiliari di `ausiliariPerEnte()` non cambia e `trovaUtentePerEmail(email)` restituisce quello che restituiva prima (`null` per un'email nuova, lo stesso utente per un'email già registrata, come in TF-GAU-03).
- Password dimostrativa degli Ausiliari del README: `Demo-Ausiliario-2026` (solo per verificare l'accesso dopo una modifica). La password dell'Amministratore non è mai usata.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                    | id      | Contenuto                                                                                                |
| :------------------------- | :------ | :------------------------------------------------------------------------------------------------------- |
| `amministratore`           | 1       | Marco Esposito                                                                                           |
| `ausiliario_del_traffico`  | 2       | Paolo Ferri, ente 1, `ATTIVO`; segnalazione 5 `PRESA_IN_CARICO`; segnalazioni 1 e 6 `CHIUSA`; verifica 2 |
| `ausiliario_del_traffico`  | 3       | Sara Galli, ente 1, `ATTIVO`; segnalazioni 4 e 10 `PRESA_IN_CARICO`; segnalazione 3 `CHIUSA`; verifica 1 |
| `ausiliario_del_traffico`  | 4       | Luca Russo, ente 1, `DISATTIVATO`                                                                        |
| `ausiliario_del_traffico`  | 5       | Anna Moretti, `anna.moretti@omnipark.example`, ente 2, `ATTIVO`, nessuna presa in carico                 |
| `ausiliario_del_traffico`  | 6       | Giorgio Marino, `giorgio.marino@omnipark.example`, ente 3, `ATTIVO`, nessuna presa in carico             |
| `utente` / `automobilista` | 8       | `marco.rossi@omnipark.example`                                                                           |
| `ente_preposto`            | 1, 2, 3 | Gragnano, Fisciano, Baronissi                                                                            |

Id inesistente: `999999`.

## 4. Categorie e scelte

**ausiliariPerEnte:** più Ausiliari di più enti, attivi e disattivati.

**creaAusiliario**

- Email: nuova · già registrata, anche con maiuscole diverse [error] · non valida [error] · vuota [error].
- Password: valida · esattamente 8 caratteri accentati [single] · troppo corta [error] · vuota [error].
- Ente: esistente · inesistente [error] · assente [error].
- Nome e cognome: presenti · con spazi ai lati [single] · di soli spazi [error].

**aggiornaAusiliario**

- Ausiliario: esistente attivo · esistente disattivato [single] · inesistente [error] · id di un utente con un altro ruolo [error].
- Email: invariata · invariata con maiuscole diverse [single] · nuova · di un altro utente [error] · non valida [error].
- Ente: invariato · diverso, senza prese in carico · diverso, con prese in carico [error] · inesistente [error].
- Dati: completi · cognome vuoto [error].

**disattivaAusiliario**

- Ausiliario: attivo · già disattivato [error] · inesistente [error] · id di un utente con un altro ruolo [error].
- Segnalazioni `PRESA_IN_CARICO`: nessuna · almeno una [error].
- Effetti: sessioni chiuse · accesso negato con `ACCOUNT_DISATTIVATO` · segnalazioni e verifiche conservate.

Le [error] si combinano con i dati validi predefiniti; le [single] compaiono in un solo frame.

## 5. Test frame (31)

| Frame     | Operazione e dati (rispetto ai predefiniti)                                                                                                         | Esito atteso                                                                                                                                                                                                                                                                                                                | Riferimento |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-GAU-01 | `ausiliariPerEnte()`                                                                                                                                | 5 elementi in ordine: Marino (Comune di Baronissi), Moretti (Comune di Fisciano), Ferri, Galli, Russo (Comune di Gragnano); Russo `DISATTIVATO`, gli altri `ATTIVO`; `ente` è il nome dell'ente, `enteId` coerente                                                                                                          | RF_ADM_2    |
| TF-GAU-02 | `creaAusiliario(1, dati predefiniti 02)`                                                                                                            | restituisce l'Ausiliario `ATTIVO`, ente 2 «Comune di Fisciano»; `utente.hash_password` inizia con `$scrypt$` ed è diverso dalla password; esiste la riga (1, id) in `gestione_account_ausiliario`; `accedi("gau.02@test.example", "parola-di-prova-lunga")` apre una sessione con ruolo `AUSILIARIO_DEL_TRAFFICO` ed ente 2 | RF_ADM_2    |
| TF-GAU-03 | `creaAusiliario` con email `PAOLO.FERRI@omnipark.example`                                                                                           | `EMAIL_GIA_REGISTRATA`; invariato                                                                                                                                                                                                                                                                                           | VD_1        |
| TF-GAU-04 | `creaAusiliario` con email `senza-chiocciola`                                                                                                       | `EMAIL_NON_VALIDA`; invariato                                                                                                                                                                                                                                                                                               | ISSUE_39    |
| TF-GAU-05 | `creaAusiliario` con password `corta77` (7 caratteri)                                                                                               | `PASSWORD_TROPPO_CORTA`; invariato                                                                                                                                                                                                                                                                                          | ISSUE_39    |
| TF-GAU-06 | `creaAusiliario` con password `àèìòùàèì` (8 caratteri accentati)                                                                                    | Ausiliario creato; `accedi` con quella password apre una sessione                                                                                                                                                                                                                                                           | ISSUE_39    |
| TF-GAU-07 | `creaAusiliario` con ente 999999                                                                                                                    | `ENTE_INESISTENTE`; invariato                                                                                                                                                                                                                                                                                               | RF_ADM_2    |
| TF-GAU-08 | `creaAusiliario` con nome `"   "`                                                                                                                   | `DATI_INCOMPLETI`; invariato                                                                                                                                                                                                                                                                                                | RF_ADM_2    |
| TF-GAU-09 | `creaAusiliario` con password `""`                                                                                                                  | `DATI_INCOMPLETI`; invariato                                                                                                                                                                                                                                                                                                | RF_ADM_2    |
| TF-GAU-10 | `creaAusiliario` con email `""`                                                                                                                     | `DATI_INCOMPLETI`; invariato                                                                                                                                                                                                                                                                                                | RF_ADM_2    |
| TF-GAU-11 | `creaAusiliario` con ente `null`                                                                                                                    | `DATI_INCOMPLETI`; invariato                                                                                                                                                                                                                                                                                                | RF_ADM_2    |
| TF-GAU-12 | `creaAusiliario` con nome `"  Nome12 "` e cognome `" Cognome12  "`                                                                                  | Ausiliario creato con nome `Nome12` e cognome `Cognome12`                                                                                                                                                                                                                                                                   | ISSUE_39    |
| TF-GAU-13 | `aggiornaAusiliario(6, { nome: "Giorgio Maria", cognome: "Marino", email: "giorgio.marino@omnipark.example", ente: 3 })`                            | restituisce nome «Giorgio Maria», email ed ente invariati, stato `ATTIVO`                                                                                                                                                                                                                                                   | RF_ADM_2    |
| TF-GAU-14 | `aggiornaAusiliario(6, …)` con email `Giorgio.Marino@omnipark.example`, gli altri dati come TF-GAU-13                                               | accettato: email salvata come indicata; `accedi("giorgio.marino@omnipark.example", "Demo-Ausiliario-2026")` apre una sessione                                                                                                                                                                                               | ISSUE_39    |
| TF-GAU-15 | `aggiornaAusiliario(5, { nome: "Anna", cognome: "Moretti", email: "anna.moretti.nuova@test.example", ente: 2 })`                                    | restituisce la nuova email; `accedi("anna.moretti.nuova@test.example", "Demo-Ausiliario-2026")` apre una sessione; con la vecchia email `CREDENZIALI_NON_VALIDE`                                                                                                                                                            | RF_ADM_2    |
| TF-GAU-16 | `aggiornaAusiliario(5, …)` con email `marco.rossi@omnipark.example`                                                                                 | `EMAIL_GIA_REGISTRATA`; invariato                                                                                                                                                                                                                                                                                           | VD_1        |
| TF-GAU-17 | `aggiornaAusiliario(5, …)` con email `senza-chiocciola`                                                                                             | `EMAIL_NON_VALIDA`; invariato                                                                                                                                                                                                                                                                                               | ISSUE_39    |
| TF-GAU-18 | `aggiornaAusiliario(5, …)` con cognome `""`                                                                                                         | `DATI_INCOMPLETI`; invariato                                                                                                                                                                                                                                                                                                | RF_ADM_2    |
| TF-GAU-19 | `aggiornaAusiliario(5, …)` con ente 999999                                                                                                          | `ENTE_INESISTENTE`; invariato                                                                                                                                                                                                                                                                                               | RF_ADM_2    |
| TF-GAU-20 | `aggiornaAusiliario(999999, dati predefiniti 20)`                                                                                                   | `AUSILIARIO_INESISTENTE`                                                                                                                                                                                                                                                                                                    | RF_ADM_2    |
| TF-GAU-21 | `aggiornaAusiliario(8, dati predefiniti 21)` (8 è un Automobilista)                                                                                 | `AUSILIARIO_INESISTENTE`; l'utente 8 è invariato                                                                                                                                                                                                                                                                            | NRF_SIC_1   |
| TF-GAU-22 | `aggiornaAusiliario(6, { nome: "Giorgio Maria", cognome: "Marino", email: "giorgio.marino@omnipark.example", ente: 2 })` (nessuna presa in carico)  | restituisce ente 2 «Comune di Fisciano»                                                                                                                                                                                                                                                                                     | NRF_SIC_1   |
| TF-GAU-23 | `aggiornaAusiliario(3, { nome: "Sara", cognome: "Galli", email: "sara.galli@omnipark.example", ente: 2 })` (2 prese in carico)                      | `CAMBIO_ENTE_NON_CONSENTITO`; Sara resta all'ente 1                                                                                                                                                                                                                                                                         | VD_18       |
| TF-GAU-24 | `aggiornaAusiliario(3, { nome: "Sara Maria", cognome: "Galli", email: "sara.galli@omnipark.example", ente: 1 })` (stesso ente, con prese in carico) | restituisce nome «Sara Maria», ente 1                                                                                                                                                                                                                                                                                       | RF_ADM_2    |
| TF-GAU-25 | `aggiornaAusiliario(4, { nome: "Luca Andrea", cognome: "Russo", email: "luca.russo@omnipark.example", ente: 1 })` (Ausiliario disattivato)          | restituisce nome «Luca Andrea» e stato `DISATTIVATO` (nessuna riattivazione)                                                                                                                                                                                                                                                | RF_ADM_2    |
| TF-GAU-26 | Ausiliario creato con `creaAusiliario(1, dati predefiniti 26)`, due sessioni di prova; `disattivaAusiliario(id)`                                    | restituisce stato `DISATTIVATO`; nessuna delle due sessioni è più valida; `accedi("gau.26@test.example", "parola-di-prova-lunga")` → `ACCOUNT_DISATTIVATO`                                                                                                                                                                  | RF_ADM_2    |
| TF-GAU-27 | sessione di prova di Sara (3); `disattivaAusiliario(3)` (prese in carico 4 e 10)                                                                    | `AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO`; Sara resta `ATTIVO`; la sua sessione è ancora valida                                                                                                                                                                                                                         | VD_19       |
| TF-GAU-28 | `chiudiSegnalazione(pool, 5, 2, "NON_CONFERMATA", T)` (Paolo non ha più prese in carico); `disattivaAusiliario(2)`                                  | restituisce `DISATTIVATO`; le segnalazioni 1, 5 e 6 sono ancora `CHIUSA` e assegnate a 2 con il loro esito; la verifica 2 è ancora registrata da 2                                                                                                                                                                          | VD_19       |
| TF-GAU-29 | `disattivaAusiliario(4)` (già disattivato)                                                                                                          | `AUSILIARIO_GIA_DISATTIVATO`                                                                                                                                                                                                                                                                                                | RF_ADM_2    |
| TF-GAU-30 | `disattivaAusiliario(999999)`                                                                                                                       | `AUSILIARIO_INESISTENTE`                                                                                                                                                                                                                                                                                                    | RF_ADM_2    |
| TF-GAU-31 | sessione di prova dell'utente 8; `disattivaAusiliario(8)` (un Automobilista)                                                                        | `AUSILIARIO_INESISTENTE`; la sessione dell'utente 8 è ancora valida                                                                                                                                                                                                                                                         | NRF_SIC_1   |

Totale 31: 1 sull'elenco, 11 sulla creazione, 13 sulla modifica, 6 sulla disattivazione.

Note sui riferimenti:

- TF-GAU-03, 16: VD_1 (email unica tra tutti gli Utente, senza distinzione tra maiuscole e minuscole come in `accedi`).
- TF-GAU-04, 05, 06, 12, 14, 17: ISSUE_39 e piano approvato (stesse regole della registrazione; password iniziale, decisione D1; nome e cognome senza spazi ai lati).
- TF-GAU-21, 22, 31: NRF_SIC_1 (l'ente dell'account stabilisce i dati accessibili; un id di un altro ruolo non è un Ausiliario).
- TF-GAU-23: VD_18 (decisione D2): dopo il cambio di ente le prese in carico sarebbero assegnate a un Ausiliario di un altro ente.
- TF-GAU-26: RF_ADM_2 e RF_AUTH_4 / `UC_AUTH_4` 2.a2 (l'account disattivato non accede più); la chiusura delle sessioni è VD_19 (`cp_persistenza_utenti_enti_veicoli.md` TF-UEV-26).
- TF-GAU-27, 28: VD_19 e `UC_ADM_2` 3.a1, 3.a2.

## 6. Precisazioni rispetto al RAD

- **Password iniziale (decisione D1).** `UC_ADM_2` passo 4 elenca nome, cognome, email ed ente; il class diagram assegna la `password` a ogni `Utente`, quindi un account nuovo ne ha bisogno. Alla sola creazione l'Amministratore inserisce una password iniziale, che comunica all'Ausiliario fuori dal sistema, con le stesse regole e lo stesso hash della registrazione. La modifica non cambia la password; non c'è un caso d'uso di cambio password. `docs/rad/` resta invariato.
- **Cambio di ente con segnalazioni prese in carico (decisione D2).** `UC_ADM_2` non ne parla. VD_18 stabilisce che una segnalazione è assegnata solo a un Ausiliario dell'ente competente: il cambio di ente con segnalazioni `Presa in carico` violerebbe il vincolo e nessuno potrebbe più chiuderle (stessa ragione di VD_19). Il cambio è rifiutato con `CAMBIO_ENTE_NON_CONSENTITO`.
- **Vincolo per COD-22 (presa in carico, UC_OP_2).** La disattivazione blocca la riga dell'Ausiliario (`FOR UPDATE`) e conta le sue prese in carico nella stessa transazione. Quando COD-22 realizzerà la presa in carico, dovrà leggere la riga dell'Ausiliario con `FOR SHARE` e verificare che sia `ATTIVO` nella stessa transazione dell'aggiornamento della segnalazione, così una presa in carico non si sovrappone a una disattivazione. Oggi nessun servizio chiama `prendiInCarico` della persistenza.
- **2.a1 (nessun Ausiliario).** Il dataset ha sempre degli Ausiliari; l'elenco vuoto è coperto dall'interfaccia (`cp_amministrazioneInterfaccia.md`).
