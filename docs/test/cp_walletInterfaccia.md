# cp_walletInterfaccia

Specifica dei casi di test (category partition) della logica del wallet nell'interfaccia: funzioni pure di `src/presentation/logica/wallet.ts`, usate dal pannello Wallet del boundary `:SchermataProfilo` (`MU_3`) e dalla ricarica proposta con il credito insufficiente nella scheda dello stallo.
Requisiti: RF_WALLET_1 (wallet e ricarica simulata), RF_WALLET_2 (credito insufficiente nell'avvio e nel prolungamento), RF_WALLET_3 (cronologia del wallet). Task OMP-58 (issue #29); dalla OMP-61 (issue #33, blocco B) messaggio della ricarica approvata e riquadro della ricarica nei flussi di avvio e prolungamento (DIF-03), TF-WALUI-13…19; dalla OMP-65 (issue #45) riga della cronologia, TF-WALUI-20, 21.

- **Fonti dell'esito atteso:** `UC_WALLET_1` (passo 1: tagli 5, 10 o 20 €; On failure: il saldo non cambia), `SD_WALLET_1`, `cp_apiWalletSoste.md` §2 (`POST /api/wallet/ricarica` → 200 `{ saldo }`, codici `IMPORTO_NON_PREVISTO` e `PAGAMENTO_RIFIUTATO`), `cp_ricarica.md` (TF-04…06), issue #29 (categorie minime: taglio di ricarica 5, 10, 20 €; esito della ricarica approvata o rifiutata), piano approvato di OMP-58 (punto 8, decisione D3: il rifiuto è coperto da questi test e non dalla verifica manuale); dalla OMP-61: `UC_WALLET_1` passo 4 («registra la ricarica …, aggiorna il saldo e lo mostra; se la ricarica è partita da `UC_SOSTA_1` o `UC_SOSTA_2`, il flusso torna al caso d'uso di partenza»), `UC_SOSTA_1` 5.a1 e `UC_SOSTA_2` 5.a1, `np_01_automobilista` (ErrCredito → Ricarica → «torna alla conferma»), `docs/test/test_di_sistema.md` §8 DIF-03.
- **File di test:** `src/presentation/logica/wallet.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` o `ISSUE_33` per le scelte delle issue #29 e #33 e dei piani approvati di OMP-58 e OMP-61.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_WALLET_1 · TF-WALUI-08 · PAGAMENTO_RIFIUTATO → rifiutata con il messaggio`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/wallet.ts — nessuna dipendenza da React né dai sottosistemi
const TAGLI_RICARICA: readonly number[]; // centesimi; duplicati da UC_WALLET_1 solo per l'interfaccia, il server resta l'autorità
eTaglioPrevisto(importo: number): boolean;
type EsitoRicarica =
  | { esito: "approvata"; saldo: number }
  | { esito: "rifiutata"; messaggio: string }
  | { esito: "errore"; messaggio: string }
  | { esito: "sessioneScaduta" };
