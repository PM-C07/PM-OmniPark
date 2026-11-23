# cp_mappa

Specifica dei casi di test (category partition) del servizio Mappa del sottosistema Gestione stalli, operazioni `stalliNellaZona(zona)` e `stalliModificatiDopo(zona, istante)` della Facade.
Requisiti: RF_STALLI_1 (mappa degli stalli e stato), NRF_PER_3 (aggiornamento della mappa entro 2 secondi, come base). Task OMP-43 (issue #7).

- **Fonti dell'esito atteso:** `UC_STALLI_1`, `SD_STALLI_1`, `UC_IOT_1` passo 4, piano approvato di OMP-43 (area e tariffa sintetica, decisioni E, H, J), nota sul cursore di `docs/test/cp_persistenza_stalli_tariffe.md` §6.
- **File di test:** `src/application/gestione-stalli/mappa.db.test.ts` (eseguito da `npm run test:db`).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_7` per le scelte dell'issue #7 e del piano approvato (zona e istante non validi, rilevazione che conferma lo stato).

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `RF_STALLI_1 · TF-MAP-02 · zona senza stalli → elenco vuoto`.

## 2. Operazioni verificate (firme)

```ts
// da src/application/gestione-stalli/facade.ts
type Zona = { latMin: number; latMax: number; lonMin: number; lonMax: number }; // estremi inclusi
type StalloZona = {
  id: number; numero: number; latitudine: number; longitudine: number;
  tipoDiStallo: "ORDINARIO_A_PAGAMENTO" | "DISABILI" | "ROSA";
  stato: "LIBERO" | "OCCUPATO" | "NON_DISPONIBILE" | "SCONOSCIUTO";
  ultimaModifica: Date;
  areaDiSosta: { id: number; nome: string };
  tariffa: { id: number; costoOrario: number }; // tariffa sintetica, costo orario in centesimi
};

facade.stalliNellaZona(zona: Zona): Promise<StalloZona[]>; // ordinati per id
facade.stalliModificatiDopo(zona: Zona, istante: Date): Promise<{ stalli: StalloZona[]; cursore: Date | null }>;
// stalli della zona con ultimaModifica > istante, ordinati per id;
// cursore = massima ultimaModifica restituita, null se nessuna
facade.registraRilevazione(rilevazione): Promise<StatoStallo>; // solo per preparare i frame
// errori: ErroreGestioneStalli con `codice` (esportati dalla Facade)
```

- **Zona valida:** quattro numeri finiti, `latMin <= latMax`, `lonMin <= lonMax`, latitudini in [-90, 90] e longitudini in [-180, 180] (gli stessi limiti dei vincoli dello schema sulle coordinate dello stallo). Altrimenti `ZONA_NON_VALIDA`.
- **Istante valido:** un `Date` con valore numerico. Altrimenti `ISTANTE_NON_VALIDO`. La zona si controlla per prima.

## 3. Ambiente

- Database di test riportato allo stato noto da `preparaDatabaseDiTest()` nel `beforeAll`. La Facade usa `poolDiTest()`, senza osservatori; le transazioni vanno in commit. I frame che modificano stalli usano zone diverse, così i frame non dipendono dall'ordine.
- Istante del dataset: `2026-11-15 08:00:00+01` (`ultima_modifica` di tutti gli stalli). Istante di prova per le rilevazioni: `2026-11-20 09:00:00+01`.
- `ultima_modifica` la scrive il trigger dello schema con l'ora del database: i frame confrontano gli istanti solo con il cursore restituito, mai con l'orologio del test.

### Righe del dataset usate (migrazione `0002_dati_esempio.sql`)

| Tabella         | id     | Contenuto                                                                                     |
| :-------------- | :----- | :-------------------------------------------------------------------------------------------- |
| `area_di_sosta` | 3      | Via Raffaele Viviani (ente 1), stalli 7, 8, 9                                                 |
| `area_di_sosta` | 4      | Via Roma (ente 1), stalli 10…13                                                               |
| `area_di_sosta` | 5      | Piazza Aubry (ente 1), stalli 14…21                                                           |
| `area_di_sosta` | 6      | Via Giovanni Paolo II (ente 2), stalli 22…25                                                  |
| `area_di_sosta` | 7      | Via Roma (Penta) (ente 2), stalli 26, 27                                                      |
| `stallo`        | 9      | Via Raffaele Viviani n. 5, `LIBERO`, tariffa 1                                                |
| `stallo`        | 10     | Via Roma n. 101, `LIBERO`, tariffa 1                                                          |
| `stallo`        | 13     | Via Roma n. 104, `SCONOSCIUTO`, tariffa 1, latitudine 40.69149, longitudine 14.51616          |
| `stallo`        | 14     | Piazza Aubry n. 1, `DISABILI`, `LIBERO`, tariffa 1, latitudine 40.68824, longitudine 14.52214 |
| `stallo`        | 22, 23 | Via Giovanni Paolo II n. 1 `LIBERO` e n. 2 `OCCUPATO`, tariffa 3                              |
| `stallo`        | 27     | Via Roma (Penta) n. 2, `LIBERO`, `NESSUN_VEICOLO`, tariffa 3                                  |
| `tariffa`       | 1, 3   | 150 e 100 centesimi l'ora                                                                     |

Colonne usate dai test (lette tramite la Facade):

| Tabella         | Colonne                                                                                                                     |
| :-------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| `stallo`        | `id`, `area_di_sosta_id`, `tariffa_id`, `numero`, `latitudine`, `longitudine`, `tipo_di_stallo`, `stato`, `ultima_modifica` |
| `area_di_sosta` | `id`, `nome`                                                                                                                |
| `tariffa`       | `id`, `costo_orario`                                                                                                        |

Zone usate:

| Nome                        | latMin   | latMax   | lonMin   | lonMax   | Stalli               |
| :-------------------------- | :------- | :------- | :------- | :------- | :------------------- |
| Piazza Aubry                | 40.688   | 40.689   | 14.522   | 14.5223  | 14…21                |
| Stallo 13 esatto            | 40.69149 | 40.69149 | 14.51616 | 14.51616 | 13 (estremi inclusi) |
| Viviani                     | 40.7077  | 40.7079  | 14.5033  | 14.5034  | 7, 8, 9              |
| Via Roma                    | 40.6913  | 40.6915  | 14.5161  | 14.5162  | 10…13                |
| Giovanni Paolo II           | 40.7804  | 40.7806  | 14.7706  | 14.7707  | 22…25                |
| Penta                       | 40.7673  | 40.7675  | 14.7972  | 14.7973  | 26, 27               |
| Mare                        | 40.0     | 40.1     | 14.0     | 14.1     | nessuno              |
| Latitudini invertite        | 40.689   | 40.688   | 14.522   | 14.5223  | —                    |
| Longitudini invertite       | 40.688   | 40.689   | 14.5223  | 14.522   | —                    |
| Latitudine fuori intervallo | 40.688   | 91       | 14.522   | 14.5223  | —                    |
| Valore non finito           | 40.688   | 40.689   | NaN      | 14.5223  | —                    |

## 4. Categorie e scelte

**stalliNellaZona — Zona**

1. con più stalli
2. con un solo stallo sugli estremi [single]
3. senza stalli
4. non valida: latitudini invertite, longitudini invertite, fuori intervallo, valore non finito [error]

**stalliModificatiDopo — Istante**

1. precedente alle modifiche del dataset
2. uguale all'ultima modifica (nessuna variazione successiva)
3. precedente a una variazione fatta da una rilevazione
4. cursore della risposta precedente + 1 ms, senza nuove variazioni
5. cursore della risposta precedente + 1 ms, con una nuova variazione su un altro stallo
6. non valido [error]

**stalliModificatiDopo — Zona**

1. con stalli
2. senza stalli
3. non valida [error]

**Tipo di variazione**

1. cambio di stato
2. rilevazione che conferma lo stato [single]

## 5. Test frame (16)

| Frame     | Operazione e scelte                                                                                                                                                                                                                                                                         | Esito atteso                                                                                                                                                                    | Riferimento |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-MAP-01 | `stalliNellaZona(Piazza Aubry)`                                                                                                                                                                                                                                                             | 8 stalli, id 14…21 in ordine; il 14 ha numero 1, `DISABILI`, `LIBERO`, latitudine 40.68824, longitudine 14.52214, `areaDiSosta` `{ 5, "Piazza Aubry" }`, `tariffa` `{ 1, 150 }` | RF_STALLI_1 |
| TF-MAP-02 | `stalliNellaZona(Mare)`                                                                                                                                                                                                                                                                     | `[]`                                                                                                                                                                            | RF_STALLI_1 |
| TF-MAP-03 | `stalliNellaZona(Stallo 13 esatto)`                                                                                                                                                                                                                                                         | solo lo stallo 13, `SCONOSCIUTO`, `areaDiSosta` `{ 4, "Via Roma" }`, `tariffa` `{ 1, 150 }`                                                                                     | RF_STALLI_1 |
| TF-MAP-04 | `stalliNellaZona(Latitudini invertite)`                                                                                                                                                                                                                                                     | errore `ZONA_NON_VALIDA`                                                                                                                                                        | ISSUE_7     |
| TF-MAP-05 | `stalliNellaZona(Longitudini invertite)`                                                                                                                                                                                                                                                    | errore `ZONA_NON_VALIDA`                                                                                                                                                        | ISSUE_7     |
| TF-MAP-06 | `stalliNellaZona(Latitudine fuori intervallo)`                                                                                                                                                                                                                                              | errore `ZONA_NON_VALIDA`                                                                                                                                                        | ISSUE_7     |
| TF-MAP-07 | `stalliNellaZona(Valore non finito)`                                                                                                                                                                                                                                                        | errore `ZONA_NON_VALIDA`                                                                                                                                                        | ISSUE_7     |
| TF-MAP-08 | `stalliModificatiDopo(Piazza Aubry, 2026-11-15 07:59:59+01)`                                                                                                                                                                                                                                | gli 8 stalli 14…21, ciascuno con area e tariffa; `cursore` = `2026-11-15 08:00:00+01`                                                                                           | NRF_PER_3   |
| TF-MAP-09 | `stalliModificatiDopo(Piazza Aubry, 2026-11-15 08:00:00+01)`                                                                                                                                                                                                                                | `{ stalli: [], cursore: null }`                                                                                                                                                 | NRF_PER_3   |
| TF-MAP-10 | `registraRilevazione({ stallo: 9, presenza: true, dataOra: istante di prova })`, poi `stalliModificatiDopo(Viviani, 2026-11-15 08:00:00+01)`                                                                                                                                                | solo lo stallo 9, `OCCUPATO`, `areaDiSosta` `{ 3, "Via Raffaele Viviani" }`, `tariffa` `{ 1, 150 }`; `cursore` uguale alla sua `ultimaModifica`                                 | NRF_PER_3   |
| TF-MAP-11 | `registraRilevazione` sullo stallo 10 (presenza vero, istante di prova); `r1 = stalliModificatiDopo(Via Roma, 2026-11-15 08:00:00+01)`; poi `stalliModificatiDopo(Via Roma, r1.cursore + 1 ms)`                                                                                             | `r1`: solo lo stallo 10; seconda risposta `{ stalli: [], cursore: null }`                                                                                                       | NRF_PER_3   |
| TF-MAP-12 | `registraRilevazione` sullo stallo 22 (presenza vero, istante di prova); `r1 = stalliModificatiDopo(Giovanni Paolo II, 2026-11-15 08:00:00+01)`; `registraRilevazione` sullo stallo 23 (presenza falso, istante di prova); poi `stalliModificatiDopo(Giovanni Paolo II, r1.cursore + 1 ms)` | `r1`: solo lo stallo 22 `OCCUPATO`; seconda risposta: solo lo stallo 23, `LIBERO`, con `cursore` uguale alla sua `ultimaModifica`                                               | NRF_PER_3   |
| TF-MAP-13 | `registraRilevazione({ stallo: 27, presenza: false, dataOra: istante di prova })` (lo stallo era già `LIBERO`), poi `stalliModificatiDopo(Penta, 2026-11-15 08:00:00+01)`                                                                                                                   | solo lo stallo 27, con stato `LIBERO` invariato                                                                                                                                 | ISSUE_7     |
| TF-MAP-14 | `stalliModificatiDopo(Mare, 2026-11-15 07:59:59+01)`                                                                                                                                                                                                                                        | `{ stalli: [], cursore: null }`                                                                                                                                                 | NRF_PER_3   |
| TF-MAP-15 | `stalliModificatiDopo(Latitudini invertite, 2026-11-15 07:59:59+01)`                                                                                                                                                                                                                        | errore `ZONA_NON_VALIDA`                                                                                                                                                        | ISSUE_7     |
| TF-MAP-16 | `stalliModificatiDopo(Piazza Aubry, new Date(NaN))`                                                                                                                                                                                                                                         | errore `ISTANTE_NON_VALIDO`                                                                                                                                                     | ISSUE_7     |

Note:

- **Rilevazione che conferma lo stato (TF-MAP-13, decisione H del piano).** Il trigger di `ultima_modifica` scatta quando cambia la riga, e una rilevazione aggiorna sempre la data e ora dell'ultima rilevazione. Lo stallo compare quindi tra i modificati anche se il suo stato non cambia. È accettato: la data dell'ultima rilevazione serve allo stato Sconosciuto (RF_IOT_2).
- **Cursore.** Il chiamante usa il `cursore` restituito come `istante` della richiesta successiva, mai il proprio orologio. Il cursore è un `Date` al millisecondo, mentre `ultima_modifica` è al microsecondo: con il cursore esatto la stessa riga può tornare una seconda volta, e il chiamante scarta i duplicati per id. Per questo TF-MAP-11 e 12 ripartono da `cursore + 1 ms`. Le due rilevazioni di TF-MAP-12 sono in due transazioni distinte, separate da almeno un giro di rete verso il database, quindi la seconda ha una `ultima_modifica` successiva a `r1.cursore + 1 ms`. Vale anche il limite della transazione confermata dopo il cursore (`cp_persistenza_stalli_tariffe.md` §6), che riguarda il futuro flusso in tempo reale e non questi frame.
- TF-MAP-02: `UC_STALLI_1` 2.a1 (nella zona non ci sono stalli gestiti), On success con elenco vuoto.
- TF-MAP-04…07 e 15: l'issue #7 prevede la zona non valida [error]. I modelli non la definiscono, quindi i limiti vengono dai vincoli dello schema sulle coordinate.
