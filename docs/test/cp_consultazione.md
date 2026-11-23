# cp_consultazione

Specifica dei casi di test (category partition) del servizio Consultazione del sottosistema Gestione soste, operazioni `sostaInCorso(stallo)`, `contaSosteAttive(ente)` e `sosteDellAutomobilista(automobilista)` della Facade.
Requisiti: RF_ANPR_1 (sosta attiva o scaduta sullo stallo per la segnalazione), RF_ADM_1 (numero di soste attive dell'ente), RF_SOSTA_7 (la sosta scaduta risulta `Scaduta` alla prima lettura). Task OMP-45 (issue #9).

- **Fonti dell'esito atteso:** `UC_ANPR_1` (passi 2–3), `SD_ANPR_1` 2.1 e `SD_IOT_1` 3.2 (`sostaInCorso()`), `UC_OP_3`, `UC_ADM_1` passo 4 e `SD_ADM_1` 4.2, `docs/rad/vincoli_dominio.md` §1 (riepilogo dell'ente: soste in stato `Attiva`), navigation path `np_01_automobilista` («le mie soste → Sosta in corso: stato e orario di scadenza»), `UC_SOSTA_2` (entry condition), `docs/test/cp_inserimento_sosta.md` §6 (più soste non terminate sullo stesso stallo), issue #9, piano approvato di OMP-45 (decisione 8, risposta D2).
- **File di test:** `src/application/gestione-soste/consultazione.db.test.ts` (eseguito con `npx vitest run --config vitest.db.config.ts <file>`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_9` per le scelte dell'issue #9 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_ANPR_1 · TF-CNS-05 · sosta attiva e scaduta sullo stallo → la attiva`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/gestione-soste/facade.ts (Sosta è il tipo della persistenza, riesportato)
type Sosta = {
  id: number; automobilistaId: number; veicoloId: number; targa: string; stalloId: number;
  stato: "ATTIVA" | "SCADUTA" | "TERMINATA";
  orarioDiAvvio: Date; orarioDiScadenza: Date; pagamento: "PAGATA" | "GRATUITA";
  dichiarazioneDiPermesso: string | null; fotoDelPermesso: Buffer | null;
};
facade.sostaInCorso(stallo: number): Promise<Sosta | null>;
facade.contaSosteAttive(ente: number): Promise<number>;
facade.sosteDellAutomobilista(automobilista: number): Promise<Sosta[]>;
// errori: ErroreGestioneSoste con `codice` (esportato dalla Facade)
```

- Tutte e tre le operazioni eseguono prima l'allineamento temporale: una sosta `ATTIVA` con scadenza raggiunta è restituita, o contata, già `SCADUTA`.
- **`sostaInCorso`:** la sosta non terminata dello stallo; se ce ne sono più di una, la `ATTIVA`, altrimenti la `SCADUTA` con la scadenza più recente. `null` se lo stallo ha solo soste `TERMINATA`, nessuna sosta o non esiste.
- **`contaSosteAttive`:** soste `ATTIVA` negli stalli delle aree di sosta dell'ente; ente inesistente → `ENTE_INESISTENTE`.
- **`sosteDellAutomobilista`:** soste in corso dell'Automobilista (`ATTIVA` e `SCADUTA`), dalla più recente per orario di avvio, poi per id; nessuno storico delle `TERMINATA`. Automobilista inesistente → `[]`.

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaAutomobilista`, `trovaOCreaVeicolo`, `associaVeicolo`, `creaSosta`, `impostaSostaScaduta`, `terminaSosteScaduteDelloStallo`, `trovaSosta`, `trovaStallo`; `creaEnteDiProva` (`src/persistence/test/datiDiProva.ts`); Facade di Gestione stalli (creata con `osservatoreGestioneSoste`) `registraRilevazione` e `impostaNonDisponibile`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni vanno in commit: ogni frame che prepara dati usa stalli, automobilisti e veicoli propri.
- Facade creata con `pool: poolDiTest()`, orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`) e `wallet: creaFacadeWallet({ pagamento: new SimulatorePagamento({ latenzaMs: 0 }), pool: poolDiTest(), orologio })`.
- **Automobilista di prova `C<n>`:** `creaAutomobilista(pool, { email: "consultazione.<n>@test.example", hashPassword: "hash-di-prova" })` con il veicolo `CN0` seguito da `<n>` su due cifre e da `AA` (per esempio `CN002AA`, `CN012AA`) (`trovaOCreaVeicolo`, `associaVeicolo`); `C<n>b` usa `consultazione.<n>b@test.example` e la stessa targa con `BB` (per esempio `CN005BB`). Nessun wallet.
- **Sosta preesistente:** `creaSosta(pool, { automobilistaId, veicoloId, stalloId, orarioDiAvvio, orarioDiScadenza, pagamento: "PAGATA" })`; «con lo stallo Non disponibile» aggiunge `impostaNonDisponibile(stallo)`; «scaduta» aggiunge `impostaSostaScaduta(pool, id)`; «terminata» aggiunge, dopo la scadenza, `terminaSosteScaduteDelloStallo(pool, stallo)`.
- Tutti gli orari sono del `2026-11-20`, `+01`.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                   | id                          | Contenuto                                                                 |
| :------------------------ | :-------------------------- | :------------------------------------------------------------------------ |
| `stallo`                  | 3, 7, 8, 12, 17, 18, 19, 20 | ente 1, `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, `VEICOLO_PRESENTE`           |
| `stallo`                  | 16                          | ente 1, `LIBERO`, nessuna sosta                                           |
| `stallo`                  | 11                          | ente 1, `OCCUPATO`; soste 2 e 9 del dataset, entrambe `TERMINATA`         |
| `stallo`                  | 23, 26                      | ente 2 (aree 6 e 7, stalli 22…27), `OCCUPATO`                             |
| `stallo`                  | 28, 29                      | ente 3 (area 8, stalli 28…30): 28 `LIBERO`, 29 `OCCUPATO`                 |
| `automobilista` / `sosta` | 8 / 1, 2, 9                 | Marco Rossi: solo soste `TERMINATA`                                       |
| `ente_preposto`           | 2, 3                        | Comune di Fisciano, Comune di Baronissi: nessuna sosta attiva nel dataset |

Colonne usate dai test:

| Tabella                          | Colonne                                                                                                                                                              |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sosta`                          | `id`, `automobilista_id`, `veicolo_id`, `stallo_id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`, `dichiarazione_di_permesso`, `foto_del_permesso` |
| `veicolo`                        | `id`, `targa`                                                                                                                                                        |
| `stallo`                         | `id`, `area_di_sosta_id`, `stato`, `occupazione_rilevata`                                                                                                            |
| `area_di_sosta`, `ente_preposto` | `id`, `ente_preposto_id`, `nome`                                                                                                                                     |

Id inesistente: `999999`.

## 4. Categorie e scelte

**sostaInCorso — Soste sullo stallo**

1. nessuna
2. Attiva
3. Scaduta
4. solo Terminate
5. Attiva e Scaduta
6. Attiva con scadenza raggiunta, non ancora allineata
7. stallo inesistente

**contaSosteAttive — Ente**

1. con soste attive
2. con una sosta attiva e una con scadenza raggiunta
3. senza aree di sosta
4. inesistente [error]

**sosteDellAutomobilista — Soste dell'Automobilista**

1. Attiva, Scaduta e Terminata
2. solo Terminate
3. Attiva con scadenza raggiunta, non ancora allineata
4. automobilista inesistente

## 5. Test frame (15)

| Frame     | Preparazione                                                                                                                                                                                                                                                            | Operazione                       | Esito atteso                                                               | Riferimento |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- | :------------------------------------------------------------------------- | :---------- |
| TF-CNS-01 | nessuna                                                                                                                                                                                                                                                                 | `sostaInCorso(16)`               | `null`                                                                     | ISSUE_9     |
| TF-CNS-02 | `C2`: sosta S sullo stallo 3, `09:00` → `12:00`, con lo stallo Non disponibile                                                                                                                                                                                          | `sostaInCorso(3)`                | S, `ATTIVA`, targa `CN002AA`, orari di avvio e scadenza come inseriti      | RF_ANPR_1   |
| TF-CNS-03 | `C3`: sosta S sullo stallo 7, `08:00` → `09:00`, scaduta                                                                                                                                                                                                                | `sostaInCorso(7)`                | S, `SCADUTA`, targa `CN003AA`                                              | RF_ANPR_1   |
| TF-CNS-04 | nessuna (soste 2 e 9 del dataset)                                                                                                                                                                                                                                       | `sostaInCorso(11)`               | `null`                                                                     | RF_ANPR_1   |
| TF-CNS-05 | `C5`: sosta S1 sullo stallo 8, `08:00` → `08:30`, scaduta; poi `C5b`: sosta S2 sullo stallo 8, `09:00` → `12:00`, con lo stallo Non disponibile                                                                                                                         | `sostaInCorso(8)`                | S2, `ATTIVA`, targa `CN005BB`                                              | RF_ANPR_1   |
| TF-CNS-06 | `C6`: sosta S sullo stallo 17, `08:00` → `09:30`, con lo stallo Non disponibile                                                                                                                                                                                         | `sostaInCorso(17)`               | S, `SCADUTA`; dopo la chiamata lo stallo 17 è `OCCUPATO`                   | RF_SOSTA_7  |
| TF-CNS-07 | nessuna                                                                                                                                                                                                                                                                 | `sostaInCorso(999999)`           | `null`                                                                     | ISSUE_9     |
| TF-CNS-08 | `C8`: sosta sullo stallo 23 e `C8b`: sosta sullo stallo 26, entrambe `09:00` → `12:00`, con lo stallo Non disponibile                                                                                                                                                   | `contaSosteAttive(2)`            | 2                                                                          | RF_ADM_1    |
| TF-CNS-09 | stallo 28 portato a `OCCUPATO` con una rilevazione presenza vera alle `09:00`; `C9`: sosta sullo stallo 28, `09:00` → `12:00`, con lo stallo Non disponibile; `C9b`: sosta S sullo stallo 29, `08:00` → `09:30`, con lo stallo Non disponibile                          | `contaSosteAttive(3)`            | 1; S è `SCADUTA` e lo stallo 29 è `OCCUPATO`                               | RF_ADM_1    |
| TF-CNS-10 | ente creato con `creaEnteDiProva(pool, "Ente di prova consultazione")`                                                                                                                                                                                                  | `contaSosteAttive(<id>)`         | 0                                                                          | RF_ADM_1    |
| TF-CNS-11 | nessuna                                                                                                                                                                                                                                                                 | `contaSosteAttive(999999)`       | errore `ENTE_INESISTENTE`                                                  | RF_ADM_1    |
| TF-CNS-12 | `C12` con i veicoli `CN012AA` e `CN012BB`: sosta S0 (`CN012AA`) sullo stallo 12, `07:00` → `07:30`, terminata; sosta S1 (`CN012AA`) sullo stallo 18, `08:00` → `08:30`, scaduta; sosta S2 (`CN012BB`) sullo stallo 19, `09:00` → `12:00`, con lo stallo Non disponibile | `sosteDellAutomobilista(<C12>)`  | `[S2, S1]` in quest'ordine, con stati `ATTIVA` e `SCADUTA`; S0 non compare | ISSUE_9     |
| TF-CNS-13 | nessuna (automobilista 8 del dataset)                                                                                                                                                                                                                                   | `sosteDellAutomobilista(8)`      | `[]`                                                                       | ISSUE_9     |
| TF-CNS-14 | `C14`: sosta S sullo stallo 20, `08:00` → `09:30`, con lo stallo Non disponibile                                                                                                                                                                                        | `sosteDellAutomobilista(<C14>)`  | `[S]` con stato `SCADUTA`; dopo la chiamata lo stallo 20 è `OCCUPATO`      | RF_SOSTA_7  |
| TF-CNS-15 | nessuna                                                                                                                                                                                                                                                                 | `sosteDellAutomobilista(999999)` | `[]`                                                                       | ISSUE_9     |

Totale 15: 7 su `sostaInCorso`, 4 su `contaSosteAttive`, 4 su `sosteDellAutomobilista`.

Note sui riferimenti:

- TF-CNS-02…05: RF_ANPR_1 e `UC_ANPR_1` passi 2–3: per decidere se segnalare e con quale motivo, Segnalazioni ha bisogno della sosta `Attiva` o `Scaduta` presente sullo stallo. TF-CNS-04 è la scelta «solo Terminate → nessun risultato» dell'issue.
- TF-CNS-05: più soste non terminate sullo stesso stallo sono previste (`cp_inserimento_sosta.md` §6); la regola di priorità (prima la `ATTIVA`) è del piano approvato.
- TF-CNS-06, 09, 14: RF_SOSTA_7 e criterio di accettazione dell'issue («superata la scadenza, la sosta risulta Scaduta alla prima lettura successiva e lo stallo torna allo stato rilevato»).
- TF-CNS-01, 07: issue #9 («restituire la sosta non terminata presente su uno stallo»); per uno stallo inesistente la consultazione non dà errore (piano approvato).
- TF-CNS-08…11: RF_ADM_1 e `vincoli_dominio.md` §1 (soste in stato `Attiva` negli stalli dell'ente). Per l'ente inesistente il codice è lo stesso di `cp_conteggio.md` TF-CON-04.
- TF-CNS-12…15: risposta D2 del piano. Nessun caso d'uso elenca le soste dell'Automobilista: `np_01` mostra la «Sosta in corso» con stato e orario di scadenza, quindi le soste `Attive` e `Scadute`, senza storico.

## 6. Note

- **Comportamenti già verificati altrove** (nessun frame qui): ordinamento e filtri di `sostaInCorsoSuStallo` e `sosteInCorsoDiAutomobilista`, `cp_persistenza_wallet_soste.md` TF-WS-44…49; conteggio delle soste attive di `riepilogoEnte`, `cp_persistenza_utenti_enti_veicoli.md` TF-UEV-29…32; il passaggio a `Scaduta` e il ritorno dello stallo allo stato rilevato, `cp_scadenzaEFine.md`.
- `sostaInCorso` restituisce una sola sosta. Quando sullo stallo ci sono una sosta `Attiva` di una targa e una `Scaduta` di un'altra, Segnalazioni potrà distinguere «sosta scaduta» da «targa non corrispondente» con `sostaPerTargaSuStallo` della persistenza, che esiste già (discrepanza 11 del piano).
