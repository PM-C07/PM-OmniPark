import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroreGestioneSoste } from "../../application/gestione-soste/facade";
import { ErroreGestioneStalli } from "../../application/gestione-stalli/facade";
import { ErroreSegnalazioni } from "../../application/segnalazioni/facade";
import { ErroreUtentiAccessi } from "../../application/utenti-accessi/facade";
import { ErroreWallet } from "../../application/wallet/facade";
import { ErroreApi, rispostaDaErrore, STATUS_PER_CODICE, type CodiceErrore } from "./_errori";

// Controllo automatico della tabella codici → status (OMP-48, piano approvato, punto 4).
// La completezza rispetto ai codici delle Facade la garantisce il tipo Record<CodiceErrore, …>
// (la compilazione fallisce se un codice resta senza status); qui si verificano i valori e la
// traduzione delle risposte.

const STATUS_AMMESSI = [401, 403, 404, 409, 422];

async function corpo(
  risposta: Response,
): Promise<{ errore: { codice: string; messaggio: string } }> {
  return (await risposta.json()) as { errore: { codice: string; messaggio: string } };
}

describe("OMP-48 · tabella codici → status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ISSUE_27 · ogni codice ha uno status tra 401, 403, 404, 409 e 422", () => {
    for (const [codice, status] of Object.entries(STATUS_PER_CODICE)) {
      expect(STATUS_AMMESSI, codice).toContain(status);
    }
  });

  it("ISSUE_27 · gli status dell'issue: sessione 401, ruolo ed ente 403, inesistente 404, conflitto 409, dati 422", () => {
    const attesi: Partial<Record<CodiceErrore, number>> = {
      SESSIONE_NON_VALIDA: 401,
      RUOLO_NON_AMMESSO: 403,
      ENTE_NON_AMMESSO: 403,
      STALLO_INESISTENTE: 404,
      SEGNALAZIONE_GIA_CHIUSA: 409,
      RICHIESTA_NON_VALIDA: 422,
    };
    for (const [codice, status] of Object.entries(attesi)) {
      expect(STATUS_PER_CODICE[codice as CodiceErrore], codice).toBe(status);
    }
  });

  it("ISSUE_27 · un errore di ogni Facade arriva con il suo codice, il suo messaggio e lo status della tabella", async () => {
    const errori = [
      new ErroreUtentiAccessi("SESSIONE_NON_VALIDA"),
      new ErroreGestioneStalli("ZONA_NON_VALIDA"),
      new ErroreWallet("IMPORTO_NON_PREVISTO"),
      new ErroreGestioneSoste("CREDITO_INSUFFICIENTE"),
      new ErroreSegnalazioni("SEGNALAZIONE_INESISTENTE"),
      new ErroreApi("RICHIESTA_NON_VALIDA"),
    ];
    for (const errore of errori) {
      const risposta = rispostaDaErrore(errore);
      expect(risposta.status, errore.codice).toBe(STATUS_PER_CODICE[errore.codice]);
      const { errore: dati } = await corpo(risposta);
      expect(dati).toEqual({ codice: errore.codice, messaggio: errore.message });
      expect(dati.messaggio.length).toBeGreaterThan(0);
    }
  });

  it("ISSUE_27 · un errore non previsto dà 500 ERRORE_INTERNO senza dettagli interni", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const risposta = rispostaDaErrore(new Error("password=segreta host=db.interno"));
    expect(risposta.status).toBe(500);
    const testo = JSON.stringify(await corpo(risposta));
    expect(testo).toContain("ERRORE_INTERNO");
    expect(testo).not.toContain("segreta");
    expect(testo).not.toContain("db.interno");
  });

  it("ISSUE_27 · il database non raggiungibile dà 503 DATABASE_NON_RAGGIUNGIBILE", async () => {
    const risposta = rispostaDaErrore({ codice: "DATABASE_NON_RAGGIUNGIBILE" });
    expect(risposta.status).toBe(503);
    expect((await corpo(risposta)).errore.codice).toBe("DATABASE_NON_RAGGIUNGIBILE");
  });
});
