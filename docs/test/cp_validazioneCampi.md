# cp_validazioneCampi

Specifica dei casi di test (category partition) della validazione dei form lato client: funzioni pure di `src/presentation/logica/validazione.ts`, usate dai form di accesso, registrazione e targhe.
Requisiti: RF_AUTH_1 (registrazione), RF_AUTH_4 (accesso), RF_AUTH_5 (targhe), NRF_USA_1 (errori comprensibili accanto al campo). Task OMP-57 (issue #28).

- **Fonti dell'esito atteso:** `UC_AUTH_1` (2.a2: il Sistema indica il campo da correggere), `UC_AUTH_4`, `UC_AUTH_5` (4.a1), scenario SC_UT_1 (email, password, targa; nessuna conferma della password), regole del server che la validazione riprende (`EMAIL_NON_VALIDA`, `PASSWORD_TROPPO_CORTA`, `TARGA_NON_VALIDA`: `cp_registraAutomobilista.md`, `cp_targhe.md`), piano approvato di OMP-57.
- **File di test:** `src/presentation/logica/validazione.test.ts`, eseguito da `npm test` (ambiente node, senza database).
- **Il server resta l'unica autorità.** La validazione lato client duplica le regole del server solo per dare un riscontro immediato: email con lo stesso formato (`/^[^@\s]+@[^@\s]+$/`), password di almeno 8 caratteri contati come caratteri Unicode, targa normalizzata (senza spazi, in maiuscolo) nel formato `AB123CD`. Un errore restituito dal server si mostra comunque accanto al campo (`cp_risposteApi.md`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_28` per le scelte dell'issue #28 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_AUTH_5 · TF-VAL-14 · targa con minuscole e spazi → valida`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/validazione.ts — nessuna dipendenza da React né dai sottosistemi
validaEmail(email: string): string | null;            // null se valida, altrimenti il messaggio
validaPasswordNuova(password: string): string | null; // registrazione: almeno 8 caratteri
validaPasswordAccesso(password: string): string | null; // accesso: solo non vuota
normalizzaTarga(targa: string): string;               // senza spazi, in maiuscolo
validaTarga(targa: string): string | null;            // formato AB123CD dopo la normalizzazione
validaRegistrazione(dati: { email: string; password: string; targa: string })
  : Partial<Record<"email" | "password" | "targa", string>>; // un messaggio per ogni campo non valido
validaAccesso(dati: { email: string; password: string })
  : Partial<Record<"email" | "password", string>>;
```

Messaggi (in italiano, mostrati accanto al campo):

| Caso                                   | Messaggio                                        |
| :------------------------------------- | :----------------------------------------------- |
| email vuota                            | `Inserisci l'email.`                             |
| email non valida                       | `L'email non è valida.`                          |
| password vuota                         | `Inserisci la password.`                         |
| password nuova con meno di 8 caratteri | `La password deve avere almeno 8 caratteri.`     |
| targa vuota (dopo la normalizzazione)  | `Inserisci la targa.`                            |
| targa non valida                       | `La targa non è valida: usa il formato AB123CD.` |

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM. I valori dei frame sono letterali.

## 4. Categorie e scelte

**Email:** valida · vuota [error] · senza `@` [error] · con uno spazio [error].

**Password nuova (registrazione):** esattamente 8 caratteri · 8 caratteri accentati (8 caratteri Unicode) [single] · 7 caratteri [error] · vuota [error].

**Password di accesso:** non vuota, anche più corta di 8 caratteri · vuota [error].

**Targa:** `AB123CD` · scritta con minuscole e spazi [single] · con spazi all'inizio e alla fine [single] · con un trattino [error] · con due cifre [error] · con quattro cifre [error] · vuota o di soli spazi [error].

**Form completo:** tutti i campi validi · tutti i campi non validi.

## 5. Test frame (23)

| Frame     | Chiamata                                                                                                     | Esito atteso                                                                                                                                          | Riferimento |
| :-------- | :----------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-VAL-01 | `validaEmail("elena.bianchi@omnipark.example")`                                                              | `null`                                                                                                                                                | RF_AUTH_1   |
| TF-VAL-02 | `validaEmail("")`                                                                                            | `"Inserisci l'email."`                                                                                                                                | RF_AUTH_1   |
| TF-VAL-03 | `validaEmail("elena.bianchi")`                                                                               | `"L'email non è valida."`                                                                                                                             | RF_AUTH_1   |
| TF-VAL-04 | `validaEmail("elena bianchi@omnipark.example")`                                                              | `"L'email non è valida."`                                                                                                                             | RF_AUTH_1   |
| TF-VAL-05 | `validaPasswordNuova("abcdefgh")`                                                                            | `null`                                                                                                                                                | RF_AUTH_1   |
| TF-VAL-06 | `validaPasswordNuova("àèìòùàèì")`                                                                            | `null`                                                                                                                                                | RF_AUTH_1   |
| TF-VAL-07 | `validaPasswordNuova("abcdefg")`                                                                             | `"La password deve avere almeno 8 caratteri."`                                                                                                        | RF_AUTH_1   |
| TF-VAL-08 | `validaPasswordNuova("")`                                                                                    | `"Inserisci la password."`                                                                                                                            | RF_AUTH_1   |
| TF-VAL-09 | `validaPasswordAccesso("abc")`                                                                               | `null`                                                                                                                                                | RF_AUTH_4   |
| TF-VAL-10 | `validaPasswordAccesso("")`                                                                                  | `"Inserisci la password."`                                                                                                                            | RF_AUTH_4   |
| TF-VAL-11 | `validaTarga("AB123CD")`                                                                                     | `null`                                                                                                                                                | RF_AUTH_5   |
| TF-VAL-12 | `normalizzaTarga("ab 123 cd")`                                                                               | `"AB123CD"`                                                                                                                                           | RF_AUTH_5   |
| TF-VAL-13 | `normalizzaTarga("  ab123cd  ")`                                                                             | `"AB123CD"`                                                                                                                                           | RF_AUTH_5   |
| TF-VAL-14 | `validaTarga("ab 123 cd")`                                                                                   | `null`                                                                                                                                                | RF_AUTH_5   |
| TF-VAL-15 | `validaTarga("AB-123-CD")`                                                                                   | `"La targa non è valida: usa il formato AB123CD."`                                                                                                    | RF_AUTH_5   |
| TF-VAL-16 | `validaTarga("AB12CD")`                                                                                      | `"La targa non è valida: usa il formato AB123CD."`                                                                                                    | RF_AUTH_5   |
| TF-VAL-17 | `validaTarga("AB1234CD")`                                                                                    | `"La targa non è valida: usa il formato AB123CD."`                                                                                                    | RF_AUTH_5   |
| TF-VAL-18 | `validaTarga("   ")`                                                                                         | `"Inserisci la targa."`                                                                                                                               | RF_AUTH_5   |
| TF-VAL-19 | `validaRegistrazione({ email: "elena.bianchi@omnipark.example", password: "abcdefgh", targa: "ef 456 gh" })` | `{}`                                                                                                                                                  | RF_AUTH_1   |
| TF-VAL-20 | `validaRegistrazione({ email: "elena", password: "corta", targa: "12-AB" })`                                 | `{ email: "L'email non è valida.", password: "La password deve avere almeno 8 caratteri.", targa: "La targa non è valida: usa il formato AB123CD." }` | RF_AUTH_1   |
| TF-VAL-21 | `validaAccesso({ email: "marco.rossi@omnipark.example", password: "x" })`                                    | `{}`                                                                                                                                                  | RF_AUTH_4   |
| TF-VAL-22 | `validaAccesso({ email: "", password: "" })`                                                                 | `{ email: "Inserisci l'email.", password: "Inserisci la password." }`                                                                                 | RF_AUTH_4   |
| TF-VAL-23 | `validaAccesso({ email: "marco.rossi", password: "x" })`                                                     | `{ email: "L'email non è valida." }`                                                                                                                  | RF_AUTH_4   |

Totale 23: 4 sull'email, 4 sulla password nuova, 2 sulla password di accesso, 8 sulla targa, 5 sui form completi.

Note sui riferimenti:

- TF-VAL-01…08, 19, 20: RF_AUTH_1 e `UC_AUTH_1` 2.a2 (dati incompleti o non validi: il campo da correggere). Le regole sono le stesse del server (`EMAIL_NON_VALIDA`, `PASSWORD_TROPPO_CORTA`); TF-VAL-06 verifica che i caratteri si contino come caratteri Unicode, come il server.
- TF-VAL-09, 10, 21…23: RF_AUTH_4. Nel form di accesso la password non si controlla per lunghezza: le credenziali le verifica solo il server, che non dice quale dato è sbagliato (`UC_AUTH_4` 2.a1).
- TF-VAL-11…18: RF_AUTH_5 e `UC_AUTH_5` 4.a1; la normalizzazione (TF-VAL-12…14) è la stessa del server (`cp_targhe.md` TF-02), categoria minima dell'issue «formato AB123CD, anche scritta con minuscole e spazi».

## 6. Note

- Nessuna conferma della password: lo scenario SC_UT_1 prevede solo email, password e targa (decisione D5 del piano).
- **Già verificati altrove** (nessun frame qui): le regole del server, `cp_registraAutomobilista.md`, `cp_accedi.md`, `cp_targhe.md`; la visualizzazione dei messaggi accanto ai campi si verifica a mano (nessun test dei componenti React, nessuna dipendenza nuova).
