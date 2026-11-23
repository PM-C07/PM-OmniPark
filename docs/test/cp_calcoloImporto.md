# cp_calcoloImporto

Specifica dei casi di test (category partition) del servizio Calcolo dell'importo del sottosistema Gestione soste, operazione `calcolaImporto(stallo, durata)` della Facade.
Requisiti: RF_WALLET_2 (addebito della sosta secondo le regole di pagamento del tipo di stallo), RF_SOSTA_1 (durata entro il massimo dello stallo). Task OMP-45 (issue #9).

- **Fonti dell'esito atteso:** `UC_SOSTA_1` (Regole di dominio, passo 3, flusso 2.a2), `SD_SOSTA_1` (2.2, 3.1, 3.2, 3.3), `docs/rad/vincoli_dominio.md` (§1 `/pagamento`, VD_9, VD_10), issue #9 (durata minima di 15 minuti, importo in centesimi con arrotondamento al centesimo), piano approvato di OMP-45 (formula e regola di arrotondamento).
- **File di test:** `src/application/gestione-soste/calcoloImporto.db.test.ts` (eseguito con `npx vitest run --config vitest.db.config.ts <file>`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_9` per le scelte dell'issue #9 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `VD_10 · TF-CAL-04 · disabili, 15 minuti → 0, GRATUITA`.

## 2. Operazione verificata (firme)

```ts
// da src/application/gestione-soste/facade.ts
type ImportoDellaSosta = {
  importo: number;                     // centesimi
  pagamento: "PAGATA" | "GRATUITA";
  orarioDiScadenza: Date;              // istante dell'orologio + durata
};
creaFacadeGestioneSoste(dipendenze: { wallet: FacadeWallet; pool?: Pool; orologio?: Orologio; utentiAccessi?: FacadeUtentiAccessi }): FacadeGestioneSoste;
facade.calcolaImporto(stallo: number, durata: number): Promise<ImportoDellaSosta>; // durata in minuti
// errori: ErroreGestioneSoste con `codice` (esportato dalla Facade)
```

- **Regola di calcolo.** Stalli `DISABILI`: importo 0 e pagamento `GRATUITA`. Stalli `ORDINARIO_A_PAGAMENTO` e `ROSA`: `importo = floor((costoOrario × durata + 30) / 60)` e pagamento `PAGATA`, cioè costo orario × minuti / 60 arrotondato al centesimo con la metà verso l'alto, calcolato in interi.
- **Durata.** Numero intero di minuti, da 15 alla durata massima della tariffa dello stallo, estremi inclusi; altrimenti `DURATA_NON_VALIDA`.
- **Ordine dei controlli.** Prima lo stallo (`STALLO_INESISTENTE`), poi la durata, perché il massimo dipende dalla tariffa dello stallo.
- Fasce orarie e orari di vigenza non sono considerati (fuori ambito, NRF_LEG_1 e COD-23). Lo stato dello stallo non conta: l'operazione legge solo tipo e tariffa e non esegue l'allineamento temporale.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Nessun frame modifica dati: gli stalli si possono usare in più frame.
- Facade creata con `pool: poolDiTest()`, orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` e `wallet: creaFacadeWallet({ pagamento: new SimulatorePagamento({ latenzaMs: 0 }), pool: poolDiTest(), orologio })` (il calcolo non lo usa).
- `orarioDiScadenza` atteso: `2026-11-20 10:00:00+01` + durata.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella   | id        | Contenuto                                                                                             |
| :-------- | :-------- | :---------------------------------------------------------------------------------------------------- |
| `stallo`  | 5, 16, 28 | `ORDINARIO_A_PAGAMENTO`: 5 con tariffa 2, 16 con tariffa 1, 28 con tariffa 4                          |
| `stallo`  | 14        | `DISABILI`, tariffa 1                                                                                 |
| `stallo`  | 4, 15     | `ROSA`: 4 con tariffa 2, 15 con tariffa 1                                                             |
| `tariffa` | 1, 2, 4   | 1: 150 centesimi l'ora, massimo 180 minuti; 2: 100 centesimi, 120 minuti; 4: 80 centesimi, 240 minuti |

Colonne lette (tramite la Facade di Gestione stalli): `stallo.id`, `stallo.tipo_di_stallo`, `stallo.tariffa_id`; `tariffa.costo_orario`, `tariffa.durata_massima`.

Id inesistente: `999999`.

## 4. Categorie e scelte

**Tipo di stallo**

1. a pagamento (`ORDINARIO_A_PAGAMENTO`)
2. disabili
3. rosa

**Durata**

1. 15 minuti
2. intermedia
3. massima della tariffa
4. inferiore a 15 minuti [error]
5. oltre la massima [error]
6. non intera [error]

**Costo orario × durata / 60**

1. importo esatto
2. da arrotondare, parte decimale uguale a 0,5 [single]
3. da arrotondare per eccesso [single]
4. da arrotondare per difetto [single]

**Stallo**

1. esistente
2. inesistente [error]

## 5. Test frame (18)

| Frame     | Operazione e scelte                                          | Esito atteso                                                                      | Riferimento |
| :-------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------- | :---------- |
| TF-CAL-01 | `calcolaImporto(5, 15)`: a pagamento, 15 minuti, esatto      | `{ importo: 25, pagamento: "PAGATA", orarioDiScadenza: 2026-11-20 10:15:00+01 }`  | RF_WALLET_2 |
| TF-CAL-02 | `calcolaImporto(16, 90)`: a pagamento, intermedia            | `{ importo: 225, pagamento: "PAGATA", orarioDiScadenza: 2026-11-20 11:30:00+01 }` | RF_WALLET_2 |
| TF-CAL-03 | `calcolaImporto(16, 180)`: a pagamento, massima              | `{ importo: 450, pagamento: "PAGATA", orarioDiScadenza: 2026-11-20 13:00:00+01 }` | RF_SOSTA_1  |
| TF-CAL-04 | `calcolaImporto(14, 15)`: disabili, 15 minuti                | `{ importo: 0, pagamento: "GRATUITA", orarioDiScadenza: 2026-11-20 10:15:00+01 }` | VD_10       |
| TF-CAL-05 | `calcolaImporto(14, 90)`: disabili, intermedia               | `{ importo: 0, pagamento: "GRATUITA", orarioDiScadenza: 2026-11-20 11:30:00+01 }` | VD_10       |
| TF-CAL-06 | `calcolaImporto(14, 180)`: disabili, massima                 | `{ importo: 0, pagamento: "GRATUITA", orarioDiScadenza: 2026-11-20 13:00:00+01 }` | VD_10       |
| TF-CAL-07 | `calcolaImporto(4, 15)`: rosa, 15 minuti                     | `{ importo: 25, pagamento: "PAGATA", orarioDiScadenza: 2026-11-20 10:15:00+01 }`  | VD_10       |
| TF-CAL-08 | `calcolaImporto(15, 90)`: rosa, intermedia                   | `{ importo: 225, pagamento: "PAGATA", orarioDiScadenza: 2026-11-20 11:30:00+01 }` | VD_10       |
| TF-CAL-09 | `calcolaImporto(15, 180)`: rosa, massima                     | `{ importo: 450, pagamento: "PAGATA", orarioDiScadenza: 2026-11-20 13:00:00+01 }` | VD_10       |
| TF-CAL-10 | `calcolaImporto(28, 240)`: a pagamento, massima di tariffa 4 | `{ importo: 320, pagamento: "PAGATA", orarioDiScadenza: 2026-11-20 14:00:00+01 }` | RF_SOSTA_1  |
| TF-CAL-11 | `calcolaImporto(16, 15)`: 150 × 15 / 60 = 37,5               | `importo: 38`, `pagamento: "PAGATA"`                                              | ISSUE_9     |
| TF-CAL-12 | `calcolaImporto(28, 20)`: 80 × 20 / 60 = 26,67               | `importo: 27`, `pagamento: "PAGATA"`                                              | ISSUE_9     |
| TF-CAL-13 | `calcolaImporto(28, 25)`: 80 × 25 / 60 = 33,33               | `importo: 33`, `pagamento: "PAGATA"`                                              | ISSUE_9     |
| TF-CAL-14 | `calcolaImporto(16, 14)`                                     | errore `DURATA_NON_VALIDA`                                                        | ISSUE_9     |
| TF-CAL-15 | `calcolaImporto(16, 181)`                                    | errore `DURATA_NON_VALIDA`                                                        | RF_SOSTA_1  |
| TF-CAL-16 | `calcolaImporto(14, 181)`: disabili oltre la massima         | errore `DURATA_NON_VALIDA` (la gratuità non toglie il limite)                     | VD_9        |
| TF-CAL-17 | `calcolaImporto(16, 30.5)`                                   | errore `DURATA_NON_VALIDA`                                                        | ISSUE_9     |
| TF-CAL-18 | `calcolaImporto(999999, 60)`                                 | errore `STALLO_INESISTENTE`                                                       | RF_SOSTA_1  |

Totale 18: 9 dal prodotto tipo × durata, 1 con la massima di un'altra tariffa, 3 [single] di arrotondamento, 5 di errore (4 sulla durata, di cui uno su uno stallo per disabili, e 1 sullo stallo inesistente).

Note sui riferimenti:

- TF-CAL-01…03 e 07…09: RF_WALLET_2 («applicando le regole di pagamento previste per il tipo di stallo»); per gli stalli rosa VD_10 («negli stalli rosa si paga la tariffa», RD_07).
- TF-CAL-04…06: VD_10 e RD_06. La gratuità vale qualunque sia la tariffa dello stallo. Che una sosta gratuita richieda dichiarazione e foto lo verifica l'avvio (`cp_avvioSosta.md`), perché il calcolo non riceve il permesso.
- TF-CAL-03, 10, 15: RF_SOSTA_1 e VD_9 (durata entro il massimo della tariffa dello stallo).
- TF-CAL-11…13: regola di arrotondamento del piano approvato (metà verso l'alto). 37,5 è il caso di metà esatta; 26,67 e 33,33 i casi per eccesso e per difetto.
- TF-CAL-14, 17: durata minima di 15 minuti e durata in minuti interi, dall'issue #9.

## 6. Note

- **Sosta `PAGATA` a importo zero (discrepanza 12 del piano).** La formula dà 0 su uno stallo a pagamento solo se costo orario × durata < 30, cioè con un costo orario inferiore a 2 centesimi a 15 minuti. Lo schema accetta costi orari da 1 centesimo, ma il dataset non ne ha: il caso non è raggiungibile con i dati di prova e nessun frame lo verifica. All'avvio, `addebita` del Wallet con importo 0 non registra movimenti (`cp_addebito.md` TF-04) e la sosta resterebbe `PAGATA`.
- Fasce orarie e orari di vigenza (NRF_LEG_1, `UC_SOSTA_1` «parte di durata che cade nella fascia a pagamento») sono fuori ambito: l'importo vale per tutta la durata anche fuori dagli orari di vigenza.
- La durata minima di 15 minuti compare solo nell'issue #9, non nel RAD.
