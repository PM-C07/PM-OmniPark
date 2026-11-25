# Misure dei requisiti non funzionali

<!-- misura:anpr -->

## NRF_AFF_2 – Accuratezza dell'associazione targa-sosta

- Data della misura: 2026-11-25T12:08:35.875Z
- Comando: `npm run misura:anpr`, su un database di test appena popolato
- Letture valide con esito corretto: 260 su 260
- **Accuratezza: 100.00%** (soglia 98%): superata
- Letture rifiutate correttamente, escluse dalla percentuale: 27 su 27
- Composizione del dataset: nessuna segnalazione 60, targa non corrispondente 64, sosta scaduta 52, lettura scartata 34, sosta assente 50, lettura rifiutata 27
- Segnalazioni nel database: 166 create, coerenti con le letture e con il vincolo di una sola non chiusa per targa
- Limite: la misura non applica le fasce orarie di UC_ANPR_1 2.a2, fuori ambito fino a COD-23. Va ripetuta dopo COD-23.

<!-- /misura:anpr -->

<!-- misura:per3 -->

## NRF_PER_3 – Aggiornamento dello stato sulla mappa

- Data della misura: 2026-11-24T16:39:19.486Z
- Comando: `npm run misura:e2e` (TS-11), sull'anteprima del branch
- Variazioni misurate: 33 (più 3 di riscaldamento), sugli stalli 1, 3, 16, una ogni 3 s
- Non comparse entro 10 s: 0; invii esclusi (errore o esito inatteso): 0
- Ritardo massimo 1480 ms, mediana 771 ms, 95° percentile 1312 ms
- **Esito: superata** (soglia 2000 ms per ogni variazione)
- Valori grezzi: `docs/test/misure/nrf_per_3.csv`

<!-- /misura:per3 -->

<!-- misura:usa2 -->

## NRF_USA_2 – Procedura di sosta in tre interazioni

- Data della misura: 2026-11-24T16:39:29.017Z
- Comando: `npm run misura:e2e` (TS-12), sull'anteprima del branch
- Interazioni dalla mappa alla sosta pagata: 3 (soglia 3); sosta Attiva: sì
- Stallo n. 5, Piazza Aubry; sfondo della mappa caricato; marker coperto al centro: sì
- **Esito: superata**
- Schermate: `docs/test/schermate/nrf_usa_2/`

<!-- /misura:usa2 -->
