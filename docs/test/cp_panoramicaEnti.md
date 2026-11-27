# cp_panoramicaEnti

Specifica dei casi di test (category partition) del servizio Panoramica degli enti: operazioni `enti()` e `riepilogo(ente)` della Facade di Amministrazione, e operazione nuova `contaSegnalazioniAperte(ente)` della Facade di Segnalazioni.
Requisito: RF_ADM_1 (panoramica degli enti clienti). Task OMP-62 (issue #39).

- **Fonti dell'esito atteso:** `UC_ADM_1` (passi 1–4, flussi 2.a1, 4.a1, Regole di dominio: «segnalazioni aperte» sono tutte quelle non chiuse, `Aperta` e `Presa in carico`), `SD_ADM_1` (2.1 `enti()`, 4.1 `riepilogo()`, 4.2 `mostraRiepilogo(stalliGestiti, sosteAttive, segnalazioniAperte)`), `docs/rad/vincoli_dominio.md` §1 (riepilogo dell'ente: stalli delle aree dell'ente, soste `Attiva`, segnalazioni non chiuse), `cp_conteggio.md` e `cp_consultazione.md` TF-CNS-08…11 (conteggi già verificati), issue #39 (categorie minime; soste contate dopo l'allineamento temporale), piano approvato di OMP-62.
- **File di test:** `src/application/amministrazione/panoramica.db.test.ts` (TF-PAN-01…09) e `src/application/segnalazioni/conteggio.db.test.ts` (TF-PAN-10, 11), eseguiti con `npx vitest run --config vitest.db.config.ts <file>`.

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_39` per le scelte dell'issue #39 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_ADM_1 · TF-PAN-05 · sosta con scadenza raggiunta → non contata`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/amministrazione/facade.ts
type RiepilogoDellEnte = { stalliGestiti: number; sosteAttive: number; segnalazioniAperte: number };
creaFacadeAmministrazione(dipendenze: {
  gestioneStalli: FacadeGestioneStalli;
  gestioneSoste: FacadeGestioneSoste;
  segnalazioni: FacadeSegnalazioni;
  pool?: Pool;
}): FacadeAmministrazione;
facade.enti(): Promise<{ id: number; nome: string }[]>;          // ordinati per nome, poi id
facade.riepilogo(ente: number): Promise<RiepilogoDellEnte>;
// errori: ErroreAmministrazione con `codice` (esportato dalla Facade)

