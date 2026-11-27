# cp_chiusuraSegnalazione

Specifica dei casi di test (category partition) del servizio Chiusura con esito del sottosistema Segnalazioni, operazione `chiudi(ausiliario, segnalazione, esito)` della Facade.
Requisiti: RF_OP_6 (chiusura della segnalazione con esito), NRF_SIC_1 (controllo degli accessi per ruolo ed ente). Task OMP-46 (issue #10); regola di chiusura aggiornata con OMP-63 (issue #40, decisione D0, RAD 0.6): si chiude solo una segnalazione presa in carico dallo stesso Ausiliario.

- **Fonti dell'esito atteso:** `UC_OP_4` (Regole di dominio, passi 1–4, flussi 2.a1, 3.a2, exit condition), `SD_OP_4`, `UC_OP_2` (Regole di dominio: la presa in carico è esclusiva), statechart `SCD_3` (`Presa in carico → Chiusa : chiusura / registraEsito()`; la transizione `Aperta → Chiusa` per la chiusura è tolta, allineamento al RAD 0.6 di OMP-63), `docs/rad/vincoli_dominio.md` (VD_17, VD_18, VD_19), schema (`segnalazione_esito_ammesso`, `segnalazione_assegnazione`, `segnalazione_chiusura_con_esito_e_data`), issue #10, piano approvato di OMP-46 (sequenza della chiusura, controllo dell'Ausiliario).
- **File di test:** `src/application/segnalazioni/chiusura.db.test.ts` (eseguito con `npx vitest run --config vitest.db.config.ts <file>`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_10` per le scelte dell'issue #10 e del piano approvato, o `ISSUE_40` per quelle di OMP-63.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_OP_6 · TF-CHI-04 · presa in carico da un altro Ausiliario → SEGNALAZIONE_PRESA_DA_ALTRI`.

## 2. Operazione verificata (firme)

```ts
// da src/application/segnalazioni/facade.ts
type Esito = "SOSTA_IRREGOLARE_ACCERTATA" | "NON_CONFERMATA";
facade.chiudi(ausiliario: number, segnalazione: number, esito: Esito): Promise<void>;
// errori: ErroreSegnalazioni con `codice` (esportato dalla Facade)
```

Sequenza (piano approvato), con l'errore di ciascun passo:

| Passo | Controllo o azione                                                                                                                                                                                  | Errore                                                                                       |
| :---- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| 1     | l'Ausiliario esiste ed è `ATTIVO`; da OMP-63 la sua riga si legge `FOR SHARE` nella transizione della chiusura                                                                                      | `AUSILIARIO_NON_ATTIVO`                                                                      |
| 2     | la segnalazione esiste; da OMP-63 la sua riga è bloccata `FOR UPDATE` fino alla fine della chiusura                                                                                                 | `SEGNALAZIONE_INESISTENTE`                                                                   |
| 3     | la segnalazione è di uno stallo dell'ente dell'Ausiliario (prima di rivelarne lo stato)                                                                                                             | `ENTE_NON_AMMESSO`                                                                           |
| 4     | l'esito è `SOSTA_IRREGOLARE_ACCERTATA` o `NON_CONFERMATA`                                                                                                                                           | `ESITO_NON_VALIDO`                                                                           |
| 5     | (OMP-63) stato: `APERTA` → errore; `PRESA_IN_CARICO` da un altro → errore; `CHIUSA` → errore; `PRESA_IN_CARICO` dallo stesso Ausiliario → la chiude, esito e data di chiusura = `orologio.adesso()` | `SEGNALAZIONE_NON_PRESA_IN_CARICO`, `SEGNALAZIONE_PRESA_DA_ALTRI`, `SEGNALAZIONE_GIA_CHIUSA` |

Funzioni usate dai test solo per preparare e verificare i dati (mai stub): persistenza `creaSegnalazioneDaLettura`, `prendiInCarico`, `dettaglioSegnalazione` (`segnalazioniVerifiche.ts`), con `poolDiTest()` come esecutore.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. Le chiusure vanno in commit: ogni frame che chiude una segnalazione usa una segnalazione propria, indicata nella tabella. I frame di errore non modificano dati e possono usare segnalazioni del dataset non chiuse da altri frame.
- Facade composta come in `cp_riscontroAnpr.md` §3, con orologio di prova fisso `adesso() = 2026-11-20 10:00:00+01` (`T`).
- **Segnalazione di prova:** `creaSegnalazioneDaLettura(pool, { stalloId, targa, dataEOra: 2026-11-20 09:00:00+01, motivo: "SOSTA_ASSENTE" })` (nasce `APERTA`); «presa in carico da N» aggiunge `prendiInCarico(pool, id, N, 2026-11-20 09:30:00+01)`.
- **Invariata:** `dettaglioSegnalazione(id)` dopo la chiamata ha stato, assegnatario, esito, data di presa in carico, data di chiusura e `ultimaModifica` uguali a prima della chiamata.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella                   | id         | Contenuto                                                               |
| :------------------------ | :--------- | :---------------------------------------------------------------------- |
| `ausiliario_del_traffico` | 2, 3       | Paolo Ferri, Sara Galli: ente 1, `ATTIVO`                               |
| `ausiliario_del_traffico` | 4          | Luca Russo: ente 1, `DISATTIVATO`                                       |
| `ausiliario_del_traffico` | 5          | Anna Moretti: ente 2, `ATTIVO`                                          |
| `segnalazione`            | 11         | ente 1, stallo 3, `APERTA`, lettura `2026-11-10 10:00:00+01`            |
| `segnalazione`            | 12         | ente 2, stallo 23, `APERTA`, lettura `2026-11-10 11:00:00+01`           |
| `segnalazione`            | 5          | ente 1, `PRESA_IN_CARICO` dall'Ausiliario 2 il `2026-11-04 09:21:00+01` |
| `segnalazione`            | 4, 10      | ente 1, `PRESA_IN_CARICO` dall'Ausiliario 3                             |
| `segnalazione`            | 1          | ente 1, `CHIUSA` (esito `SOSTA_IRREGOLARE_ACCERTATA`, Ausiliario 2)     |
| `stallo`                  | 16, 17, 19 | ente 1, nessuna segnalazione nel dataset                                |

Colonne usate dai test: `segnalazione` (`id`, `stallo_id`, `ausiliario_del_traffico_id`, `stato`, `motivo`, `targa_rilevata`, `data_e_ora_della_lettura`, `data_e_ora_della_presa_in_carico`, `esito`, `data_e_ora_della_chiusura`, `ultima_modifica`); `ausiliario_del_traffico` (`id`, `ente_preposto_id`, `stato_dell_account`); `stallo` e `area_di_sosta` per l'ente.

Id inesistente: `999999`.

## 4. Categorie e scelte

**Stato della segnalazione**

1. Aperta [error] (OMP-63: va prima presa in carico)
2. Presa in carico dallo stesso Ausiliario
3. Presa in carico da un altro Ausiliario [error]
4. Chiusa [error]
5. inesistente [error]

**Ente della segnalazione**

1. lo stesso dell'Ausiliario
2. un altro [error]

**Esito**

1. accertata (`SOSTA_IRREGOLARE_ACCERTATA`)
2. non confermata (`NON_CONFERMATA`)
3. mancante [error]
4. non previsto [error]

**Richiedente**

1. Ausiliario attivo
2. Ausiliario disattivato [error]

**Concorrenza**

1. chiusura singola
2. lo stesso Ausiliario chiude due volte insieme la sua segnalazione presa in carico [single] (OMP-63)

## 5. Test frame (13)

| Frame     | Preparazione                                                                           | Chiamata                                                                                                               | Esito atteso                                                                                                                                                                | Riferimento |
| :-------- | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| TF-CHI-01 | nessuna                                                                                | `chiudi(2, 11, "SOSTA_IRREGOLARE_ACCERTATA")`                                                                          | (OMP-63) errore `SEGNALAZIONE_NON_PRESA_IN_CARICO`; la segnalazione 11 è invariata (`APERTA`, non assegnata)                                                                | ISSUE_40    |
| TF-CHI-02 | (OMP-63) `prendiInCarico(pool, 12, 5, 2026-11-20 09:30:00+01)` della persistenza       | `chiudi(5, 12, "NON_CONFERMATA")`                                                                                      | la segnalazione 12 è `CHIUSA`, assegnata all'Ausiliario 5, esito `NON_CONFERMATA`, data della presa in carico `09:30`, data di chiusura `T`                                 | RF_OP_6     |
| TF-CHI-03 | nessuna                                                                                | `chiudi(2, 5, "NON_CONFERMATA")`                                                                                       | la segnalazione 5 è `CHIUSA`, sempre assegnata all'Ausiliario 2, esito `NON_CONFERMATA`, data di chiusura `T`, data di presa in carico invariata (`2026-11-04 09:21:00+01`) | RF_OP_6     |
| TF-CHI-04 | nessuna                                                                                | `chiudi(2, 4, "NON_CONFERMATA")`                                                                                       | errore `SEGNALAZIONE_PRESA_DA_ALTRI`; la segnalazione 4 è invariata                                                                                                         | VD_17       |
| TF-CHI-05 | nessuna                                                                                | `chiudi(2, 1, "NON_CONFERMATA")`                                                                                       | errore `SEGNALAZIONE_GIA_CHIUSA`; la segnalazione 1 è invariata                                                                                                             | RF_OP_6     |
| TF-CHI-06 | nessuna                                                                                | `chiudi(2, 999999, "NON_CONFERMATA")`                                                                                  | errore `SEGNALAZIONE_INESISTENTE`                                                                                                                                           | RF_OP_6     |
| TF-CHI-07 | nessuna                                                                                | `chiudi(5, 10, "NON_CONFERMATA")`                                                                                      | errore `ENTE_NON_AMMESSO`; la segnalazione 10 è invariata                                                                                                                   | NRF_SIC_1   |
| TF-CHI-08 | nessuna                                                                                | `chiudi(5, 1, "NON_CONFERMATA")` (chiusa, di un altro ente)                                                            | errore `ENTE_NON_AMMESSO` (non `SEGNALAZIONE_GIA_CHIUSA`); la segnalazione 1 è invariata                                                                                    | NRF_SIC_1   |
| TF-CHI-09 | nessuna                                                                                | `chiudi(3, 10, undefined)`                                                                                             | errore `ESITO_NON_VALIDO`; la segnalazione 10 è invariata                                                                                                                   | RF_OP_6     |
| TF-CHI-10 | nessuna                                                                                | `chiudi(3, 10, "ALTRO")`                                                                                               | errore `ESITO_NON_VALIDO`; la segnalazione 10 è invariata                                                                                                                   | RF_OP_6     |
| TF-CHI-11 | segnalazione di prova S sullo stallo 16, targa `CH11AA`                                | `chiudi(4, S, "NON_CONFERMATA")`                                                                                       | errore `AUSILIARIO_NON_ATTIVO`; S è invariata (`APERTA`, non assegnata)                                                                                                     | VD_19       |
| TF-CHI-12 | segnalazione di prova S sullo stallo 17, targa `CH12AA`, presa in carico da 3          | `chiudi(3, S, "SOSTA_IRREGOLARE_ACCERTATA")`                                                                           | S è `CHIUSA`, assegnata all'Ausiliario 3, esito `SOSTA_IRREGOLARE_ACCERTATA`, data di presa in carico `09:30`, data di chiusura `T`                                         | RF_OP_6     |
| TF-CHI-13 | (OMP-63) segnalazione di prova S sullo stallo 19, targa `CH13AA`, presa in carico da 2 | `chiudi(2, S, "SOSTA_IRREGOLARE_ACCERTATA")` e `chiudi(2, S, "NON_CONFERMATA")` avviate insieme (`Promise.allSettled`) | una chiamata riesce e l'altra fallisce con `SEGNALAZIONE_GIA_CHIUSA`; S è `CHIUSA`, assegnata all'Ausiliario 2 e con l'esito della chiamata riuscita                        | ISSUE_10    |

Totale 13: 2 chiusure riuscite dal dataset (TF-CHI-02 dopo la presa in carico preparata, TF-CHI-03) e 1 da una segnalazione presa in carico di prova, 9 errori singoli, 1 frame [single] di concorrenza. Frame cambiati con OMP-63: TF-CHI-01, 02, 13.

Note sui riferimenti:

- TF-CHI-01 (cambiato con la OMP-63): decisione D0 di OMP-63 (RAD 0.6, `UC_OP_4` Regole di dominio e 2.a1): una segnalazione `Aperta` va prima presa in carico. Fino a OMP-62 il frame verificava la chiusura diretta di una `Aperta`.
- TF-CHI-02 (cambiato con la OMP-63): RF_OP_6 e `UC_OP_4` passo 4, con la presa in carico preparata (OMP-63); copre l'esito `NON_CONFERMATA`, TF-CHI-03 e 12 coprono gli altri casi riusciti.
- TF-CHI-03, 12: `UC_OP_4` (una segnalazione `Presa in carico` può essere chiusa dall'Ausiliario assegnatario); TF-CHI-12 usa una presa in carico recente, TF-CHI-03 quella del dataset.
- TF-CHI-04: VD_17 e `UC_OP_2` (presa in carico esclusiva), `UC_OP_4` 2.a1.
- TF-CHI-05: `UC_OP_4` 2.a1 (già `Chiusa`) e criterio di accettazione dell'issue («una segnalazione chiusa non può essere chiusa di nuovo»).
- TF-CHI-07, 08: NRF_SIC_1 e VD_18. TF-CHI-08 verifica che il controllo dell'ente preceda quello dello stato (piano approvato): a un Ausiliario di un altro ente non si rivela che la segnalazione è chiusa.
- TF-CHI-09, 10: `UC_OP_4` 3.a2 (esito non indicato o non previsto).
- TF-CHI-11: VD_19 e `UC_ADM_2` (un Ausiliario disattivato non opera).
- TF-CHI-13 (cambiato con la OMP-63): piano approvato (OMP-46), aggiornato con OMP-63: la riga della segnalazione è bloccata, quindi la seconda chiusura aspetta la prima e trova la segnalazione `CHIUSA`. Il test non può imporre quale delle due arrivi per prima: entrambi gli ordini danno l'esito atteso. Fino a OMP-62 erano due Ausiliari su una segnalazione `Aperta`.

## 6. Note

- **Comportamenti già verificati altrove** (nessun frame qui): l'aggiornamento condizionato `chiudiSegnalazione` della persistenza (aperta, presa dallo stesso, presa da un altro, chiusa, inesistente, esito non ammesso dallo schema), `cp_persistenza_segnalazioni_verifiche.md` TF-SV-32…37; `trovaAusiliario`, `cp_verificaAutorizzazione.md` TF-10…12.
- `SD_OP_4` (4.1–4.2) assegna e poi chiude in due passi; qui avvengono in un solo aggiornamento, con lo stesso effetto e senza corse (discrepanza 4 del piano).
- La verifica del pagamento come punto di estensione della chiusura (`UC_OP_3`, `UC_OP_4` 2.a2) e l'annullamento (3.a1, solo interfaccia) sono fuori ambito (COD-21, API e interfaccia).
