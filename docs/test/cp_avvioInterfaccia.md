# cp_avvioInterfaccia

Specifica dei casi di test (category partition) della logica dell'avvio della sosta nell'interfaccia: funzioni pure di `src/presentation/logica/avvioSosta.ts`, usate dalla scheda dello stallo del boundary `:MappaStalli` (`MU_2`).
Requisiti: RF_SOSTA_1 (avvio della sosta), RF_WALLET_2 (addebito, credito insufficiente), NRF_USA_2 (avvio e pagamento in tre interazioni), RF_SOSTA_5 (permesso sugli stalli riservati, rinviato a COD-20). Task OMP-58 (issue #29).

- **Fonti dell'esito atteso:** `UC_SOSTA_1` (entry condition: stallo `Occupato`; passi 1–5; flussi 2.a1, 2.a2, 2.a3, 2.a4, 5.a1), `SD_SOSTA_1`, `np_01_automobilista` (Scheda → ErrCredito → Ricarica → «torna alla conferma»), `cp_apiWalletSoste.md` §2 (codici di errore di `POST /api/soste`), `cp_calcoloImporto.md` §2 (durata intera da 15 minuti alla durata massima), issue #29 (categorie minime: stato dello stallo → disponibilità di «Avvia sosta»; tipo di stallo; credito rispetto all'importo), piano approvato di OMP-58 (punti 4 e 6, decisioni D2 e D4).
- **File di test:** `src/presentation/logica/avvioSosta.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` per le scelte dell'issue #29 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_1 · TF-AVVUI-04 · stallo Libero → non disponibile con il motivo`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/avvioSosta.ts — nessuna dipendenza da React né dai sottosistemi
type Disponibilita = { disponibile: true } | { disponibile: false; motivo: string };
disponibilitaAvvio(stato: string, tipoDiStallo: string): Disponibilita;
opzioniDurata(durataMassima: number): number[];        // minuti
durataPredefinita(durataMassima: number): number | null;
etichettaDurata(minuti: number): string;
creditoSufficiente(saldo: number, importo: number): boolean; // centesimi
etichettaConferma(importo: number): string;            // testo del pulsante dell'interazione 3
const CAMPI_AVVIO_SOSTA: Readonly<Record<string, string>>; // codice → campo, per interpretaRisposta (cp_risposteApi.md)
```

**`disponibilitaAvvio`**, regole in quest'ordine (prima lo stato, poi il tipo):

| Caso                                              | Esito                                                                                                                                                                                            |
| :------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stato `LIBERO`                                    | `{ disponibile: false, motivo: "Lo stallo risulta libero: la sosta si avvia quando il sensore rileva il veicolo." }`                                                                             |
| stato `NON_DISPONIBILE`                           | `{ disponibile: false, motivo: "Sullo stallo c'è già una sosta in corso." }`                                                                                                                     |
| stato `SCONOSCIUTO`                               | `{ disponibile: false, motivo: "Lo stato dello stallo non è affidabile: la sosta non si può avviare." }`                                                                                         |
| altro stato diverso da `OCCUPATO`                 | `{ disponibile: false, motivo: "La sosta non si può avviare su questo stallo." }`                                                                                                                |
| `OCCUPATO`, tipo `DISABILI`                       | `{ disponibile: false, motivo: "Per gli stalli riservati alle persone con disabilità servono la dichiarazione e la foto del permesso: l'avvio da qui arriverà con un prossimo aggiornamento." }` |
| `OCCUPATO`, tipo `ORDINARIO_A_PAGAMENTO` o `ROSA` | `{ disponibile: true }` (sullo stallo rosa senza permesso, come il server: decisione D2)                                                                                                         |
| `OCCUPATO`, altro tipo                            | `{ disponibile: false, motivo: "La sosta non si può avviare su questo stallo." }`                                                                                                                |

**Durata:** `opzioniDurata` restituisce i multipli di 15 da 15 a `durataMassima`, in ordine crescente; se `durataMassima` non è multiplo di 15 la aggiunge come ultima opzione; con `durataMassima` < 15 restituisce `[]`. `durataPredefinita` è 60 se `durataMassima` ≥ 60, altrimenti `durataMassima` se ≥ 15, altrimenti `null`. `etichettaDurata`: `"<m> min"` sotto l'ora, `"<h> h"` per ore intere, `"<h> h <m> min"` altrimenti.

**Credito:** `creditoSufficiente` è `saldo >= importo`.

**Conferma:** `etichettaConferma(importo)` = `"Conferma e paga (" + formattaEuro(importo) + ")"` (`cp_formatoImporti.md`).

**`CAMPI_AVVIO_SOSTA`:** `CREDITO_INSUFFICIENTE` → `"credito"` (proposta di ricarica); `DURATA_NON_VALIDA` → `"durata"`; `TARGA_NON_NEL_PROFILO` e `SOSTA_GIA_ATTIVA` → `"targa"`; ogni altro codice va su `"generale"` (regola 3 di `cp_risposteApi.md`). Si verifica attraverso `interpretaRisposta(status, corpo, CAMPI_AVVIO_SOSTA)`.

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM. `<msg>` indica il messaggio del frame, restituito invariato. Lo spazio indivisibile prima di `€` è scritto ` `.

## 4. Categorie e scelte

**Stato dello stallo:** Occupato · Libero [error] · Non disponibile [error] · Sconosciuto [error] · non riconosciuto [error].

**Tipo di stallo:** a pagamento · rosa · riservato a permesso (disabili) [error] · non riconosciuto [error].

**Durata massima:** multiplo di 15 · non multiplo di 15 [single] · inferiore a 15 [error].

**Credito rispetto all'importo:** sufficiente · uguale [single] · insufficiente [error] → proposta di ricarica · importo zero.

**Esito dell'avvio:** avviata · credito insufficiente [error] · durata non valida [error] · targa non del profilo [error] · sosta già attiva per la targa [error] · stallo non più occupato [error] · sessione scaduta [error].

## 5. Test frame (30)

| Frame       | Chiamata                                                                                                                                                                                | Esito atteso                                                                                                                          | Riferimento |
| :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-AVVUI-01 | `disponibilitaAvvio("OCCUPATO", "ORDINARIO_A_PAGAMENTO")`                                                                                                                               | `{ disponibile: true }`                                                                                                               | RF_SOSTA_1  |
| TF-AVVUI-02 | `disponibilitaAvvio("OCCUPATO", "ROSA")`                                                                                                                                                | `{ disponibile: true }`                                                                                                               | ISSUE_29    |
| TF-AVVUI-03 | `disponibilitaAvvio("OCCUPATO", "DISABILI")`                                                                                                                                            | `{ disponibile: false, motivo: <messaggio dei disabili del §2> }`                                                                     | RF_SOSTA_5  |
| TF-AVVUI-04 | `disponibilitaAvvio("LIBERO", "ORDINARIO_A_PAGAMENTO")`                                                                                                                                 | `{ disponibile: false, motivo: "Lo stallo risulta libero: la sosta si avvia quando il sensore rileva il veicolo." }`                  | RF_SOSTA_1  |
| TF-AVVUI-05 | `disponibilitaAvvio("NON_DISPONIBILE", "ORDINARIO_A_PAGAMENTO")`                                                                                                                        | `{ disponibile: false, motivo: "Sullo stallo c'è già una sosta in corso." }`                                                          | RF_SOSTA_1  |
| TF-AVVUI-06 | `disponibilitaAvvio("SCONOSCIUTO", "ORDINARIO_A_PAGAMENTO")`                                                                                                                            | `{ disponibile: false, motivo: "Lo stato dello stallo non è affidabile: la sosta non si può avviare." }`                              | RF_SOSTA_1  |
| TF-AVVUI-07 | `disponibilitaAvvio("LIBERO", "DISABILI")`                                                                                                                                              | `{ disponibile: false, motivo: "Lo stallo risulta libero: la sosta si avvia quando il sensore rileva il veicolo." }` (prima lo stato) | RF_SOSTA_1  |
| TF-AVVUI-08 | `disponibilitaAvvio("GUASTO", "ORDINARIO_A_PAGAMENTO")`                                                                                                                                 | `{ disponibile: false, motivo: "La sosta non si può avviare su questo stallo." }`                                                     | ISSUE_29    |
| TF-AVVUI-09 | `disponibilitaAvvio("OCCUPATO", "CARICO_SCARICO")`                                                                                                                                      | `{ disponibile: false, motivo: "La sosta non si può avviare su questo stallo." }`                                                     | ISSUE_29    |
| TF-AVVUI-10 | `opzioniDurata(120)`                                                                                                                                                                    | `[15, 30, 45, 60, 75, 90, 105, 120]`                                                                                                  | RF_SOSTA_1  |
| TF-AVVUI-11 | `opzioniDurata(50)`                                                                                                                                                                     | `[15, 30, 45, 50]`                                                                                                                    | RF_SOSTA_1  |
| TF-AVVUI-12 | `opzioniDurata(10)`                                                                                                                                                                     | `[]`                                                                                                                                  | RF_SOSTA_1  |
| TF-AVVUI-13 | `durataPredefinita(180)`                                                                                                                                                                | `60`                                                                                                                                  | NRF_USA_2   |
| TF-AVVUI-14 | `durataPredefinita(45)`                                                                                                                                                                 | `45`                                                                                                                                  | NRF_USA_2   |
| TF-AVVUI-15 | `durataPredefinita(10)`                                                                                                                                                                 | `null`                                                                                                                                | ISSUE_29    |
| TF-AVVUI-16 | `etichettaDurata(45)`                                                                                                                                                                   | `"45 min"`                                                                                                                            | ISSUE_29    |
| TF-AVVUI-17 | `etichettaDurata(120)`                                                                                                                                                                  | `"2 h"`                                                                                                                               | ISSUE_29    |
| TF-AVVUI-18 | `etichettaDurata(90)`                                                                                                                                                                   | `"1 h 30 min"`                                                                                                                        | ISSUE_29    |
| TF-AVVUI-19 | `creditoSufficiente(1000, 300)`                                                                                                                                                         | `true`                                                                                                                                | RF_WALLET_2 |
| TF-AVVUI-20 | `creditoSufficiente(300, 300)`                                                                                                                                                          | `true`                                                                                                                                | RF_WALLET_2 |
| TF-AVVUI-21 | `creditoSufficiente(50, 150)`                                                                                                                                                           | `false`                                                                                                                               | RF_WALLET_2 |
| TF-AVVUI-22 | `creditoSufficiente(0, 0)`                                                                                                                                                              | `true`                                                                                                                                | RF_WALLET_2 |
| TF-AVVUI-23 | `etichettaConferma(300)`                                                                                                                                                                | `"Conferma e paga (3,00 €)"`                                                                                                          | NRF_USA_2   |
| TF-AVVUI-24 | `interpretaRisposta(201, { sosta: 41, orarioDiAvvio: "2026-11-20T08:42:00.000Z", orarioDiScadenza: "2026-11-20T10:42:00.000Z", importo: 300, pagamento: "PAGATA" }, CAMPI_AVVIO_SOSTA)` | `{ esito: "successo", dati: <corpo> }`                                                                                                | RF_SOSTA_1  |
| TF-AVVUI-25 | `interpretaRisposta(409, { errore: { codice: "CREDITO_INSUFFICIENTE", messaggio: <msg> } }, CAMPI_AVVIO_SOSTA)`                                                                         | `{ esito: "errore", campo: "credito", messaggio: <msg> }`                                                                             | RF_WALLET_2 |
| TF-AVVUI-26 | `interpretaRisposta(422, { errore: { codice: "DURATA_NON_VALIDA", messaggio: <msg> } }, CAMPI_AVVIO_SOSTA)`                                                                             | `{ esito: "errore", campo: "durata", messaggio: <msg> }`                                                                              | RF_SOSTA_1  |
| TF-AVVUI-27 | `interpretaRisposta(422, { errore: { codice: "TARGA_NON_NEL_PROFILO", messaggio: <msg> } }, CAMPI_AVVIO_SOSTA)`                                                                         | `{ esito: "errore", campo: "targa", messaggio: <msg> }`                                                                               | VD_3        |
| TF-AVVUI-28 | `interpretaRisposta(409, { errore: { codice: "SOSTA_GIA_ATTIVA", messaggio: <msg> } }, CAMPI_AVVIO_SOSTA)`                                                                              | `{ esito: "errore", campo: "targa", messaggio: <msg> }`                                                                               | RF_SOSTA_1  |
| TF-AVVUI-29 | `interpretaRisposta(409, { errore: { codice: "STALLO_NON_OCCUPATO", messaggio: <msg> } }, CAMPI_AVVIO_SOSTA)`                                                                           | `{ esito: "errore", campo: "generale", messaggio: <msg> }`                                                                            | RF_SOSTA_1  |
| TF-AVVUI-30 | `interpretaRisposta(401, { errore: { codice: "SESSIONE_NON_VALIDA", messaggio: <msg> } }, CAMPI_AVVIO_SOSTA)`                                                                           | `{ esito: "sessioneScaduta" }`                                                                                                        | NRF_SIC_1   |

Totale 30: 9 sulla disponibilità di «Avvia sosta» (stato e tipo), 9 sulla durata, 4 sul credito, 1 sul pulsante di conferma, 7 sull'esito dell'avvio.

Note sui riferimenti:

- TF-AVVUI-01, 04…07: RF_SOSTA_1 e `UC_SOSTA_1` (entry condition e 2.a1: avvio solo su stallo `Occupato`); l'issue: «Avvia sosta» compare solo se lo stallo è Occupato.
- TF-AVVUI-02: decisione D2 del piano (rosa senza permesso, come il server; discrepanza con VD_8 e `SC_UT_6` da risolvere in COD-20). TF-AVVUI-03: RF_SOSTA_5 e `UC_SOSTA_1` 2.a4, avvio sugli stalli per disabili rinviato a COD-20 (fuori scope dell'issue).
- TF-AVVUI-10…12: RF_SOSTA_1 (durata entro il massimo dello stallo) e la durata minima di 15 minuti (`cp_calcoloImporto.md` §2). TF-AVVUI-13, 14, 23: NRF_USA_2 (durata già proposta e importo nel pulsante dell'interazione 3).
- TF-AVVUI-19…22: RF_WALLET_2 e `UC_SOSTA_1` 5.a1 (controllo anticipato del credito; il server resta l'autorità con `CREDITO_INSUFFICIENTE`, TF-AVVUI-25). TF-AVVUI-22: sosta gratuita.
- TF-AVVUI-27: VD_3 (la targa deve essere del profilo). TF-AVVUI-30: come `cp_risposteApi.md` TF-RAP-11.

## 6. Note

- **Già verificati altrove** (nessun frame qui): regole generali di `interpretaRisposta`, `cp_risposteApi.md`; codici e status di `POST /api/soste`, `cp_apiWalletSoste.md`; calcolo dell'importo, `cp_calcoloImporto.md` e `cp_apiImporto.md`; formato degli importi, `cp_formatoImporti.md`.
- Il conteggio delle tre interazioni e la ricarica che conserva targa e durata si verificano a mano sull'anteprima (COD-19 per la misura formale).
