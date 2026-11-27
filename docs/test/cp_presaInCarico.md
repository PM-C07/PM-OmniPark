# cp_presaInCarico

Specifica dei casi di test (category partition) del servizio Presa in carico del sottosistema Segnalazioni, operazione `prendiInCarico(ausiliario, segnalazione)` della Facade.
Requisiti: RF_OP_3 (presa in carico della segnalazione), NRF_SIC_1 (controllo degli accessi per ruolo ed ente). Task OMP-63 (issue #40).

- **Fonti dell'esito atteso:** `UC_OP_2` (Regole di dominio: presa in carico esclusiva; passi 1–3; 2.a1), statechart `SCD_3` (`Aperta → Presa in carico : presaInCarico / assegnaAusiliario()`), `docs/rad/vincoli_dominio.md` (VD_17, VD_18, VD_19), `cp_gestioneAusiliari.md` §6 (vincolo per COD-22: riga dell'Ausiliario letta `FOR SHARE` e verificata `ATTIVO` nella stessa transazione), issue #40, piano approvato di OMP-63 (decisione D1: presa in carico ripetuta dallo stesso Ausiliario → successo senza modifiche).
- **File di test:** `src/application/segnalazioni/presaInCarico.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_40` per le scelte dell'issue #40 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_OP_3 · TF-PIC-02 · presa in carico da un altro Ausiliario → SEGNALAZIONE_PRESA_DA_ALTRI`.

## 2. Operazione verificata (firma)

```ts
// da src/application/segnalazioni/facade.ts (operazione nuova)
facade.prendiInCarico(ausiliario: number, segnalazione: number): Promise<SegnalazioneMappa>;
// SegnalazioneMappa con il campo nuovo tipoDiStallo; errori: ErroreSegnalazioni con `codice`
```

Sequenza, in un'unica transazione:

| Passo | Controllo o azione                                                                                                            | Errore                                                   |
| :---- | :---------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| 1     | riga dell'Ausiliario letta `FOR SHARE` (`bloccaAusiliarioInCondivisione`): esiste ed è `ATTIVO`                               | `AUSILIARIO_NON_ATTIVO`                                  |
| 2     | riga della segnalazione bloccata `FOR UPDATE` (`bloccaSegnalazione`): esiste                                                  | `SEGNALAZIONE_INESISTENTE`                               |
| 3     | la segnalazione è di uno stallo dell'ente dell'Ausiliario (prima di rivelarne lo stato)                                       | `ENTE_NON_AMMESSO`                                       |
| 4     | stato: `CHIUSA` → errore; `PRESA_IN_CARICO` da un altro → errore; `PRESA_IN_CARICO` dallo stesso → nessuna modifica (D1)      | `SEGNALAZIONE_GIA_CHIUSA`, `SEGNALAZIONE_PRESA_DA_ALTRI` |
| 5     | `APERTA` → `prendiInCarico` della persistenza: `PRESA_IN_CARICO`, assegnata, data della presa in carico = `orologio.adesso()` | —                                                        |

Restituisce la segnalazione dopo l'operazione. Due richieste simultanee sulla stessa segnalazione si mettono in fila sul blocco della riga: la seconda trova `PRESA_IN_CARICO`. Una disattivazione concorrente dell'Ausiliario (`FOR UPDATE` sulla stessa riga) e la presa in carico non possono riuscire entrambe.

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaSegnalazioneDaLettura`, `prendiInCarico`, `dettaglioSegnalazione` (`segnalazioniVerifiche.ts`), `creaAusiliario` (`utentiEntiVeicoli.ts`), con `poolDiTest()` come esecutore; Facade di Utenti e accessi `disattivaAusiliario` (TF-PIC-10).

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni vanno in commit: i frame che leggono il dataset usano segnalazioni che nessun altro frame modifica; quelli che scrivono usano una segnalazione propria.
- Facade composta come in `cp_chiusuraSegnalazione.md` §3, con orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`).
- **Segnalazione di prova del frame `n`:** `creaSegnalazioneDaLettura(pool, { stalloId, targa: "PC<n>AA", dataEOra: 2026-11-20 09:00:00+01, motivo: "SOSTA_ASSENTE" })`, `APERTA`, con `<n>` su due cifre e lo stallo indicato nel frame.
- **Invariata:** `dettaglioSegnalazione(id)` dopo la chiamata ha stato, assegnatario, data della presa in carico e `ultimaModifica` uguali a prima.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                   | id                 | Contenuto                                                               |
| :------------------------ | :----------------- | :---------------------------------------------------------------------- |
| `ausiliario_del_traffico` | 2, 3               | Paolo Ferri, Sara Galli: ente 1, `ATTIVO`                               |
| `ausiliario_del_traffico` | 4                  | Luca Russo: ente 1, `DISATTIVATO`                                       |
| `ausiliario_del_traffico` | 5                  | Anna Moretti: ente 2, `ATTIVO`                                          |
| `segnalazione`            | 4                  | ente 1, `PRESA_IN_CARICO` dall'Ausiliario 3                             |
| `segnalazione`            | 5                  | ente 1, `PRESA_IN_CARICO` dall'Ausiliario 2 il `2026-11-04 09:21:00+01` |
| `segnalazione`            | 1                  | ente 1, `CHIUSA`                                                        |
| `stallo`                  | 16, 17, 18, 19, 20 | ente 1, stalli delle segnalazioni di prova                              |

