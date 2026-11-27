# cp_statoDelPagamento

Specifica dei casi di test (category partition) del servizio Stato del pagamento del sottosistema Segnalazioni, operazione `statoDelPagamento(ausiliario, segnalazione)` della Facade, e dell'operazione nuova `sostaDellaTargaSulloStallo(targa, stallo)` della Facade di Gestione soste che la sostiene.
Requisiti: RF_OP_4 (verifica del pagamento), NRF_SIC_1 (controllo degli accessi per ruolo ed ente). Task OMP-63 (issue #40).

- **Fonti dell'esito atteso:** `UC_OP_3` (Regole di dominio: stato della sosta `Attiva`, `Scaduta` o `Terminata`, sosta gratuita negli stalli per persone con disabilità; entry condition allineata al RAD 0.6: solo su una segnalazione presa in carico da chi la richiede; passi 2–3), `UC_OP_4` (2.a2, punto di estensione), statechart `SCD_2` e `SCD_3`, `docs/rad/vincoli_dominio.md` (VD_18), `cp_persistenza_wallet_soste.md` TF-WS-27…29 (`sostaPerTargaSuStallo`: la sosta più recente della targa sullo stallo, in qualsiasi stato), issue #40, piano approvato di OMP-63 (decisione D0).
- **File di test:** `src/application/segnalazioni/statoDelPagamento.db.test.ts`, eseguito con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_40` per le scelte dell'issue #40 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_OP_4 · TF-PAG-04 · sosta terminata → TERMINATA`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/segnalazioni/facade.ts (operazione nuova)
type StatoDelPagamento = {
  sosta: {
    stato: "ATTIVA" | "SCADUTA" | "TERMINATA";
    orarioDiAvvio: Date;
    orarioDiScadenza: Date;
    pagamento: "PAGATA" | "GRATUITA";
  } | null; // null: per la targa non risulta alcuna sosta sullo stallo
};
facade.statoDelPagamento(ausiliario: number, segnalazione: number): Promise<StatoDelPagamento>;
// errori: ErroreSegnalazioni con `codice`

// da src/application/gestione-soste/facade.ts (operazione nuova)
facade.sostaDellaTargaSulloStallo(targa: string, stallo: number): Promise<Sosta | null>;
// dopo l'allineamento temporale; la più recente della targa sullo stallo, in qualsiasi stato
```

Controlli di `statoDelPagamento`, in quest'ordine: Ausiliario esistente e `ATTIVO` (`AUSILIARIO_NON_ATTIVO`); segnalazione esistente (`SEGNALAZIONE_INESISTENTE`); stesso ente (`ENTE_NON_AMMESSO`, prima di rivelare lo stato); stato: `APERTA` → `SEGNALAZIONE_NON_PRESA_IN_CARICO`, `PRESA_IN_CARICO` da un altro → `SEGNALAZIONE_PRESA_DA_ALTRI`, `CHIUSA` → `SEGNALAZIONE_GIA_CHIUSA`. Poi `gestioneSoste.sostaDellaTargaSulloStallo(targaRilevata, stalloId)`. La risposta non contiene mai dichiarazione e foto del permesso.

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaSegnalazioneDaLettura`, `prendiInCarico` (`segnalazioniVerifiche.ts`), `creaAutomobilista`, `trovaOCreaVeicolo`, `associaVeicolo` (`utentiEntiVeicoli.ts`), `creaSosta`, `impostaSostaScaduta`, `terminaSosteScaduteDelloStallo`, `trovaSosta` (`walletSoste.ts`); Facade di Gestione stalli (con `osservatoreGestioneSoste`) `registraRilevazione` e `impostaNonDisponibile`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni vanno in commit: ogni frame che prepara dati usa stallo, automobilista, targa e segnalazione propri.
- Facade composta come in `cp_chiusuraSegnalazione.md` §3, con orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`). Tutti gli orari sono del `2026-11-20`, `+01`.
- **Targa del frame `n`:** `PG0<n>AA` con `<n>` su due cifre; automobilista `creaAutomobilista(pool, { email: "pagamento.<n>@test.example", hashPassword: "hash-di-prova" })`, veicolo con la targa (`trovaOCreaVeicolo`, `associaVeicolo`).
- **Segnalazione presa in carico del frame `n`:** `creaSegnalazioneDaLettura(pool, { stalloId, targa: <targa del frame>, dataEOra: 09:50, motivo: "SOSTA_ASSENTE" })`, poi `prendiInCarico(pool, id, 2, 09:55)` (Paolo Ferri, ente 1).
- **Sosta:** `creaSosta(pool, { automobilistaId, veicoloId, stalloId, orarioDiAvvio, orarioDiScadenza, pagamento })`; «attiva» aggiunge `impostaNonDisponibile(stallo)` (stallo `OCCUPATO`); «scaduta» aggiunge `impostaSostaScaduta(pool, id)`; «terminata» aggiunge, dopo la scadenza, `terminaSosteScaduteDelloStallo(pool, stallo)`.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                   | id                          | Contenuto                                                     |
| :------------------------ | :-------------------------- | :------------------------------------------------------------ |
| `ausiliario_del_traffico` | 2, 3                        | Paolo Ferri, Sara Galli: ente 1, `ATTIVO`                     |
| `ausiliario_del_traffico` | 5                           | Anna Moretti: ente 2, `ATTIVO`                                |
| `segnalazione`            | 11                          | ente 1, `APERTA`                                              |
| `segnalazione`            | 4                           | ente 1, `PRESA_IN_CARICO` dall'Ausiliario 3                   |
| `segnalazione`            | 1                           | ente 1, `CHIUSA`                                              |
| `stallo`                  | 3, 7, 8, 12, 17, 18, 19, 20 | ente 1, `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`                   |
| `stallo`                  | 14                          | ente 1, `DISABILI`, `LIBERO` (portato a `OCCUPATO` nel frame) |

Id inesistente: `999999`.

## 4. Categorie e scelte

**Sosta della targa sullo stallo:** Attiva · Scaduta · Terminata · nessuna · più soste, la più recente [single] · Attiva con scadenza raggiunta e non ancora allineata [single] → Scaduta.

**Pagamento:** pagata · gratuita (stallo per persone con disabilità) [single].

**Segnalazione rispetto al richiedente:** presa in carico da lui · Aperta [error] · presa in carico da un altro [error] · Chiusa [error] · inesistente [error] · di un altro ente [error].

## 5. Test frame (12)

| Frame     | Preparazione (frame `n`)                                                                                                                                                                  | Chiamata                       | Esito atteso                                                                                                                      | Riferimento |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-PAG-01 | sosta attiva `PAGATA` della targa sullo stallo 17, `09:00` → `12:00`; segnalazione presa in carico S sullo stallo 17                                                                      | `statoDelPagamento(2, S)`      | `{ sosta: { stato: "ATTIVA", orarioDiAvvio: 09:00, orarioDiScadenza: 12:00, pagamento: "PAGATA" } }`, senza dichiarazione né foto | RF_OP_4     |
| TF-PAG-02 | stallo 14 portato a `OCCUPATO` (`registraRilevazione` presenza vera alle `09:00`); sosta attiva `GRATUITA` sullo stallo 14 con dichiarazione e foto, `09:00` → `10:30`; S sullo stallo 14 | `statoDelPagamento(2, S)`      | `stato: "ATTIVA"`, `pagamento: "GRATUITA"`; la risposta non contiene dichiarazione né foto del permesso                           | RF_OP_4     |
| TF-PAG-03 | sosta `PAGATA` sullo stallo 18, `08:00` → `08:30`, scaduta; S sullo stallo 18                                                                                                             | `statoDelPagamento(2, S)`      | `stato: "SCADUTA"`, orari `08:00` e `08:30`                                                                                       | RF_OP_4     |
| TF-PAG-04 | sosta `PAGATA` sullo stallo 19, `08:00` → `08:30`, scaduta e poi terminata; S sullo stallo 19                                                                                             | `statoDelPagamento(2, S)`      | `stato: "TERMINATA"`                                                                                                              | RF_OP_4     |
| TF-PAG-05 | sosta attiva della targa sullo stallo 20 (non quello della segnalazione); S sullo stallo 3                                                                                                | `statoDelPagamento(2, S)`      | `{ sosta: null }`                                                                                                                 | RF_OP_4     |
| TF-PAG-06 | sullo stallo 7: sosta `08:00` → `08:30` scaduta e terminata, poi sosta attiva `09:00` → `11:00`; S sullo stallo 7                                                                         | `statoDelPagamento(2, S)`      | la sosta delle `09:00`: `stato: "ATTIVA"`, `orarioDiAvvio: 09:00`                                                                 | RF_OP_4     |
| TF-PAG-07 | sosta attiva sullo stallo 8, `08:00` → `09:30` (scadenza raggiunta a `T`), ancora `ATTIVA`; S sullo stallo 8                                                                              | `statoDelPagamento(2, S)`      | `stato: "SCADUTA"`; dopo la chiamata `trovaSosta` la restituisce `SCADUTA`                                                        | RF_OP_4     |
| TF-PAG-08 | nessuna                                                                                                                                                                                   | `statoDelPagamento(2, 11)`     | errore `SEGNALAZIONE_NON_PRESA_IN_CARICO`                                                                                         | ISSUE_40    |
| TF-PAG-09 | nessuna                                                                                                                                                                                   | `statoDelPagamento(2, 4)`      | errore `SEGNALAZIONE_PRESA_DA_ALTRI`                                                                                              | NRF_SIC_1   |
| TF-PAG-10 | nessuna                                                                                                                                                                                   | `statoDelPagamento(2, 1)`      | errore `SEGNALAZIONE_GIA_CHIUSA`                                                                                                  | ISSUE_40    |
| TF-PAG-11 | segnalazione presa in carico S sullo stallo 12 (dell'ente 1)                                                                                                                              | `statoDelPagamento(5, S)`      | errore `ENTE_NON_AMMESSO`                                                                                                         | NRF_SIC_1   |
| TF-PAG-12 | nessuna                                                                                                                                                                                   | `statoDelPagamento(2, 999999)` | errore `SEGNALAZIONE_INESISTENTE`                                                                                                 | RF_OP_4     |

Totale 12: 7 sullo stato della sosta (compresi i due [single]), 5 sui controlli della segnalazione.

Note sui riferimenti:

- TF-PAG-01…07: RF_OP_4 e `UC_OP_3` (passi 2–3 e Regole di dominio). TF-PAG-02: sosta gratuita negli stalli per persone con disabilità (conta che sia `Attiva`) e NRF_LEG_2 (dichiarazione e foto non escono dalla sosta). TF-PAG-06: la sosta più recente (`sostaPerTargaSuStallo`, TF-WS-27). TF-PAG-07: l'allineamento temporale di Gestione soste (`cp_scadenzaEFine.md`).
- TF-PAG-08, 10: decisione D0 (RAD 0.6, `UC_OP_3` entry condition): solo su una segnalazione presa in carico da chi la richiede.
- TF-PAG-09, 11: NRF_SIC_1 (presa in carico esclusiva e segregazione per ente).

## 6. Note

- **2.a1 (informazioni sul pagamento non disponibili):** un guasto del database non si riproduce senza stub; la route lo traduce in 503 dalla tabella comune e la schermata mostra il messaggio d'errore (`cp_mappaSegnalazioni.md`).
- `sostaDellaTargaSulloStallo` non ha frame propri: la persistenza che riusa è verificata da TF-WS-27…29, l'allineamento da `cp_scadenzaEFine.md`, e il comportamento composto da TF-PAG-01…07.
