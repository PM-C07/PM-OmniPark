# cp_amministrazioneInterfaccia

Specifica dei casi di test (category partition) della logica delle schermate dell'Amministratore: funzioni pure di `src/presentation/logica/amministrazione.ts`, usate dai boundary `:PanoramicaEnti` (`MU_5`, `/admin`) e `:SchermataAusiliari` (`MU_6`, `/admin/ausiliari`).
Requisiti: RF_ADM_1 (panoramica degli enti), RF_ADM_2 (gestione degli account degli Ausiliari), NRF_USA_1 (errori comprensibili accanto al campo). Task OMP-62 (issue #39).

- **Fonti dell'esito atteso:** `UC_ADM_1` (passi 2 e 4, flussi 2.a1 e 4.a1), `UC_ADM_2` (passi 2, 4, 6, flussi 2.a1, 3.a2, 5.a1, 6.a1), `np_03_amministratore` (pannelli Riepilogo, Modulo Ausiliario e Conferma disattivazione; errori «Riepilogo non disponibile», «Dati incompleti o email già usata», «Ausiliario con segnalazioni Prese in carico»), `cp_apiAmministrazione.md` §2 (corpi e codici), `cp_validazioneCampi.md` (regole e messaggi di email e password), `cp_risposteApi.md` (`interpretaRisposta`), piano approvato di OMP-62 (punto 7, decisione D1).
- **File di test:** `src/presentation/logica/amministrazione.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_39` per le scelte dell'issue #39 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_ADM_1 · TF-AMMUI-19 · riepilogo in errore → Riepilogo non disponibile`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/amministrazione.ts — nessuna dipendenza da React né dai sottosistemi
type ModuloAusiliario = { nome: string; cognome: string; email: string; password: string; ente: string }; // ente: valore del select
type Modalita = "creazione" | "modifica";
type CampoModulo = "nome" | "cognome" | "email" | "password" | "ente";
type AusiliarioDellElenco = {
  id: number; email: string; nome: string; cognome: string;
  enteId: number; ente: string; statoDellAccount: string;
};
type RiepilogoCaricato =
  | { stato: "caricamento" }
  | { stato: "pronto"; stalliGestiti: number; sosteAttive: number; segnalazioniAperte: number }
  | { stato: "errore" };

validaModuloAusiliario(dati: ModuloAusiliario, modalita: Modalita): Partial<Record<CampoModulo, string>>;
corpoAusiliario(dati: ModuloAusiliario, modalita: Modalita)
  : { nome: string; cognome: string; email: string; ente: number; password?: string };
moduloDa(ausiliario: AusiliarioDellElenco): ModuloAusiliario;            // modulo già compilato per la modifica
raggruppaPerEnte(ausiliari: readonly AusiliarioDellElenco[])
  : { enteId: number; ente: string; ausiliari: AusiliarioDellElenco[] }[]; // gruppi nell'ordine di arrivo
righePanoramica(enti: readonly { id: number; nome: string }[], riepiloghi: ReadonlyMap<number, RiepilogoCaricato>)
  : { id: number; ente: string; celle: [string, string, string] }[];       // stalli, soste, segnalazioni
const CAMPI_AUSILIARIO: Readonly<Record<string, string>>;    // codice → campo del modulo, per interpretaRisposta
const CAMPI_DISATTIVAZIONE: Readonly<Record<string, string>>; // codice → "riga" (messaggio accanto all'Ausiliario)
```

- **`validaModuloAusiliario`:** un messaggio per ogni campo non valido. Nome vuoto dopo `trim` → `Inserisci il nome.`; cognome vuoto dopo `trim` → `Inserisci il cognome.`; email con `validaEmail` (`Inserisci l'email.`, `L'email non è valida.`); ente `""` → `Scegli l'ente.`; password solo in creazione, con `validaPasswordNuova` (`Inserisci la password.`, `La password deve avere almeno 8 caratteri.`). In modifica la password non si controlla (decisione D1).
- **`corpoAusiliario`:** nome e cognome senza spazi ai lati, email invariata, `ente` come numero; `password` solo in creazione.
- **`moduloDa`:** nome, cognome, email dell'Ausiliario, ente come stringa dell'`enteId`, password vuota.
- **`raggruppaPerEnte`:** un gruppo per ente, nell'ordine in cui gli enti compaiono (le API restituiscono già l'elenco per ente, cognome e nome); dentro il gruppo l'ordine resta quello ricevuto. Elenco vuoto → nessun gruppo (2.a1).
- **`righePanoramica`:** una riga per ente, nell'ordine ricevuto. Celle: i tre numeri come testo se il riepilogo è `pronto`; tre volte `Caricamento…` se `caricamento` o assente; tre volte `Non disponibile` se `errore` (4.a1).
- **`CAMPI_AUSILIARIO`:** `EMAIL_NON_VALIDA`, `EMAIL_GIA_REGISTRATA` → `email`; `PASSWORD_TROPPO_CORTA` → `password`; `ENTE_INESISTENTE`, `CAMBIO_ENTE_NON_CONSENTITO` → `ente`. Gli altri codici (per esempio `DATI_INCOMPLETI`, `AUSILIARIO_INESISTENTE`) vanno sull'avviso generale.
- **`CAMPI_DISATTIVAZIONE`:** `AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO`, `AUSILIARIO_GIA_DISATTIVATO`, `AUSILIARIO_INESISTENTE` → `riga`.

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM. **Modulo valido predefinito:** `{ nome: "Anna", cognome: "Moretti", email: "anna.moretti@omnipark.example", password: "parola-di-prova-lunga", ente: "2" }`; ogni frame indica solo i campi che cambiano. Le risposte delle API sono oggetti letterali con i codici e i messaggi del server (`<msg>`).

