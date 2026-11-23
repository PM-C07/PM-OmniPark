# cp_riscontroAnpr

Specifica dei casi di test (category partition) del servizio Riscontro ANPR del sottosistema Segnalazioni, operazione `elaboraLettura(lettura)` della Facade.
Requisiti: RF_ANPR_1 (segnalazione automatica da lettura ANPR), NRF_AFF_2 (accuratezza dell'associazione targa-sosta). Task OMP-46 (issue #10).

- **Fonti dell'esito atteso:** `UC_ANPR_1` (passi 1–5, flussi 1.a1, 2.a1, 4.a1), `SD_ANPR_1`, `UC_SOSTA_7` (Regole di dominio: la sosta scaduta è rilevabile con motivo «sosta scaduta»), scenari SC_OP_1, SC_OP_3, SC_OP_5, `docs/rad/vincoli_dominio.md` (VD_2, VD_13, VD_16), schema (`segnalazione_targa_rilevata_normalizzata`, `segnalazione_una_non_chiusa_per_targa`, `segnalazione_date_ordinate`), issue #10 (regole di classificazione, lettura scartata, errori), piano approvato di OMP-46 (tabella di classificazione P1–P4, risposte D1, D2, D3).
- **File di test:** `src/application/segnalazioni/riscontro.db.test.ts` (eseguito con `npx vitest run --config vitest.db.config.ts <file>`).
- Le scelte di questa specifica sono la base del dataset con cui si misurerà l'accuratezza richiesta da NRF_AFF_2.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `SCHEMA` per un limite dello schema ripreso dal controllo; altrimenti `ISSUE_10` per le scelte dell'issue #10 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_ANPR_1 · TF-RIS-06 · sosta scaduta della stessa targa sullo stallo → SOSTA_SCADUTA`.

## 2. Operazione verificata (firme)

```ts
// da src/application/segnalazioni/facade.ts
type Lettura = { targa?: string | null; stallo?: number | null; dataOra?: Date | null };
type Motivo = "SOSTA_ASSENTE" | "SOSTA_SCADUTA" | "TARGA_NON_CORRISPONDENTE";
type EsitoRiscontro =
  | { esito: "NESSUNA_SEGNALAZIONE" }
  | { esito: "SEGNALAZIONE_CREATA"; segnalazione: number; motivo: Motivo }
  | { esito: "LETTURA_SCARTATA"; motivo: Motivo };
creaFacadeSegnalazioni(dipendenze: { gestioneSoste: FacadeGestioneSoste; pool?: Pool; orologio?: Orologio; utentiAccessi?: FacadeUtentiAccessi }): FacadeSegnalazioni;
facade.elaboraLettura(lettura: Lettura): Promise<EsitoRiscontro>;
// errori: ErroreSegnalazioni con `codice` (esportato dalla Facade)
```

**Controlli della lettura**, in quest'ordine:

1. targa, stallo e data e ora presenti, data valida, targa non vuota dopo la normalizzazione (`normalizzaTarga` di Utenti e accessi) → altrimenti `LETTURA_INCOMPLETA`;
2. targa normalizzata fatta solo di lettere e cifre (regola dello schema) → altrimenti `TARGA_NON_VALIDA`;
3. data e ora non successiva a `orologio.adesso()` (uguale è accettata) → altrimenti `LETTURA_NON_VALIDA`;
4. stallo esistente → altrimenti `STALLO_INESISTENTE`.

**Classificazione** (piano approvato), dopo l'allineamento temporale, che porta a `SCADUTA` le soste attive con scadenza raggiunta. Simboli per la targa letta T e lo stallo L: **A** sosta `ATTIVA` di T su L; **S** sosta `SCADUTA` di T su L; **D** sosta `ATTIVA` di un'altra targa su L; **X** sosta `ATTIVA` di T su un altro stallo.

| Priorità | Regola     | Esito                      |
| :------- | :--------- | :------------------------- |
| P1       | A          | nessuna segnalazione       |
| P2       | S          | `SOSTA_SCADUTA`            |
| P3       | D oppure X | `TARGA_NON_CORRISPONDENTE` |
| P4       | altrimenti | `SOSTA_ASSENTE`            |

Se l'esito prevede una segnalazione e per T esiste già una segnalazione non chiusa (`APERTA` o `PRESA_IN_CARICO`), la lettura è scartata (`LETTURA_SCARTATA`, con il motivo che avrebbe avuto), anche quando la seconda di due letture concorrenti è fermata dall'indice unico del database. Altrimenti si crea una segnalazione `APERTA` con stallo, targa normalizzata, data e ora della lettura e motivo.

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaAutomobilista`, `trovaOCreaVeicolo`, `associaVeicolo` (`utentiEntiVeicoli.ts`), `creaSosta`, `impostaSostaScaduta`, `trovaSosta` (`walletSoste.ts`), `dettaglioSegnalazione`, `esisteSegnalazioneNonChiusa`, `segnalazioniNonChiuseDellEnte` (`segnalazioniVerifiche.ts`), `trovaStallo` (`stalliTariffe.ts`); Facade di Gestione stalli creata con `osservatoreGestioneSoste`: `registraRilevazione`, `impostaNonDisponibile`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni vanno in commit: ogni frame usa stalli, automobilisti, veicoli e targhe propri, indicati nella tabella dei frame.
- Orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`), passato a tutte le Facade. Composizione: `wallet = creaFacadeWallet({ pagamento: new SimulatorePagamento({ latenzaMs: 0 }), pool: poolDiTest(), orologio })`, `gestioneSoste = creaFacadeGestioneSoste({ wallet, pool: poolDiTest(), orologio })`, `facade = creaFacadeSegnalazioni({ gestioneSoste, pool: poolDiTest(), orologio })`.
- **Lettura predefinita:** `dataOra` `2026-11-20 09:50:00+01` (`L`), salvo indicazione.
- **Sosta di una targa:** automobilista di prova creato con `creaAutomobilista(pool, { email: "riscontro.<targa minuscola>@test.example", hashPassword: "hash-di-prova" })`, veicolo con la targa (`trovaOCreaVeicolo`, `associaVeicolo`); se nello stesso frame la stessa targa ha due soste, automobilista e veicolo si creano una volta sola. Poi `creaSosta(pool, { automobilistaId, veicoloId, stalloId, orarioDiAvvio, orarioDiScadenza, pagamento: "PAGATA" })`:
  - «attiva»: `09:00` → `12:00`, poi `impostaNonDisponibile(stallo)`;
  - «scaduta»: `08:00` → `08:30`, poi `impostaSostaScaduta(pool, id)` (lo stallo resta `OCCUPATO`);
  - quando sullo stesso stallo ci sono una scaduta e una attiva, si prepara prima la scaduta.
