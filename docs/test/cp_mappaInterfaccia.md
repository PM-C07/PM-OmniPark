# cp_mappaInterfaccia

Specifica dei casi di test (category partition) della logica della mappa degli stalli nell'interfaccia: funzioni pure di `src/presentation/logica/mappaStalli.ts`, usate dal boundary `:MappaStalli` (`MU_2`) e dal componente mappa generico, e, dalla OMP-61, di `src/presentation/logica/marcatori.ts` (separazione dei marker sovrapposti nel componente mappa generico).
Requisiti: RF_STALLI_1 (mappa degli stalli, tipo e stato), NRF_PER_3 (stati aggiornati senza ricaricare la pagina), NRF_USA_1 (stati mai indicati solo con il colore), NRF_USA_2 (selezione dello stallo con una sola interazione). Task OMP-58 (issue #29); dalla OMP-61 (issue #33, blocco B) correzione di DIF-04 (TF-MAPUI-19…25) e di DIF-02 (TF-MARC-01…09) di `docs/test/test_di_sistema.md` §8.

- **Fonti dell'esito atteso:** `UC_STALLI_1` (passi 1–4), `SD_STALLI_1` (`mostraZona`, `aggiornaStato`), `cp_apiStalli.md` §2 (formato di `zona` e degli stalli nelle risposte, righe già viste che tornano per il margine di 5 s), issue #29 (categorie minime: stato dello stallo, tipo di stallo, modifiche ricevute), piano approvato di OMP-58 (punti 1 e 3, con la correzione su `applicaModifiche`). Dalla OMP-61: `docs/test/test_di_sistema.md` §8 (DIF-02: marker di stalli vicini che si coprono a zoom 17, il tocco seleziona lo stallo sbagliato; DIF-04: «La mia sosta» mostra l'id invece di numero e area), issue #33 («lo stallo toccato deve essere sempre quello selezionato»; «con lo stallo nella zona della mappa deve mostrare numero e area, non l'id; l'id resta solo per gli stalli fuori zona»), `UC_STALLI_1` passi 3–4, `UC_SOSTA_1` entry condition, `np_01_automobilista` («Sosta in corso: stato e orario di scadenza»), piano approvato di OMP-61 (decisione D1: opzione A, si spostano solo i marker che si sovrappongono davvero; D7: correzione di DIF-04 senza causa accertata).
- **File di test:** `src/presentation/logica/mappaStalli.test.ts` (TF-MAPUI-01…25) e `src/presentation/logica/marcatori.test.ts` (TF-MARC-01…09), eseguiti da `npm test` (ambiente node, senza database).

## 1. Tracciabilità

Ogni frame riporta un solo riferimento, scelto in quest'ordine: un requisito dell'Elenco (`RF_…`, `NRF_…`) se il suo testo copre davvero il comportamento; altrimenti il vincolo di dominio `VD_<n>`; altrimenti `ISSUE_29` o `ISSUE_33` per le scelte delle issue #29 e #33 e dei piani approvati di OMP-58 e OMP-61.

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
// dalla OMP-61 (DIF-04)
ricordaStalli(noti: ReadonlyMap<number, StalloDellaMappa>, righe: readonly StalloDellaMappa[]): ReadonlyMap<number, StalloDellaMappa>;
descrizioneStallo(stalloId: number, noti: ReadonlyMap<number, StalloDellaMappa>): string;

