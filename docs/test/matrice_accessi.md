# Matrice degli accessi

Verifica di NRF_SIC_1 (controllo degli accessi per ruolo ed ente) sulle route API: per ogni route di `src/app/api/`, e per ogni metodo, il test che dimostra il rifiuto senza sessione, con un ruolo non ammesso e, dove la route lavora su dati di un ente, con un ente diverso. Task OMP-66 (issue #46, COD-25).

- **Fonti:** route in `src/app/api/`; catalogo delle operazioni e regole di ruolo ed ente in `src/application/utenti-accessi/autorizzazione.ts`; tabella codice → status in `src/app/api/_errori.ts` (401 `SESSIONE_NON_VALIDA`, 403 `RUOLO_NON_AMMESSO` ed `ENTE_NON_AMMESSO`); specifiche `cp_api*.md`, `cp_ingressoRilevazioni.md`, `cp_ingressoLetture.md`, `cp_verificaPermesso.md`.
- **Fuori dalla matrice:** le pagine, protette dal proxy (`src/proxy.ts`, TF-ACC-32…43 di `cp_apiAccesso.md`), che non tocca `/api`; l'ente diverso a livello di sistema, verificato da TS-10 in `test_di_sistema.md`.

## 1. Come si legge

- Una riga per metodo e percorso. «Ruoli ammessi» è il ruolo dell'operazione passata a `richiediSessione` (`src/app/api/_sessione.ts`), cioè l'attore principale del caso d'uso.
- Ogni cella riporta il file di test (§2) e il frame che la verifica, con l'esito della cella; «manca» se nessun test la verifica; «n/a» se il controllo non si applica, con il motivo.
- **Senza sessione → 401:** richiesta senza cookie di sessione, risposta 401 `SESSIONE_NON_VALIDA`. Per le route dei simulatori la cella è «senza token → 401» (`TOKEN_NON_VALIDO`, intestazione `x-simulatore-token` assente).
- **Ruolo non ammesso → 403:** sessione valida di un ruolo diverso da quello ammesso, risposta 403 `RUOLO_NON_AMMESSO`.
- **Altro ente → 403 o 404:** solo per le operazioni dell'Ausiliario del Traffico, l'unico ruolo legato a un ente (regola `perEnte` di `autorizzazione.ts`, VD_18). Per l'Automobilista, che non appartiene a un ente, e per l'Amministratore, che consulta e gestisce tutti gli enti clienti (UC_ADM_1, UC_ADM_2; nel class diagram non ha associazioni con `EntePreposto`, a differenza dell'Ausiliario che «opera per» un ente), la cella è «n/a».
- **Pubblica:** route senza sessione per scelta documentata; le tre celle sono «n/a» e la nota cita la fonte e il test del comportamento senza cookie.

## 2. File di test

| Nome nella matrice            | File                                                            |
| :---------------------------- | :-------------------------------------------------------------- |
| `accesso.db.test.ts`          | `src/app/api/auth/accesso.db.test.ts`                           |
| `stalli.db.test.ts`           | `src/app/api/stalli/stalli.db.test.ts`                          |
| `walletSoste.db.test.ts`      | `src/app/api/soste/walletSoste.db.test.ts`                      |
| `importo.db.test.ts`          | `src/app/api/soste/importo/importo.db.test.ts`                  |
| `prolungamento.db.test.ts`    | `src/app/api/soste/[id]/prolungamento/prolungamento.db.test.ts` |
| `segnalazioni.db.test.ts`     | `src/app/api/ausiliario/segnalazioni.db.test.ts`                |
| `permessi.db.test.ts`         | `src/app/api/ausiliario/permessi.db.test.ts`                    |
| `amministrazione.db.test.ts`  | `src/app/api/admin/amministrazione.db.test.ts`                  |
| `sensori/…/route.db.test.ts`  | `src/app/api/sensori/rilevazioni/route.db.test.ts`              |
| `anpr/…/route.db.test.ts`     | `src/app/api/anpr/letture/route.db.test.ts`                     |
| `verificaPermesso.db.test.ts` | `src/application/segnalazioni/verificaPermesso.db.test.ts`      |

## 3. Matrice

### 3.1 Route pubbliche e dei simulatori

| #   | Metodo e percorso               | Ruoli ammessi                  | Senza sessione → 401                                  | Ruolo non ammesso → 403                                              | Altro ente → 403 o 404 | Note                                                                                                                                                                                              |
| :-- | :------------------------------ | :----------------------------- | :---------------------------------------------------- | :------------------------------------------------------------------- | :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `POST /api/auth/registrazione`  | pubblica                       | n/a                                                   | n/a                                                                  | n/a                    | UC_AUTH_1, `cp_apiAccesso.md` §2 (sessione: nessuna); senza cookie → 201: `accesso.db.test.ts` TF-ACC-01                                                                                          |
| 2   | `POST /api/auth/accesso`        | pubblica                       | n/a                                                   | n/a                                                                  | n/a                    | UC_AUTH_4, `cp_apiAccesso.md` §2 (sessione: nessuna); senza cookie → 200: `accesso.db.test.ts` TF-ACC-08                                                                                          |
| 3   | `POST /api/auth/uscita`         | pubblica, sessione facoltativa | n/a                                                   | n/a                                                                  | n/a                    | `cp_apiAccesso.md` §2 (sessione: facoltativa), idempotente; senza cookie → 204: `accesso.db.test.ts` TF-ACC-17                                                                                    |
| 4   | `GET /api/health/db`            | pubblica (infrastruttura)      | n/a                                                   | n/a                                                                  | n/a                    | stato del database, senza dati di utenti né di enti; usata senza sessione da `misura:anpr` (`report_requisiti_non_funzionali.md` §5, passo 6) ed esclusa dalla copertura come infrastruttura (§6) |
| 5   | `GET /api/auth/io`              | tutti i ruoli autenticati      | `accesso.db.test.ts` TF-ACC-13                        | n/a: nessun ruolo escluso (`cp_apiAccesso.md` §2, «qualsiasi ruolo») | n/a                    | anche TF-ACC-14 (sessione scaduta), TF-ACC-15 (inesistente)                                                                                                                                       |
| 6   | `POST /api/sensori/rilevazioni` | token del simulatore           | senza token → 401: `sensori/…/route.db.test.ts` TF-03 | n/a: nessun ruolo                                                    | n/a                    | anche TF-04 (token errato), TF-14 (`SIMULATORE_TOKEN` non configurata)                                                                                                                            |
| 7   | `POST /api/anpr/letture`        | token del simulatore           | senza token → 401: `anpr/…/route.db.test.ts` TF-02    | n/a: nessun ruolo                                                    | n/a                    | anche TF-03 (token errato), TF-13 (`SIMULATORE_TOKEN` non configurata)                                                                                                                            |

### 3.2 Route dell'Automobilista

| #   | Metodo e percorso                    | Ruoli ammessi                 | Senza sessione → 401                     | Ruolo non ammesso → 403                  | Altro ente → 403 o 404 | Note                                                                                                        |
| :-- | :----------------------------------- | :---------------------------- | :--------------------------------------- | :--------------------------------------- | :--------------------- | :---------------------------------------------------------------------------------------------------------- |
| 8   | `GET /api/automobilista/targhe`      | Automobilista (`UC_AUTH_5`)   | `accesso.db.test.ts` TF-ACC-19           | `accesso.db.test.ts` TF-ACC-21           | n/a                    |                                                                                                             |
| 9   | `POST /api/automobilista/targhe`     | Automobilista (`UC_AUTH_5`)   | `accesso.db.test.ts` TF-ACC-31           | `accesso.db.test.ts` TF-ACC-44           | n/a                    | TF-ACC-44 aggiunto con OMP-66                                                                               |
| 10  | `DELETE /api/automobilista/targhe`   | Automobilista (`UC_AUTH_5`)   | `accesso.db.test.ts` TF-ACC-45           | `accesso.db.test.ts` TF-ACC-46           | n/a                    | TF-ACC-45 e 46 aggiunti con OMP-66                                                                          |
| 11  | `GET /api/stalli`                    | Automobilista (`UC_STALLI_1`) | `stalli.db.test.ts` TF-API-STA-03        | `stalli.db.test.ts` TF-API-STA-05        | n/a                    |                                                                                                             |
| 12  | `GET /api/stalli/modifiche`          | Automobilista (`UC_STALLI_1`) | `stalli.db.test.ts` TF-API-STA-16        | `stalli.db.test.ts` TF-API-STA-17        | n/a                    |                                                                                                             |
| 13  | `GET /api/stalli/[id]`               | Automobilista (`UC_STALLI_2`) | `stalli.db.test.ts` TF-API-STA-21        | `stalli.db.test.ts` TF-API-STA-22        | n/a                    |                                                                                                             |
| 14  | `GET /api/wallet`                    | Automobilista (`UC_WALLET_3`) | `walletSoste.db.test.ts` TF-API-WS-03    | `walletSoste.db.test.ts` TF-API-WS-05    | n/a                    |                                                                                                             |
| 15  | `POST /api/wallet/ricarica`          | Automobilista (`UC_WALLET_1`) | `walletSoste.db.test.ts` TF-API-WS-09    | `walletSoste.db.test.ts` TF-API-WS-10    | n/a                    |                                                                                                             |
| 16  | `GET /api/wallet/movimenti`          | Automobilista (`UC_WALLET_3`) | `walletSoste.db.test.ts` TF-API-WS-45    | `walletSoste.db.test.ts` TF-API-WS-46    | n/a                    |                                                                                                             |
| 17  | `POST /api/soste`                    | Automobilista (`UC_SOSTA_1`)  | `walletSoste.db.test.ts` TF-API-WS-25    | `walletSoste.db.test.ts` TF-API-WS-27    | n/a                    | corpo multipart senza cookie → 401: TF-API-WS-43                                                            |
| 18  | `GET /api/soste`                     | Automobilista (`UC_SOSTA_1`)  | `walletSoste.db.test.ts` TF-API-WS-30    | `walletSoste.db.test.ts` TF-API-WS-31    | n/a                    |                                                                                                             |
| 19  | `GET /api/soste/importo`             | Automobilista (`UC_SOSTA_1`)  | `importo.db.test.ts` TF-API-IMP-14       | `importo.db.test.ts` TF-API-IMP-17       | n/a                    |                                                                                                             |
| 20  | `POST /api/soste/[id]/prolungamento` | Automobilista (`UC_SOSTA_2`)  | `prolungamento.db.test.ts` TF-API-PRO-16 | `prolungamento.db.test.ts` TF-API-PRO-18 | n/a                    | sosta di un altro Automobilista → 404 `SOSTA_INESISTENTE`: TF-API-PRO-04                                    |
| 21  | `GET /api/soste/[id]/prolungamento`  | Automobilista (`UC_SOSTA_2`)  | `prolungamento.db.test.ts` TF-API-PRO-17 | `prolungamento.db.test.ts` TF-API-PRO-20 | n/a                    | TF-API-PRO-20 aggiunto con OMP-66; sosta di un altro Automobilista → 404 `SOSTA_INESISTENTE`: TF-API-PRO-19 |

### 3.3 Route dell'Ausiliario del Traffico

| #   | Metodo e percorso                             | Ruoli ammessi          | Senza sessione → 401                    | Ruolo non ammesso → 403                 | Altro ente → 403 o 404                                      | Note                                                                           |
| :-- | :-------------------------------------------- | :--------------------- | :-------------------------------------- | :-------------------------------------- | :---------------------------------------------------------- | :----------------------------------------------------------------------------- |
| 22  | `GET /api/ausiliario/segnalazioni`            | Ausiliario (`UC_OP_1`) | `segnalazioni.db.test.ts` TF-API-SEG-05 | `segnalazioni.db.test.ts` TF-API-SEG-07 | `segnalazioni.db.test.ts` TF-API-SEG-03 (`ente=2` → 403)    | Ausiliario disattivato → 401: TF-API-SEG-08                                    |
| 23  | `GET /api/ausiliario/segnalazioni/modifiche`  | Ausiliario (`UC_OP_1`) | `segnalazioni.db.test.ts` TF-API-SEG-18 | `segnalazioni.db.test.ts` TF-API-SEG-17 | `segnalazioni.db.test.ts` TF-API-SEG-16 (`ente=2` → 403)    |                                                                                |
| 24  | `GET /api/ausiliario/permessi`                | Ausiliario (`UC_OP_1`) | `permessi.db.test.ts` TF-API-PER-02     | `permessi.db.test.ts` TF-API-PER-03     | escluso dall'elenco: `verificaPermesso.db.test.ts` TF-VP-13 | la route non riceve un ente: l'elenco è sempre quello dell'ente della sessione |
| 25  | `POST /api/segnalazioni/[id]/presa-in-carico` | Ausiliario (`UC_OP_2`) | `segnalazioni.db.test.ts` TF-API-SEG-33 | `segnalazioni.db.test.ts` TF-API-SEG-34 | `segnalazioni.db.test.ts` TF-API-SEG-35 (403)               |                                                                                |
| 26  | `GET /api/segnalazioni/[id]/pagamento`        | Ausiliario (`UC_OP_3`) | `segnalazioni.db.test.ts` TF-API-SEG-42 | `segnalazioni.db.test.ts` TF-API-SEG-43 | `segnalazioni.db.test.ts` TF-API-SEG-44 (403)               |                                                                                |
| 27  | `POST /api/segnalazioni/[id]/chiusura`        | Ausiliario (`UC_OP_4`) | `segnalazioni.db.test.ts` TF-API-SEG-29 | `segnalazioni.db.test.ts` TF-API-SEG-30 | `segnalazioni.db.test.ts` TF-API-SEG-24 (403)               |                                                                                |
| 28  | `GET /api/permessi/[sosta]/foto`              | Ausiliario (`UC_OP_5`) | `permessi.db.test.ts` TF-API-PER-05     | `permessi.db.test.ts` TF-API-PER-06     | `permessi.db.test.ts` TF-API-PER-07 (403)                   | dati personali; `Cache-Control: no-store` anche sugli errori                   |
| 29  | `POST /api/permessi/[sosta]/esito`            | Ausiliario (`UC_OP_5`) | `permessi.db.test.ts` TF-API-PER-13     | `permessi.db.test.ts` TF-API-PER-14     | `permessi.db.test.ts` TF-API-PER-15 (403)                   |                                                                                |

### 3.4 Route dell'Amministratore

| #   | Metodo e percorso                               | Ruoli ammessi               | Senza sessione → 401                       | Ruolo non ammesso → 403                    | Altro ente → 403 o 404 | Note                                |
| :-- | :---------------------------------------------- | :-------------------------- | :----------------------------------------- | :----------------------------------------- | :--------------------- | :---------------------------------- |
| 30  | `GET /api/admin/enti`                           | Amministratore (`UC_ADM_1`) | `amministrazione.db.test.ts` TF-API-ADM-02 | `amministrazione.db.test.ts` TF-API-ADM-03 | n/a                    | anche TF-API-ADM-04 (Automobilista) |
| 31  | `GET /api/admin/enti/[id]/riepilogo`            | Amministratore (`UC_ADM_1`) | `amministrazione.db.test.ts` TF-API-ADM-09 | `amministrazione.db.test.ts` TF-API-ADM-08 | n/a                    |                                     |
| 32  | `GET /api/admin/ausiliari`                      | Amministratore (`UC_ADM_2`) | `amministrazione.db.test.ts` TF-API-ADM-12 | `amministrazione.db.test.ts` TF-API-ADM-11 | n/a                    |                                     |
| 33  | `POST /api/admin/ausiliari`                     | Amministratore (`UC_ADM_2`) | `amministrazione.db.test.ts` TF-API-ADM-22 | `amministrazione.db.test.ts` TF-API-ADM-21 | n/a                    |                                     |
| 34  | `PUT /api/admin/ausiliari/[id]`                 | Amministratore (`UC_ADM_2`) | `amministrazione.db.test.ts` TF-API-ADM-35 | `amministrazione.db.test.ts` TF-API-ADM-34 | n/a                    | TF-API-ADM-35 aggiunto con OMP-66   |
| 35  | `POST /api/admin/ausiliari/[id]/disattivazione` | Amministratore (`UC_ADM_2`) | `amministrazione.db.test.ts` TF-API-ADM-33 | `amministrazione.db.test.ts` TF-API-ADM-32 | n/a                    |                                     |

## 4. Riepilogo

| Voce                                               | Valore                                                       |
| :------------------------------------------------- | :----------------------------------------------------------- |
| File di route in `src/app/api/`                    | 30                                                           |
| Righe della matrice (metodo e percorso)            | 35                                                           |
| Celle da coprire (escluse le «n/a»)                | 67: 2 senza token, 29 senza sessione, 28 di ruolo, 8 di ente |
| Celle coperte da test già presenti prima di OMP-66 | 62                                                           |
| Celle coperte dai test aggiunti con OMP-66         | 5: TF-ACC-44, 45, 46, TF-API-ADM-35, TF-API-PRO-20           |
| Celle «manca»                                      | 0                                                            |

Nessuna route ha mostrato un controllo mancante: tutte le route con sessione la controllano con `richiediSessione` (`GET /api/auth/io` con `utenteDellaSessione`, senza controllo dell'operazione) prima di validare corpo e parametri. L'ente della risorsa (segnalazione o sosta) lo controlla Segnalazioni prima di rivelarne lo stato: `src/application/segnalazioni/bloccoSegnalazione.ts` (presa in carico, stato del pagamento, chiusura), `verificaPermesso.ts` (foto ed esito del permesso), `ausiliario.ts` (elenco e variazioni delle segnalazioni dell'ente).

## 5. Scelte

1. **`GET /api/health/db`:** pubblica come infrastruttura. Restituisce solo lo stato e il nome del database, che `scripts/misuraAnpr.ts` usa per controllare di essere sul database di test (`report_requisiti_non_funzionali.md` §5, passo 6); nessun dato di utenti né di enti.
2. **`GET /api/ausiliario/permessi`, ente diverso:** la route non riceve un ente, quindi un rifiuto 403 o 404 non si può provocare. La cella cita la verifica del servizio: in TF-VP-13 la sosta `13d` sullo stallo 24 (ente 2) non compare nell'elenco dell'Ausiliario 2 (ente 1). Nessun test di route aggiunto.
3. **Celle coperte una volta sola:** per ogni cella si cita un test; gli altri test con lo stesso esito (sessione scaduta o inesistente, token errato, secondo ruolo non ammesso) sono nella colonna «Note».
