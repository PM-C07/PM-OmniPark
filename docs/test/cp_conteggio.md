# cp_conteggio

Specifica dei casi di test (category partition) del servizio Conteggio del sottosistema Gestione stalli, operazione `contaStalliGestiti(ente)` della Facade.
Requisito: RF_ADM_1 (panoramica degli enti clienti: numero di stalli gestiti). Task OMP-43 (issue #7).

- **Fonti dell'esito atteso:** `UC_ADM_1` (passo 4, flusso 4.a1), `SD_ADM_1` (4.2 `stalliGestiti`), `docs/rad/vincoli_dominio.md` §1 (riepilogo dell'ente: gli stalli delle aree di sosta di competenza dell'ente), piano approvato di OMP-43 (decisione F).
- **File di test:** `src/application/gestione-stalli/conteggio.db.test.ts` (eseguito da `npm run test:db`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_7`.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_ADM_1 · TF-CON-03 · ente senza stalli → 0`.

## 2. Operazione verificata (firme)

```ts
// da src/application/gestione-stalli/facade.ts
facade.contaStalliGestiti(ente: number): Promise<number>; // stalli di tutte le aree dell'ente, in qualsiasi stato
// errori: ErroreGestioneStalli con `codice` (esportati dalla Facade)

// da src/persistence/test/datiDiProva.ts (solo per preparare i frame)
creaEnteDiProva(es: Esecutore, nome: string): Promise<number>; // crea un ente senza aree né stalli, restituisce l'id
```

Il servizio usa `riepilogoEnte` dello strato di persistenza, che restituisce `null` per un ente inesistente: in quel caso il servizio lancia `ENTE_INESISTENTE`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. La Facade usa `poolDiTest()`, senza osservatori.
- L'ente senza stalli si crea con `creaEnteDiProva(poolDiTest(), "Ente di prova senza stalli")`.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella         | id  | Contenuto                                                                                      |
| :-------------- | :-- | :--------------------------------------------------------------------------------------------- |
| `ente_preposto` | 1   | Comune di Gragnano: aree 1…5, stalli 1…21 (21 stalli, tra cui 13 `SCONOSCIUTO`)                |
| `ente_preposto` | 2   | Comune di Fisciano: aree 6 e 7, stalli 22…27 (6 stalli, tra cui 25 `SCONOSCIUTO` mai rilevato) |
| `ente_preposto` | 3   | Comune di Baronissi: area 8, stalli 28…30 (3 stalli)                                           |

Colonne usate (lette da `riepilogoEnte` o scritte da `creaEnteDiProva`):

| Tabella         | Colonne                  |
| :-------------- | :----------------------- |
| `ente_preposto` | `id`, `nome`             |
| `area_di_sosta` | `id`, `ente_preposto_id` |
| `stallo`        | `id`, `area_di_sosta_id` |

Id inesistente: `999999`.

## 4. Categorie e scelte

**Ente**

1. con stalli in più aree
2. con stalli in una sola area [single]
3. senza stalli
4. inesistente [error]

## 5. Test frame (4)

| Frame     | Ente                              | Esito atteso              | Riferimento |
| :-------- | :-------------------------------- | :------------------------ | :---------- |
| TF-CON-01 | 1 (Gragnano, 5 aree)              | `21`                      | RF_ADM_1    |
| TF-CON-02 | 3 (Baronissi, una sola area)      | `3`                       | RF_ADM_1    |
| TF-CON-03 | ente creato con `creaEnteDiProva` | `0`                       | RF_ADM_1    |
| TF-CON-04 | 999999                            | errore `ENTE_INESISTENTE` | RF_ADM_1    |

Note sui riferimenti:

- TF-CON-01: conta anche gli stalli `SCONOSCIUTO`: gli stalli gestiti sono tutti quelli delle aree dell'ente, qualunque sia lo stato.
- TF-CON-04: `UC_ADM_1` 4.a1 (le informazioni dell'ente non sono disponibili, On failure).
