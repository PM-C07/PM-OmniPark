# cp_mappaInterfaccia

Specifica dei casi di test (category partition) della logica della mappa degli stalli nell'interfaccia: funzioni pure di `src/presentation/logica/mappaStalli.ts`, usate dal boundary `:MappaStalli` (`MU_2`) e dal componente mappa generico.
Requisiti: RF_STALLI_1 (mappa degli stalli, tipo e stato), NRF_PER_3 (stati aggiornati senza ricaricare la pagina), NRF_USA_1 (stati mai indicati solo con il colore). Task OMP-58 (issue #29).

- **Fonti dell'esito atteso:** `UC_STALLI_1` (passi 1–4), `SD_STALLI_1` (`mostraZona`, `aggiornaStato`), `cp_apiStalli.md` §2 (formato di `zona` e degli stalli nelle risposte, righe già viste che tornano per il margine di 5 s), issue #29 (categorie minime: stato dello stallo, tipo di stallo, modifiche ricevute), piano approvato di OMP-58 (punti 1 e 3, con la correzione su `applicaModifiche`).
- **File di test:** `src/presentation/logica/mappaStalli.test.ts`, eseguito da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` per le scelte dell'issue #29 e del piano approvato.

Nome del test: `<riferimento> · <frame> · <descrizione> → <esito>`, per esempio `NRF_PER_3 · TF-MAPUI-06 · riga già applicata → stesso array`.

## 2. Funzioni verificate (firme)

```ts
// src/presentation/logica/mappaStalli.ts — nessuna dipendenza da React, da Leaflet né dai sottosistemi
type StalloDellaMappa = {            // uno stallo come arriva da GET /api/stalli e /api/stalli/modifiche
  id: number; numero: number; latitudine: number; longitudine: number;
  tipoDiStallo: string; stato: string; ultimaModifica: string; // istante ISO 8601
  areaDiSosta: { id: number; nome: string };
  tariffa: { id: number; costoOrario: number };
};
type ElementoMappa = {               // elemento del componente mappa generico
  id: number; latitudine: number; longitudine: number;
  tono: Tono; simbolo: string; simboloStato: string; etichetta: string; gruppo: string;
};
zonaDallaVista(vista: { sud: number; ovest: number; nord: number; est: number }): string;
applicaModifiche(stalli: readonly StalloDellaMappa[], righe: readonly StalloDellaMappa[]): readonly StalloDellaMappa[];
elementoDelloStallo(stallo: StalloDellaMappa): ElementoMappa;
```

- **`zonaDallaVista`:** restituisce il parametro `zona` di `cp_apiStalli.md`, `latMin,lonMin,latMax,lonMax` = `sud,ovest,nord,est`. Ogni estremo è arrotondato verso l'esterno a 5 decimali (minimi per difetto, massimi per eccesso) e scritto con 5 decimali, senza notazione esponenziale. Un valore che dista meno di `1e-9` da un multiplo di `0,00001` si considera già arrotondato (errori di rappresentazione dei numeri decimali). Le latitudini sono limitate a [-90, 90], le longitudini a [-180, 180] (la vista di Leaflet può superare ±180).
- **`applicaModifiche`** (correzione del piano): non confronta `ultimaModifica`. Ogni riga ricevuta sostituisce, per id, lo stallo presente; una riga di uno stallo non presente lo aggiunge. Il risultato è ordinato per id. Se il contenuto risultante è identico a quello di partenza (stessi stalli con tutti i campi uguali), la funzione restituisce **lo stesso array** ricevuto, per evitare un nuovo rendering; altrimenti un array nuovo. L'array ricevuto non viene mai modificato.
- **`elementoDelloStallo`:** tono e testo dello stato da `descriviStato("stallo", stato)` (`cp_statiDominio.md`); `simboloStato` ✓ Libero, ● Occupato, ✕ Non disponibile, ? Sconosciuto o non riconosciuto; `simbolo` del tipo P a pagamento, ♿ per persone con disabilità, R rosa, ? tipo non riconosciuto; `etichetta` = `Stallo n. <numero>, <area>, <tipo in parole>, <stato in parole>` con il tipo «a pagamento», «per persone con disabilità», «rosa», «di tipo non riconosciuto»; `gruppo` = nome dell'area di sosta.

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM.

**Stallo di partenza `S(id, stato, ultimaModifica)`:** `{ id, numero: id, latitudine: 40.688, longitudine: 14.522, tipoDiStallo: "ORDINARIO_A_PAGAMENTO", stato, ultimaModifica, areaDiSosta: { id: 5, nome: "Piazza Aubry" }, tariffa: { id: 1, costoOrario: 150 } }`. Ogni frame crea oggetti nuovi; «riga identica» è un oggetto distinto con gli stessi valori.

Istanti usati: `T1 = "2026-11-20T09:00:00.000Z"`, `T2 = "2026-11-20T09:00:05.000Z"`.

## 4. Categorie e scelte

**Vista (zona):** estremi con più di 5 decimali · estremi già a 5 decimali · estremo già arrotondato con errore di rappresentazione [single] · estremi oltre i limiti [error].

**Modifiche ricevute:** riga nuova con stato diverso → stato aggiornato · riga già applicata [single] → nessun cambiamento · nessuna riga · riga con `ultimaModifica` più vecchia ma stato diverso → applicata · rilevazione che conferma lo stato (cambia solo `ultimaModifica`) · riga di uno stallo nuovo della zona · più righe, solo alcune diverse.

**Stato dello stallo:** Libero · Occupato · Non disponibile · Sconosciuto · non riconosciuto [error].

**Tipo di stallo:** a pagamento · per persone con disabilità · rosa.

## 5. Test frame (18)

| Frame       | Chiamata                                                                                                                       | Esito atteso                                                                                                                                                                                | Riferimento |
| :---------- | :----------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| TF-MAPUI-01 | `zonaDallaVista({ sud: 40.6879912, ovest: 14.5219987, nord: 40.6890001, est: 14.5223004 })`                                    | `"40.68799,14.52199,40.68901,14.52231"`                                                                                                                                                     | RF_STALLI_1 |
| TF-MAPUI-02 | `zonaDallaVista({ sud: 40.688, ovest: 14.522, nord: 40.689, est: 14.5223 })`                                                   | `"40.68800,14.52200,40.68900,14.52230"`                                                                                                                                                     | RF_STALLI_1 |
| TF-MAPUI-03 | `zonaDallaVista({ sud: 40.6884 - 0.002, ovest: 14.5221 - 0.002, nord: 40.6884 + 0.002, est: 14.5221 + 0.002 })`                | `"40.68640,14.52010,40.69040,14.52410"`                                                                                                                                                     | ISSUE_29    |
| TF-MAPUI-04 | `zonaDallaVista({ sud: -95, ovest: -200, nord: 95, est: 190 })`                                                                | `"-90.00000,-180.00000,90.00000,180.00000"`                                                                                                                                                 | ISSUE_29    |
| TF-MAPUI-05 | `stalli = [S(1, "LIBERO", T1), S(2, "LIBERO", T1)]`; `applicaModifiche(stalli, [S(2, "OCCUPATO", T2)])`                        | array nuovo, diverso da `stalli`: `[S(1, "LIBERO", T1), S(2, "OCCUPATO", T2)]`; `stalli` è rimasto `[S(1, "LIBERO", T1), S(2, "LIBERO", T1)]`                                               | NRF_PER_3   |
| TF-MAPUI-06 | `stalli = [S(1, "LIBERO", T1), S(2, "OCCUPATO", T2)]`; `applicaModifiche(stalli, [S(2, "OCCUPATO", T2)])`                      | lo stesso array `stalli` (`toBe`)                                                                                                                                                           | NRF_PER_3   |
| TF-MAPUI-07 | `stalli = [S(1, "LIBERO", T1)]`; `applicaModifiche(stalli, [])`                                                                | lo stesso array `stalli` (`toBe`)                                                                                                                                                           | NRF_PER_3   |
| TF-MAPUI-08 | `stalli = [S(1, "OCCUPATO", T2)]`; `applicaModifiche(stalli, [S(1, "NON_DISPONIBILE", T1)])`                                   | `[S(1, "NON_DISPONIBILE", T1)]`: la riga ricevuta sostituisce lo stallo anche se `ultimaModifica` è più vecchia                                                                             | NRF_PER_3   |
| TF-MAPUI-09 | `stalli = [S(1, "LIBERO", T1)]`; `applicaModifiche(stalli, [S(1, "LIBERO", T2)])`                                              | array nuovo: `[S(1, "LIBERO", T2)]`                                                                                                                                                         | NRF_PER_3   |
| TF-MAPUI-10 | `stalli = [S(1, "LIBERO", T1), S(3, "LIBERO", T1)]`; `applicaModifiche(stalli, [S(2, "OCCUPATO", T2)])`                        | `[S(1, "LIBERO", T1), S(2, "OCCUPATO", T2), S(3, "LIBERO", T1)]` (ordinati per id)                                                                                                          | RF_STALLI_1 |
| TF-MAPUI-11 | `stalli = [S(1, "LIBERO", T1), S(2, "LIBERO", T1)]`; `applicaModifiche(stalli, [S(1, "LIBERO", T1), S(2, "SCONOSCIUTO", T2)])` | `[S(1, "LIBERO", T1), S(2, "SCONOSCIUTO", T2)]`                                                                                                                                             | NRF_PER_3   |
| TF-MAPUI-12 | `elementoDelloStallo(S(16, "LIBERO", T1))`                                                                                     | `{ id: 16, latitudine: 40.688, longitudine: 14.522, tono: "verde", simbolo: "P", simboloStato: "✓", etichetta: "Stallo n. 16, Piazza Aubry, a pagamento, Libero", gruppo: "Piazza Aubry" }` | RF_STALLI_1 |
| TF-MAPUI-13 | `elementoDelloStallo(S(17, "OCCUPATO", T1))`                                                                                   | `tono: "rosso"`, `simboloStato: "●"`, `etichetta: "Stallo n. 17, Piazza Aubry, a pagamento, Occupato"`                                                                                      | RF_STALLI_1 |
| TF-MAPUI-14 | `elementoDelloStallo(S(18, "NON_DISPONIBILE", T1))`                                                                            | `tono: "arancione"`, `simboloStato: "✕"`, `etichetta: "Stallo n. 18, Piazza Aubry, a pagamento, Non disponibile"`                                                                           | RF_STALLI_1 |
| TF-MAPUI-15 | `elementoDelloStallo(S(13, "SCONOSCIUTO", T1))`                                                                                | `tono: "grigio"`, `simboloStato: "?"`, `etichetta: "Stallo n. 13, Piazza Aubry, a pagamento, Sconosciuto"`                                                                                  | RF_STALLI_1 |
| TF-MAPUI-16 | `elementoDelloStallo({ ...S(14, "LIBERO", T1), tipoDiStallo: "DISABILI" })`                                                    | `simbolo: "♿"`, `etichetta: "Stallo n. 14, Piazza Aubry, per persone con disabilità, Libero"`                                                                                              | RF_STALLI_1 |
| TF-MAPUI-17 | `elementoDelloStallo({ ...S(15, "OCCUPATO", T1), tipoDiStallo: "ROSA" })`                                                      | `simbolo: "R"`, `etichetta: "Stallo n. 15, Piazza Aubry, rosa, Occupato"`                                                                                                                   | RF_STALLI_1 |
| TF-MAPUI-18 | `elementoDelloStallo(S(19, "GUASTO", T1))`                                                                                     | `tono: "grigio"`, `simboloStato: "?"`, `etichetta: "Stallo n. 19, Piazza Aubry, a pagamento, Stato non riconosciuto"`                                                                       | NRF_USA_1   |

Totale 18: 4 sulla zona, 7 sulle modifiche ricevute, 7 sugli elementi della mappa (4 stati, 2 tipi oltre a quello a pagamento, 1 stato non riconosciuto).

Note sui riferimenti:

- TF-MAPUI-01…04: il parametro `zona` di `cp_apiStalli.md` §2 ricavato dalla vista (`UC_STALLI_1` passo 1); TF-MAPUI-03 e 04: piano approvato, punto 3 (errori di rappresentazione, limiti di latitudine e longitudine).
- TF-MAPUI-05…11: NRF_PER_3 e `UC_STALLI_1` passo 4 (`aggiornaStato`); TF-MAPUI-06 è il [single] dell'issue «riga già applicata → nessun cambiamento» (le righe già viste tornano per il margine di 5 s, `cp_apiStalli.md` TF-API-STA-10). TF-MAPUI-08: correzione del piano, `ultima_modifica` è l'inizio della transazione e non va confrontato.
- TF-MAPUI-12…17: RF_STALLI_1 (tipo e stato) e NRF_USA_1 (lo stato è anche nel simbolo e nell'etichetta, non solo nel colore).

## 6. Note

- **Già verificati altrove** (nessun frame qui): testo e tono degli stati, `cp_statiDominio.md`; formato e controllo di `zona` lato server, `cp_apiStalli.md`.
- Il polling (richieste non accavallate, pausa con la scheda nascosta, 401 → `/accesso?da=%2Fmappa`) e il disegno dei marker si verificano a mano sull'anteprima.
