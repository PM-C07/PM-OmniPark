# cp_segnalazioniEnte

Specifica dei casi di test (category partition) del servizio Segnalazioni dell'ente del sottosistema Segnalazioni, operazioni `segnalazioniNonChiuse(ausiliario, ente)` e `segnalazioniModificateDopo(ausiliario, ente, istante)` della Facade.
Requisiti: RF_OP_1 (mappa delle segnalazioni dell'Ausiliario del Traffico), NRF_SIC_1 (controllo degli accessi per ruolo ed ente). Task OMP-46 (issue #10).

- **Fonti dell'esito atteso:** `UC_OP_1` (passi 1–2, flussi 2.a1, 2.a2, Regole di dominio), `SD_OP_1` (2.1 `ente()`, 2.2 `segnalazioniNonChiuse()`), `UC_ADM_2` (un account disattivato non può più accedere), `docs/rad/vincoli_dominio.md` (VD_17, VD_18, VD_19), `docs/test/cp_mappa.md` (cursore delle modifiche, stessa tecnica), issue #10 (segnalazioni aperte e prese in carico; segnalazioni modificate dopo un istante; ente del richiedente), piano approvato di OMP-46 (controllo dell'Ausiliario, risposta D6).
- **File di test:** `src/application/segnalazioni/segnalazioniEnte.db.test.ts` (eseguito con `npx vitest run --config vitest.db.config.ts <file>`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_10` per le scelte dell'issue #10 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `NRF_SIC_1 · TF-ENT-04 · ente di un altro Ausiliario → ENTE_NON_AMMESSO`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/segnalazioni/facade.ts (SegnalazioneMappa è il tipo della persistenza, riesportato)
type SegnalazioneMappa = {
  id: number; stalloId: number; numeroStallo: number; latitudine: number; longitudine: number;
  stato: "APERTA" | "PRESA_IN_CARICO" | "CHIUSA";
  motivo: Motivo | null; targaRilevata: string | null; dataEOraDellaLettura: Date | null;
  ausiliarioId: number | null; ultimaModifica: Date;
};
facade.segnalazioniNonChiuse(ausiliario: number, ente: number): Promise<SegnalazioneMappa[]>;
facade.segnalazioniModificateDopo(ausiliario: number, ente: number, istante: Date)
  : Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date | null }>;
// errori: ErroreSegnalazioni con `codice` (esportato dalla Facade)
```

- **Controllo dell'Ausiliario** (prima di ogni lettura): l'Ausiliario è letto con `trovaAusiliario` della Facade di Utenti e accessi. Inesistente, non Ausiliario o `DISATTIVATO` → `AUSILIARIO_NON_ATTIVO`. `ente` diverso dal suo ente → `ENTE_NON_AMMESSO`.
- **`segnalazioniNonChiuse`:** segnalazioni `APERTA` e `PRESA_IN_CARICO` negli stalli delle aree dell'ente, per id. Le `CHIUSA` sono escluse. I permessi da verificare (RF_OP_2) non sono compresi (COD-21).
- **`segnalazioniModificateDopo`:** segnalazioni dell'ente in qualsiasi stato con `ultimaModifica` successiva all'istante, per id, e cursore (la massima `ultimaModifica` restituita, `null` se nessuna). `istante` non valido → `ISTANTE_NON_VALIDO`, dopo il controllo dell'Ausiliario.

Funzioni usate dai test solo per preparare i dati (mai stub): persistenza `creaSegnalazioneDaLettura` (`segnalazioniVerifiche.ts`), con `poolDiTest()` come esecutore.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Solo TF-ENT-12 modifica dati (una segnalazione nuova dell'ente 3); per questo i frame si eseguono nell'ordine della tabella, e TF-ENT-03 e TF-ENT-11 precedono TF-ENT-12.
- Facade composta come in `cp_riscontroAnpr.md` §3, con orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01`.
- Nel dataset tutte le segnalazioni hanno `ultima_modifica` `2026-11-15 08:00:00+01`. Una segnalazione inserita da un test ha `ultima_modifica` uguale all'ora del database al momento dell'inserimento, successiva al `2026-11-15`.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                   | id                  | Contenuto                                          |
| :------------------------ | :------------------ | :------------------------------------------------- |
| `ausiliario_del_traffico` | 2, 3                | Paolo Ferri, Sara Galli: ente 1, `ATTIVO`          |
| `ausiliario_del_traffico` | 4                   | Luca Russo: ente 1, `DISATTIVATO`                  |
| `ausiliario_del_traffico` | 5                   | Anna Moretti: ente 2, `ATTIVO`                     |
| `ausiliario_del_traffico` | 6                   | Giorgio Marino: ente 3, `ATTIVO`                   |
| `utente`                  | 7                   | Elena Bianchi, Automobilista (non è un Ausiliario) |
| `segnalazione`            | 4, 5, 10            | ente 1, `PRESA_IN_CARICO` (4 e 10 da 3, 5 da 2)    |
| `segnalazione`            | 11                  | ente 1, `APERTA`                                   |
| `segnalazione`            | 1, 2, 3, 6, 7, 8, 9 | ente 1, `CHIUSA`                                   |
| `segnalazione`            | 12                  | ente 2, `APERTA`                                   |
| `stallo`                  | 28                  | ente 3 (area 8); l'ente 3 non ha segnalazioni      |

Colonne usate dai test: `segnalazione` (`id`, `stallo_id`, `stato`, `motivo`, `targa_rilevata`, `data_e_ora_della_lettura`, `ausiliario_del_traffico_id`, `ultima_modifica`); `stallo` (`id`, `area_di_sosta_id`, `numero`, `latitudine`, `longitudine`); `area_di_sosta` (`id`, `ente_preposto_id`); `ausiliario_del_traffico` (`id`, `ente_preposto_id`, `stato_dell_account`).

Id inesistente: `999999`.

## 4. Categorie e scelte

**segnalazioniNonChiuse — Ente**

1. con segnalazioni Aperte, Prese in carico e Chiuse (le Chiuse escluse)
2. con una sola segnalazione Aperta
3. senza segnalazioni

**Richiedente** (entrambe le operazioni)

1. Ausiliario attivo dello stesso ente
2. Ausiliario attivo di un altro ente [error]
3. Ausiliario disattivato [error]
4. utente inesistente [error]
5. utente che non è un Ausiliario [error]

**segnalazioniModificateDopo — Istante**

1. precedente alle modifiche
2. uguale all'ultima modifica (cursore)
3. precedente a una segnalazione appena creata, poi cursore + 1 ms [single]
4. non valido [error]

## 5. Test frame (13)

| Frame     | Operazione                                                                                                                                                                                                                                 | Esito atteso                                                                                                                                                        | Riferimento |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-ENT-01 | `segnalazioniNonChiuse(2, 1)`                                                                                                                                                                                                              | id `[4, 5, 10, 11]` in quest'ordine, stati `PRESA_IN_CARICO`, `PRESA_IN_CARICO`, `PRESA_IN_CARICO`, `APERTA`; nessuna delle chiuse 1, 2, 3, 6, 7, 8, 9              | RF_OP_1     |
| TF-ENT-02 | `segnalazioniNonChiuse(5, 2)`                                                                                                                                                                                                              | id `[12]`, `APERTA`                                                                                                                                                 | RF_OP_1     |
| TF-ENT-03 | `segnalazioniNonChiuse(6, 3)`                                                                                                                                                                                                              | `[]`                                                                                                                                                                | RF_OP_1     |
| TF-ENT-04 | `segnalazioniNonChiuse(2, 2)`                                                                                                                                                                                                              | errore `ENTE_NON_AMMESSO`                                                                                                                                           | NRF_SIC_1   |
| TF-ENT-05 | `segnalazioniNonChiuse(4, 1)`                                                                                                                                                                                                              | errore `AUSILIARIO_NON_ATTIVO`                                                                                                                                      | VD_19       |
| TF-ENT-06 | `segnalazioniNonChiuse(999999, 1)`                                                                                                                                                                                                         | errore `AUSILIARIO_NON_ATTIVO`                                                                                                                                      | NRF_SIC_1   |
| TF-ENT-07 | `segnalazioniNonChiuse(7, 1)`                                                                                                                                                                                                              | errore `AUSILIARIO_NON_ATTIVO`                                                                                                                                      | NRF_SIC_1   |
| TF-ENT-08 | `segnalazioniModificateDopo(5, 2, 2026-11-15 07:59:59+01)`                                                                                                                                                                                 | segnalazioni `[12]`; cursore `2026-11-15 08:00:00+01`                                                                                                               | RF_OP_1     |
| TF-ENT-09 | `segnalazioniModificateDopo(5, 2, 2026-11-15 08:00:00+01)`                                                                                                                                                                                 | `{ segnalazioni: [], cursore: null }`                                                                                                                               | RF_OP_1     |
| TF-ENT-10 | `segnalazioniModificateDopo(3, 2, 2026-11-15 07:59:59+01)`                                                                                                                                                                                 | errore `ENTE_NON_AMMESSO`                                                                                                                                           | NRF_SIC_1   |
| TF-ENT-11 | `segnalazioniModificateDopo(6, 3, new Date("non valida"))`                                                                                                                                                                                 | errore `ISTANTE_NON_VALIDO`                                                                                                                                         | ISSUE_10    |
| TF-ENT-12 | `creaSegnalazioneDaLettura(pool, { stalloId: 28, targa: "EN12AA", dataEOra: 2026-11-20 09:00:00+01, motivo: "SOSTA_ASSENTE" })`; poi `segnalazioniModificateDopo(6, 3, 2026-11-15 08:00:00+01)`; poi di nuovo con istante = cursore + 1 ms | la prima chiamata restituisce solo la segnalazione nuova, `APERTA`, e un cursore uguale alla sua `ultimaModifica`; la seconda `{ segnalazioni: [], cursore: null }` | RF_OP_1     |
| TF-ENT-13 | `segnalazioniModificateDopo(4, 1, 2026-11-15 07:59:59+01)`                                                                                                                                                                                 | errore `AUSILIARIO_NON_ATTIVO`                                                                                                                                      | VD_19       |

Totale 13: 3 sugli enti, 4 sui richiedenti non ammessi in `segnalazioniNonChiuse`, 3 sulle modifiche (compreso il cursore [single]), 3 di errore nelle modifiche (ente, istante, richiedente disattivato).

Note sui riferimenti:

- TF-ENT-01…03: RF_OP_1 e `UC_OP_1` passo 2 (segnalazioni `Aperte` e `Prese in carico` del comune); TF-ENT-03 corrisponde a `UC_OP_1` 2.a1 (nessuna segnalazione: elenco vuoto, nessun errore).
- TF-ENT-04, 10: NRF_SIC_1 e VD_18 (ogni Ausiliario vede solo le segnalazioni del proprio ente): è la scelta «ente di un altro richiedente [error]» dell'issue.
- TF-ENT-05, 13: VD_19 e `UC_ADM_2` (un Ausiliario disattivato non può più accedere). TF-ENT-06, 07: chi non è un Ausiliario non opera sulle segnalazioni (NRF_SIC_1).
- TF-ENT-08, 09, 12: issue #10 (segnalazioni modificate dopo un istante, base dell'aggiornamento della mappa dell'Ausiliario) con il cursore di OMP-34. Il cursore ha la precisione del millisecondo: per non ricevere di nuovo l'ultima segnalazione si riparte da cursore + 1 ms, come in `cp_mappa.md`.

## 6. Note

- **Cursore e transazioni confermate dopo la lettura** (stessa nota di `cp_mappa.md`): una transazione che modifica una segnalazione e conferma dopo che il cursore è stato letto, con un `ultima_modifica` precedente al cursore, non compare nella richiesta successiva. Per l'aggiornamento della mappa il rischio è accettato; nessun frame lo verifica.
- **Comportamenti già verificati altrove** (nessun frame qui): filtro per stato e per ente di `segnalazioniNonChiuseDellEnte`, ente inesistente, `segnalazioniModificateDopo` dopo una presa in carico o una chiusura, `cp_persistenza_segnalazioni_verifiche.md` TF-SV-11…18; `trovaAusiliario`, `cp_verificaAutorizzazione.md` TF-10…12.
- I permessi da verificare (RF_OP_2, `SD_OP_1` 2.3) restano alla COD-21 (risposta D6 del piano).

## 7. Aggiunte di OMP-48 (issue #27): fotografia e variazioni con il cursore del database

Operazioni nuove della Facade, usate dalle API dell'Ausiliario (`cp_apiSegnalazioni.md`). Le operazioni dei §2…5 restano invariate, per compatibilità.

```ts
facade.fotografiaSegnalazioni(ausiliario: number, ente: number)
  : Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date }>;
// segnalazioni non chiuse dell'ente (come segnalazioniNonChiuse) e cursore = istante del database letto prima delle righe
facade.variazioniDopo(ausiliario: number, ente: number, cursore: Date)
  : Promise<{ segnalazioni: SegnalazioneMappa[]; cursore: Date }>;
// segnalazioni dell'ente, in qualsiasi stato, con ultimaModifica > cursore − 5 s (MARGINE_CURSORE_MS), per id;
// nuovo cursore = istante del database letto prima delle righe
```

- Controllo dell'Ausiliario come in §2 (`AUSILIARIO_NON_ATTIVO`, `ENTE_NON_AMMESSO`), poi il cursore (`ISTANTE_NON_VALIDO`).
- **Ambiente:** come §3; i frame si eseguono dopo TF-ENT-13, nell'ordine della tabella. **Variazione:** `creaSegnalazioneDaLettura(pool, { stalloId, targa, dataEOra: 2026-11-20 09:00:00+01, motivo: "SOSTA_ASSENTE" })`; per la variazione confermata con ritardo, la stessa funzione su un client della seconda connessione dopo `BEGIN`, con il `COMMIT` dopo la lettura indicata. **Cursore + 6 s:** calcolato, senza attese.

**Categorie e scelte (OMP-48)**

- `fotografiaSegnalazioni`: ente con segnalazioni · richiedente disattivato [error] · ente di un altro [error].
- `variazioniDopo` — cursore: precedente a una variazione · appena restituito, con una variazione negli ultimi 5 s (margine) · successivo all'ultima variazione di più di 5 s (cursore + 6 s) · non valido [error]; variazione confermata con ritardo entro il margine [single]; ente di un altro [error].

| Frame     | Operazione                                                                                                                                                                        | Esito atteso                                                                 | Riferimento |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :---------- |
| TF-ENT-14 | `fotografiaSegnalazioni(5, 2)`                                                                                                                                                    | `segnalazioni` id `[12]`; `cursore` è un `Date` valido                       | RF_OP_1     |
| TF-ENT-15 | `c0 = fotografiaSegnalazioni(5, 2).cursore`; segnalazione sullo stallo 22, targa `EN15AA`; `variazioniDopo(5, 2, c0)`                                                             | contiene la segnalazione `EN15AA`, `APERTA`; `cursore` non precedente a `c0` | NRF_PER_3   |
| TF-ENT-16 | `c0` di `(5, 2)`; segnalazione sullo stallo 24, targa `EN16AA`; `r1 = variazioniDopo(5, 2, c0)`; `r2 = variazioniDopo(5, 2, r1.cursore)`                                          | `r1` e `r2` contengono `EN16AA` (margine)                                    | ISSUE_10    |
| TF-ENT-17 | `c0` di `(6, 3)`; segnalazione sullo stallo 29, targa `EN17AA`; `r1 = variazioniDopo(6, 3, c0)`; `r2 = variazioniDopo(6, 3, r1.cursore + 6 s)`                                    | `r1` contiene `EN17AA`; `r2.segnalazioni` è `[]`                             | NRF_PER_3   |
| TF-ENT-18 | `c0` di `(6, 3)`; seconda connessione: `BEGIN` e segnalazione sullo stallo 30, targa `EN18AA`; `r1 = variazioniDopo(6, 3, c0)`; `COMMIT`; `r2 = variazioniDopo(6, 3, r1.cursore)` | `r1` non contiene `EN18AA`; `r2` la contiene                                 | NRF_PER_3   |
| TF-ENT-19 | `variazioniDopo(2, 2, 2026-11-20 09:00:00+01)`                                                                                                                                    | errore `ENTE_NON_AMMESSO`                                                    | NRF_SIC_1   |
| TF-ENT-20 | `variazioniDopo(6, 3, new Date("non valida"))`                                                                                                                                    | errore `ISTANTE_NON_VALIDO`                                                  | ISSUE_10    |
| TF-ENT-21 | `fotografiaSegnalazioni(4, 1)`                                                                                                                                                    | errore `AUSILIARIO_NON_ATTIVO`                                               | VD_19       |
| TF-ENT-22 | `fotografiaSegnalazioni(2, 2)`                                                                                                                                                    | errore `ENTE_NON_AMMESSO`                                                    | NRF_SIC_1   |

Totale aggiunto: 9 frame (in tutto 22).

Note: TF-ENT-15, 17, 18 verificano il criterio di accettazione dell'issue #27 sulla variazione confermata dopo la lettura precedente (TF-ENT-18: transazione iniziata prima del cursore e confermata dopo, entro il margine); TF-ENT-17 la correzione 2 del piano di OMP-48; TF-ENT-16 le risposte idempotenti.