## 4. Categorie e scelte

**Modulo:** valido · tutti i campi vuoti [error] · nome di soli spazi [error] · email non valida [error] · password troppo corta in creazione [error] · password vuota in modifica · ente non scelto [error].

**Corpo:** creazione · modifica.

**Errori del server:** codice con un campo (email, ente) · codice senza campo · codice della disattivazione.

**Elenco degli Ausiliari:** più enti · vuoto [single].

**Panoramica:** riepilogo pronto · in caricamento · in errore · nessun ente [single].

## 5. Test frame (21)

| Frame       | Chiamata e dati                                                                                                                                                    | Esito atteso                                                                                                                                                | Riferimento |
| :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-AMMUI-01 | `validaModuloAusiliario(predefinito, "creazione")`                                                                                                                 | `{}`                                                                                                                                                        | RF_ADM_2    |
| TF-AMMUI-02 | `validaModuloAusiliario` con tutti i campi `""`, `"creazione"`                                                                                                     | `{ nome: "Inserisci il nome.", cognome: "Inserisci il cognome.", email: "Inserisci l'email.", password: "Inserisci la password.", ente: "Scegli l'ente." }` | RF_ADM_2    |
| TF-AMMUI-03 | `validaModuloAusiliario` con nome `"   "`, `"creazione"`                                                                                                           | `{ nome: "Inserisci il nome." }`                                                                                                                            | RF_ADM_2    |
| TF-AMMUI-04 | `validaModuloAusiliario` con email `senza-chiocciola`, `"creazione"`                                                                                               | `{ email: "L'email non è valida." }`                                                                                                                        | NRF_USA_1   |
| TF-AMMUI-05 | `validaModuloAusiliario` con password `corta77`, `"creazione"`                                                                                                     | `{ password: "La password deve avere almeno 8 caratteri." }`                                                                                                | ISSUE_39    |
| TF-AMMUI-06 | `validaModuloAusiliario` con password `""`, `"modifica"`                                                                                                           | `{}`                                                                                                                                                        | ISSUE_39    |
| TF-AMMUI-07 | `validaModuloAusiliario` con ente `""`, `"modifica"`                                                                                                               | `{ ente: "Scegli l'ente." }`                                                                                                                                | RF_ADM_2    |
| TF-AMMUI-08 | `corpoAusiliario` con nome `" Anna "`, cognome `"Moretti "`, `"creazione"`                                                                                         | `{ nome: "Anna", cognome: "Moretti", email: "anna.moretti@omnipark.example", ente: 2, password: "parola-di-prova-lunga" }`                                  | ISSUE_39    |
| TF-AMMUI-09 | `corpoAusiliario(predefinito, "modifica")`                                                                                                                         | `{ nome: "Anna", cognome: "Moretti", email: "anna.moretti@omnipark.example", ente: 2 }`, senza la chiave `password`                                         | ISSUE_39    |
| TF-AMMUI-10 | `moduloDa({ id: 5, email: "anna.moretti@omnipark.example", nome: "Anna", cognome: "Moretti", enteId: 2, ente: "Comune di Fisciano", statoDellAccount: "ATTIVO" })` | `{ nome: "Anna", cognome: "Moretti", email: "anna.moretti@omnipark.example", password: "", ente: "2" }`                                                     | RF_ADM_2    |
| TF-AMMUI-11 | `interpretaRisposta(409, { errore: { codice: "EMAIL_GIA_REGISTRATA", messaggio: <msg> } }, CAMPI_AUSILIARIO)`                                                      | `{ esito: "errore", campo: "email", messaggio: <msg> }`                                                                                                     | RF_ADM_2    |
| TF-AMMUI-12 | `interpretaRisposta(404, { errore: { codice: "ENTE_INESISTENTE", messaggio: <msg> } }, CAMPI_AUSILIARIO)`                                                          | `{ esito: "errore", campo: "ente", messaggio: <msg> }`                                                                                                      | RF_ADM_2    |
| TF-AMMUI-13 | `interpretaRisposta(409, { errore: { codice: "CAMBIO_ENTE_NON_CONSENTITO", messaggio: <msg> } }, CAMPI_AUSILIARIO)`                                                | `{ esito: "errore", campo: "ente", messaggio: <msg> }`                                                                                                      | VD_18       |
| TF-AMMUI-14 | `interpretaRisposta(422, { errore: { codice: "DATI_INCOMPLETI", messaggio: <msg> } }, CAMPI_AUSILIARIO)`                                                           | `{ esito: "errore", campo: "generale", messaggio: <msg> }`                                                                                                  | RF_ADM_2    |
| TF-AMMUI-15 | `interpretaRisposta(409, { errore: { codice: "AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO", messaggio: <msg> } }, CAMPI_DISATTIVAZIONE)`                           | `{ esito: "errore", campo: "riga", messaggio: <msg> }`                                                                                                      | VD_19       |
| TF-AMMUI-16 | `raggruppaPerEnte` con Marino (ente 3 «Comune di Baronissi»), Moretti (2 «Comune di Fisciano»), Ferri e Galli (1 «Comune di Gragnano»), in quest'ordine            | tre gruppi: Baronissi [Marino], Fisciano [Moretti], Gragnano [Ferri, Galli]                                                                                 | RF_ADM_2    |
| TF-AMMUI-17 | `raggruppaPerEnte([])`                                                                                                                                             | `[]`                                                                                                                                                        | RF_ADM_2    |
| TF-AMMUI-18 | `righePanoramica([{ 1, "Comune di Gragnano" }], { 1 → pronto 21, 0, 4 })`                                                                                          | `[{ id: 1, ente: "Comune di Gragnano", celle: ["21", "0", "4"] }]`                                                                                          | RF_ADM_1    |
| TF-AMMUI-19 | `righePanoramica([{ 2, "Comune di Fisciano" }], { 2 → errore })`                                                                                                   | celle `["Non disponibile", "Non disponibile", "Non disponibile"]`                                                                                           | RF_ADM_1    |
| TF-AMMUI-20 | `righePanoramica([{ 3, "Comune di Baronissi" }], mappa vuota)`                                                                                                     | celle `["Caricamento…", "Caricamento…", "Caricamento…"]`                                                                                                    | ISSUE_39    |
| TF-AMMUI-21 | `righePanoramica([], mappa vuota)`                                                                                                                                 | `[]` (la schermata mostra «Non ci sono enti clienti», 2.a1)                                                                                                 | RF_ADM_1    |

