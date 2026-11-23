# cp_verificaAutorizzazione

Specifica dei casi di test (category partition) del servizio Autorizzazione, operazioni `verificaAutorizzazione(sessione, operazione, ente)`, `ausiliariDellEntePreposto(ente)` e `trovaAusiliario(ausiliario)` (aggiunta con OMP-46, issue #10).
Requisito: NRF_SIC_1 (controllo degli accessi), base.

## Parametri e ambiente

- `sessione`: token della sessione.
- `operazione`: operazione richiesta; per ogni operazione è definito l'elenco dei ruoli ammessi.
- `ente`: ente a cui appartengono i dati, oppure nessuno per le operazioni che non riguardano un ente.
- Ambiente: due enti; per ciascuno un Ausiliario attivo; nel primo ente anche un Ausiliario disattivato; un Automobilista e un Amministratore. La durata della sessione è fissa; la sessione scaduta si ottiene spostando l'orologio dei test, senza attese reali.

## Categorie e scelte: verificaAutorizzazione

**Sessione**

1. valida
2. scaduta [error]
3. inesistente [error]

**Ruolo rispetto all'operazione**

1. ammesso
2. non ammesso [error]

**Ente dei dati**

1. lo stesso dell'Ausiliario
2. un altro ente [error]
3. non applicabile

Vincoli: l'ente si verifica solo per l'Ausiliario del Traffico. L'Amministratore opera su tutti gli enti [single].

## Categorie e scelte: ausiliariDellEntePreposto

**Ente**

1. con Ausiliari attivi
2. senza Ausiliari [single]

## Frame ed esiti attesi

| Frame | Operazione                | Sessione    | Ruolo                      | Ente            | Esito atteso                                                 |
| ----- | ------------------------- | ----------- | -------------------------- | --------------- | ------------------------------------------------------------ |
| TF-01 | verifica                  | valida      | Automobilista, ammesso     | non applicabile | autorizzato                                                  |
| TF-02 | verifica                  | valida      | Ausiliario, ammesso        | lo stesso       | autorizzato                                                  |
| TF-03 | verifica                  | valida      | Ausiliario, ammesso        | un altro ente   | errore `ENTE_NON_AMMESSO`                                    |
| TF-04 | verifica                  | valida      | Automobilista, non ammesso | –               | errore `RUOLO_NON_AMMESSO`                                   |
| TF-05 | verifica                  | valida      | Amministratore, ammesso    | qualsiasi ente  | autorizzato                                                  |
| TF-06 | verifica                  | scaduta     | –                          | –               | errore `SESSIONE_NON_VALIDA`                                 |
| TF-07 | verifica                  | inesistente | –                          | –               | errore `SESSIONE_NON_VALIDA`                                 |
| TF-08 | ausiliariDellEntePreposto | –           | –                          | con Ausiliari   | solo gli Ausiliari attivi dell'ente (escluso il disattivato) |
| TF-09 | ausiliariDellEntePreposto | –           | –                          | senza Ausiliari | elenco vuoto                                                 |

## Categorie e scelte: trovaAusiliario (OMP-46)

Operazione `trovaAusiliario(ausiliario: number): Promise<Ausiliario | null>`: l'Ausiliario del Traffico con id, email, nome, cognome, ente e stato dell'account, oppure `null`. La usa Segnalazioni per controllare che l'Ausiliario sia attivo e per leggerne l'ente (`SD_OP_1` 2.1 `ente()`, VD_18, VD_19).

**Ausiliario**

1. attivo
2. disattivato
3. inesistente

## Frame ed esiti attesi: trovaAusiliario (OMP-46)

| Frame | Operazione      | Ausiliario             | Esito atteso                                                                                                                  |
| ----- | --------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TF-10 | trovaAusiliario | attivo (id 2)          | `{ id: 2, email: "paolo.ferri@omnipark.example", nome: "Paolo", cognome: "Ferri", enteId: 1, statoDellAccount: "ATTIVO" }`    |
| TF-11 | trovaAusiliario | disattivato (id 4)     | `{ id: 4, email: "luca.russo@omnipark.example", nome: "Luca", cognome: "Russo", enteId: 1, statoDellAccount: "DISATTIVATO" }` |
| TF-12 | trovaAusiliario | inesistente (`999999`) | `null`                                                                                                                        |

Gli Ausiliari 2 e 4 sono quelli del dataset (`0002_dati_esempio.sql`). Che un utente esistente ma non Ausiliario non sia restituito lo verifica `cp_segnalazioniEnte.md` TF-ENT-07.
