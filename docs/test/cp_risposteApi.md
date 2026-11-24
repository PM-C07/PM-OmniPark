# cp_risposteApi

Specifica dei casi di test (category partition) dell'interpretazione delle risposte delle API nell'interfaccia: funzioni pure di `src/presentation/logica/risposteApi.ts`, usate dai form di accesso, registrazione e targhe e dall'intestazione delle aree.
Requisiti: RF_AUTH_1, RF_AUTH_4, RF_AUTH_5, NRF_USA_1 (errori comprensibili accanto al campo). Task OMP-57 (issue #28).

- **Fonti dell'esito atteso:** formato degli errori delle API `{ errore: { codice, messaggio } }` e tabella codici → status (`cp_apiAccesso.md` §2), `UC_AUTH_1` 2.a1 e 2.a2, `UC_AUTH_4` 2.a1 e 2.a2, `UC_AUTH_5` 3.a2 e 4.a1, issue #28 (risposta delle API: successo; errore di dominio → messaggio accanto al campo; 401 → ritorno a `/accesso`), piano approvato di OMP-57 (mappe codice → campo).
- **File di test:** `src/presentation/logica/risposteApi.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_28` per le scelte dell'issue #28 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_AUTH_1 · TF-RAP-04 · EMAIL_GIA_REGISTRATA nella registrazione → campo email`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/risposteApi.ts — nessuna dipendenza da React né dai sottosistemi
type EsitoRisposta =
  | { esito: "successo"; dati: unknown }
  | { esito: "errore"; campo: string; messaggio: string } // campo "generale" se il codice non ha un campo
  | { esito: "sessioneScaduta" };                       // il chiamante porta su /accesso
interpretaRisposta(status: number, corpo: unknown, campiPerCodice: Readonly<Record<string, string>>): EsitoRisposta;
erroreDiRete(): EsitoRisposta;                          // la richiesta non è arrivata al server
chiamaApi(url: string, opzioni: RequestInit, campiPerCodice: Readonly<Record<string, string>>)
  : Promise<EsitoRisposta>;                             // fetch + interpretaRisposta, o erroreDiRete se fetch fallisce

const CAMPI_REGISTRAZIONE;     // EMAIL_NON_VALIDA, EMAIL_GIA_REGISTRATA → "email"; PASSWORD_TROPPO_CORTA → "password"; TARGA_NON_VALIDA → "targa"
const CAMPI_ACCESSO;           // nessun codice: credenziali errate e account disattivato vanno sull'avviso generale
const CAMPI_AGGIUNTA_TARGA;    // TARGA_NON_VALIDA, TARGA_GIA_PRESENTE → "targa"
const CAMPI_RIMOZIONE_TARGA;   // ULTIMA_TARGA, TARGA_CON_SOSTA_ATTIVA, TARGA_NON_PRESENTE → "riga" (accanto alla targa da rimuovere)
```

Regole, in quest'ordine:

1. status da 200 a 299 → `{ esito: "successo", dati: corpo }` (anche con corpo `null`, per esempio la risposta 204 dell'uscita);
2. corpo con `errore.codice` uguale a `SESSIONE_NON_VALIDA` → `{ esito: "sessioneScaduta" }`;
3. corpo nella forma `{ errore: { codice, messaggio } }`, con codice e messaggio stringhe non vuote → `{ esito: "errore", campo: campiPerCodice[codice] ?? "generale", messaggio }`: il messaggio è quello in italiano dell'errore di dominio;
4. altrimenti (corpo assente o di forma diversa) → `{ esito: "errore", campo: "generale", messaggio: "Si è verificato un errore. Riprova più tardi." }`.

`erroreDiRete()` → `{ esito: "errore", campo: "generale", messaggio: "Impossibile contattare il server. Controlla la connessione e riprova." }`.

Il 401 `CREDENZIALI_NON_VALIDE` del form di accesso non è una sessione scaduta: è un errore da mostrare (regola 3).

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM. I corpi dei frame sono oggetti letterali con i codici e i messaggi delle API; `<msg>` indica il messaggio del frame, restituito invariato.

## 4. Categorie e scelte

**Status:** 2xx (200, 201, 204) · 401 · 403 · 404 · 409 · 422 · 500.

**Corpo:** dati di successo · `null` · errore di dominio con codice mappato a un campo · errore con codice senza campo · errore `SESSIONE_NON_VALIDA` · forma non riconosciuta [error].

**Mappa dei campi:** registrazione · accesso · aggiunta di una targa · rimozione di una targa.

**Rete:** risposta ricevuta · richiesta non arrivata [single].

## 5. Test frame (19)

| Frame     | Chiamata                                                                                                                                       | Esito atteso                                                                                                                 | Riferimento |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-RAP-01 | `interpretaRisposta(200, { utente: { id: 8, ruolo: "AUTOMOBILISTA", ente: null } }, CAMPI_ACCESSO)`                                            | `{ esito: "successo", dati: <corpo> }`                                                                                       | RF_AUTH_4   |
| TF-RAP-02 | `interpretaRisposta(201, { targhe: [{ veicolo: 3, targa: "MN234PQ" }] }, CAMPI_AGGIUNTA_TARGA)`                                                | `{ esito: "successo", dati: <corpo> }`                                                                                       | RF_AUTH_5   |
| TF-RAP-03 | `interpretaRisposta(204, null, CAMPI_ACCESSO)`                                                                                                 | `{ esito: "successo", dati: null }`                                                                                          | RF_AUTH_4   |
| TF-RAP-04 | `interpretaRisposta(409, { errore: { codice: "EMAIL_GIA_REGISTRATA", messaggio: "L'email è già registrata." } }, CAMPI_REGISTRAZIONE)`         | `{ esito: "errore", campo: "email", messaggio: "L'email è già registrata." }`                                                | RF_AUTH_1   |
| TF-RAP-05 | `interpretaRisposta(422, { errore: { codice: "EMAIL_NON_VALIDA", messaggio: <msg> } }, CAMPI_REGISTRAZIONE)`                                   | `{ esito: "errore", campo: "email", messaggio: <msg> }`                                                                      | RF_AUTH_1   |
| TF-RAP-06 | `interpretaRisposta(422, { errore: { codice: "PASSWORD_TROPPO_CORTA", messaggio: <msg> } }, CAMPI_REGISTRAZIONE)`                              | `{ esito: "errore", campo: "password", messaggio: <msg> }`                                                                   | RF_AUTH_1   |
| TF-RAP-07 | `interpretaRisposta(422, { errore: { codice: "TARGA_NON_VALIDA", messaggio: <msg> } }, CAMPI_REGISTRAZIONE)`                                   | `{ esito: "errore", campo: "targa", messaggio: <msg> }`                                                                      | RF_AUTH_1   |
| TF-RAP-08 | `interpretaRisposta(422, { errore: { codice: "RICHIESTA_NON_VALIDA", messaggio: <msg> } }, CAMPI_REGISTRAZIONE)`                               | `{ esito: "errore", campo: "generale", messaggio: <msg> }`                                                                   | ISSUE_28    |
| TF-RAP-09 | `interpretaRisposta(401, { errore: { codice: "CREDENZIALI_NON_VALIDE", messaggio: "Email o password non corrette." } }, CAMPI_ACCESSO)`        | `{ esito: "errore", campo: "generale", messaggio: "Email o password non corrette." }` (non `sessioneScaduta`)                | RF_AUTH_4   |
| TF-RAP-10 | `interpretaRisposta(403, { errore: { codice: "ACCOUNT_DISATTIVATO", messaggio: <msg> } }, CAMPI_ACCESSO)`                                      | `{ esito: "errore", campo: "generale", messaggio: <msg> }`                                                                   | RF_AUTH_4   |
| TF-RAP-11 | `interpretaRisposta(401, { errore: { codice: "SESSIONE_NON_VALIDA", messaggio: <msg> } }, CAMPI_AGGIUNTA_TARGA)`                               | `{ esito: "sessioneScaduta" }`                                                                                               | NRF_SIC_1   |
| TF-RAP-12 | `interpretaRisposta(409, { errore: { codice: "TARGA_GIA_PRESENTE", messaggio: <msg> } }, CAMPI_AGGIUNTA_TARGA)`                                | `{ esito: "errore", campo: "targa", messaggio: <msg> }`                                                                      | RF_AUTH_5   |
| TF-RAP-13 | `interpretaRisposta(422, { errore: { codice: "TARGA_NON_VALIDA", messaggio: <msg> } }, CAMPI_AGGIUNTA_TARGA)`                                  | `{ esito: "errore", campo: "targa", messaggio: <msg> }`                                                                      | RF_AUTH_5   |
| TF-RAP-14 | `interpretaRisposta(409, { errore: { codice: "ULTIMA_TARGA", messaggio: <msg> } }, CAMPI_RIMOZIONE_TARGA)`                                     | `{ esito: "errore", campo: "riga", messaggio: <msg> }`                                                                       | RF_AUTH_5   |
| TF-RAP-15 | `interpretaRisposta(409, { errore: { codice: "TARGA_CON_SOSTA_ATTIVA", messaggio: <msg> } }, CAMPI_RIMOZIONE_TARGA)`                           | `{ esito: "errore", campo: "riga", messaggio: <msg> }`                                                                       | RF_AUTH_5   |
| TF-RAP-16 | `interpretaRisposta(500, { errore: { codice: "ERRORE_INTERNO", messaggio: "Si è verificato un errore. Riprova più tardi." } }, CAMPI_ACCESSO)` | `{ esito: "errore", campo: "generale", messaggio: "Si è verificato un errore. Riprova più tardi." }`                         | ISSUE_28    |
| TF-RAP-17 | `interpretaRisposta(502, "<html>Bad gateway</html>", CAMPI_ACCESSO)`                                                                           | `{ esito: "errore", campo: "generale", messaggio: "Si è verificato un errore. Riprova più tardi." }`                         | ISSUE_28    |
| TF-RAP-18 | `erroreDiRete()`                                                                                                                               | `{ esito: "errore", campo: "generale", messaggio: "Impossibile contattare il server. Controlla la connessione e riprova." }` | ISSUE_28    |
| TF-RAP-19 | `interpretaRisposta(404, { errore: { codice: "TARGA_NON_PRESENTE", messaggio: <msg> } }, CAMPI_RIMOZIONE_TARGA)`                               | `{ esito: "errore", campo: "riga", messaggio: <msg> }`                                                                       | ISSUE_28    |

Totale 19: 3 di successo, 13 di errore di dominio (uno per codice dei form, compreso il 401 che non è una sessione scaduta), 1 di sessione scaduta, 2 di forma non riconosciuta o rete.

Note sui riferimenti:

- TF-RAP-04…07: RF_AUTH_1 e `UC_AUTH_1` 2.a1, 2.a2 (il Sistema indica il campo da correggere); il messaggio è quello del dominio, in italiano.
- TF-RAP-09, 10: RF_AUTH_4 e `UC_AUTH_4` 2.a1 (credenziali errate senza indicare quale dato è sbagliato: avviso generale), 2.a2 (account disattivato).
- TF-RAP-11: categoria minima dell'issue «401 → ritorno a `/accesso`»: solo `SESSIONE_NON_VALIDA` porta su `/accesso` (`indirizzoDiAccesso`, `cp_navigazioneRuoli.md` TF-NAV-31).
- TF-RAP-12…15: RF_AUTH_5 e `UC_AUTH_5` 4.a1 (targa non valida o già nel profilo, accanto al campo) e 3.a2 (unica targa o targa con sosta attiva, accanto alla targa da rimuovere).
- TF-RAP-19: `TARGA_NON_PRESENTE` (404, `cp_apiAccesso.md` TF-ACC-28) non è un'alternativa di `UC_AUTH_5`: capita se la targa è già stata rimossa, per esempio da un'altra scheda. Il piano approvato di OMP-57 lo mette accanto alla targa da rimuovere, come gli altri errori della rimozione: riferimento `ISSUE_28`.

## 6. Note

- **Già verificati altrove** (nessun frame qui): codici e status delle API, `cp_apiAccesso.md`; la visualizzazione dei messaggi nei form si verifica a mano.
- **`chiamaApi`: nessun frame.** È un involucro di `fetch` che legge il corpo (JSON, testo o vuoto) e delega a `interpretaRisposta`, o a `erroreDiRete` se la richiesta non arriva al server: le regole che applica sono quelle dei frame TF-RAP-01…19. Si verifica a mano con i form, senza simulare `fetch` (nessuna dipendenza nuova).
