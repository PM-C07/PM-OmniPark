# cp_addebito

Specifica dei casi di test (category partition) del servizio Addebito, operazione `addebita`: addebito dell'importo di una sosta sul wallet dell'Automobilista, eseguito nella transazione del chiamante.
Requisito: RF_WALLET_2 (addebito della sosta).

## Parametri e ambiente

- La transazione del chiamante (Gestione soste), l'Automobilista, l'importo in centesimi e la sosta a cui l'addebito si riferisce.
- Ambiente: wallet con saldo noto, preparato con ricariche nel database di test.

## Categorie e scelte

**Importo**

1. positivo
2. zero (sosta gratuita) [single]
3. negativo [error]

**Saldo rispetto all'importo**

1. maggiore
2. uguale [single]
3. minore [error]

**Transazione del chiamante**

1. confermata
2. annullata dal chiamante dopo l'addebito [single]

**Sosta da addebitare**

1. dello stesso Automobilista, con pagamento `PAGATA`
2. di un altro Automobilista [error]
3. con pagamento `GRATUITA` [error]

**Concorrenza**

1. richiesta singola
2. due addebiti simultanei, saldo sufficiente per uno solo [single]
3. due addebiti simultanei, saldo sufficiente per entrambi [single]

## Frame ed esiti attesi

| Frame | Saldo iniziale | Importo   | Transazione / Concorrenza       | Esito atteso                                                             |
| ----- | -------------- | --------- | ------------------------------- | ------------------------------------------------------------------------ |
| TF-01 | 1000           | 300       | confermata, singola             | addebito registrato, saldo 700                                           |
| TF-02 | 1000           | 1000      | confermata, singola             | addebito registrato, saldo 0                                             |
| TF-03 | 1000           | 1500      | singola                         | errore `CREDITO_INSUFFICIENTE`, nessun movimento, saldo 1000             |
| TF-04 | 1000           | 0         | confermata, singola             | nessun movimento, saldo 1000                                             |
| TF-05 | 1000           | -100      | singola                         | errore `IMPORTO_NON_VALIDO`, nessun movimento                            |
| TF-06 | 1000           | 300       | annullata dal chiamante         | nessun movimento, saldo 1000                                             |
| TF-07 | 1000           | 700 e 700 | due simultanei                  | uno registrato, l'altro `CREDITO_INSUFFICIENTE`; saldo 300, mai negativo |
| TF-08 | 1000           | 400 e 400 | due simultanei                  | entrambi registrati, saldo 200                                           |
| TF-09 | 1000           | 300       | sosta di un altro Automobilista | errore `SOSTA_NON_ADDEBITABILE`, nessun movimento, saldo 1000            |
| TF-10 | 1000           | 300       | sosta `GRATUITA`                | errore `SOSTA_NON_ADDEBITABILE`, nessun movimento, saldo 1000 (VD_10)    |

Dove non indicato, la sosta è dello stesso Automobilista e `PAGATA`. Le due richieste simultanee usano due connessioni distinte, ciascuna con la propria transazione.