esitoRicarica(status: number, corpo: unknown): EsitoRicarica;
// dalla OMP-61
messaggioRicaricaApprovata(importo: number, saldo: number): string; // centesimi
type RiquadroRicarica = "proposta" | "approvata" | "nessuno";
riquadroRicarica(stato: { creditoScarso: boolean; erroreCredito: boolean; ricaricaApprovata: boolean }): RiquadroRicarica;
// dalla OMP-65: un elemento di GET /api/wallet/movimenti (cp_apiWalletSoste.md §2) e la riga che lo mostra
type MovimentoApi = {
  id: number;
  tipoDiMovimento: "RICARICA" | "ADDEBITO";
  importo: number; // centesimi, positivo
  dataEOra: string; // ISO 8601
  sosta: { id: number; targa: string; numeroStallo: number; area: string } | null;
};
type RigaMovimento = { tipo: string; importo: string; dataEOra: string; targa: string | null; stallo: string | null };
rigaMovimento(movimento: MovimentoApi): RigaMovimento;
```

Regole di `esitoRicarica`, in quest'ordine:

1. status da 200 a 299 con corpo `{ saldo }` e `saldo` intero → `{ esito: "approvata", saldo }`;
2. corpo con `errore.codice` `SESSIONE_NON_VALIDA` → `{ esito: "sessioneScaduta" }`;
3. corpo con `errore.codice` `PAGAMENTO_RIFIUTATO` e messaggio stringa non vuota → `{ esito: "rifiutata", messaggio }`;
4. altro errore nella forma `{ errore: { codice, messaggio } }` → `{ esito: "errore", messaggio }`;
5. altrimenti (successo senza `saldo` intero, corpo di forma diversa) → `{ esito: "errore", messaggio: "Si è verificato un errore. Riprova più tardi." }`.

**`messaggioRicaricaApprovata(importo, saldo)`** = `"Ricarica di " + formattaEuro(importo) + " approvata. Nuovo saldo: " + formattaEuro(saldo) + "."` (`cp_formatoImporti.md`). È il messaggio del componente `Ricarica` (OMP-58), spostato nella logica perché lo mostrano anche la scheda dello stallo e il prolungamento.

**`riquadroRicarica`** decide che cosa mostra, nella conferma dell'avvio o del prolungamento, il riquadro della ricarica:

1. `creditoScarso` (saldo noto minore dell'importo) oppure `erroreCredito` (il server ha risposto `CREDITO_INSUFFICIENTE`) → `"proposta"`: avviso «Credito insufficiente» con la ricarica (`UC_SOSTA_1` 5.a1, `UC_SOSTA_2` 5.a1);
2. altrimenti, se una ricarica di questo flusso è stata approvata (`ricaricaApprovata`) → `"approvata"`: resta visibile `messaggioRicaricaApprovata` con il nuovo saldo, e la conferma è di nuovo possibile (`UC_WALLET_1` passo 4, DIF-03);
3. altrimenti → `"nessuno"`.

`ricaricaApprovata` torna falso quando il flusso si chiude (conferma riuscita o annullamento).

**`rigaMovimento(movimento)`** (dalla OMP-65) compone la riga della sezione «Movimenti» (`UC_WALLET_3` passo 2):

- `tipo`: `"Ricarica"` per `RICARICA`, `"Addebito"` per `ADDEBITO` (i tipi del class diagram; un prolungamento è un altro addebito della stessa sosta, decisione C2 del piano di OMP-65);
- `importo`: `"+"` + `formattaEuro(importo)` per la ricarica, `"−"` (U+2212, segno meno) + `formattaEuro(importo)` per l'addebito;
- `dataEOra`: `formattaDataOra(dataEOra)` («09/11/2026 16:00» nel fuso Europe/Rome), spostata in `importi.ts` accanto a `formattaOra` e riesportata da `mappaSegnalazioni.ts`;
- `targa`: la targa della sosta; `null` per la ricarica;
- `stallo`: `"Stallo " + numeroStallo + " · " + area`; `null` per la ricarica.

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM. I messaggi dei corpi sono quelli del Wallet: `PAGAMENTO_RIFIUTATO` «Il pagamento è stato rifiutato. Il saldo non è cambiato.», `IMPORTO_NON_PREVISTO` «Puoi ricaricare solo 5, 10 o 20 €.». Negli importi dei testi attesi lo spazio prima di `€` è quello indivisibile di `formattaEuro` (`cp_formatoImporti.md`).

## 4. Categorie e scelte

**Taglio di ricarica:** 5 € · 10 € · 20 € · non previsto [error] · zero [error].

**Esito della ricarica:** approvata · rifiutata [error] · importo non previsto [error] · sessione scaduta [error] · risposta di successo senza saldo [error] · risposta non riconosciuta [error].

**Messaggio della ricarica approvata** (dalla OMP-61): taglio e saldo · saldo con decimali.

**Riquadro della ricarica** (dalla OMP-61): credito scarso · errore di credito dal server · ricarica approvata con il credito ora sufficiente (DIF-03) · ricarica approvata ma credito ancora scarso [single] · nessuna ricarica, credito sufficiente.

**Riga della cronologia** (dalla OMP-65): ricarica · addebito con targa e stallo.

Dati della riga della cronologia (movimenti 4 e 6 del wallet di Marco Rossi, `cp_movimenti.md` §3):

- `M4` = `{ id: 4, tipoDiMovimento: "RICARICA", importo: 1000, dataEOra: "2026-11-02T09:18:00.000Z", sosta: null }`;
- `R4` = `{ tipo: "Ricarica", importo: "+10,00 €", dataEOra: "02/11/2026 10:18", targa: null, stallo: null }`;
- `M6` = `{ id: 6, tipoDiMovimento: "ADDEBITO", importo: 300, dataEOra: "2026-11-09T15:00:00.000Z", sosta: { id: 9, targa: "MN234PQ", numeroStallo: 102, area: "Via Roma" } }`;
- `R6` = `{ tipo: "Addebito", importo: "−3,00 €", dataEOra: "09/11/2026 16:00", targa: "MN234PQ", stallo: "Stallo 102 · Via Roma" }`.

## 5. Test frame (21)

| Frame       | Chiamata                                                                                                                                   | Esito atteso                                                                                    | Riferimento |
| :---------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :---------- |
| TF-WALUI-01 | `TAGLI_RICARICA`                                                                                                                           | `[500, 1000, 2000]`                                                                             | RF_WALLET_1 |
| TF-WALUI-02 | `eTaglioPrevisto(500)`                                                                                                                     | `true`                                                                                          | RF_WALLET_1 |
| TF-WALUI-03 | `eTaglioPrevisto(1000)`                                                                                                                    | `true`                                                                                          | RF_WALLET_1 |
| TF-WALUI-04 | `eTaglioPrevisto(2000)`                                                                                                                    | `true`                                                                                          | RF_WALLET_1 |
| TF-WALUI-05 | `eTaglioPrevisto(1500)`                                                                                                                    | `false`                                                                                         | RF_WALLET_1 |
| TF-WALUI-06 | `eTaglioPrevisto(0)`                                                                                                                       | `false`                                                                                         | RF_WALLET_1 |
| TF-WALUI-07 | `esitoRicarica(200, { saldo: 1600 })`                                                                                                      | `{ esito: "approvata", saldo: 1600 }`                                                           | RF_WALLET_1 |
| TF-WALUI-08 | `esitoRicarica(409, { errore: { codice: "PAGAMENTO_RIFIUTATO", messaggio: "Il pagamento è stato rifiutato. Il saldo non è cambiato." } })` | `{ esito: "rifiutata", messaggio: "Il pagamento è stato rifiutato. Il saldo non è cambiato." }` | RF_WALLET_1 |
| TF-WALUI-09 | `esitoRicarica(422, { errore: { codice: "IMPORTO_NON_PREVISTO", messaggio: "Puoi ricaricare solo 5, 10 o 20 €." } })`                      | `{ esito: "errore", messaggio: "Puoi ricaricare solo 5, 10 o 20 €." }`                          | RF_WALLET_1 |
| TF-WALUI-10 | `esitoRicarica(401, { errore: { codice: "SESSIONE_NON_VALIDA", messaggio: "La sessione non è valida." } })`                                | `{ esito: "sessioneScaduta" }`                                                                  | NRF_SIC_1   |
| TF-WALUI-11 | `esitoRicarica(200, { saldo: "1600" })`                                                                                                    | `{ esito: "errore", messaggio: "Si è verificato un errore. Riprova più tardi." }`               | ISSUE_29    |
| TF-WALUI-12 | `esitoRicarica(502, "<html>Bad gateway</html>")`                                                                                           | `{ esito: "errore", messaggio: "Si è verificato un errore. Riprova più tardi." }`               | ISSUE_29    |
| TF-WALUI-13 | `messaggioRicaricaApprovata(500, 500)`                                                                                                     | `"Ricarica di 5,00 € approvata. Nuovo saldo: 5,00 €."`                                          | RF_WALLET_1 |
| TF-WALUI-14 | `messaggioRicaricaApprovata(1000, 1050)`                                                                                                   | `"Ricarica di 10,00 € approvata. Nuovo saldo: 10,50 €."`                                        | RF_WALLET_1 |
| TF-WALUI-15 | `riquadroRicarica({ creditoScarso: true, erroreCredito: false, ricaricaApprovata: false })`                                                | `"proposta"`                                                                                    | RF_WALLET_2 |
| TF-WALUI-16 | `riquadroRicarica({ creditoScarso: false, erroreCredito: true, ricaricaApprovata: false })`                                                | `"proposta"`                                                                                    | RF_WALLET_2 |
| TF-WALUI-17 | `riquadroRicarica({ creditoScarso: false, erroreCredito: false, ricaricaApprovata: true })`                                                | `"approvata"`                                                                                   | RF_WALLET_1 |
| TF-WALUI-18 | `riquadroRicarica({ creditoScarso: true, erroreCredito: false, ricaricaApprovata: true })`                                                 | `"proposta"`                                                                                    | RF_WALLET_2 |
| TF-WALUI-19 | `riquadroRicarica({ creditoScarso: false, erroreCredito: false, ricaricaApprovata: false })`                                               | `"nessuno"`                                                                                     | ISSUE_33    |
| TF-WALUI-20 | `rigaMovimento(M4)` (§4, dati della riga della cronologia)                                                                                 | `R4`                                                                                            | RF_WALLET_3 |
| TF-WALUI-21 | `rigaMovimento(M6)` (§4, dati della riga della cronologia)                                                                                 | `R6`                                                                                            | RF_WALLET_3 |

Totale 21: 6 sui tagli, 6 sull'esito della ricarica, 2 sul messaggio della ricarica approvata, 5 sul riquadro della ricarica, 2 sulla riga della cronologia.

Note sui riferimenti:

- TF-WALUI-01…06: RF_WALLET_1 e `UC_WALLET_1` passo 1 (tagli 5, 10 o 20 €); la costante è duplicata nell'interfaccia e il server la ricontrolla (`IMPORTO_NON_PREVISTO`, TF-WALUI-09).
- TF-WALUI-07, 08: categoria minima dell'issue «esito della ricarica (approvata; rifiutata)»; il rifiuto è l'On failure di `UC_WALLET_1` (`cp_ricarica.md` TF-06). Decisione D3: in anteprima il simulatore non rifiuta i tagli previsti, quindi il rifiuto è verificato solo qui.
- TF-WALUI-11, 12: risposta non riconosciuta, come `cp_risposteApi.md` TF-RAP-17.
- TF-WALUI-13, 14: `UC_WALLET_1` passo 4 («aggiorna il saldo e lo mostra»), con il testo del componente `Ricarica` di OMP-58.
- TF-WALUI-15, 16, 18: `UC_SOSTA_1` 5.a1 e `UC_SOSTA_2` 5.a1 (proposta di ricarica con il credito insufficiente); TF-WALUI-18: dopo una ricarica che non basta la proposta resta, con il messaggio della ricarica approvata dentro il componente `Ricarica`.
- TF-WALUI-20, 21 (OMP-65): `UC_WALLET_3` passo 2, con i movimenti 4 e 6 del wallet di Marco Rossi (`cp_movimenti.md` §3). Nei testi attesi lo spazio prima di `€` è quello indivisibile di `formattaEuro` e il segno dell'addebito è U+2212.
- TF-WALUI-17 riproduce **DIF-03** (`test_di_sistema.md` §8): in OMP-58 il riquadro dipendeva solo dal credito scarso o dall'errore di credito, e con il credito tornato sufficiente spariva insieme al messaggio e al nuovo saldo; ora mostra la ricarica approvata (`UC_WALLET_1` passo 4). Il frame fallisce prima della correzione perché la funzione non esiste; nel flusso reale lo riproduce TS-01 passo 5 (Blocco C).

## 6. Note

- **Già verificati altrove** (nessun frame qui): ricarica e rifiuto lato server, `cp_ricarica.md` e `cp_apiWalletSoste.md`; formato del saldo, `cp_formatoImporti.md`.
- Riepilogo, conferma, annullamento e pulsante disabilitato durante l'invio si verificano a mano sull'anteprima. Dalla OMP-65 si verificano a mano anche il messaggio della cronologia vuota, l'avviso con i movimenti non disponibili e la ricarica che compare nella sezione «Movimenti» senza ricaricare la pagina. Il riquadro «approvata» nella scheda dello stallo e nel prolungamento si verifica con TS-01 passo 5 e TS-15.