// da src/application/segnalazioni/facade.ts (operazione nuova)
facade.contaSegnalazioniAperte(ente: number): Promise<number>;   // APERTA e PRESA_IN_CARICO
// errori: ErroreSegnalazioni
```

- **`enti`:** gli enti preposti (persistenza `enti()`); elenco vuoto se non ce ne sono (2.a1).
- **`riepilogo`:** prima controlla che l'ente esista tra quelli di `enti()`; altrimenti, anche per un id non intero positivo, `ENTE_INESISTENTE` (`ErroreAmministrazione`). Poi chiede i tre valori alle Facade: `gestioneStalli.contaStalliGestiti(ente)`, `gestioneSoste.contaSosteAttive(ente)` (che esegue l'allineamento temporale: una sosta `ATTIVA` con scadenza raggiunta diventa `SCADUTA` e non è contata) e `segnalazioni.contaSegnalazioniAperte(ente)`.
- **`contaSegnalazioniAperte`:** segnalazioni `APERTA` o `PRESA_IN_CARICO` rilevate negli stalli delle aree dell'ente; le `CHIUSA` non contano. Ente inesistente o id non valido → `ENTE_INESISTENTE` (`ErroreSegnalazioni`, codice nuovo). Nessun controllo del richiedente: l'autorizzazione dell'Amministratore la fa la route (`cp_apiAmministrazione.md`).

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaAutomobilista`, `trovaOCreaVeicolo`, `associaVeicolo`, `creaSosta`, `trovaSosta`, `trovaStallo`, `creaSegnalazioneDaLettura`, `chiudiSegnalazione`; `creaEnteDiProva` (`src/persistence/test/datiDiProva.ts`); Facade di Gestione stalli `impostaNonDisponibile`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni vanno in commit: **i frame si eseguono nell'ordine della tabella**, perché TF-PAN-03 legge l'ente 1 prima che TF-PAN-05 vi aggiunga una sosta, e TF-PAN-04 legge l'ente 3 prima di TF-PAN-06.
- Orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`). Composizione: `wallet = creaFacadeWallet({ pagamento: new SimulatorePagamento({ latenzaMs: 0 }), pool: poolDiTest(), orologio })`, `gestioneSoste = creaFacadeGestioneSoste({ wallet, pool: poolDiTest(), orologio })`, `gestioneStalli = creaFacadeGestioneStalli({ pool: poolDiTest(), orologio, osservatori: [osservatoreGestioneSoste] })`, `segnalazioni = creaFacadeSegnalazioni({ gestioneSoste, pool: poolDiTest(), orologio })`, `facade = creaFacadeAmministrazione({ gestioneStalli, gestioneSoste, segnalazioni, pool: poolDiTest() })`.
- **Dalla COD-23 (RF_IOT_2):** dopo `preparaDatabaseDiTest()`, `rilevazioniAllIstante(poolDiTest(), T)` (`src/persistence/test/datiDiProva.ts`) porta a `T` l'ultima rilevazione degli stalli rilevati: uno stallo resta `Libero` od `Occupato` solo con una rilevazione degli ultimi 60 secondi. Gli esiti non cambiano.
- **Sosta di prova del frame `n`:** automobilista `creaAutomobilista(pool, { email: "panoramica.<n>@test.example", hashPassword: "hash-di-prova" })`, veicolo `PA0<n>AA` con `<n>` su due cifre (`trovaOCreaVeicolo`, `associaVeicolo`), `creaSosta(pool, { automobilistaId, veicoloId, stalloId, orarioDiAvvio, orarioDiScadenza, pagamento: "PAGATA" })`, poi `gestioneStalli.impostaNonDisponibile(stallo)`. Tutti gli orari sono del `2026-11-20`, `+01`.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                   | id     | Contenuto                                                                                  |
| :------------------------ | :----- | :----------------------------------------------------------------------------------------- |
| `ente_preposto`           | 1      | Comune di Gragnano: stalli 1…21 (21); segnalazioni 4, 5, 10 `PRESA_IN_CARICO`, 11 `APERTA` |
| `ente_preposto`           | 2      | Comune di Fisciano: stalli 22…27 (6); segnalazione 12 `APERTA`                             |
| `ente_preposto`           | 3      | Comune di Baronissi: stalli 28…30 (3); nessuna segnalazione                                |
| `stallo`                  | 17     | ente 1, `OCCUPATO`                                                                         |
| `stallo`                  | 23     | ente 2, `OCCUPATO`                                                                         |
| `stallo`                  | 28, 29 | ente 3: 28 `LIBERO`, 29 `OCCUPATO`                                                         |
| `ausiliario_del_traffico` | 6      | Giorgio Marino, ente 3, `ATTIVO`                                                           |
| sosta                     | —      | nessuna sosta `ATTIVA` nel dataset                                                         |

Id inesistente: `999999`.

## 4. Categorie e scelte

**Ente:** con stalli, soste attive e segnalazioni aperte · senza soste attive · senza segnalazioni aperte · senza stalli [single] · inesistente [error] · id non valido [error].

**Soste:** attiva · con scadenza raggiunta e non ancora allineata [single] → non contata.

**Segnalazioni:** `APERTA` e `PRESA_IN_CARICO` → contate · `CHIUSA` → non contata.

**Elenco degli enti:** più enti · ente aggiunto [single].

Le categorie di ruolo (Amministratore, Ausiliario, Automobilista, nessuna sessione) sono nella specifica delle route, `cp_apiAmministrazione.md`: la Facade non conosce la sessione.

## 5. Test frame (11)

| Frame     | Preparazione                                                                                                                                                                                                                                           | Chiamata                                          | Esito atteso                                                                                                                    | Riferimento |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-PAN-01 | nessuna                                                                                                                                                                                                                                                | `enti()`                                          | `[{ 3, "Comune di Baronissi" }, { 2, "Comune di Fisciano" }, { 1, "Comune di Gragnano" }]`                                      | RF_ADM_1    |
| TF-PAN-02 | sosta di prova 02 sullo stallo 23, `09:00` → `12:00`                                                                                                                                                                                                   | `riepilogo(2)`                                    | `{ stalliGestiti: 6, sosteAttive: 1, segnalazioniAperte: 1 }`                                                                   | RF_ADM_1    |
| TF-PAN-03 | nessuna                                                                                                                                                                                                                                                | `riepilogo(1)`                                    | `{ stalliGestiti: 21, sosteAttive: 0, segnalazioniAperte: 4 }` (3 `PRESA_IN_CARICO` e 1 `APERTA`)                               | RF_ADM_1    |
| TF-PAN-04 | sosta di prova 04 sullo stallo 29, `09:00` → `12:00`                                                                                                                                                                                                   | `riepilogo(3)`                                    | `{ stalliGestiti: 3, sosteAttive: 1, segnalazioniAperte: 0 }`                                                                   | RF_ADM_1    |
| TF-PAN-05 | sosta di prova 05 sullo stallo 17, `08:00` → `09:30` (scadenza già raggiunta a `T`), ancora `ATTIVA`                                                                                                                                                   | `riepilogo(1)`                                    | `{ stalliGestiti: 21, sosteAttive: 0, segnalazioniAperte: 4 }`; dopo la chiamata la sosta è `SCADUTA` e lo stallo 17 `OCCUPATO` | RF_ADM_1    |
| TF-PAN-06 | `creaSegnalazioneDaLettura({ stalloId: 28, targa: "PA006AA", dataEOra: 2026-11-20 09:00, motivo: "SOSTA_ASSENTE" })`, poi `prendiInCarico(id, 6, 09:20)` (precondizione adeguata con la OMP-63) e `chiudiSegnalazione(id, 6, "NON_CONFERMATA", 09:30)` | `riepilogo(3)`                                    | `segnalazioniAperte: 0` (la segnalazione chiusa non conta); gli altri valori come TF-PAN-04                                     | RF_ADM_1    |
| TF-PAN-07 | `creaEnteDiProva(pool, "Ente di prova panoramica")`                                                                                                                                                                                                    | `enti()`, poi `riepilogo(<id>)`                   | l'ente compare in `enti()` (ordinato per nome); riepilogo `{ 0, 0, 0 }`                                                         | RF_ADM_1    |
| TF-PAN-08 | nessuna                                                                                                                                                                                                                                                | `riepilogo(999999)`                               | errore `ENTE_INESISTENTE` (`ErroreAmministrazione`)                                                                             | RF_ADM_1    |
| TF-PAN-09 | nessuna                                                                                                                                                                                                                                                | `riepilogo(0)`, `riepilogo(-1)`, `riepilogo(1.5)` | errore `ENTE_INESISTENTE` in tutti e tre i casi                                                                                 | ISSUE_39    |
| TF-PAN-10 | nessuna                                                                                                                                                                                                                                                | `segnalazioni.contaSegnalazioniAperte(1)`         | 4                                                                                                                               | RF_ADM_1    |
| TF-PAN-11 | nessuna                                                                                                                                                                                                                                                | `segnalazioni.contaSegnalazioniAperte(999999)`    | errore `ENTE_INESISTENTE` (`ErroreSegnalazioni`)                                                                                | RF_ADM_1    |

Totale 11: 9 sulla Facade di Amministrazione (`panoramica.db.test.ts`), 2 su `contaSegnalazioniAperte` (`conteggio.db.test.ts`, che ha un proprio database ricreato nel `beforeAll`).

Note sui riferimenti:

- TF-PAN-03, 10: RF_ADM_1 con la precisazione di `UC_ADM_1` (Regole di dominio): le segnalazioni `Presa in carico` contano tra le «aperte».
- TF-PAN-06: precondizione adeguata con la OMP-63. Da RAD 0.6 `chiudiSegnalazione` della persistenza chiude solo una segnalazione `PRESA_IN_CARICO` dallo stesso ausiliario (`cp_persistenza_segnalazioni_verifiche.md` TF-SV-32), quindi la preparazione prende prima in carico la segnalazione con lo stesso Ausiliario 6 (Giorgio Marino, `ATTIVO`, ente 3, quello dello stallo 28). L'esito del frame è invariato.
- TF-PAN-05: categoria minima dell'issue («sosta con scadenza raggiunta → non contata»), che si ottiene con l'allineamento di `contaSosteAttive`.
- TF-PAN-09: la Facade accetta solo id interi positivi, come le altre Facade (`idValido`).

## 6. Note

- **4.a1 (informazioni dell'ente non disponibili):** un guasto del database non si riproduce senza stub; la Facade lascia passare l'errore della persistenza, e la route lo traduce in 503 `DATABASE_NON_RAGGIUNGIBILE` (tabella comune). Nell'interfaccia la riga dell'ente mostra «Riepilogo non disponibile» (`cp_amministrazioneInterfaccia.md`).
- **2.a1 (nessun ente):** il dataset ha sempre tre enti e i test non li cancellano; il caso è coperto dall'interfaccia (`cp_amministrazioneInterfaccia.md`).