- **Stallo «portato a `OCCUPATO`»:** `registraRilevazione({ stallo, presenza: true, dataOra: 2026-11-20 09:00:00+01 })`, necessario prima di una sosta attiva su uno stallo `LIBERO`.
- Una targa letta senza soste non ha bisogno di un veicolo nel database.
- Tutti gli orari sono del `2026-11-20`, `+01`.

### Verifiche

- **Creata (`C`)**: l'esito è `{ esito: "SEGNALAZIONE_CREATA", segnalazione, motivo }` con il motivo della riga; `dettaglioSegnalazione(segnalazione)` è `APERTA`, sullo stallo letto, con `targaRilevata` uguale alla targa normalizzata, `dataEOraDellaLettura` uguale a quella della lettura, il motivo della riga, nessun assegnatario e nessun esito.
- **Nessuna (`0`)**: l'esito è `{ esito: "NESSUNA_SEGNALAZIONE" }` e `esisteSegnalazioneNonChiusa(T)` è `false` (salvo TF-RIS-17, dove resta solo la segnalazione preesistente).
- **Errore (`E`)**: l'errore è quello indicato e per la targa, se valida, non esiste alcuna segnalazione non chiusa.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella        | id                                                     | Contenuto                                                                         |
| :------------- | :----------------------------------------------------- | :-------------------------------------------------------------------------------- |
| `stallo`       | 3, 4, 7, 8, 11, 12, 15, 17, 18, 19, 20, 21, 23, 26, 29 | `OCCUPATO`, `VEICOLO_PRESENTE` (4 e 15 `ROSA`, gli altri `ORDINARIO_A_PAGAMENTO`) |
| `stallo`       | 1, 2, 5, 6, 9, 10, 14, 16, 22, 24, 27, 28, 30          | `LIBERO`                                                                          |
| `stallo`       | 13, 25                                                 | `SCONOSCIUTO`                                                                     |
| `segnalazione` | 11                                                     | `APERTA`, stallo 3, targa `HB204KM`, `SOSTA_ASSENTE` (ente 1)                     |
| `segnalazione` | 12                                                     | `APERTA`, stallo 23, targa `KC562DF`, `SOSTA_ASSENTE` (ente 2)                    |

