import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste } from "../gestione-soste/facade";
import {
  creaFacadeUtentiAccessi,
  ErroreUtentiAccessi,
  type FacadeUtentiAccessi,
} from "../utenti-accessi/facade";
import { creaFacadeWallet } from "../wallet/facade";
import {
  creaSegnalazioneDaLettura,
  dettaglioSegnalazione,
} from "../../persistence/accessoDati/segnalazioniVerifiche";
import { creaAusiliario, trovaAusiliario } from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeSegnalazioni,
  ErroreSegnalazioni,
  type CodiceErroreSegnalazioni,
  type FacadeSegnalazioni,
} from "./facade";

// Test frame TF-PIC-01…10 di docs/test/cp_presaInCarico.md (OMP-63, issue #40).
// Le transazioni vanno in commit (§3): i frame che leggono il dataset usano le segnalazioni 1, 4, 5,
// che nessun frame modifica; quelli che scrivono usano una segnalazione di prova propria
// (stalli 16…20, targa PC<n>AA).

const T = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => T };
const INESISTENTE = 999999;
const LETTURA_DI_PROVA = new Date("2026-11-20T09:00:00+01:00");
const PRESA_IN_CARICO_SEGNALAZIONE_5 = new Date("2026-11-04T09:21:00+01:00");

