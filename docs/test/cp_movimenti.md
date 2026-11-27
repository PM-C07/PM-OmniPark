# cp_movimenti

Specifica dei casi di test (category partition) del servizio Conto, operazione `movimenti(automobilista)`, esposta dalla Facade di Wallet.
Requisito: RF_WALLET_3 (saldo e cronologia del wallet), `UC_WALLET_3`, `SD_WALLET_3`. Task OMP-65 (COD-24, issue #45).

- **Fonti dell'esito atteso:** `UC_WALLET_3` passo 2 («la cronologia dei movimenti, dal più recente: ricariche e addebiti con data, ora, importo e, per gli addebiti, la sosta e la targa») e 2.a1 (cronologia vuota), `SD_WALLET_3` (`2.2: movimenti()`, `2.3: sostaETarga()`), class diagram (`TipoMovimento` = `RICARICA` | `ADDEBITO`), vincolo di dominio 4 (un addebito è collegato a una sola sosta), issue #45 (stallo con numero e area per gli addebiti; al massimo gli ultimi 50 movimenti; movimenti di un altro Automobilista non visibili), piano approvato di OMP-65 (decisione C1: targa e stallo insieme negli addebiti; decisione C2: il tipo resta quello del class diagram, un prolungamento compare come un secondo addebito della stessa sosta).
- **File di test:** `src/application/wallet/movimenti.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento: `RF_WALLET_3` se il comportamento è nel testo del requisito o in `UC_WALLET_3`; altrimenti `ISSUE_45` per le scelte dell'issue #45 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_WALLET_3 · TF-CRON-02 · wallet senza movimenti → elenco vuoto`.

## 2. Operazione verificata (firma)

```ts
// src/application/wallet/facade.ts
movimenti(automobilista: number): Promise<MovimentoDellaCronologia[]>;

type MovimentoDellaCronologia = {
  id: number;
  tipoDiMovimento: "RICARICA" | "ADDEBITO";
  importo: number; // centesimi, sempre positivo: il segno lo dà il tipo
  dataEOra: Date;
  /** null per le ricariche; per gli addebiti la sosta con targa e stallo (numero e nome dell'area). */
  sosta: { id: number; targa: string; numeroStallo: number; area: string } | null;
};
```

Regole:

1. automobilista senza wallet → errore `WALLET_NON_TROVATO` (come `saldo`, `cp_saldo.md` TF-04);
2. solo i movimenti del wallet dell'automobilista indicato;
3. ordine per data e ora decrescente, poi id decrescente;
4. al massimo 50 movimenti (`LIMITE_MOVIMENTI`): i 50 più recenti secondo l'ordine della regola 3.

Un prolungamento non ha un tipo proprio: compare come un altro addebito della stessa sosta, con la stessa targa e lo stesso stallo (decisione C2).

## 3. Ambiente

- Database di test con lo schema e i dati di esempio (`preparaDatabaseDiTest()` prima di ogni frame); Facade creata con `creaFacadeWallet` sul `poolDiTest()`, con il `SimulatorePagamento` a latenza 0 e un orologio fisso (l'operazione non li usa).
- **Automobilista nuovo:** `creaAutomobilista` e `creaWallet` della persistenza, con email propria del frame; nasce senza movimenti.
- **Ricarica di preparazione:** `registraRicarica` della persistenza sul wallet, con l'importo e l'istante indicati.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

Marco Rossi: automobilista 8, wallet 2, veicolo con targa `MN234PQ`. Stallo 10 = numero 101, stallo 11 = numero 102, entrambi nell'area 4 «Via Roma».

| Movimento | Tipo       | Importo | Data e ora             | Sosta | Stallo della sosta |
| :-------- | :--------- | ------: | :--------------------- | :---- | :----------------- |
| 1         | `RICARICA` |     500 | 2026-10-31 08:30+01:00 | —     | —                  |
| 2         | `ADDEBITO` |     150 | 2026-10-31 09:00+01:00 | 1     | 10                 |
| 3         | `ADDEBITO` |     300 | 2026-11-02 08:42+01:00 | 2     | 11                 |
| 4         | `RICARICA` |    1000 | 2026-11-02 10:18+01:00 | —     | —                  |
| 5         | `ADDEBITO` |     150 | 2026-11-02 10:20+01:00 | 2     | 11                 |
| 6         | `ADDEBITO` |     300 | 2026-11-09 16:00+01:00 | 9     | 11                 |

Il movimento 5 è il prolungamento della sosta 2 (`SC_UT_5`, `scenari_ut.md`): secondo addebito della stessa sosta.

## 4. Categorie e scelte

**Wallet:** presente · assente (automobilista inesistente) [error].

**Tipo dei movimenti:** ricarica · addebito (con sosta, targa e stallo), anche più di uno per la stessa sosta.

**Quantità:** nessuno [single] · fino a 50 · oltre 50 [single].

**Proprietà:** movimenti solo dell'automobilista · presenti anche movimenti di altri automobilisti.

**Ordine:** date diverse, dal più recente.

## 5. Test frame (5)

| Frame      | Preparazione e chiamata                                                                                                                                       | Esito atteso                                                                                                                                                                                                                                                                                                                                                     | Riferimento |
| :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-CRON-01 | dataset; `movimenti(8)` (Marco Rossi)                                                                                                                         | 6 movimenti con id 6, 5, 4, 3, 2, 1 in quest'ordine; tipo, importo e data e ora come nel dataset (§3); 4 e 1 con `sosta: null`; 6 con `{ id: 9, targa: "MN234PQ", numeroStallo: 102, area: "Via Roma" }`; 5 e 3 con `{ id: 2, targa: "MN234PQ", numeroStallo: 102, area: "Via Roma" }`; 2 con `{ id: 1, targa: "MN234PQ", numeroStallo: 101, area: "Via Roma" }` | RF_WALLET_3 |
| TF-CRON-02 | automobilista nuovo senza movimenti; `movimenti(automobilista)`                                                                                               | `[]`                                                                                                                                                                                                                                                                                                                                                             | RF_WALLET_3 |
| TF-CRON-03 | automobilista nuovo con una ricarica da 1000 alle 2026-11-20 09:00+01:00 (nel dataset ci sono i movimenti di altri cinque wallet); `movimenti(automobilista)` | un solo movimento: `RICARICA`, 1000, 2026-11-20 09:00+01:00, `sosta: null`; nessun movimento di altri wallet                                                                                                                                                                                                                                                     | ISSUE_45    |
| TF-CRON-04 | automobilista nuovo con 51 ricariche da 500, la `i`-esima (`i` = 0…50) alle 2026-11-20 09:00+01:00 + `i` minuti; `movimenti(automobilista)`                   | 50 movimenti; il primo è la ricarica delle 09:50, l'ultimo quella delle 09:01; date strettamente decrescenti; la ricarica delle 09:00 non compare                                                                                                                                                                                                                | ISSUE_45    |
| TF-CRON-05 | `movimenti(999999)` (automobilista inesistente)                                                                                                               | errore `WALLET_NON_TROVATO`                                                                                                                                                                                                                                                                                                                                      | RF_WALLET_3 |

Totale 5.

Note sui riferimenti:

- TF-CRON-01: `UC_WALLET_3` passo 2. Copre in un solo frame i due tipi, l'ordine dal più recente, targa e stallo degli addebiti e il prolungamento (movimento 5) come secondo addebito della sosta 2. Il numero esatto (6) mostra anche che gli altri wallet del dataset non compaiono.
- TF-CRON-02: `UC_WALLET_3` 2.a1 (cronologia vuota).
- TF-CRON-03: issue #45, «Nessun Automobilista vede i movimenti di un altro», con un automobilista che non è nel dataset.
- TF-CRON-04: limite dell'issue #45; nessuna paginazione (fuori scope).
- TF-CRON-05: 2.a2 (dati del wallet non disponibili), con lo stesso codice di `saldo`.

## 6. Note

- **Già verificati altrove** (nessun frame qui): l'ordine con l'id come spareggio a parità di data, nella persistenza (`cp_persistenza_wallet_soste.md`, regola di ordinamento di `movimenti`); la registrazione di ricariche e addebiti, `cp_ricarica.md` e `cp_addebito.md`; l'assenza di addebiti per le soste gratuite, `cp_addebito.md`.
- **Scostamento dall'issue #45 (decisione C2):** l'issue chiedeva tre tipi (ricarica, addebito della sosta, addebito del prolungamento). Il tipo resta quello del class diagram e di `UC_WALLET_3`; il prolungamento si riconosce come un secondo addebito della stessa sosta.
