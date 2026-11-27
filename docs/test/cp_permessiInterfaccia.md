# cp_permessiInterfaccia

Specifica dei casi di test (category partition) della logica della voce «Permessi da verificare» nella pagina dell'Ausiliario (`src/presentation/logica/permessiDaVerificare.ts`): descrizione del permesso nell'elenco e risposta alla registrazione dell'esito.
Requisiti: RF_OP_2, RF_OP_5. Task OMP-63 (issue #40, parte B).

- **Fonti dell'esito atteso:** `UC_OP_1` 3.a1 (tipo di stallo e targa del permesso), `UC_OP_5` (passo 4, 2.a1, 4.a1, 4.a2), `np_02_ausiliario.puml` («Permesso da verificare», «Esito della verifica», «Sosta non più Attiva o esito già registrato» → mappa), `cp_risposteApi.md` (`interpretaRisposta`), `cp_apiPermessi.md` (codici), issue #40 (voce d'elenco, nessun marker; schermate: test sulle funzioni di logica, solo casi principali).
- **File di test:** `src/presentation/logica/permessiDaVerificare.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento: un requisito dell'Elenco se il suo testo copre il comportamento, altrimenti `ISSUE_40`. Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`.

## 2. Funzioni verificate (firme)

```ts
type PermessoDellElenco = {
  sostaId: number; stalloId: number; numeroStallo: number; tipoDiStallo: string;
  latitudine: number; longitudine: number; targa: string; dichiarazioneDiPermesso: string;
};
descriviPermesso(permesso: PermessoDellElenco): string;
// «Stallo n. <numero> <tipo come in descriviTipo di mappaStalli.ts> · targa <targa>»
ESITI_VERIFICA: { CONFORME: "Conforme"; NON_CONFORME: "Non conforme" };
CAMPI_ESITO_VERIFICA: { VERIFICA_GIA_REGISTRATA: "giaRegistrata"; SOSTA_NON_ATTIVA: "nonAttiva"; NESSUN_PERMESSO_DA_VERIFICARE: "nessunPermesso" };
rispostaAllEsito(esito: EsitoRisposta, scelto: "CONFORME" | "NON_CONFORME"):
  | { tipo: "registrato"; messaggio: string }
  | { tipo: "nonDisponibile"; messaggio: string }
  | { tipo: "sessioneScaduta" }
  | { tipo: "errore"; messaggio: string };
```

- **`rispostaAllEsito`:** successo → `registrato` con «Esito registrato: permesso conforme.» oppure, con `NON_CONFORME`, «Esito registrato: permesso non conforme. È stata registrata una segnalazione di sosta irregolare accertata, già chiusa.»; errore su uno dei campi di `CAMPI_ESITO_VERIFICA` → `nonDisponibile` con il messaggio della API (il permesso non è più da verificare: l'elenco si ricarica); `sessioneScaduta` → `sessioneScaduta`; ogni altro errore → `errore` con il messaggio (da riprovare).
- Le risposte si costruiscono con `interpretaRisposta(status, corpo, CAMPI_ESITO_VERIFICA)` di `risposteApi.ts`.

## 3. Ambiente

Nessun database. Messaggi delle API (`src/application/segnalazioni/errori.ts`): `GIA_REGISTRATA = "L'esito della verifica di questa sosta è già registrato: vale il primo."`, `NON_ATTIVA = "La sosta non è più attiva: non c'è più nulla da verificare."`.
Permesso di prova `P(numeroStallo, tipoDiStallo, targa)`: `{ sostaId: 1, stalloId: 15, numeroStallo, tipoDiStallo, latitudine: 40.68829, longitudine: 14.52214, targa, dichiarazioneDiPermesso: "Dichiaro di esporre il permesso previsto per lo stallo" }`.

## 4. Categorie e scelte (casi principali)

**Tipo di stallo nell'elenco:** rosa · per persone con disabilità.

**Risposta all'esito:** registrata conforme · registrata non conforme · esito già registrato · sosta non più attiva · sessione scaduta.

## 5. Test frame (7)

| Frame       | Chiamata                                                                                                                                                     | Esito atteso                                                                                                                                                   | Riferimento |
| :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-PERUI-01 | `descriviPermesso(P(2, "ROSA", "AB123CD"))`                                                                                                                  | `"Stallo n. 2 rosa · targa AB123CD"`                                                                                                                           | RF_OP_2     |
| TF-PERUI-02 | `descriviPermesso(P(1, "DISABILI", "IJ789KL"))`                                                                                                              | `"Stallo n. 1 per persone con disabilità · targa IJ789KL"`                                                                                                     | RF_OP_2     |
| TF-PERUI-03 | `rispostaAllEsito(interpretaRisposta(200, { verifica: 3, segnalazione: null }, CAMPI_ESITO_VERIFICA), "CONFORME")`                                           | `{ tipo: "registrato", messaggio: "Esito registrato: permesso conforme." }`                                                                                    | RF_OP_5     |
| TF-PERUI-04 | `rispostaAllEsito(interpretaRisposta(200, { verifica: 3, segnalazione: 7 }, CAMPI_ESITO_VERIFICA), "NON_CONFORME")`                                          | `{ tipo: "registrato", messaggio: "Esito registrato: permesso non conforme. È stata registrata una segnalazione di sosta irregolare accertata, già chiusa." }` | RF_OP_5     |
| TF-PERUI-05 | `rispostaAllEsito(interpretaRisposta(409, { errore: { codice: "VERIFICA_GIA_REGISTRATA", messaggio: GIA_REGISTRATA } }, CAMPI_ESITO_VERIFICA), "CONFORME")`  | `{ tipo: "nonDisponibile", messaggio: GIA_REGISTRATA }`                                                                                                        | ISSUE_40    |
| TF-PERUI-06 | `rispostaAllEsito(interpretaRisposta(409, { errore: { codice: "SOSTA_NON_ATTIVA", messaggio: NON_ATTIVA } }, CAMPI_ESITO_VERIFICA), "NON_CONFORME")`         | `{ tipo: "nonDisponibile", messaggio: NON_ATTIVA }`                                                                                                            | ISSUE_40    |
| TF-PERUI-07 | `rispostaAllEsito(interpretaRisposta(401, { errore: { codice: "SESSIONE_NON_VALIDA", messaggio: "Sessione scaduta." } }, CAMPI_ESITO_VERIFICA), "CONFORME")` | `{ tipo: "sessioneScaduta" }`                                                                                                                                  | ISSUE_40    |

Totale 7: 2 sulla descrizione nell'elenco, 5 sulla risposta all'esito.

Note sui riferimenti:

- TF-PERUI-01, 02: RF_OP_2 e `UC_OP_1` 3.a1 (tipo di stallo e targa del permesso da verificare).
- TF-PERUI-03, 04: `UC_OP_5` passo 4 e 4.a1; la segnalazione generata è una sosta irregolare accertata, non una sanzione (`RD_10`).
- TF-PERUI-05, 06: `np_02_ausiliario.puml` («Sosta non più Attiva o esito già registrato» → mappa), `UC_OP_5` 2.a1 e 4.a2.