Totale 21: 7 sulla validazione, 2 sul corpo, 1 sul modulo già compilato, 5 sugli errori del server, 2 sull'elenco, 4 sulla panoramica.

Note sui riferimenti:

- TF-AMMUI-04: NRF_USA_1 (errore comprensibile accanto al campo), come `cp_validazioneCampi.md`.
- TF-AMMUI-05, 06, 08, 09: ISSUE_39 e decisione D1 (password iniziale solo in creazione, stesse regole della registrazione; nome e cognome senza spazi ai lati).
- TF-AMMUI-13: VD_18 (decisione D2), messaggio accanto al campo «Ente». TF-AMMUI-15: VD_19 (`UC_ADM_2` 3.a2), messaggio accanto all'Ausiliario.
- TF-AMMUI-19: `UC_ADM_1` 4.a1. TF-AMMUI-17, 21: `UC_ADM_2` 2.a1 e `UC_ADM_1` 2.a1.

## 6. Note

- I componenti `PanoramicaEnti.tsx` e `SchermataAusiliari.tsx` non hanno test automatici (nessuna dipendenza per i test di componente): si verificano a mano sull'anteprima e con TS-09 e TS-13 di `docs/test/test_di_sistema.md`.
- La conferma della disattivazione e l'annullamento (5.a1) sono stati del componente, senza chiamate alle API: si verificano con TS-13 e a mano.
