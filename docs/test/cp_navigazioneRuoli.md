# cp_navigazioneRuoli

Specifica dei casi di test (category partition) della navigazione per ruolo: funzioni pure di `src/presentation/logica/navigazione.ts`, usate dalle pagine di accesso e registrazione, dall'intestazione delle aree e da `src/proxy.ts`.
Requisiti: RF_AUTH_4 (accesso: schermata iniziale del ruolo), RF_AUTH_1 (registrazione: mappa degli stalli), NRF_SIC_1 (ogni ruolo vede solo le sue aree). Task OMP-57 (issue #28).

- **Fonti dell'esito atteso:** `UC_AUTH_4` passo 3 (schermata iniziale per ruolo: `MU_2`, `MU_4`, `MU_5`), `UC_AUTH_1` passo 3, navigation path `np_00_generale` (menu: mappa e profilo; mappa delle segnalazioni; panoramica degli enti e gestione degli Ausiliari), issue #28 (percorsi `/mappa`, `/profilo`, `/ausiliario`, `/admin`, `/admin/ausiliari`), piano approvato di OMP-57 (parametro `?da=` senza open redirect).
- **File di test:** `src/presentation/logica/navigazione.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_28` per le scelte dell'issue #28 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_AUTH_4 · TF-NAV-02 · schermata iniziale dell'Ausiliario → /ausiliario`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/navigazione.ts — usato anche da src/proxy.ts: nessun import di React né di codice client
type Ruolo = "AUTOMOBILISTA" | "AUSILIARIO_DEL_TRAFFICO" | "AMMINISTRATORE";
schermataIniziale(ruolo: string): string;            // /mappa, /ausiliario, /admin; /accesso per un ruolo sconosciuto
ruoloDellArea(percorso: string): Ruolo | null;       // ruolo dell'area a cui appartiene il percorso, null se nessuna
destinazioneDopoAccesso(ruolo: string, da: string | null): string;
vociDiMenu(ruolo: string): { etichetta: string; percorso: string }[];
etichettaRuolo(ruolo: string, ente: number | null): string; // testo dell'intestazione
indirizzoDiAccesso(percorsoCorrente: string): string;       // /accesso?da=<percorso codificato>
```

- **Aree:** `/mappa` e `/profilo` → `AUTOMOBILISTA`; `/ausiliario` → `AUSILIARIO_DEL_TRAFFICO`; `/admin` → `AMMINISTRATORE`. Un percorso appartiene a un'area se è il percorso dell'area o continua con `/` (`/mappa/x` sì, `/mappatura` no).
- **`?da=` accettato** solo se è un percorso interno — inizia con `/`, non con `//` né con `/\`, e contiene solo lettere, cifre, `/`, `_` e `-` — e appartiene a un'area del ruolo. Altrimenti la destinazione è la schermata iniziale.
- **Menu:** Automobilista «Mappa» `/mappa`, «Profilo» `/profilo`; Ausiliario «Segnalazioni» `/ausiliario`; Amministratore «Panoramica enti» `/admin`, «Gestione Ausiliari» `/admin/ausiliari`; ruolo sconosciuto: nessuna voce.
- **Etichetta del ruolo:** «Automobilista»; «Ausiliario del Traffico · ente <n>»; «Amministratore».

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM.

## 4. Categorie e scelte

**Ruolo:** Automobilista · Ausiliario del Traffico · Amministratore · sconosciuto [error].

**Percorso (area):** area dell'Automobilista (mappa, profilo, sotto-percorso) · area dell'Ausiliario · area dell'Amministratore (anche `/admin/ausiliari`) · nessuna area (`/`, `/accesso`) · prefisso simile ma non area (`/mappatura`, `/administrator`).

**`?da=`:** assente · percorso dell'area del ruolo · percorso di un'altra area · indirizzo esterno con schema [error] · `//host` [error] · `/\host` [error] · con caratteri non ammessi (query, punti) [error] · vuoto.

## 5. Test frame (31)

| Frame     | Chiamata                                                                         | Esito atteso                                                                                                                | Riferimento |
| :-------- | :------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-NAV-01 | `schermataIniziale("AUTOMOBILISTA")`                                             | `"/mappa"`                                                                                                                  | RF_AUTH_4   |
| TF-NAV-02 | `schermataIniziale("AUSILIARIO_DEL_TRAFFICO")`                                   | `"/ausiliario"`                                                                                                             | RF_AUTH_4   |
| TF-NAV-03 | `schermataIniziale("AMMINISTRATORE")`                                            | `"/admin"`                                                                                                                  | RF_AUTH_4   |
| TF-NAV-04 | `schermataIniziale("ALTRO")`                                                     | `"/accesso"`                                                                                                                | ISSUE_28    |
| TF-NAV-05 | `ruoloDellArea("/mappa")`                                                        | `"AUTOMOBILISTA"`                                                                                                           | NRF_SIC_1   |
| TF-NAV-06 | `ruoloDellArea("/profilo")`                                                      | `"AUTOMOBILISTA"`                                                                                                           | NRF_SIC_1   |
| TF-NAV-07 | `ruoloDellArea("/mappa/stalli/14")`                                              | `"AUTOMOBILISTA"`                                                                                                           | NRF_SIC_1   |
| TF-NAV-08 | `ruoloDellArea("/ausiliario/segnalazioni")`                                      | `"AUSILIARIO_DEL_TRAFFICO"`                                                                                                 | NRF_SIC_1   |
| TF-NAV-09 | `ruoloDellArea("/admin/ausiliari")`                                              | `"AMMINISTRATORE"`                                                                                                          | NRF_SIC_1   |
| TF-NAV-10 | `ruoloDellArea("/")`                                                             | `null`                                                                                                                      | NRF_SIC_1   |
| TF-NAV-11 | `ruoloDellArea("/accesso")`                                                      | `null`                                                                                                                      | NRF_SIC_1   |
| TF-NAV-12 | `ruoloDellArea("/mappatura")`                                                    | `null`                                                                                                                      | NRF_SIC_1   |
| TF-NAV-13 | `ruoloDellArea("/administrator")`                                                | `null`                                                                                                                      | NRF_SIC_1   |
| TF-NAV-14 | `destinazioneDopoAccesso("AUTOMOBILISTA", null)`                                 | `"/mappa"`                                                                                                                  | RF_AUTH_4   |
| TF-NAV-15 | `destinazioneDopoAccesso("AUTOMOBILISTA", "/profilo")`                           | `"/profilo"`                                                                                                                | ISSUE_28    |
| TF-NAV-16 | `destinazioneDopoAccesso("AUSILIARIO_DEL_TRAFFICO", "/ausiliario/segnalazioni")` | `"/ausiliario/segnalazioni"`                                                                                                | ISSUE_28    |
| TF-NAV-17 | `destinazioneDopoAccesso("AUTOMOBILISTA", "/admin")`                             | `"/mappa"`                                                                                                                  | NRF_SIC_1   |
| TF-NAV-18 | `destinazioneDopoAccesso("AMMINISTRATORE", "/mappa")`                            | `"/admin"`                                                                                                                  | NRF_SIC_1   |
| TF-NAV-19 | `destinazioneDopoAccesso("AUTOMOBILISTA", "https://esempio.example/mappa")`      | `"/mappa"`                                                                                                                  | ISSUE_28    |
| TF-NAV-20 | `destinazioneDopoAccesso("AUTOMOBILISTA", "//esempio.example/mappa")`            | `"/mappa"`                                                                                                                  | ISSUE_28    |
| TF-NAV-21 | `destinazioneDopoAccesso("AUTOMOBILISTA", "/\\esempio.example/mappa")`           | `"/mappa"`                                                                                                                  | ISSUE_28    |
| TF-NAV-22 | `destinazioneDopoAccesso("AUTOMOBILISTA", "/profilo?x=1")`                       | `"/mappa"`                                                                                                                  | ISSUE_28    |
| TF-NAV-23 | `destinazioneDopoAccesso("AUTOMOBILISTA", "/mappa/../admin")`                    | `"/mappa"`                                                                                                                  | ISSUE_28    |
| TF-NAV-24 | `destinazioneDopoAccesso("AMMINISTRATORE", "")`                                  | `"/admin"`                                                                                                                  | RF_AUTH_4   |
| TF-NAV-25 | `vociDiMenu("AUTOMOBILISTA")`                                                    | `[{ etichetta: "Mappa", percorso: "/mappa" }, { etichetta: "Profilo", percorso: "/profilo" }]`                              | ISSUE_28    |
| TF-NAV-26 | `vociDiMenu("AUSILIARIO_DEL_TRAFFICO")`                                          | `[{ etichetta: "Segnalazioni", percorso: "/ausiliario" }]`                                                                  | ISSUE_28    |
| TF-NAV-27 | `vociDiMenu("AMMINISTRATORE")`                                                   | `[{ etichetta: "Panoramica enti", percorso: "/admin" }, { etichetta: "Gestione Ausiliari", percorso: "/admin/ausiliari" }]` | ISSUE_28    |
| TF-NAV-28 | `etichettaRuolo("AUTOMOBILISTA", null)`                                          | `"Automobilista"`                                                                                                           | ISSUE_28    |
| TF-NAV-29 | `etichettaRuolo("AUSILIARIO_DEL_TRAFFICO", 1)`                                   | `"Ausiliario del Traffico · ente 1"`                                                                                        | ISSUE_28    |
| TF-NAV-30 | `etichettaRuolo("AMMINISTRATORE", null)`                                         | `"Amministratore"`                                                                                                          | ISSUE_28    |
| TF-NAV-31 | `indirizzoDiAccesso("/profilo")`                                                 | `"/accesso?da=%2Fprofilo"`                                                                                                  | ISSUE_28    |

Totale 31: 4 sulla schermata iniziale, 9 sulle aree, 11 su `?da=`, 3 sul menu, 3 sull'etichetta, 1 sull'indirizzo di accesso.

Note sui riferimenti:

- TF-NAV-01…03, 14, 24: RF_AUTH_4 e `UC_AUTH_4` passo 3 (ruolo dopo l'accesso: Automobilista → `/mappa`, Ausiliario → `/ausiliario`, Amministratore → `/admin`, categorie minime dell'issue). La registrazione porta sempre a `/mappa` (`UC_AUTH_1` passo 3) con la stessa funzione.
- TF-NAV-05…13, 17, 18: NRF_SIC_1 (ogni ruolo solo nelle sue aree). `ruoloDellArea` la usa anche `src/proxy.ts`.
- TF-NAV-19…23: piano approvato, punto 4 (parametro `?da=` usato solo se è un percorso interno dell'area del ruolo: niente open redirect).
- TF-NAV-25…27: menu per ruolo secondo `np_00_generale`.

## 6. Note

- **Già verificati altrove** (nessun frame qui): i redirect del proxy per area e ruolo, `cp_apiAccesso.md` TF-ACC-32…43.