Id inesistente: `999999`.

## 4. Categorie e scelte

**Stato della segnalazione:** Aperta · Presa in carico dallo stesso Ausiliario [single] · Presa in carico da un altro [error] · Chiusa [error] · inesistente [error].

**Ente della segnalazione:** lo stesso dell'Ausiliario · un altro [error]; un altro con segnalazione chiusa [single] (l'ente si controlla prima dello stato).

**Richiedente:** Ausiliario attivo · Ausiliario disattivato [error].

**Concorrenza:** richiesta singola · due Ausiliari insieme sulla stessa Aperta [single] · presa in carico e disattivazione dell'Ausiliario insieme [single].

## 5. Test frame (10)

| Frame     | Preparazione                                                                                                               | Chiamata                                                                               | Esito atteso                                                                                                                                                                                                                                                             | Riferimento |
| :-------- | :------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-PIC-01 | segnalazione di prova S sullo stallo 16                                                                                    | `prendiInCarico(2, S)`                                                                 | restituisce S `PRESA_IN_CARICO` con `ausiliarioId` 2 e `tipoDiStallo` `ORDINARIO_A_PAGAMENTO`; nel dettaglio data della presa in carico `T` e `ultimaModifica` successiva a prima                                                                                        | RF_OP_3     |
| TF-PIC-02 | nessuna                                                                                                                    | `prendiInCarico(2, 4)`                                                                 | errore `SEGNALAZIONE_PRESA_DA_ALTRI`; la 4 invariata                                                                                                                                                                                                                     | VD_17       |
| TF-PIC-03 | nessuna                                                                                                                    | `prendiInCarico(2, 1)`                                                                 | errore `SEGNALAZIONE_GIA_CHIUSA`; la 1 invariata                                                                                                                                                                                                                         | RF_OP_3     |
| TF-PIC-04 | nessuna                                                                                                                    | `prendiInCarico(2, 5)`                                                                 | nessun errore; restituisce la 5 `PRESA_IN_CARICO` dell'Ausiliario 2; la 5 invariata (data della presa in carico `2026-11-04 09:21:00+01`)                                                                                                                                | ISSUE_40    |
| TF-PIC-05 | segnalazione di prova S sullo stallo 17                                                                                    | `prendiInCarico(5, S)`                                                                 | errore `ENTE_NON_AMMESSO`; S invariata (`APERTA`)                                                                                                                                                                                                                        | NRF_SIC_1   |
| TF-PIC-06 | nessuna                                                                                                                    | `prendiInCarico(5, 1)` (chiusa, di un altro ente)                                      | errore `ENTE_NON_AMMESSO` (non `SEGNALAZIONE_GIA_CHIUSA`)                                                                                                                                                                                                                | NRF_SIC_1   |
| TF-PIC-07 | nessuna                                                                                                                    | `prendiInCarico(2, 999999)`                                                            | errore `SEGNALAZIONE_INESISTENTE`                                                                                                                                                                                                                                        | RF_OP_3     |
| TF-PIC-08 | segnalazione di prova S sullo stallo 18                                                                                    | `prendiInCarico(4, S)`                                                                 | errore `AUSILIARIO_NON_ATTIVO`; S invariata                                                                                                                                                                                                                              | VD_19       |
| TF-PIC-09 | segnalazione di prova S sullo stallo 19                                                                                    | `prendiInCarico(2, S)` e `prendiInCarico(3, S)` avviate insieme (`Promise.allSettled`) | una chiamata riesce e l'altra fallisce con `SEGNALAZIONE_PRESA_DA_ALTRI`; S è `PRESA_IN_CARICO` e assegnata all'Ausiliario della chiamata riuscita                                                                                                                       | VD_17       |
| TF-PIC-10 | Ausiliario di prova A dell'ente 1 (`creaAusiliario`, email `pic.10@test.example`); segnalazione di prova S sullo stallo 20 | `prendiInCarico(A, S)` e `utentiAccessi.disattivaAusiliario(A)` avviate insieme        | esattamente una delle due riesce: se riesce la presa in carico, la disattivazione fallisce con `AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO` e A resta `ATTIVO`; se riesce la disattivazione, la presa in carico fallisce con `AUSILIARIO_NON_ATTIVO` e S resta `APERTA` | VD_19       |

Totale 10: 1 presa in carico riuscita, 1 ripetuta dallo stesso Ausiliario, 6 errori singoli, 2 frame di concorrenza.

Note sui riferimenti:

- TF-PIC-02, 09: VD_17 e `UC_OP_2` (presa in carico esclusiva, 2.a1). TF-PIC-09: il test non può imporre quale chiamata arrivi per prima; entrambi gli ordini danno l'esito atteso.
- TF-PIC-04: decisione D1 del piano approvato (un secondo tocco dello stesso Ausiliario non è un errore).
- TF-PIC-05, 06: NRF_SIC_1 e VD_18; TF-PIC-06 verifica che l'ente si controlli prima dello stato, come nella chiusura (`cp_chiusuraSegnalazione.md` TF-CHI-08).
- TF-PIC-08, 10: VD_19 e il vincolo per COD-22 di `cp_gestioneAusiliari.md` §6. TF-PIC-10: entrambi gli ordini sono possibili; il frame verifica che non riescano entrambe.
