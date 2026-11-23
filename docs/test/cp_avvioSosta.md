# cp_avvioSosta

Specifica dei casi di test (category partition) del servizio Avvio del sottosistema Gestione soste, operazione `avviaSosta(richiesta)` della Facade.
Requisiti: RF_SOSTA_1 (avvio della sosta), RF_SOSTA_6 (stallo Non disponibile durante la sosta), RF_WALLET_2 (addebito della sosta). Task OMP-45 (issue #9).

- **Fonti dell'esito atteso:** `UC_SOSTA_1` (passi 1–6, flussi 2.a1, 2.a2, 2.a3, 2.a4, 5.a1, exit condition), `SD_SOSTA_1`, `UC_SOSTA_5` (Regole di dominio: nessuna verifica di autenticità), `docs/rad/vincoli_dominio.md` (VD_2, VD_3, VD_5, VD_6, VD_8, VD_9, VD_10), statechart `SCD_1` (`avvioSosta`) e `SCD_2` (creazione in `Attiva`), issue #9 (ordine dei controlli, durata minima, atomicità), piano approvato di OMP-45 (sequenza, codici di errore, decisioni 4 e 5, risposta D1).
- **File di test:** `src/application/gestione-soste/avvio.db.test.ts` (eseguito con `npx vitest run --config vitest.db.config.ts <file>`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `SCHEMA` per un limite dello schema ripreso dal controllo; altrimenti `ISSUE_9` per le scelte dell'issue #9 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_SOSTA_1 · TF-AVV-16 · durata oltre il massimo → DURATA_NON_VALIDA`.

## 2. Operazione verificata (firme)

```ts
// da src/application/gestione-soste/facade.ts
type RichiestaDiAvvio = {
  automobilista: number; stallo: number; targa: string;
  durata: number;                      // minuti interi
  dichiarazioneDiPermesso?: string; fotoDelPermesso?: Buffer;
};
type SostaAvviata = {
  sosta: number; orarioDiAvvio: Date; orarioDiScadenza: Date;
  importo: number; pagamento: "PAGATA" | "GRATUITA";
};
creaFacadeGestioneSoste(dipendenze: { wallet: FacadeWallet; pool?: Pool; orologio?: Orologio; utentiAccessi?: FacadeUtentiAccessi }): FacadeGestioneSoste;
facade.avviaSosta(richiesta: RichiestaDiAvvio): Promise<SostaAvviata>;
const osservatoreGestioneSoste: OsservatoreStalli; // esportato dalla Facade, per comporre Gestione stalli nei test
// errori: ErroreGestioneSoste con `codice` (esportato dalla Facade)
```

Sequenza (piano approvato), con l'errore di ciascun passo:

| Passo | Controllo o azione                                                                                                     | Errore                                                                                                                              |
| :---- | :--------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| 0     | allineamento temporale (le soste attive con scadenza raggiunta passano a `SCADUTA`)                                    | —                                                                                                                                   |
| 1     | la targa, normalizzata, è tra le targhe del profilo (`targhe` della Facade di Utenti e accessi)                        | `TARGA_NON_NEL_PROFILO`                                                                                                             |
| 2     | lo stallo esiste ed è `OCCUPATO`                                                                                       | `STALLO_INESISTENTE`, `STALLO_NON_OCCUPATO`                                                                                         |
| 3     | nessuna sosta `ATTIVA` per il veicolo, poi per lo stallo                                                               | `SOSTA_GIA_ATTIVA`, `STALLO_CON_SOSTA_ATTIVA`                                                                                       |
| 4     | durata intera tra 15 minuti e la durata massima della tariffa                                                          | `DURATA_NON_VALIDA`                                                                                                                 |
| 5     | permesso secondo il tipo di stallo (sotto)                                                                             | `PERMESSO_MANCANTE`, `PERMESSO_NON_VALIDO`, `PERMESSO_NON_PREVISTO`                                                                 |
| 6     | calcolo dell'importo (`cp_calcoloImporto.md`)                                                                          | —                                                                                                                                   |
| 7     | un'unica transazione: creazione della sosta `ATTIVA`, addebito sul wallet (salvo `GRATUITA`), stallo `NON_DISPONIBILE` | `CREDITO_INSUFFICIENTE`; corse chiuse dal database tradotte in `SOSTA_GIA_ATTIVA`, `STALLO_CON_SOSTA_ATTIVA`, `STALLO_NON_OCCUPATO` |

Permesso (passo 5, decisione 4 e risposta D1). Nessuna verifica di autenticità (COD-20); i controlli riprendono solo i limiti dello schema:

- **`DISABILI`:** dichiarazione (testo non vuoto dopo il trim) e foto (da 1 byte a 2 MB) obbligatorie. Se una delle due manca o è vuota → `PERMESSO_MANCANTE`; foto oltre 2 MB → `PERMESSO_NON_VALIDO`.
- **`ROSA`:** dichiarazione e foto facoltative, salvate solo se complete; una sola delle due → `PERMESSO_NON_VALIDO`.
- **`ORDINARIO_A_PAGAMENTO`:** se arriva dichiarazione o foto → `PERMESSO_NON_PREVISTO` (VD_8).

Funzioni usate dai test solo per preparare e verificare i dati (mai stub):

- persistenza: `creaAutomobilista`, `trovaOCreaVeicolo`, `associaVeicolo` (`utentiEntiVeicoli.ts`); `creaWallet`, `registraRicarica`, `trovaWalletDiAutomobilista`, `movimenti`, `creaSosta`, `trovaSosta`, `sostaAttivaPerVeicolo`, `sostaAttivaSuStallo` (`walletSoste.ts`); `trovaStallo` (`stalliTariffe.ts`); con `poolDiTest()` come esecutore;
- Facade di Gestione stalli creata con `creaFacadeGestioneStalli({ pool: poolDiTest(), osservatori: [osservatoreGestioneSoste] })`: `registraRilevazione` e `impostaNonDisponibile`.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le transazioni della Facade vanno in commit: ogni frame usa stalli, automobilisti e veicoli propri, indicati nella tabella dei frame, e nessun frame ne riusa un altro.
- Orologio di prova fisso: `adesso() = 2026-11-20 10:00:00+01` (`T`). La Facade di Gestione soste e quella del Wallet ricevono lo stesso orologio: `creaFacadeGestioneSoste({ pool: poolDiTest(), orologio, wallet: creaFacadeWallet({ pagamento: new SimulatorePagamento({ latenzaMs: 0 }), pool: poolDiTest(), orologio }) })`.
- **Automobilista di prova `P<n>`** (preparazione con la persistenza): `creaAutomobilista(pool, { email: "avvio.<n>@test.example", hashPassword })` con un hash calcolato una volta nel `beforeAll` (`calcolaHashPassword("parola-di-prova-lunga")`); `creaWallet`; se il saldo indicato è maggiore di 0, `registraRicarica` di quell'importo con `dataEOra` `2026-11-20 08:00:00+01`; veicolo con la targa indicata (`trovaOCreaVeicolo` e `associaVeicolo`). Salvo indicazione diversa la targa di `P<n>` è `AV0` seguito da `<n>` su due cifre e da `AA` (per esempio `AV001AA`, `AV025AA`) e il saldo è 1000.
- **Stallo «portato a `OCCUPATO`»:** `registraRilevazione({ stallo, presenza: true, dataOra: 2026-11-20 09:00:00+01 })` della Facade di Gestione stalli.
- **Sosta preesistente:** `creaSosta(pool, { automobilistaId, veicoloId, stalloId, orarioDiAvvio, orarioDiScadenza, pagamento: "PAGATA" })`; se indicato «con lo stallo Non disponibile», poi `impostaNonDisponibile(stallo)` della Facade di Gestione stalli.
- **Permesso completo:** dichiarazione `Dichiaro di esporre il permesso previsto per lo stallo` e foto `Buffer.alloc(1024, 0xff)`. **Foto troppo grande:** `Buffer.alloc(2097153, 0xff)` (2 MB + 1 byte).

### Verifiche

- **Avvio riuscito (`OK`)**, con i valori della riga: `avviaSosta` restituisce `{ sosta, orarioDiAvvio: T, orarioDiScadenza, importo, pagamento }`; `trovaSosta(sosta)` è `ATTIVA` con automobilista, veicolo, stallo, orari e pagamento della richiesta e con dichiarazione e foto come indicato (`null` se non indicate); lo stallo è `NON_DISPONIBILE` con l'occupazione rilevata invariata; per `PAGATA` il wallet ha un nuovo movimento `ADDEBITO` con l'importo, `sostaId` della sosta e `dataEOra` `T`, e il saldo è diminuito dell'importo; per `GRATUITA` nessun movimento nuovo e saldo invariato.
- **Nessuna scrittura (`N`)**: l'errore è quello indicato; il saldo e i movimenti del wallet dell'automobilista sono quelli della preparazione; `sostaAttivaPerVeicolo` del suo veicolo è `null` (salvo TF-AVV-10, dove resta la sosta preesistente invariata); stato e occupazione rilevata dello stallo sono quelli della preparazione; `sostaAttivaSuStallo` dello stallo è quella della preparazione (`null` se non c'era).

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                 | id                                                | Contenuto                                                                 |
| :---------------------- | :------------------------------------------------ | :------------------------------------------------------------------------ |
| `stallo`                | 3, 7, 8, 11, 12, 17, 18, 19, 20, 21               | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, `VEICOLO_PRESENTE`, tariffa 1        |
| `stallo`                | 23, 26                                            | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, tariffa 3                            |
| `stallo`                | 29                                                | `ORDINARIO_A_PAGAMENTO`, `OCCUPATO`, tariffa 4                            |
| `stallo`                | 1, 9, 10, 16 (tariffa 1), 22, 27 (tariffa 3)      | `ORDINARIO_A_PAGAMENTO`, `LIBERO`                                         |
| `stallo`                | 13                                                | `ORDINARIO_A_PAGAMENTO`, `SCONOSCIUTO`, `VEICOLO_PRESENTE`                |
| `stallo`                | 2, 14 (tariffa 1), 24 (tariffa 3), 30 (tariffa 4) | `DISABILI`, `LIBERO`                                                      |
| `stallo`                | 4 (tariffa 2), 15 (tariffa 1)                     | `ROSA`, `OCCUPATO`                                                        |
| `stallo`                | 25                                                | `ROSA`, `SCONOSCIUTO`, mai rilevato, tariffa 3                            |
| `tariffa`               | 1, 2, 3, 4                                        | 150 c/h e 180 min; 100 c/h e 120 min; 100 c/h e 120 min; 80 c/h e 240 min |
| `automobilista_veicolo` | (7, 1)                                            | targa `EF456GH` di Elena Bianchi                                          |

Colonne usate dai test (lette o scritte tramite le funzioni di persistenza o le Facade):

| Tabella                                    | Colonne                                                                                                                                                              |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stallo`                                   | `id`, `tipo_di_stallo`, `stato`, `occupazione_rilevata`, `data_e_ora_dell_ultima_rilevazione`, `tariffa_id`                                                          |
| `tariffa`                                  | `id`, `costo_orario`, `durata_massima`                                                                                                                               |
| `utente`, `automobilista`                  | `id`, `email`, `hash_password`, `ruolo`                                                                                                                              |
| `veicolo`, `automobilista_veicolo`         | `id`, `targa`, `automobilista_id`, `veicolo_id`                                                                                                                      |
| `wallet_virtuale`, `saldo_wallet_virtuale` | `id`, `automobilista_id`, `wallet_virtuale_id`, `saldo`                                                                                                              |
| `movimento_del_wallet`                     | `id`, `wallet_virtuale_id`, `tipo_di_movimento`, `importo`, `data_e_ora`, `sosta_id`                                                                                 |
| `sosta`                                    | `id`, `automobilista_id`, `veicolo_id`, `stallo_id`, `stato`, `orario_di_avvio`, `orario_di_scadenza`, `pagamento`, `dichiarazione_di_permesso`, `foto_del_permesso` |

Id inesistente: `999999`.

## 4. Categorie e scelte

**Targa**

1. dell'Automobilista
2. di un altro Automobilista [error]
3. con una sosta attiva [error]
4. con una sosta attiva già scaduta, non ancora allineata [single]
5. dell'Automobilista, scritta in minuscolo e con uno spazio [single]

**Stallo**

1. Occupato
2. Libero [error]
3. Non disponibile [error]
4. Sconosciuto [error]
5. inesistente [error]
6. Occupato ma con una sosta attiva (dati incoerenti) [error]

**Tipo di stallo**

1. a pagamento
2. disabili [property DISABILI]
3. rosa

**Durata**

1. 15 minuti
2. intermedia
3. massima
4. inferiore a 15 minuti [error]
5. oltre la massima [error]
6. non intera [error]

**Saldo**

1. sufficiente
2. uguale all'importo [single]
3. insufficiente [error]
4. non rilevante [if DISABILI]: saldo 0

**Permesso**

1. assente
2. completo
3. assente o con dichiarazione vuota su stallo per disabili [error]
4. foto oltre 2 MB [error]
5. solo una delle due su stallo rosa [error]
6. presente su stallo a pagamento [error]

**Concorrenza**

1. richiesta singola
2. due avvii simultanei sullo stesso stallo [single]

## 5. Test frame (26)

Durata in minuti; saldo iniziale in centesimi. Dove non indicato: automobilista `P<n>` con la targa predefinita (§3) e saldo 1000, richiesta con la targa di `P<n>`, nessun permesso.

| Frame     | Preparazione                                                                                                                                                         | Richiesta                                                                        | Esito atteso                                                                                                                                                                                                                                                                  | Riferimento |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-AVV-01 | `P1`                                                                                                                                                                 | stallo 23 (tariffa 3), durata 15                                                 | `OK`: importo 25, `PAGATA`, scadenza `10:15`; saldo 975                                                                                                                                                                                                                       | RF_SOSTA_1  |
| TF-AVV-02 | `P2`                                                                                                                                                                 | stallo 3 (tariffa 1), durata 90                                                  | `OK`: importo 225, `PAGATA`, scadenza `11:30`; saldo 775                                                                                                                                                                                                                      | RF_WALLET_2 |
| TF-AVV-03 | `P3`                                                                                                                                                                 | stallo 7 (tariffa 1), durata 180                                                 | `OK`: importo 450, `PAGATA`, scadenza `13:00`; saldo 550                                                                                                                                                                                                                      | RF_SOSTA_1  |
| TF-AVV-04 | `P4` con saldo 450                                                                                                                                                   | stallo 8 (tariffa 1), durata 180                                                 | `OK`: importo 450, `PAGATA`, scadenza `13:00`; saldo 0                                                                                                                                                                                                                        | RF_WALLET_2 |
| TF-AVV-05 | `P5` con saldo 0; stallo 14 portato a `OCCUPATO`                                                                                                                     | stallo 14 (disabili), durata 180, permesso completo                              | `OK`: importo 0, `GRATUITA`, scadenza `13:00`; dichiarazione e foto salvate; nessun movimento, saldo 0                                                                                                                                                                        | VD_10       |
| TF-AVV-06 | `P6`                                                                                                                                                                 | stallo 15 (rosa, tariffa 1), durata 60, senza permesso                           | `OK`: importo 150, `PAGATA`, scadenza `11:00`; dichiarazione e foto `null`; saldo 850                                                                                                                                                                                         | VD_10       |
| TF-AVV-07 | `P7`                                                                                                                                                                 | stallo 4 (rosa, tariffa 2), durata 60, permesso completo                         | `OK`: importo 100, `PAGATA`, scadenza `11:00`; dichiarazione e foto salvate; saldo 900                                                                                                                                                                                        | RF_SOSTA_5  |
| TF-AVV-08 | `P8`; sosta preesistente di `P8` sullo stallo 11 dalle `08:30` alle `09:30`, con lo stallo Non disponibile                                                           | stallo 12 (tariffa 1), durata 60                                                 | `OK` sullo stallo 12: importo 150, scadenza `11:00`; saldo 850. La sosta sullo stallo 11 è `SCADUTA` e lo stallo 11 è `OCCUPATO`                                                                                                                                              | RF_SOSTA_7  |
| TF-AVV-09 | `P9`                                                                                                                                                                 | stallo 17, durata 60, targa `EF456GH` (di Elena Bianchi)                         | errore `TARGA_NON_NEL_PROFILO`; `N` (stallo 17 `OCCUPATO`)                                                                                                                                                                                                                    | VD_3        |
| TF-AVV-10 | `P10`; sosta preesistente di `P10` sullo stallo 18 dalle `09:00` alle `12:00`, con lo stallo Non disponibile                                                         | stallo 19, durata 60                                                             | errore `SOSTA_GIA_ATTIVA`; `N`; la sosta sullo stallo 18 resta `ATTIVA` e invariata; stallo 19 `OCCUPATO` senza sosta attiva                                                                                                                                                  | RF_SOSTA_1  |
| TF-AVV-11 | `P11`                                                                                                                                                                | stallo 16 (`LIBERO`), durata 60                                                  | errore `STALLO_NON_OCCUPATO`; `N` (stallo 16 `LIBERO`)                                                                                                                                                                                                                        | RF_SOSTA_1  |
| TF-AVV-12 | `P12` e `P12b` (targa `AV012BB`); sosta preesistente di `P12b` sullo stallo 20 dalle `09:00` alle `12:00`, con lo stallo Non disponibile                             | `P12`: stallo 20, durata 60                                                      | errore `STALLO_NON_OCCUPATO`; `N` per `P12`; stallo 20 `NON_DISPONIBILE`; la sosta di `P12b` resta `ATTIVA`                                                                                                                                                                   | RF_SOSTA_6  |
| TF-AVV-13 | `P13`                                                                                                                                                                | stallo 13 (`SCONOSCIUTO`), durata 60                                             | errore `STALLO_NON_OCCUPATO`; `N` (stallo 13 `SCONOSCIUTO`)                                                                                                                                                                                                                   | RF_SOSTA_1  |
| TF-AVV-14 | `P14`                                                                                                                                                                | stallo 999999, durata 60                                                         | errore `STALLO_INESISTENTE`; `N` (senza verifica dello stallo)                                                                                                                                                                                                                | RF_SOSTA_1  |
| TF-AVV-15 | `P15`                                                                                                                                                                | stallo 21, durata 14                                                             | errore `DURATA_NON_VALIDA`; `N` (stallo 21 `OCCUPATO`)                                                                                                                                                                                                                        | ISSUE_9     |
| TF-AVV-16 | `P16`                                                                                                                                                                | stallo 26 (tariffa 3, massimo 120), durata 121                                   | errore `DURATA_NON_VALIDA`; `N` (stallo 26 `OCCUPATO`)                                                                                                                                                                                                                        | RF_SOSTA_1  |
| TF-AVV-17 | `P17`; stallo 22 portato a `OCCUPATO`                                                                                                                                | stallo 22, durata 30.5                                                           | errore `DURATA_NON_VALIDA`; `N` (stallo 22 `OCCUPATO`)                                                                                                                                                                                                                        | ISSUE_9     |
| TF-AVV-18 | `P18` con saldo 300                                                                                                                                                  | stallo 29 (tariffa 4), durata 240 (importo 320)                                  | errore `CREDITO_INSUFFICIENTE`; `N`: saldo 300, solo la ricarica iniziale, nessuna sosta per il veicolo nemmeno in altri stati, stallo 29 `OCCUPATO`                                                                                                                          | RF_WALLET_2 |
| TF-AVV-19 | `P19`; stallo 24 portato a `OCCUPATO`                                                                                                                                | stallo 24 (disabili), durata 60, senza permesso                                  | errore `PERMESSO_MANCANTE`; `N` (stallo 24 `OCCUPATO`)                                                                                                                                                                                                                        | VD_10       |
| TF-AVV-20 | `P20`; stallo 30 portato a `OCCUPATO`                                                                                                                                | stallo 30 (disabili), durata 60, dichiarazione `"   "` e foto di 1024 byte       | errore `PERMESSO_MANCANTE`; `N` (stallo 30 `OCCUPATO`)                                                                                                                                                                                                                        | VD_10       |
| TF-AVV-21 | `P21`; stallo 2 portato a `OCCUPATO`                                                                                                                                 | stallo 2 (disabili), durata 60, dichiarazione completa e foto troppo grande      | errore `PERMESSO_NON_VALIDO`; `N` (stallo 2 `OCCUPATO`)                                                                                                                                                                                                                       | SCHEMA      |
| TF-AVV-22 | `P22`; stallo 25 portato a `OCCUPATO`                                                                                                                                | stallo 25 (rosa), durata 60, solo la foto di 1024 byte                           | errore `PERMESSO_NON_VALIDO`; `N` (stallo 25 `OCCUPATO`)                                                                                                                                                                                                                      | VD_8        |
| TF-AVV-23 | `P23`; stallo 1 portato a `OCCUPATO`                                                                                                                                 | stallo 1 (a pagamento), durata 60, permesso completo                             | errore `PERMESSO_NON_PREVISTO`; `N` (stallo 1 `OCCUPATO`)                                                                                                                                                                                                                     | VD_8        |
| TF-AVV-24 | `P24` e `P24b` (targa `AV024BB`); stallo 10 portato a `OCCUPATO`; sosta preesistente di `P24b` sullo stallo 10 dalle `09:00` alle `12:00`, **senza** Non disponibile | `P24`: stallo 10, durata 60                                                      | errore `STALLO_CON_SOSTA_ATTIVA`; `N` per `P24`; la sosta di `P24b` resta `ATTIVA`; stallo 10 `OCCUPATO`                                                                                                                                                                      | ISSUE_9     |
| TF-AVV-25 | `P25` e `P25b` (targa `AV025BB`), saldo 1000 ciascuno; stallo 9 portato a `OCCUPATO`                                                                                 | `P25` e `P25b` sullo stallo 9, durata 60, avviate insieme (`Promise.allSettled`) | una sola riesce (`OK`: importo 150, saldo 850); l'altra fallisce con `STALLO_NON_OCCUPATO` o `STALLO_CON_SOSTA_ATTIVA` e ha `N` (saldo 1000, solo la ricarica, nessuna sosta attiva per il veicolo); `sostaAttivaSuStallo(9)` è la sosta riuscita; stallo 9 `NON_DISPONIBILE` | ISSUE_9     |
| TF-AVV-26 | `P26`; stallo 27 (tariffa 3) portato a `OCCUPATO`                                                                                                                    | stallo 27, durata 60, targa `"av026 aa"`                                         | `OK`: sosta avviata sul veicolo `AV026AA` di `P26`; importo 100, `PAGATA`, scadenza `11:00`; saldo 900                                                                                                                                                                        | VD_3        |

Tutti gli orari sono del `2026-11-20`, `+01`. Totale 26: 9 avvii riusciti (compreso TF-AVV-26 [single] con la targa da normalizzare), 16 errori singoli, 1 frame [single] di concorrenza. Ogni frame di errore viola un solo controllo; gli altri dati della richiesta sono validi.

Note sui riferimenti:

- TF-AVV-01…04: RF_SOSTA_1 (durata entro il massimo) e RF_WALLET_2 (addebito, credito uguale all'importo accettato). Gli importi sono quelli di `cp_calcoloImporto.md`.
- TF-AVV-05: VD_10 e vincolo [if disabili] dell'issue: con saldo 0 l'avvio riesce, nessun addebito. Dichiarazione e foto sono obbligatorie per la gratuità (vincolo `sosta_gratuita_con_permesso`, decisione 4).
- TF-AVV-06, 07: VD_10 (negli stalli rosa si paga la tariffa); TF-AVV-07 salva dichiarazione e foto (RF_SOSTA_5).
- TF-AVV-08: l'allineamento temporale all'inizio dell'avvio (issue #9, «invocato all'inizio di ogni operazione che legge soste o stalli») porta a `SCADUTA` la sosta scaduta della stessa targa, che così non blocca il nuovo avvio (RF_SOSTA_7, RF_SOSTA_6).
- TF-AVV-09: VD_3 (la sosta è avviata per un veicolo dell'Automobilista che la avvia).
- TF-AVV-10: RF_SOSTA_1 («una sola sosta attiva per targa»), `UC_SOSTA_1` 2.a3.
- TF-AVV-11…14: `UC_SOSTA_1` 2.a1 (lo stallo non è `Occupato`: `Libero`, `Non disponibile` o `Sconosciuto`). TF-AVV-12: lo stallo è `Non disponibile` perché ha una sosta attiva (RF_SOSTA_6, VD_6); il controllo dello stallo viene prima di quello della sosta attiva.
- TF-AVV-15, 17: durata minima e minuti interi dall'issue #9; TF-AVV-16: RF_SOSTA_1, VD_9, `UC_SOSTA_1` 2.a2.
- TF-AVV-18: RF_WALLET_2 («negare l'operazione se il credito non è sufficiente») e criterio di accettazione dell'issue: la sosta creata nella transazione è annullata insieme a tutto il resto.
- TF-AVV-19, 20: decisione 4 (permesso obbligatorio sugli stalli per disabili, senza verifica). TF-AVV-21: limite di 2 MB del vincolo `sosta_foto_dimensione`. TF-AVV-22: VD_8 (dichiarazione e foto entrambe presenti). TF-AVV-23: VD_8 (solo sugli stalli riservati).
- TF-AVV-24: `sosta_una_attiva_per_stallo` e issue #9 («nessuna sosta attiva per lo stesso stallo»). Lo stato è incoerente per costruzione (VD_6 lo esclude): serve a verificare il controllo, che il percorso normale non raggiunge.
- TF-AVV-25: piano approvato (decisione 5): la corsa tra i controlli e la transazione è chiusa dal database (aggiornamento condizionato dello stallo, indice unico per stallo). Quale dei due errori riceve chi perde dipende da quando la sua richiesta legge lo stato dello stallo: entrambi sono esiti corretti.
- TF-AVV-26: VD_3. La targa della richiesta si confronta con quelle del profilo nella forma normalizzata di Utenti e accessi (maiuscole, senza spazi), con la funzione esportata dalla sua Facade.

## 6. Note

- **Stalli rosa (risposta D1).** Il modello (RF_SOSTA_5, `UC_SOSTA_1` 2.a4, VD_8) rende dichiarazione e foto obbligatorie anche sugli stalli rosa. In OMP-45 sono facoltative: il modello sarà rispettato con la COD-20, che introdurrà anche la verifica della foto (`UC_SOSTA_5` 2.a1). Quando cambierà, TF-AVV-06 cambierà esito.
- **Comportamenti già verificati altrove** (nessun frame qui):
  - addebito con saldo uguale, insufficiente e concorrente sullo stesso wallet, importo 0: `cp_addebito.md` TF-01…08;
  - aggiornamento condizionato dello stallo a `NON_DISPONIBILE` e uso dell'esecutore esterno: `cp_statoPerLaSosta.md` TF-SOS-03…09;
  - unicità della sosta attiva per veicolo e per stallo nello schema: `cp_inserimento_sosta.md` TF-SOSTA-25…30, `cp_persistenza_wallet_soste.md` TF-WS-15;
  - importi per tipo e durata e arrotondamento: `cp_calcoloImporto.md`;
  - regola di normalizzazione della targa: `cp_targhe.md` TF-02 (qui TF-AVV-26 verifica solo che l'avvio la applichi).
- Due avvii simultanei della stessa targa su stalli diversi sono chiusi dall'indice `sosta_una_attiva_per_veicolo`, già verificato nello schema; non c'è un frame dedicato.
- Se la targa viene tolta dal profilo tra il controllo e la transazione, la sosta parte comunque (rischio residuo accettato nel piano): nessun frame.