describe("OMP-63 · cp_presaInCarico", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§3) ---

  function utentiAccessi(): FacadeUtentiAccessi {
    return creaFacadeUtentiAccessi({ pool: poolDiTest(), orologio });
  }

  function facade(): FacadeSegnalazioni {
    const pool = poolDiTest();
    const wallet = creaFacadeWallet({
      pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
      pool,
      orologio,
    });
    const gestioneSoste = creaFacadeGestioneSoste({ wallet, pool, orologio });
    return creaFacadeSegnalazioni({
      gestioneSoste,
      pool,
      orologio,
      utentiAccessi: utentiAccessi(),
    });
  }

  async function verificaErrore(
    operazione: Promise<unknown>,
    codice: CodiceErroreSegnalazioni,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreSegnalazioni);
    expect((ottenuto as ErroreSegnalazioni).codice).toBe(codice);
  }

  // Segnalazione di prova del frame n: targa PC<nn>AA, lettura 09:00, SOSTA_ASSENTE, APERTA.
  async function segnalazioneDiProva(n: number, stalloId: number): Promise<number> {
    return creaSegnalazioneDaLettura(poolDiTest(), {
      stalloId,
      targa: `PC${String(n).padStart(2, "0")}AA`,
      dataEOra: LETTURA_DI_PROVA,
      motivo: "SOSTA_ASSENTE",
    });
  }

  async function dettaglio(id: number) {
    const d = await dettaglioSegnalazione(poolDiTest(), id);
    expect(d).not.toBeNull();
    return d!;
  }

  // Campi confrontati per «invariata» (§3).
  async function istantanea(id: number) {
    const d = await dettaglio(id);
    return {
      stato: d.stato,
      ausiliarioId: d.ausiliarioId,
      assegnatario: d.assegnatario?.id ?? null,
      dataEOraDellaPresaInCarico: d.dataEOraDellaPresaInCarico?.getTime() ?? null,
      ultimaModifica: d.ultimaModifica.getTime(),
    };
  }

  async function verificaErroreEInvariata(
    id: number,
    operazione: () => Promise<unknown>,
    codice: CodiceErroreSegnalazioni,
  ): Promise<void> {
    const prima = await istantanea(id);
    await verificaErrore(operazione(), codice);
    expect(await istantanea(id)).toEqual(prima);
  }

  // --- Presa in carico riuscita ---

  it("RF_OP_3 · TF-PIC-01 · segnalazione aperta dell'ente dell'Ausiliario 2 → PRESA_IN_CARICO dall'Ausiliario 2, ORDINARIO_A_PAGAMENTO, presa in carico a T", async () => {
    const s = await segnalazioneDiProva(1, 16);
    const prima = await dettaglio(s);
    expect(prima.stato).toBe("APERTA");

    const risultato = await facade().prendiInCarico(2, s);

    expect(risultato.id).toBe(s);
    expect(risultato.stato).toBe("PRESA_IN_CARICO");
    expect(risultato.ausiliarioId).toBe(2);
    expect(risultato.tipoDiStallo).toBe("ORDINARIO_A_PAGAMENTO");

    const d = await dettaglio(s);
    expect(d.stato).toBe("PRESA_IN_CARICO");
    expect(d.ausiliarioId).toBe(2);
    expect(d.assegnatario?.id).toBe(2);
    expect(d.dataEOraDellaPresaInCarico?.getTime()).toBe(T.getTime());
    expect(d.ultimaModifica.getTime()).toBeGreaterThan(prima.ultimaModifica.getTime());
  });

  // --- Errori e presa ripetuta ---

  it("VD_17 · TF-PIC-02 · presa in carico da un altro Ausiliario → SEGNALAZIONE_PRESA_DA_ALTRI, invariata", async () => {
    await verificaErroreEInvariata(
      4,
      () => facade().prendiInCarico(2, 4),
      "SEGNALAZIONE_PRESA_DA_ALTRI",
    );
  });

  it("RF_OP_3 · TF-PIC-03 · segnalazione già chiusa → SEGNALAZIONE_GIA_CHIUSA, invariata", async () => {
    await verificaErroreEInvariata(
      1,
      () => facade().prendiInCarico(2, 1),
      "SEGNALAZIONE_GIA_CHIUSA",
    );
  });

  it("ISSUE_40 · TF-PIC-04 · presa in carico ripetuta dallo stesso Ausiliario → nessun errore, la 5 dell'Ausiliario 2 invariata", async () => {
    const prima = await istantanea(5);

    const risultato = await facade().prendiInCarico(2, 5);

    expect(risultato.id).toBe(5);
    expect(risultato.stato).toBe("PRESA_IN_CARICO");
    expect(risultato.ausiliarioId).toBe(2);
    expect(await istantanea(5)).toEqual(prima);
    expect((await dettaglio(5)).dataEOraDellaPresaInCarico?.getTime()).toBe(
      PRESA_IN_CARICO_SEGNALAZIONE_5.getTime(),
    );
  });

  it("NRF_SIC_1 · TF-PIC-05 · segnalazione di un altro ente → ENTE_NON_AMMESSO, resta APERTA", async () => {
    const s = await segnalazioneDiProva(5, 17);

    await verificaErroreEInvariata(s, () => facade().prendiInCarico(5, s), "ENTE_NON_AMMESSO");

    const d = await dettaglio(s);
    expect(d.stato).toBe("APERTA");
    expect(d.ausiliarioId).toBeNull();
  });

  it("NRF_SIC_1 · TF-PIC-06 · segnalazione chiusa di un altro ente → ENTE_NON_AMMESSO (non SEGNALAZIONE_GIA_CHIUSA)", async () => {
    await verificaErroreEInvariata(1, () => facade().prendiInCarico(5, 1), "ENTE_NON_AMMESSO");
  });

  it("RF_OP_3 · TF-PIC-07 · segnalazione inesistente → SEGNALAZIONE_INESISTENTE", async () => {
    await verificaErrore(facade().prendiInCarico(2, INESISTENTE), "SEGNALAZIONE_INESISTENTE");
  });

  it("VD_19 · TF-PIC-08 · Ausiliario disattivato → AUSILIARIO_NON_ATTIVO, invariata", async () => {
    const s = await segnalazioneDiProva(8, 18);

    await verificaErroreEInvariata(s, () => facade().prendiInCarico(4, s), "AUSILIARIO_NON_ATTIVO");

    const d = await dettaglio(s);
    expect(d.stato).toBe("APERTA");
    expect(d.ausiliarioId).toBeNull();
  });

  // --- Concorrenza ---

  it("VD_17 · TF-PIC-09 · due Ausiliari insieme sulla stessa segnalazione aperta → una riesce, l'altra SEGNALAZIONE_PRESA_DA_ALTRI", async () => {
    const s = await segnalazioneDiProva(9, 19);
    const f = facade();
    const ausiliari = [2, 3];

    const risultati = await Promise.allSettled(ausiliari.map((a) => f.prendiInCarico(a, s)));

    const riuscite = risultati.filter((r) => r.status === "fulfilled");
    const fallite = risultati.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(riuscite).toHaveLength(1);
    expect(fallite).toHaveLength(1);
    expect(fallite[0].reason).toBeInstanceOf(ErroreSegnalazioni);
    expect((fallite[0].reason as ErroreSegnalazioni).codice).toBe("SEGNALAZIONE_PRESA_DA_ALTRI");

    const vincente = ausiliari[risultati.findIndex((r) => r.status === "fulfilled")];
    const d = await dettaglio(s);
    expect(d.stato).toBe("PRESA_IN_CARICO");
    expect(d.ausiliarioId).toBe(vincente);
  });

  it("VD_19 · TF-PIC-10 · presa in carico e disattivazione dell'Ausiliario insieme → riesce esattamente una delle due", async () => {
    const a = await creaAusiliario(poolDiTest(), {
      email: "pic.10@test.example",
      hashPassword: "hash-di-prova",
      nome: "Nome10",
      cognome: "Cognome10",
      enteId: 1,
      amministratoreId: 1,
    });
    const s = await segnalazioneDiProva(10, 20);
    const f = facade();
    const u = utentiAccessi();

    const [presa, disattivazione] = await Promise.allSettled([
      f.prendiInCarico(a, s),
      u.disattivaAusiliario(a),
    ]);

    expect([presa.status, disattivazione.status].filter((x) => x === "fulfilled")).toHaveLength(1);

    const ausiliario = await trovaAusiliario(poolDiTest(), a);
    const d = await dettaglio(s);
    if (presa.status === "fulfilled") {
      expect(disattivazione.status).toBe("rejected");
      const motivo = (disattivazione as PromiseRejectedResult).reason;
      expect(motivo).toBeInstanceOf(ErroreUtentiAccessi);
      expect((motivo as ErroreUtentiAccessi).codice).toBe(
        "AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO",
      );
      expect(ausiliario?.statoDellAccount).toBe("ATTIVO");
      expect(d.stato).toBe("PRESA_IN_CARICO");
      expect(d.ausiliarioId).toBe(a);
    } else {
      expect(disattivazione.status).toBe("fulfilled");
      const motivo = presa.reason;
      expect(motivo).toBeInstanceOf(ErroreSegnalazioni);
      expect((motivo as ErroreSegnalazioni).codice).toBe("AUSILIARIO_NON_ATTIVO");
      expect(ausiliario?.statoDellAccount).toBe("DISATTIVATO");
      expect(d.stato).toBe("APERTA");
      expect(d.ausiliarioId).toBeNull();
    }
  });
});