Nel dataset nessuna sosta è `ATTIVA` o `SCADUTA`: le soste di ogni frame sono preparate dal frame.

Colonne usate dai test:

| Tabella                                                       | Colonne                                                                                                                                                                   |
| :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `segnalazione`                                                | `id`, `stallo_id`, `ausiliario_del_traffico_id`, `stato`, `motivo`, `targa_rilevata`, `data_e_ora_della_lettura`, `esito`, `data_e_ora_della_chiusura`, `ultima_modifica` |
| `sosta`                                                       | `id`, `automobilista_id`, `veicolo_id`, `stallo_id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`                                                        |
| `stallo`                                                      | `id`, `stato`, `occupazione_rilevata`, `data_e_ora_dell_ultima_rilevazione`                                                                                               |
| `utente`, `automobilista`, `veicolo`, `automobilista_veicolo` | colonne per la preparazione delle soste                                                                                                                                   |

Id inesistente: `999999`.

## 4. Categorie e scelte

**Sosta sullo stallo** (per la targa letta T)

1. nessuna
2. Attiva della stessa targa
3. Attiva di un'altra targa
4. Scaduta della stessa targa
5. Scaduta di un'altra targa
6. Attiva della stessa targa e Scaduta (della stessa o di un'altra targa)
7. Attiva di un'altra targa e Scaduta della stessa targa
8. Attiva di un'altra targa e Scaduta di un'altra targa
9. Attiva della stessa targa con scadenza raggiunta, non ancora allineata [single]

**Targa letta con sosta attiva su un altro stallo**

1. no
2. sì [if non 2 e non 6: la targa ha al più una sosta attiva, VD_2]

**Segnalazione non chiusa già presente per la targa**

1. no
2. sì, con un esito che prevede una segnalazione [single]: lettura scartata
3. sì, con l'esito «nessuna segnalazione» [single]

**Concorrenza**

1. lettura singola
2. due letture contemporanee della stessa targa [single]

**Targa**

1. valida
2. scritta in minuscolo e con uno spazio [single]
3. vuota dopo la normalizzazione [error]
4. con caratteri diversi da lettere e cifre [error]

**Stallo**

1. esistente
2. inesistente [error]
3. mancante [error]

**Data e ora della lettura**

1. precedente all'istante corrente
2. uguale all'istante corrente [single]
3. successiva all'istante corrente [error]
4. mancante [error]
5. non valida [error]

## 5. Test frame (27)

Dove non indicato: lettura con `dataOra` `L`, targa T scritta come in tabella.

| Frame     | Preparazione                                                                                                                                         | Lettura (targa, stallo)                                  | Esito atteso                                                                                                                                                                         | Riferimento |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-RIS-01 | nessuna                                                                                                                                              | `RA01AA`, 16                                             | `C`, `SOSTA_ASSENTE`                                                                                                                                                                 | RF_ANPR_1   |
| TF-RIS-02 | `RA02AA` attiva sullo stallo 3                                                                                                                       | `RA02AA`, 1                                              | `C`, `TARGA_NON_CORRISPONDENTE`                                                                                                                                                      | ISSUE_10    |
| TF-RIS-03 | `RA03AA` attiva sullo stallo 7                                                                                                                       | `RA03AA`, 7                                              | `0`                                                                                                                                                                                  | NRF_AFF_2   |
| TF-RIS-04 | `RA04BB` attiva sullo stallo 8                                                                                                                       | `RA04AA`, 8                                              | `C`, `TARGA_NON_CORRISPONDENTE`                                                                                                                                                      | RF_ANPR_1   |
| TF-RIS-05 | `RA05BB` attiva sullo stallo 11; `RA05AA` attiva sullo stallo 12                                                                                     | `RA05AA`, 11                                             | `C`, `TARGA_NON_CORRISPONDENTE`                                                                                                                                                      | RF_ANPR_1   |
| TF-RIS-06 | `RA06AA` scaduta sullo stallo 17                                                                                                                     | `RA06AA`, 17                                             | `C`, `SOSTA_SCADUTA`                                                                                                                                                                 | RF_ANPR_1   |
| TF-RIS-07 | `RA07AA` scaduta sullo stallo 18, poi `RA07AA` attiva sullo stallo 19                                                                                | `RA07AA`, 18                                             | `C`, `SOSTA_SCADUTA`                                                                                                                                                                 | ISSUE_10    |
| TF-RIS-08 | `RA08BB` scaduta sullo stallo 20                                                                                                                     | `RA08AA`, 20                                             | `C`, `SOSTA_ASSENTE`                                                                                                                                                                 | RF_ANPR_1   |
| TF-RIS-09 | `RA09BB` scaduta sullo stallo 21; `RA09AA` attiva sullo stallo 26                                                                                    | `RA09AA`, 21                                             | `C`, `TARGA_NON_CORRISPONDENTE`                                                                                                                                                      | ISSUE_10    |
| TF-RIS-10 | `RA10BB` scaduta sullo stallo 29, poi `RA10AA` attiva sullo stallo 29                                                                                | `RA10AA`, 29                                             | `0`                                                                                                                                                                                  | NRF_AFF_2   |
| TF-RIS-11 | `RA11AA` scaduta sullo stallo 4, poi `RA11AA` attiva sullo stallo 4                                                                                  | `RA11AA`, 4                                              | `0`                                                                                                                                                                                  | NRF_AFF_2   |
| TF-RIS-12 | `RA12AA` scaduta sullo stallo 15, poi `RA12BB` attiva sullo stallo 15                                                                                | `RA12AA`, 15                                             | `C`, `SOSTA_SCADUTA`                                                                                                                                                                 | ISSUE_10    |
| TF-RIS-13 | `RA13CC` scaduta sullo stallo 23, poi `RA13BB` attiva sullo stallo 23                                                                                | `RA13AA`, 23                                             | `C`, `TARGA_NON_CORRISPONDENTE`                                                                                                                                                      | RF_ANPR_1   |
| TF-RIS-14 | stalli 22 e 27 portati a `OCCUPATO`; `RA14CC` scaduta sullo stallo 22, poi `RA14BB` attiva sullo stallo 22; `RA14AA` attiva sullo stallo 27          | `RA14AA`, 22                                             | `C`, `TARGA_NON_CORRISPONDENTE`                                                                                                                                                      | RF_ANPR_1   |
| TF-RIS-15 | stallo 28 portato a `OCCUPATO`; `RA15AA` sullo stallo 28 dalle `08:00` alle `09:30`, con `impostaNonDisponibile(28)` (attiva con scadenza raggiunta) | `RA15AA`, 28                                             | `C`, `SOSTA_SCADUTA`; la sosta è `SCADUTA` e lo stallo 28 è `OCCUPATO`                                                                                                               | RF_SOSTA_7  |
| TF-RIS-16 | nessuna (segnalazione 11 del dataset, `APERTA`, targa `HB204KM`)                                                                                     | `HB204KM`, 5                                             | `{ esito: "LETTURA_SCARTATA", motivo: "SOSTA_ASSENTE" }`; tra le segnalazioni non chiuse dell'ente 1 l'unica con targa `HB204KM` è la 11, invariata                                  | VD_16       |
| TF-RIS-17 | stallo 24 portato a `OCCUPATO`; `KC562DF` attiva sullo stallo 24 (la targa ha la segnalazione 12 del dataset, `APERTA`)                              | `KC562DF`, 24                                            | `{ esito: "NESSUNA_SEGNALAZIONE" }`; la segnalazione 12 resta l'unica non chiusa della targa, invariata                                                                              | RF_ANPR_1   |
| TF-RIS-18 | nessuna                                                                                                                                              | `RA18AA`, 6, due letture avviate insieme (`Promise.all`) | entrambe terminano senza errore: una `C` con `SOSTA_ASSENTE`, l'altra `{ esito: "LETTURA_SCARTATA", motivo: "SOSTA_ASSENTE" }`; per `RA18AA` esiste una sola segnalazione non chiusa | ISSUE_10    |
| TF-RIS-19 | nessuna                                                                                                                                              | `"ra19 aa"`, 2                                           | `C`, `SOSTA_ASSENTE`, con `targaRilevata` `RA19AA`                                                                                                                                   | ISSUE_10    |
| TF-RIS-20 | nessuna                                                                                                                                              | `RA20AA`, 14, `dataOra` = `T`                            | `C`, `SOSTA_ASSENTE`, con `dataEOraDellaLettura` `T`                                                                                                                                 | ISSUE_10    |
| TF-RIS-21 | nessuna                                                                                                                                              | `"   "`, 10                                              | `E`: `LETTURA_INCOMPLETA`                                                                                                                                                            | RF_ANPR_1   |
| TF-RIS-22 | nessuna                                                                                                                                              | `"RA22-AA"`, 13                                          | `E`: `TARGA_NON_VALIDA`                                                                                                                                                              | SCHEMA      |
| TF-RIS-23 | nessuna                                                                                                                                              | `RA23AA`, 999999                                         | `E`: `STALLO_INESISTENTE`                                                                                                                                                            | RF_ANPR_1   |
| TF-RIS-24 | nessuna                                                                                                                                              | `RA24AA`, stallo assente (`undefined`)                   | `E`: `LETTURA_INCOMPLETA`                                                                                                                                                            | RF_ANPR_1   |
| TF-RIS-25 | nessuna                                                                                                                                              | `RA25AA`, 30, `dataOra` assente (`undefined`)            | `E`: `LETTURA_INCOMPLETA`                                                                                                                                                            | RF_ANPR_1   |
| TF-RIS-26 | nessuna                                                                                                                                              | `RA26AA`, 25, `dataOra` `new Date("non valida")`         | `E`: `LETTURA_INCOMPLETA`                                                                                                                                                            | RF_ANPR_1   |
| TF-RIS-27 | nessuna                                                                                                                                              | `RA27AA`, 9, `dataOra` = `T` + 1 secondo                 | `E`: `LETTURA_NON_VALIDA`                                                                                                                                                            | SCHEMA      |

Totale 27: 15 sulla classificazione (tutte le righe della tabella del piano, compresa l'attiva con scadenza raggiunta), 2 sulla segnalazione non chiusa già presente, 1 di concorrenza, 2 [single] su targa e data accettate, 7 di errore.

Note sui riferimenti:

- TF-RIS-01, 08: `UC_ANPR_1` passo 3 e issue #10 («nessuna sosta valida → sosta assente»); SC_OP_1. In TF-RIS-08 la sosta sullo stallo è scaduta ma di un'altra targa: per `UC_ANPR_1` il motivo «targa non corrispondente» vale solo rispetto alla sosta `Attiva` sullo stallo, quindi la targa letta non ha alcuna sosta valida.
- TF-RIS-02: regola dell'issue #10 «targa con sosta attiva su un altro stallo → targa non corrispondente» (discrepanza 1, §6).
- TF-RIS-03, 10, 11: NRF_AFF_2 (la targa letta è associata alla sua sosta attiva sullo stallo) e `UC_ANPR_1` 2.a1: nessuna segnalazione, anche con soste scadute sullo stesso stallo (P1).
- TF-RIS-04, 05, 13, 14: `UC_ANPR_1` passo 3 («targa non corrispondente a quella della sosta Attiva sullo stallo») e SC_OP_5.
- TF-RIS-06: `UC_ANPR_1` passo 3, `UC_SOSTA_7` e SC_OP_3 (sosta scaduta della stessa targa).
- TF-RIS-07, 12: risposta D1 del piano: P2 prevale su P3 (la targa letta ha una sosta propria scaduta su quello stallo).
- TF-RIS-09: P3 per la sosta attiva altrove della targa letta; la sosta scaduta sullo stallo è di un'altra targa.
- TF-RIS-15: RF_SOSTA_7 e nota tecnica dell'issue: il riscontro usa la consultazione delle soste con l'allineamento temporale, quindi una sosta appena scaduta è classificata come scaduta.
- TF-RIS-16: VD_16 e `UC_ANPR_1` 4.a1: la lettura è scartata e la prima segnalazione resta. TF-RIS-17: il controllo dei duplicati si fa solo quando l'esito prevede una segnalazione (`UC_ANPR_1` passi 2 e 4).
- TF-RIS-18: decisione 4 del piano: la seconda di due letture concorrenti, fermata dall'indice `segnalazione_una_non_chiusa_per_targa`, è scartata e non è un errore.
- TF-RIS-19: decisione 5: la targa è normalizzata con `normalizzaTarga` di Utenti e accessi.
- TF-RIS-20, 27: risposta D3 del piano. Una lettura successiva all'istante corrente creerebbe una segnalazione che non si potrebbe più chiudere (vincolo `segnalazione_date_ordinate`: la chiusura non può precedere la lettura); la lettura all'istante corrente è accettata.
- TF-RIS-21, 23…26: `UC_ANPR_1` 1.a1 (lettura incompleta o stallo inesistente: la lettura è scartata) ed errori di dominio della decisione 4 del piano.
- TF-RIS-22: risposta D2: dopo la normalizzazione la targa deve avere solo lettere e cifre, come richiede il vincolo `segnalazione_targa_rilevata_normalizzata`.

## 6. Note

- **Discrepanza 1: targa con sosta attiva altrove e nessuna sosta sullo stallo.** `UC_ANPR_1` (passo 3) definisce «targa non corrispondente» rispetto alla targa della sosta `Attiva` sullo stallo: con nessuna sosta sullo stallo il motivo sarebbe «sosta assente». L'issue #10 aggiunge la regola «targa con sosta attiva su un altro stallo → targa non corrispondente», e il piano approvato la segue: TF-RIS-02 si aspetta `TARGA_NON_CORRISPONDENTE`.
- **Discrepanza 3: fasce orarie e stalli riservati fuori ambito fino alla COD-23.** `SD_ANPR_1` (2.2, 2.3) e `UC_ANPR_1` 2.a2 prevedono che fuori dalla fascia a pagamento, su uno stallo non riservato, non si generi alcuna segnalazione, mentre su uno stallo riservato si prosegua con «sosta assente». In OMP-46 ogni lettura è trattata come se fosse dentro la fascia a pagamento e il tipo di stallo non si usa; i frame sugli stalli rosa (TF-RIS-11, 12) danno quindi lo stesso esito degli stalli ordinari. La regola sul permesso esposto negli stalli riservati è della COD-20 e della COD-21.
- Le letture non si conservano: della lettura restano targa, stallo e data e ora nella segnalazione generata.
- **Comportamenti già verificati altrove** (nessun frame qui): `esisteSegnalazioneNonChiusa` e `creaSegnalazioneDaLettura`, compresi l'indice di unicità per targa, lo stallo inesistente, la targa non normalizzata e il motivo non ammesso, `cp_persistenza_segnalazioni_verifiche.md` TF-SV-01…10; sosta attiva o scaduta sullo stallo e soste in corso della targa, `cp_consultazione.md` TF-CNS-01…07 e 16…18; allineamento temporale, `cp_scadenzaEFine.md`; normalizzazione della targa, `cp_targhe.md` TF-02.
