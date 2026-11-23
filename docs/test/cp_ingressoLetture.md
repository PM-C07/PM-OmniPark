# Category partition – Ingresso delle letture (POST /api/anpr/letture)

Requisito: RF_ANPR_1. Issue: COD-14 (OMP-47).
Driver: il test chiama direttamente l'handler POST della route con una Request reale,
sopra la Facade Segnalazioni e il database di test, senza stub.
La classificazione delle letture è già verificata in COD-13: qui si prova l'ingresso.

## Parametri

- Intestazione `x-simulatore-token`
- Variabile d'ambiente `SIMULATORE_TOKEN`
- Corpo JSON: `targa` (stringa), `stallo` (id), `dataOra` (ISO 8601)

## Categorie e scelte

Token

- valido
- assente [error]
- errato [error]
- `SIMULATORE_TOKEN` non configurata [error]

Corpo

- completo e ben tipato
- non è JSON [error]
- campo mancante [error]
- tipo non valido (targa non stringa) [error]
- tipo non valido (stallo non numerico) [error]
- targa con caratteri diversi da lettere e cifre [error]
- dataOra non valida [error]
- dataOra senza fuso orario [error]
- dataOra con una data di calendario inesistente [error]
- dataOra successiva all'istante corrente [error]

Stallo

- esistente
- inesistente [error]

Segnalazione non chiusa già presente per la targa

- no
- sì [single]

## Vincoli

- Il token si controlla per primo: con token assente o errato, o con `SIMULATORE_TOKEN` non configurata, la risposta è 401 con codice `TOKEN_NON_VALIDO` qualunque sia il corpo.
- `dataOra` è una stringa ISO 8601 completa, `YYYY-MM-DDTHH:mm:ss[.sss]` seguita da `Z` o `±HH:mm` con fuso compreso tra `-12:00` e `+14:00`, con una data di calendario reale.
- Corpo non JSON, campo mancante, tipo non valido (compreso `stallo` non numerico) e `dataOra` non conforme hanno codice `LETTURA_INCOMPLETA`.
- La risposta 200 ha come corpo l'esito del riscontro (`EsitoRiscontro`).
- Ogni frame [error] non crea segnalazioni.
- Formato degli errori: `{ errore: { codice, messaggio } }`.

## Frame

| ID    | Token           | Corpo                                                             | Stallo                   | Esito atteso                                                                              |
| ----- | --------------- | ----------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| TF-01 | valido          | completo                                                          | esistente                | 200, esito del riscontro nel corpo (es. sosta assente → segnalazione creata)              |
| TF-02 | assente         | completo                                                          | esistente                | 401 `TOKEN_NON_VALIDO`, nessuna segnalazione                                              |
| TF-03 | errato          | completo                                                          | esistente                | 401 `TOKEN_NON_VALIDO`, nessuna segnalazione                                              |
| TF-04 | valido          | non è JSON                                                        | –                        | 422 `LETTURA_INCOMPLETA`, nessuna segnalazione                                            |
| TF-05 | valido          | campo mancante                                                    | esistente                | 422 `LETTURA_INCOMPLETA`, nessuna segnalazione                                            |
| TF-06 | valido          | targa non stringa                                                 | esistente                | 422 `LETTURA_INCOMPLETA`, nessuna segnalazione                                            |
| TF-07 | valido          | dataOra non valida                                                | esistente                | 422 `LETTURA_INCOMPLETA`, nessuna segnalazione                                            |
| TF-08 | valido          | completo                                                          | inesistente              | 422 `STALLO_INESISTENTE`, nessuna segnalazione                                            |
| TF-09 | valido          | targa `RA22-AA`                                                   | esistente                | 422 `TARGA_NON_VALIDA`, nessuna segnalazione                                              |
| TF-10 | valido          | dataOra un'ora dopo l'istante corrente                            | esistente                | 422 `LETTURA_NON_VALIDA`, nessuna segnalazione                                            |
| TF-11 | valido          | dataOra senza fuso (`2026-11-20T09:00:00`)                        | esistente                | 422 `LETTURA_INCOMPLETA`, nessuna segnalazione                                            |
| TF-12 | valido          | dataOra inesistente (`2026-02-31T10:00:00+01:00`)                 | esistente                | 422 `LETTURA_INCOMPLETA`, nessuna segnalazione                                            |
| TF-13 | non configurata | completo                                                          | esistente                | 401 `TOKEN_NON_VALIDO`, nessuna segnalazione                                              |
| TF-14 | valido          | completo, targa `HB204KM` (segnalazione 11 del dataset, `APERTA`) | esistente, diverso dal 3 | 200, `{ esito: "LETTURA_SCARTATA", motivo: "SOSTA_ASSENTE" }`, nessuna nuova segnalazione |
| TF-15 | valido          | stallo non numerico (`"5"`, stallo 5 esistente)                   | esistente                | 422 `LETTURA_INCOMPLETA`, nessuna segnalazione                                            |
