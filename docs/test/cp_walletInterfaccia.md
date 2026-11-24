# cp_walletInterfaccia

Specifica dei casi di test (category partition) della logica del wallet nell'interfaccia: funzioni pure di `src/presentation/logica/wallet.ts`, usate dal pannello Wallet del boundary `:SchermataProfilo` (`MU_3`) e dalla ricarica proposta con il credito insufficiente nella scheda dello stallo.
Requisiti: RF_WALLET_1 (wallet e ricarica simulata). Task OMP-58 (issue #29).

- **Fonti dell'esito atteso:** `UC_WALLET_1` (passo 1: tagli 5, 10 o 20 €; On failure: il saldo non cambia), `SD_WALLET_1`, `cp_apiWalletSoste.md` §2 (`POST /api/wallet/ricarica` → 200 `{ saldo }`, codici `IMPORTO_NON_PREVISTO` e `PAGAMENTO_RIFIUTATO`), `cp_ricarica.md` (TF-04…06), issue #29 (categorie minime: taglio di ricarica 5, 10, 20 €; esito della ricarica approvata o rifiutata), piano approvato di OMP-58 (punto 8, decisione D3: il rifiuto è coperto da questi test e non dalla verifica manuale).
- **File di test:** `src/presentation/logica/wallet.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` per le scelte dell'issue #29 e del piano approvato.

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
```

Regole di `esitoRicarica`, in quest'ordine:

1. status da 200 a 299 con corpo `{ saldo }` e `saldo` intero → `{ esito: "approvata", saldo }`;
2. corpo con `errore.codice` `SESSIONE_NON_VALIDA` → `{ esito: "sessioneScaduta" }`;
3. corpo con `errore.codice` `PAGAMENTO_RIFIUTATO` e messaggio stringa non vuota → `{ esito: "rifiutata", messaggio }`;
4. altro errore nella forma `{ errore: { codice, messaggio } }` → `{ esito: "errore", messaggio }`;
5. altrimenti (successo senza `saldo` intero, corpo di forma diversa) → `{ esito: "errore", messaggio: "Si è verificato un errore. Riprova più tardi." }`.

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM. I messaggi dei corpi sono quelli del Wallet: `PAGAMENTO_RIFIUTATO` «Il pagamento è stato rifiutato. Il saldo non è cambiato.», `IMPORTO_NON_PREVISTO` «Puoi ricaricare solo 5, 10 o 20 €.».

## 4. Categorie e scelte

**Taglio di ricarica:** 5 € · 10 € · 20 € · non previsto [error] · zero [error].

**Esito della ricarica:** approvata · rifiutata [error] · importo non previsto [error] · sessione scaduta [error] · risposta di successo senza saldo [error] · risposta non riconosciuta [error].

## 5. Test frame (12)

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

Totale 12: 6 sui tagli, 6 sull'esito della ricarica.

Note sui riferimenti:

- TF-WALUI-01…06: RF_WALLET_1 e `UC_WALLET_1` passo 1 (tagli 5, 10 o 20 €); la costante è duplicata nell'interfaccia e il server la ricontrolla (`IMPORTO_NON_PREVISTO`, TF-WALUI-09).
- TF-WALUI-07, 08: categoria minima dell'issue «esito della ricarica (approvata; rifiutata)»; il rifiuto è l'On failure di `UC_WALLET_1` (`cp_ricarica.md` TF-06). Decisione D3: in anteprima il simulatore non rifiuta i tagli previsti, quindi il rifiuto è verificato solo qui.
- TF-WALUI-11, 12: risposta non riconosciuta, come `cp_risposteApi.md` TF-RAP-17.

## 6. Note

- **Già verificati altrove** (nessun frame qui): ricarica e rifiuto lato server, `cp_ricarica.md` e `cp_apiWalletSoste.md`; formato del saldo, `cp_formatoImporti.md`.
- Riepilogo, conferma, annullamento e pulsante disabilitato durante l'invio si verificano a mano sull'anteprima.