// src/presentation/logica/marcatori.ts (OMP-61, DIF-02) — nessuna dipendenza da React, da Leaflet, da stalli o segnalazioni
type PuntoMarcatore = { id: number; x: number; y: number };   // centro del marker in pixel alla zoom corrente
separaMarcatori(punti: readonly PuntoMarcatore[], distanzaMinima: number): PuntoMarcatore[];
const DIMENSIONE_MARCATORE: number;                             // 36 px, lato dei marker di Mappa.tsx
```

- **`zonaDallaVista`:** restituisce il parametro `zona` di `cp_apiStalli.md`, `latMin,lonMin,latMax,lonMax` = `sud,ovest,nord,est`. Ogni estremo è arrotondato verso l'esterno a 5 decimali (minimi per difetto, massimi per eccesso) e scritto con 5 decimali, senza notazione esponenziale. Un valore che dista meno di `1e-9` da un multiplo di `0,00001` si considera già arrotondato (errori di rappresentazione dei numeri decimali). Le latitudini sono limitate a [-90, 90], le longitudini a [-180, 180] (la vista di Leaflet può superare ±180).
- **`applicaModifiche`** (correzione del piano): non confronta `ultimaModifica`. Ogni riga ricevuta sostituisce, per id, lo stallo presente; una riga di uno stallo non presente lo aggiunge. Il risultato è ordinato per id. Se il contenuto risultante è identico a quello di partenza (stessi stalli con tutti i campi uguali), la funzione restituisce **lo stesso array** ricevuto, per evitare un nuovo rendering; altrimenti un array nuovo. L'array ricevuto non viene mai modificato.
- **`elementoDelloStallo`:** tono e testo dello stato da `descriviStato("stallo", stato)` (`cp_statiDominio.md`); `simboloStato` ✓ Libero, ● Occupato, ✕ Non disponibile, ? Sconosciuto o non riconosciuto; `simbolo` del tipo P a pagamento, ♿ per persone con disabilità, R rosa, ? tipo non riconosciuto; `etichetta` = `Stallo n. <numero>, <area>, <tipo in parole>, <stato in parole>` con il tipo «a pagamento», «per persone con disabilità», «rosa», «di tipo non riconosciuto»; `gruppo` = nome dell'area di sosta.

- **`ricordaStalli`** (DIF-04): stalli già visti durante l'apertura della pagina, per id. Ogni riga (della fotografia o delle variazioni, di qualsiasi zona) sostituisce per id quella presente o si aggiunge; nessuno stallo viene tolto quando cambia la zona. Con `righe` vuoto restituisce la stessa mappa.
- **`descrizioneStallo`** (DIF-04): per uno stallo noto `"Stallo n. " + numero + ", " + areaDiSosta.nome`; altrimenti `"Stallo " + stalloId` (uno stallo mai visto in nessuna zona, per esempio una sosta su uno stallo lontano dalla mappa). La usa «La mia sosta» al posto della descrizione di OMP-58, che cercava lo stallo solo nella fotografia della zona corrente.
- **`separaMarcatori`** (DIF-02, decisione D1): sposta solo i marker che si sovrappongono davvero.
  1. Due marker si sovrappongono se la distanza tra i centri è **minore** di `distanzaMinima`. I gruppi sono le componenti connesse di questa relazione (anche indiretta).
  2. Un marker senza sovrapposizioni resta dov'è.
  3. I marker di un gruppo di `n` si dispongono su una griglia di `colonne = ceil(sqrt(n))` colonne e `righe = ceil(n / colonne)` righe, passo `distanzaMinima`, centrata sul baricentro dei punti originali del gruppo: la cella di riga `r` e colonna `c` (da 0) ha centro `baricentro + ((c − (colonne − 1) / 2) · passo, (r − (righe − 1) / 2) · passo)`. I marker occupano le celle per righe, da sinistra a destra, nell'ordine di `y` crescente, poi `x` crescente, poi `id` crescente (da nord a sud sulla mappa).
  4. Se dopo la disposizione un marker di un gruppo è a distanza minore di `distanzaMinima` da un marker di un altro gruppo (o da un marker rimasto fermo), i due gruppi si uniscono e la disposizione si ripete dai punti originali, finché non ci sono più sovrapposizioni.
  5. Il risultato ha gli stessi `id` nell'ordine dei `punti`; ogni coppia di marker è a distanza almeno `distanzaMinima`.

  `Mappa.tsx` la applica con `DIMENSIONE_MARCATORE` ai centri dei marker proiettati in pixel alla zoom corrente, a ogni cambio di zoom e degli elementi, e riporta i centri in coordinate geografiche: con lo zoom abbastanza alto i marker tornano nella posizione reale. Vale per la mappa degli stalli e per quella delle segnalazioni (componente generico).

## 3. Ambiente

Funzioni pure: nessun database, nessuna rete, nessun DOM.

**Stallo di partenza `S(id, stato, ultimaModifica)`:** `{ id, numero: id, latitudine: 40.688, longitudine: 14.522, tipoDiStallo: "ORDINARIO_A_PAGAMENTO", stato, ultimaModifica, areaDiSosta: { id: 5, nome: "Piazza Aubry" }, tariffa: { id: 1, costoOrario: 150 } }`. Ogni frame crea oggetti nuovi; «riga identica» è un oggetto distinto con gli stessi valori.

Istanti usati: `T1 = "2026-11-20T09:00:00.000Z"`, `T2 = "2026-11-20T09:00:05.000Z"`.

**Dalla OMP-61:** `S6 = { ...S(19, "OCCUPATO", T1), numero: 6 }` (lo stallo 19, n. 6 di Piazza Aubry); `N(...stalli)` = `new Map` degli stalli dati, per id. Per `separaMarcatori` i punti sono `P(id, x, y)` = `{ id, x, y }` in pixel; le coordinate attese si confrontano con una tolleranza di `1e-9` e «distanze ≥ 36» indica che ogni coppia del risultato dista almeno `36 − 1e-9`.

## 4. Categorie e scelte

**Vista (zona):** estremi con più di 5 decimali · estremi già a 5 decimali · estremo già arrotondato con errore di rappresentazione [single] · estremi oltre i limiti [error].

**Modifiche ricevute:** riga nuova con stato diverso → stato aggiornato · riga già applicata [single] → nessun cambiamento · nessuna riga · riga con `ultimaModifica` più vecchia ma stato diverso → applicata · rilevazione che conferma lo stato (cambia solo `ultimaModifica`) · riga di uno stallo nuovo della zona · più righe, solo alcune diverse.

**Stato dello stallo:** Libero · Occupato · Non disponibile · Sconosciuto · non riconosciuto [error].

**Tipo di stallo:** a pagamento · per persone con disabilità · rosa.

**Stalli già visti** (dalla OMP-61, DIF-04): nessuno · righe nuove · fotografia di un'altra zona senza lo stallo → resta noto · riga più recente dello stesso stallo · nessuna riga [single].

**Descrizione dello stallo della sosta** (DIF-04): stallo noto · mai visto → id · noto da una zona precedente [single].

**Marker da separare** (dalla OMP-61, DIF-02): nessun punto · un punto · due punti a distanza maggiore del minimo · a distanza uguale al minimo [single] · due punti sovrapposti · cinque punti allineati a 6 px (Piazza Aubry n. 4…8) con un punto isolato · punti coincidenti [single] · gruppo che, disposto, copre un marker vicino → gruppi uniti [single].

## 5. Test frame (34)

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
| TF-MAPUI-19 | `ricordaStalli(new Map(), [S6])`                                                                                               | mappa con il solo stallo 19, uguale a `S6`                                                                                                                                                  | ISSUE_33    |
| TF-MAPUI-20 | `noti = N(S6)`; `ricordaStalli(noti, [S(1, "LIBERO", T1)])` (fotografia di un'altra zona)                                      | mappa con gli stalli 1 e 19; lo stallo 19 è ancora `S6`                                                                                                                                     | ISSUE_33    |
| TF-MAPUI-21 | `noti = N(S6)`; `ricordaStalli(noti, [{ ...S6, stato: "NON_DISPONIBILE", ultimaModifica: T2 }])`                               | mappa con il solo stallo 19, nello stato `NON_DISPONIBILE` con `ultimaModifica` `T2`                                                                                                        | ISSUE_33    |
| TF-MAPUI-22 | `noti = N(S6)`; `ricordaStalli(noti, [])`                                                                                      | la stessa mappa (`toBe(noti)`)                                                                                                                                                              | ISSUE_33    |
| TF-MAPUI-23 | `descrizioneStallo(19, N(S6))`                                                                                                 | `"Stallo n. 6, Piazza Aubry"`                                                                                                                                                               | RF_SOSTA_1  |
| TF-MAPUI-24 | `descrizioneStallo(19, new Map())`                                                                                             | `"Stallo 19"`                                                                                                                                                                               | ISSUE_33    |
| TF-MAPUI-25 | `noti = ricordaStalli(ricordaStalli(new Map(), [S6]), [S(1, "LIBERO", T1)])`; `descrizioneStallo(19, noti)`                    | `"Stallo n. 6, Piazza Aubry"`                                                                                                                                                               | RF_SOSTA_1  |
| TF-MARC-01  | `separaMarcatori([], 36)`                                                                                                      | `[]`                                                                                                                                                                                        | ISSUE_33    |
| TF-MARC-02  | `separaMarcatori([P(1, 10, 20)], 36)`                                                                                          | `[P(1, 10, 20)]`                                                                                                                                                                            | ISSUE_33    |
| TF-MARC-03  | `separaMarcatori([P(1, 0, 0), P(2, 40, 0)], 36)`                                                                               | `[P(1, 0, 0), P(2, 40, 0)]` (invariati)                                                                                                                                                     | ISSUE_33    |
| TF-MARC-04  | `separaMarcatori([P(1, 0, 0), P(2, 0, 36)], 36)`                                                                               | `[P(1, 0, 0), P(2, 0, 36)]` (invariati: distanza uguale al minimo)                                                                                                                          | ISSUE_33    |
| TF-MARC-05  | `separaMarcatori([P(1, 0, 0), P(2, 0, 6)], 36)`                                                                                | `[P(1, -18, 3), P(2, 18, 3)]`                                                                                                                                                               | NRF_USA_2   |
| TF-MARC-06  | `separaMarcatori([P(17, 100, 124), P(18, 100, 118), P(19, 100, 112), P(20, 100, 106), P(21, 100, 100), P(1, 300, 300)], 36)`   | `[P(17, 100, 130), P(18, 64, 130), P(19, 136, 94), P(20, 100, 94), P(21, 64, 94), P(1, 300, 300)]`; distanze ≥ 36                                                                           | NRF_USA_2   |
| TF-MARC-07  | `separaMarcatori([P(2, 50, 50), P(1, 50, 50)], 36)`                                                                            | `[P(2, 68, 50), P(1, 32, 50)]`                                                                                                                                                              | ISSUE_33    |
| TF-MARC-08  | `separaMarcatori([P(1, 0, 0), P(2, 0, 6), P(3, 50, 3)], 36)`                                                                   | `[P(1, -4/3, -15), P(2, -4/3, 21), P(3, 104/3, -15)]`; distanze ≥ 36                                                                                                                        | ISSUE_33    |
| TF-MARC-09  | `DIMENSIONE_MARCATORE`                                                                                                         | `36`                                                                                                                                                                                        | ISSUE_33    |

Totale 34: 4 sulla zona, 7 sulle modifiche ricevute, 7 sugli elementi della mappa (4 stati, 2 tipi oltre a quello a pagamento, 1 stato non riconosciuto), 4 sugli stalli già visti e 3 sulla descrizione dello stallo della sosta (DIF-04) in `mappaStalli.test.ts`; 9 sulla separazione dei marker (DIF-02) in `marcatori.test.ts`.

Note sui riferimenti:

- TF-MAPUI-01…04: il parametro `zona` di `cp_apiStalli.md` §2 ricavato dalla vista (`UC_STALLI_1` passo 1); TF-MAPUI-03 e 04: piano approvato, punto 3 (errori di rappresentazione, limiti di latitudine e longitudine).
- TF-MAPUI-05…11: NRF_PER_3 e `UC_STALLI_1` passo 4 (`aggiornaStato`); TF-MAPUI-06 è il [single] dell'issue «riga già applicata → nessun cambiamento» (le righe già viste tornano per il margine di 5 s, `cp_apiStalli.md` TF-API-STA-10). TF-MAPUI-08: correzione del piano, `ultima_modifica` è l'inizio della transazione e non va confrontato.
- TF-MAPUI-12…17: RF_STALLI_1 (tipo e stato) e NRF_USA_1 (lo stato è anche nel simbolo e nell'etichetta, non solo nel colore).
- TF-MAPUI-19…22: stalli già visti (DIF-04, decisione D7): TF-MAPUI-20 è il caso del cambio di zona, in cui la fotografia nuova non contiene più lo stallo della sosta.
- TF-MAPUI-23: RF_SOSTA_1 e `np_01_automobilista` (la sosta in corso indica lo stallo come lo vede l'Automobilista, con numero e area). TF-MAPUI-24: issue #33 («l'id resta solo per gli stalli fuori zona»).
- TF-MAPUI-25 riproduce **DIF-04** con l'ipotesi del cambio di zona: in OMP-58 la descrizione cercava lo stallo solo nella fotografia corrente e dava `"Stallo 19"`. La causa del difetto osservato non è accertata (decisione D7): il frame verifica che uno stallo già visto resti descritto con numero e area, qualunque sia la zona corrente; il riscontro nel flusso reale è TS-01 passo 6 e TS-02 con il ricaricamento della pagina (Blocco C).
- TF-MARC-03, 04: si spostano solo i marker che si sovrappongono davvero (decisione D1): con i centri a 36 px, il lato del marker, i marker si toccano senza coprirsi.
- TF-MARC-05, 06 riproducono **DIF-02**: in OMP-58 i marker restavano nelle posizioni reali, a circa 6 px l'uno dall'altro con marker da 36 px, e il tocco al centro di un marker selezionava quello sopra. Dopo la separazione ogni marker ha il centro libero e il tocco seleziona lo stallo toccato (NRF_USA_2, prima delle tre interazioni; `UC_SOSTA_1` entry condition). In TF-MARC-06 l'ordine `y` crescente mette in alto lo stallo più a nord (n. 8, id 21) e il punto isolato non si muove.
- TF-MARC-07: punti coincidenti, ordinati per `id`. TF-MARC-08: il gruppo {1, 2} disposto in orizzontale coprirebbe il marker 3 (32 px da `P(2, 18, 3)`), quindi i tre marker si dispongono insieme attorno al baricentro (50/3, 3).
- TF-MARC-09: il lato dei marker di `Mappa.tsx` (36 px, OMP-58) è la distanza minima usata dalla mappa.

## 6. Note

- **Già verificati altrove** (nessun frame qui): testo e tono degli stati, `cp_statiDominio.md`; formato e controllo di `zona` lato server, `cp_apiStalli.md`.
- Il polling (richieste non accavallate, pausa con la scheda nascosta, 401 → `/accesso?da=%2Fmappa`) e il disegno dei marker si verificano a mano sull'anteprima.
- **Separazione dei marker nella mappa** (dalla OMP-61): l'applicazione in `Mappa.tsx` (proiezione, cambio di zoom, ritorno alle coordinate geografiche) non ha test unitari; la verificano TS-12 (tocco al centro del marker dello stallo, che non deve essere coperto) e TS-03, TS-05, TS-11 (marker riconosciuti dall'etichetta, non dalla posizione), nel Blocco C.
- **Mappa delle segnalazioni dell'Ausiliario (COD-18), da rilanciare** perché usa lo stesso componente `Mappa.tsx` e anche i suoi marker vicini vengono separati: `src/presentation/logica/mappaSegnalazioni.test.ts` (57 frame di `cp_mappaSegnalazioni.md`, logica invariata, con `npm test`); TS-06 (`e2e/segnalazioni.spec.ts`) e TS-10 (`e2e/accesso.spec.ts`) sull'anteprima del branch con `npm run test:e2e`; verifica a mano da telefono della mappa di `/ausiliario` con più segnalazioni vicine (per esempio letture sugli stalli 7, 8 e 9 di Via Raffaele Viviani, a circa 5,5 m l'uno dall'altro).
