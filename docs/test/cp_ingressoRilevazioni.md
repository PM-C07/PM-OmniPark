# Category partition – Ingresso delle rilevazioni (POST /api/sensori/rilevazioni)

Requisito: RF_IOT_1. Issue: COD-14 (OMP-47).
Driver: il test chiama direttamente l'handler POST della route con una Request reale,
sopra la Facade Gestione stalli e il database di test, senza stub.

## Parametri

- Intestazione `x-simulatore-token`
- Variabile d'ambiente `SIMULATORE_TOKEN`
- Corpo JSON: `stallo` (id), `presenza` (boolean), `dataOra` (ISO 8601)
- Stato dello stallo nel database

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
- tipo non valido (presenza non boolean) [error]
- tipo non valido (stallo non numerico) [error]
- dataOra non valida [error]
- dataOra senza fuso orario [error]
- dataOra con una data di calendario inesistente [error]
- dataOra successiva all'istante corrente [error]

Stallo

- esistente
- inesistente [error]

Presenza

- true
- false

Ordine temporale

- non precedente all'ultima rilevazione
- precedente all'ultima rilevazione [error]

## Vincoli

- Il token si controlla per primo: con token assente o errato, o con `SIMULATORE_TOKEN` non configurata, la risposta è 401 con codice `TOKEN_NON_VALIDO` qualunque sia il corpo.
- `dataOra` è una stringa ISO 8601 completa, `YYYY-MM-DDTHH:mm:ss[.sss]` seguita da `Z` o `±HH:mm` con fuso compreso tra `-12:00` e `+14:00`, con una data di calendario reale.
- Corpo non JSON, campo mancante, tipo non valido (compreso `stallo` non numerico) e `dataOra` non conforme hanno codice `RILEVAZIONE_INCOMPLETA`.
- La risposta 200 ha corpo `{ stato }`, con il nuovo stato dello stallo.
- Ogni frame [error] lascia invariato lo stato dello stallo.
- Formato degli errori: `{ errore: { codice, messaggio } }`.

## Frame

| ID    | Token           | Corpo                                             | Stallo      | Presenza | Esito atteso                                    |
| ----- | --------------- | ------------------------------------------------- | ----------- | -------- | ----------------------------------------------- |
| TF-01 | valido          | completo                                          | esistente   | true     | 200, `{ stato: "OCCUPATO" }`, stallo Occupato   |
| TF-02 | valido          | completo                                          | esistente   | false    | 200, `{ stato: "LIBERO" }`, stallo Libero       |
| TF-03 | assente         | completo                                          | esistente   | true     | 401 `TOKEN_NON_VALIDO`, stato invariato         |
| TF-04 | errato          | completo                                          | esistente   | true     | 401 `TOKEN_NON_VALIDO`, stato invariato         |
| TF-05 | valido          | non è JSON                                        | –           | –        | 422 `RILEVAZIONE_INCOMPLETA`, stato invariato   |
| TF-06 | valido          | campo mancante                                    | esistente   | –        | 422 `RILEVAZIONE_INCOMPLETA`, stato invariato   |
| TF-07 | valido          | presenza non boolean                              | esistente   | –        | 422 `RILEVAZIONE_INCOMPLETA`, stato invariato   |
| TF-08 | valido          | dataOra non valida                                | esistente   | true     | 422 `RILEVAZIONE_INCOMPLETA`, stato invariato   |
| TF-09 | valido          | completo                                          | inesistente | true     | 422 `STALLO_INESISTENTE`, nessuno stallo creato |
| TF-10 | valido          | dataOra precedente all'ultima rilevazione         | esistente   | true     | 409 `RILEVAZIONE_SUPERATA`, stato invariato     |
| TF-11 | valido          | dataOra un'ora dopo l'istante corrente            | esistente   | true     | 422 `RILEVAZIONE_NON_VALIDA`, stato invariato   |
| TF-12 | valido          | dataOra senza fuso (`2026-11-20T09:00:00`)        | esistente   | true     | 422 `RILEVAZIONE_INCOMPLETA`, stato invariato   |
| TF-13 | valido          | dataOra inesistente (`2026-02-31T10:00:00+01:00`) | esistente   | true     | 422 `RILEVAZIONE_INCOMPLETA`, stato invariato   |
| TF-14 | non configurata | completo                                          | esistente   | true     | 401 `TOKEN_NON_VALIDO`, stato invariato         |
| TF-15 | valido          | stallo non numerico (`"5"`, stallo 5 esistente)   | esistente   | true     | 422 `RILEVAZIONE_INCOMPLETA`, stato invariato   |
