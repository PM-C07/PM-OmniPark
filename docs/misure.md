# Misure dei requisiti non funzionali

<!-- misura:anpr -->

## NRF_AFF_2 – Accuratezza dell'associazione targa-sosta

- Data della misura: 2026-11-23T18:35:41.447Z
- Comando: `npm run misura:anpr`, su un database di test appena popolato
- Letture valide con esito corretto: 260 su 260
- **Accuratezza: 100.00%** (soglia 98%): superata
- Letture rifiutate correttamente, escluse dalla percentuale: 27 su 27
- Composizione del dataset: nessuna segnalazione 60, targa non corrispondente 64, sosta scaduta 52, lettura scartata 34, sosta assente 50, lettura rifiutata 27
- Segnalazioni nel database: 166 create, coerenti con le letture e con il vincolo di una sola non chiusa per targa
- Limite: la misura non applica le fasce orarie di UC_ANPR_1 2.a2, fuori ambito fino a COD-23. Va ripetuta dopo COD-23.

<!-- /misura:anpr -->
