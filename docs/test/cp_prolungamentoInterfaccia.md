# cp_prolungamentoInterfaccia

Specifica dei casi di test (category partition) della logica del prolungamento nell'interfaccia: funzioni pure di `src/presentation/logica/prolungamento.ts`, usate dal pannello «Prolungamento» (`ProlungamentoSosta.tsx`) della sosta in corso del boundary `:MappaStalli` (`MU_2`).
Requisiti: RF_SOSTA_2 (prolungamento della sosta), RF_WALLET_2 (addebito, credito insufficiente). Task OMP-61 (issue #33), blocco B.

- **Fonti dell'esito atteso:** `UC_SOSTA_2` (entry condition: una propria sosta `Attiva`; passi 1–6; flussi 2.a1, 2.a2, 4.a1, 5.a1), `SD_SOSTA_2`, `np_01_automobilista` (SostaCorso → «prolunga» → Prolungamento → «conferma»; Prolungamento → ErrCredito → Ricarica → «torna alla conferma»), scenario `SC_UT_5`, `cp_apiProlungamento.md` §2 (codici di `GET` e `POST /api/soste/<id>/prolungamento`), `cp_prolungamento.md` §2 (durata complessiva entro il massimo della tariffa, tempo aggiuntivo minimo di 15 minuti, messaggio con i minuti disponibili), `cp_avvioInterfaccia.md` §2 (`opzioniDurata`, `durataPredefinita`, `etichettaConferma`, riusate qui), piano approvato di OMP-61.
- **File di test:** `src/presentation/logica/prolungamento.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_33` per le scelte dell'issue #33 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_2 · TF-PROUI-07 · nessun minuto prolungabile → nessuna opzione`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/prolungamento.ts — nessuna dipendenza da React né dai sottosistemi
tempoDisponibile(durataMassima: number, orarioDiAvvio: string, orarioDiScadenza: string): number; // minuti
opzioniProlungamento(durataMassima: number, orarioDiAvvio: string, orarioDiScadenza: string): number[];
tempoAggiuntivoProposto(durataMassima: number, orarioDiAvvio: string, orarioDiScadenza: string): number | null;
disponibilitaProlungamento(statoMostrato: string, opzioni: readonly number[]): Disponibilita; // tipo di avvioSosta.ts
const CAMPI_PROLUNGAMENTO: Readonly<Record<string, string>>; // codice → campo, per interpretaRisposta (cp_risposteApi.md)
messaggioProlungata(orarioDiScadenza: string): string;
```

- **`tempoDisponibile`:** minuti interi ancora prolungabili entro la durata massima della tariffa (`UC_SOSTA_2` passo 2, VD_9): `max(0, floor(durataMassima − (scadenza − avvio) / 60 000))`, con gli orari ISO 8601 di `GET /api/soste`. È lo stesso tempo che il server indica con `DURATA_OLTRE_IL_MASSIMO` (`cp_prolungamento.md` §2).
- **`opzioniProlungamento`** = `opzioniDurata(tempoDisponibile(…))` (`cp_avvioInterfaccia.md` §2): multipli di 15 fino al tempo disponibile, più il tempo disponibile se non è multiplo di 15; nessuna opzione sotto i 15 minuti.
- **`tempoAggiuntivoProposto`** = `durataPredefinita(tempoDisponibile(…))`: 60 minuti, o il tempo disponibile se è minore (ma almeno 15); `null` sotto i 15. Il pannello lo propone già scelto, come la durata dell'avvio.
- **`disponibilitaProlungamento`**, regole in quest'ordine, con `statoMostrato` di `cp_sostaInCorso.md` (una sosta `ATTIVA` con il timer a zero si mostra `SCADUTA`):

| Caso                                                   | Esito                                                                                                                                                                                                                                               |
| :----------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCADUTA`                                              | `{ disponibile: false, motivo: "La sosta è scaduta e non si può prolungare: puoi avviarne una nuova." }` (`UC_SOSTA_2` 2.a1, stesso testo di `SOSTA_SCADUTA`)                                                                                       |
| `ATTIVA` senza opzioni (meno di 15 minuti disponibili) | `{ disponibile: false, motivo: "La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo." }`, lo stesso testo di `DURATA_OLTRE_IL_MASSIMO` con meno di 15 minuti disponibili (`cp_prolungamento.md` §2, decisione D3) |
| `ATTIVA` con almeno un'opzione                         | `{ disponibile: true }` («Prolunga» visibile)                                                                                                                                                                                                       |
| ogni altro stato                                       | `{ disponibile: false, motivo: "La sosta non si può prolungare." }`                                                                                                                                                                                 |

- **`CAMPI_PROLUNGAMENTO`:** `CREDITO_INSUFFICIENTE` → `"credito"` (proposta di ricarica, `UC_SOSTA_2` 5.a1, con `riquadroRicarica` di `cp_walletInterfaccia.md`); `DURATA_OLTRE_IL_MASSIMO` e `DURATA_NON_VALIDA` → `"tempo"` (accanto alla scelta del tempo aggiuntivo, con il messaggio del server che indica i minuti disponibili, 2.a2); ogni altro codice va su `"generale"` (regola 3 di `cp_risposteApi.md`). Si verifica attraverso `interpretaRisposta(status, corpo, CAMPI_PROLUNGAMENTO)`.
- **`messaggioProlungata(orario)`** = `"Sosta prolungata: scade alle " + formattaOra(orario) + "."` (`cp_formatoImporti.md`, fuso Europe/Rome): la conferma di `UC_SOSTA_2` passo 6, mostrata come il messaggio dell'avvio e con la stessa regola di visibilità (`confermaVisibile`, `cp_sostaInCorso.md`).

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM, nessun timer. `<msg>` indica il messaggio del frame, restituito invariato.

- Orario di avvio `AV = "2026-11-20T08:42:00.000Z"` (09:42 ora italiana).
- Orari di scadenza: `SC60 = "2026-11-20T09:42:00.000Z"` (60 minuti dopo `AV`), `SC70 = "2026-11-20T09:52:00.000Z"` (70), `SC130 = "2026-11-20T10:52:00.000Z"` (130), `SC175 = "2026-11-20T11:37:00.000Z"` (175), `SC180 = "2026-11-20T11:42:00.000Z"` (180), `SC60s = "2026-11-20T09:42:30.000Z"` (60 minuti e 30 secondi).

## 4. Categorie e scelte

**Tempo disponibile:** almeno 15 minuti, multiplo di 15 · almeno 15, non multiplo di 15 [single] · meno di 15 · zero (durata massima già raggiunta) · durata attuale con i secondi [single].

**Tempo aggiuntivo proposto:** 60 minuti · meno di 60 disponibili · nessuno [error].

**Stato mostrato della sosta:** `ATTIVA` con opzioni · `ATTIVA` senza opzioni [error] · `SCADUTA` [error] · altro stato [error].

**Esito del prolungamento:** prolungata · credito insufficiente [error] · oltre il massimo [error] · tempo non valido [error] · sosta scaduta [error] · sessione scaduta [error].

## 5. Test frame (21)

| Frame       | Chiamata                                                                                                                                                                                                          | Esito atteso                                                                                                                                          | Riferimento |
| :---------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-PROUI-01 | `tempoDisponibile(180, AV, SC60)`                                                                                                                                                                                 | `120`                                                                                                                                                 | RF_SOSTA_2  |
| TF-PROUI-02 | `tempoDisponibile(180, AV, SC175)`                                                                                                                                                                                | `5`                                                                                                                                                   | RF_SOSTA_2  |
| TF-PROUI-03 | `tempoDisponibile(180, AV, SC180)`                                                                                                                                                                                | `0`                                                                                                                                                   | RF_SOSTA_2  |
| TF-PROUI-04 | `tempoDisponibile(120, AV, SC60s)`                                                                                                                                                                                | `59`                                                                                                                                                  | RF_SOSTA_2  |
| TF-PROUI-05 | `opzioniProlungamento(180, AV, SC60)`                                                                                                                                                                             | `[15, 30, 45, 60, 75, 90, 105, 120]`                                                                                                                  | RF_SOSTA_2  |
| TF-PROUI-06 | `opzioniProlungamento(120, AV, SC70)`                                                                                                                                                                             | `[15, 30, 45, 50]`                                                                                                                                    | RF_SOSTA_2  |
| TF-PROUI-07 | `opzioniProlungamento(180, AV, SC175)`                                                                                                                                                                            | `[]`                                                                                                                                                  | RF_SOSTA_2  |
| TF-PROUI-08 | `tempoAggiuntivoProposto(180, AV, SC60)`                                                                                                                                                                          | `60`                                                                                                                                                  | ISSUE_33    |
| TF-PROUI-09 | `tempoAggiuntivoProposto(180, AV, SC130)`                                                                                                                                                                         | `50`                                                                                                                                                  | ISSUE_33    |
| TF-PROUI-10 | `tempoAggiuntivoProposto(180, AV, SC175)`                                                                                                                                                                         | `null`                                                                                                                                                | ISSUE_33    |
| TF-PROUI-11 | `disponibilitaProlungamento("ATTIVA", [15, 30])`                                                                                                                                                                  | `{ disponibile: true }`                                                                                                                               | RF_SOSTA_2  |
| TF-PROUI-12 | `disponibilitaProlungamento("ATTIVA", [])`                                                                                                                                                                        | `{ disponibile: false, motivo: "La sosta non si può più prolungare: ha quasi raggiunto la durata massima dello stallo." }`                            | RF_SOSTA_2  |
| TF-PROUI-13 | `disponibilitaProlungamento("SCADUTA", [15, 30])`                                                                                                                                                                 | `{ disponibile: false, motivo: "La sosta è scaduta e non si può prolungare: puoi avviarne una nuova." }`                                              | RF_SOSTA_2  |
| TF-PROUI-14 | `disponibilitaProlungamento("TERMINATA", [15])`                                                                                                                                                                   | `{ disponibile: false, motivo: "La sosta non si può prolungare." }`                                                                                   | ISSUE_33    |
| TF-PROUI-15 | `interpretaRisposta(200, { sosta: 41, orarioDiScadenza: "2026-11-20T10:42:00.000Z", importo: 150 }, CAMPI_PROLUNGAMENTO)`                                                                                         | `{ esito: "successo", dati: <corpo> }`                                                                                                                | RF_SOSTA_2  |
| TF-PROUI-16 | `interpretaRisposta(409, { errore: { codice: "CREDITO_INSUFFICIENTE", messaggio: <msg> } }, CAMPI_PROLUNGAMENTO)`                                                                                                 | `{ esito: "errore", campo: "credito", messaggio: <msg> }`                                                                                             | RF_WALLET_2 |
| TF-PROUI-17 | `interpretaRisposta(422, { errore: { codice: "DURATA_OLTRE_IL_MASSIMO", messaggio: "Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 120 minuti." } }, CAMPI_PROLUNGAMENTO)` | `{ esito: "errore", campo: "tempo", messaggio: "Il prolungamento supera la durata massima dello stallo. Puoi prolungare al massimo di 120 minuti." }` | RF_SOSTA_2  |
| TF-PROUI-18 | `interpretaRisposta(422, { errore: { codice: "DURATA_NON_VALIDA", messaggio: <msg> } }, CAMPI_PROLUNGAMENTO)`                                                                                                     | `{ esito: "errore", campo: "tempo", messaggio: <msg> }`                                                                                               | ISSUE_33    |
| TF-PROUI-19 | `interpretaRisposta(409, { errore: { codice: "SOSTA_SCADUTA", messaggio: <msg> } }, CAMPI_PROLUNGAMENTO)`                                                                                                         | `{ esito: "errore", campo: "generale", messaggio: <msg> }`                                                                                            | RF_SOSTA_2  |
| TF-PROUI-20 | `interpretaRisposta(401, { errore: { codice: "SESSIONE_NON_VALIDA", messaggio: <msg> } }, CAMPI_PROLUNGAMENTO)`                                                                                                   | `{ esito: "sessioneScaduta" }`                                                                                                                        | NRF_SIC_1   |
| TF-PROUI-21 | `messaggioProlungata("2026-11-20T10:42:00.000Z")`                                                                                                                                                                 | `"Sosta prolungata: scade alle 11:42."`                                                                                                               | RF_SOSTA_2  |

Totale 21: 4 sul tempo disponibile, 3 sulle opzioni, 3 sul tempo proposto, 4 sulla disponibilità di «Prolunga», 6 sull'esito del prolungamento, 1 sul messaggio di conferma.

Note sui riferimenti:

- TF-PROUI-01…07: RF_SOSTA_2 («entro il limite massimo previsto per lo stallo») e `UC_SOSTA_2` passo 2; il tempo disponibile è quello di `cp_prolungamento.md` TF-PRO-03 e 17 (120 e 10 minuti). TF-PROUI-04: con una durata attuale non intera si arrotonda per difetto, come il server. TF-PROUI-06: il tempo disponibile non multiplo di 15 resta sceglibile, come la durata massima nell'avvio. TF-PROUI-07: con meno di 15 minuti nessun prolungamento è possibile (tempo aggiuntivo minimo, `cp_prolungamento.md` TF-PRO-10).
- TF-PROUI-08…10: scelta del piano (tempo aggiuntivo già proposto, come la durata dell'avvio per NRF_USA_2); `SC_UT_5` prolunga di 1 ora.
- TF-PROUI-11…14: `UC_SOSTA_2` entry condition (sosta `Attiva`) e 2.a1 (sosta `Scaduta`: si avvia una nuova sosta); TF-PROUI-12: 2.a2 prima di inviare la richiesta, con lo stesso messaggio che il server darebbe (`cp_prolungamento.md` TF-PRO-19, `cp_apiProlungamento.md` TF-API-PRO-10). Il tempo proposto, quando esiste, non è mai inferiore a 15 minuti (TF-PROUI-08…10), come le opzioni (TF-PROUI-05…07).
- TF-PROUI-16: `UC_SOSTA_2` 5.a1 (proposta di ricarica). TF-PROUI-17: 2.a2 («indicando il tempo ancora disponibile»), con il messaggio del server invariato. TF-PROUI-19: 2.a1 raggiunto se la sosta scade mentre il pannello è aperto. TF-PROUI-20: come `cp_risposteApi.md` TF-RAP-11.
- TF-PROUI-21: `UC_SOSTA_2` passo 6 («aggiorna l'orario di scadenza e lo conferma»).

## 6. Note

- **Già verificati altrove** (nessun frame qui): regole generali di `interpretaRisposta`, `cp_risposteApi.md`; `opzioniDurata`, `durataPredefinita` ed `etichettaConferma`, `cp_avvioInterfaccia.md`; riquadro e messaggio della ricarica, `cp_walletInterfaccia.md`; visibilità della conferma, `cp_sostaInCorso.md`; codici e status delle route, `cp_apiProlungamento.md`; formato degli importi e degli orari, `cp_formatoImporti.md`.
- **Componente** (`ProlungamentoSosta.tsx`): «Prolunga» nella riga della sosta `Attiva`, scelta del tempo aggiuntivo, importo aggiuntivo e nuova scadenza da `GET /api/soste/<id>/prolungamento` prima della conferma (`UC_SOSTA_2` passo 3), «Conferma e paga (…)», «Annulla» (4.a1: la scadenza non cambia), ricarica con il credito insufficiente e ritorno alla conferma (5.a1). Si verificano con TS-13 (Blocco C) e a mano da telefono.
