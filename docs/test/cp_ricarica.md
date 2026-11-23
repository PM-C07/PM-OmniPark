# cp_ricarica

Specifica dei casi di test (category partition) del servizio Ricarica, operazione `ricarica(automobilista, importo)`.
Requisito: RF_WALLET_1 (wallet e ricarica simulata), UC_WALLET_1.

## Parametri e ambiente

- `automobilista`: identificativo dell'Automobilista.
- `importo`: in centesimi; i tagli previsti da UC_WALLET_1 sono 5, 10 e 20 € (500, 1000, 2000).
- Ambiente: il Wallet riceve dall'esterno un servizio di pagamento che implementa `PagamentoSimulato`. Nei test è il simulatore dei pagamenti con latenza 0; un automobilista indicato tra gli automobilisti di prova della sua configurazione riceve sempre `RIFIUTATO`.

## Categorie e scelte

**Importo**

1. 500 (5 €)
2. 1000 (10 €)
3. 2000 (20 €)
4. diverso dai tagli previsti, per esempio 1500 [error]
5. zero o negativo [error]

**Esito del pagamento**

1. `APPROVATO`
2. `RIFIUTATO` [error]

**Wallet**

1. presente
2. assente (automobilista inesistente) [error]

Vincolo: con un importo non previsto il servizio di pagamento non viene interpellato.

## Frame ed esiti attesi

| Frame | Importo | Pagamento | Wallet   | Esito atteso                                                             |
| ----- | ------- | --------- | -------- | ------------------------------------------------------------------------ |
| TF-01 | 500     | approvato | presente | un movimento di ricarica da 500, saldo aumentato di 500                  |
| TF-02 | 1000    | approvato | presente | un movimento di ricarica da 1000, saldo aumentato di 1000                |
| TF-03 | 2000    | approvato | presente | un movimento di ricarica da 2000, saldo aumentato di 2000                |
| TF-04 | 1500    | –         | presente | errore `IMPORTO_NON_PREVISTO`, nessun movimento, pagamento non richiesto |
| TF-05 | 0       | –         | presente | errore `IMPORTO_NON_PREVISTO`, nessun movimento, pagamento non richiesto |
| TF-06 | 500     | rifiutato | presente | errore `PAGAMENTO_RIFIUTATO`, nessun movimento, saldo invariato          |
| TF-07 | 500     | –         | assente  | errore `WALLET_NON_TROVATO`, nessun movimento                            |

Il rifiuto del pagamento corrisponde all'On failure di UC_WALLET_1: il saldo resta invariato.
