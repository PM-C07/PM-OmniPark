# cp_saldo

Specifica dei casi di test (category partition) del servizio Conto, operazione `saldo(automobilista)`.
Requisito: RF_WALLET_1 (wallet virtuale dell'Automobilista).

## Parametri e ambiente

- `automobilista`: identificativo dell'Automobilista.
- Ambiente: database di test; il saldo non è memorizzato e si calcola dai movimenti del wallet.

## Categorie e scelte

**Wallet**

1. presente
2. assente (automobilista inesistente) [error]

**Movimenti registrati**

1. nessuno
2. solo ricariche
3. ricariche e addebiti

## Frame ed esiti attesi

| Frame | Wallet   | Movimenti            | Esito atteso                                  |
| ----- | -------- | -------------------- | --------------------------------------------- |
| TF-01 | presente | nessuno              | saldo 0                                       |
| TF-02 | presente | solo ricariche       | saldo uguale alla somma delle ricariche       |
| TF-03 | presente | ricariche e addebiti | saldo uguale alle ricariche meno gli addebiti |
| TF-04 | assente  | –                    | errore `WALLET_NON_TROVATO`                   |

Gli importi sono in centesimi.
