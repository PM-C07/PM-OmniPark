import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeUtentiAccessi } from "../utenti-accessi/facade";
import { creaFacadeWallet } from "../wallet/facade";
import { creaSegnalazioneDaLettura } from "../../persistence/accessoDati/segnalazioniVerifiche";
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

// Test frame TF-ENT-01…13 di docs/test/cp_segnalazioniEnte.md (OMP-46).
// I frame vanno eseguiti nell'ordine della tabella: solo TF-ENT-12 scrive dati (ente 3, in commit).

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const INESISTENTE = 999999;

const PRIMA_DELLE_MODIFICHE = new Date("2026-11-15T07:59:59+01:00");
const ULTIMA_MODIFICA_DATASET = new Date("2026-11-15T08:00:00+01:00");

describe("OMP-46 · cp_segnalazioniEnte", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§3) ---

  function facade(): FacadeSegnalazioni {
    const pool = poolDiTest();
    const wallet = creaFacadeWallet({
      pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
      pool,
      orologio,
    });
    const gestioneSoste = creaFacadeGestioneSoste({ wallet, pool, orologio });
    const utentiAccessi = creaFacadeUtentiAccessi({ pool, orologio });
    return creaFacadeSegnalazioni({ gestioneSoste, pool, orologio, utentiAccessi });
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

  // --- segnalazioniNonChiuse: enti ---

  it("RF_OP_1 · TF-ENT-01 · ente con segnalazioni aperte, prese in carico e chiuse → [4, 5, 10, 11] senza le chiuse", async () => {
    const segnalazioni = await facade().segnalazioniNonChiuse(2, 1);

    expect(segnalazioni.map((s) => s.id)).toEqual([4, 5, 10, 11]);
    expect(segnalazioni.map((s) => s.stato)).toEqual([
      "PRESA_IN_CARICO",
      "PRESA_IN_CARICO",
      "PRESA_IN_CARICO",
      "APERTA",
    ]);
    const ids = segnalazioni.map((s) => s.id);
    for (const chiusa of [1, 2, 3, 6, 7, 8, 9]) {
      expect(ids).not.toContain(chiusa);
    }
  });

  it("RF_OP_1 · TF-ENT-02 · ente con una sola segnalazione aperta → [12] APERTA", async () => {
    const segnalazioni = await facade().segnalazioniNonChiuse(5, 2);

    expect(segnalazioni.map((s) => s.id)).toEqual([12]);
    expect(segnalazioni[0].stato).toBe("APERTA");
  });

  it("RF_OP_1 · TF-ENT-03 · ente senza segnalazioni → []", async () => {
    const segnalazioni = await facade().segnalazioniNonChiuse(6, 3);

    expect(segnalazioni).toEqual([]);
  });

  // --- segnalazioniNonChiuse: richiedenti non ammessi ---

  it("NRF_SIC_1 · TF-ENT-04 · ente di un altro Ausiliario → ENTE_NON_AMMESSO", async () => {
    await verificaErrore(facade().segnalazioniNonChiuse(2, 2), "ENTE_NON_AMMESSO");
  });

  it("VD_19 · TF-ENT-05 · Ausiliario disattivato → AUSILIARIO_NON_ATTIVO", async () => {
    await verificaErrore(facade().segnalazioniNonChiuse(4, 1), "AUSILIARIO_NON_ATTIVO");
  });

  it("NRF_SIC_1 · TF-ENT-06 · utente inesistente → AUSILIARIO_NON_ATTIVO", async () => {
    await verificaErrore(facade().segnalazioniNonChiuse(INESISTENTE, 1), "AUSILIARIO_NON_ATTIVO");
  });

  it("NRF_SIC_1 · TF-ENT-07 · utente che non è un Ausiliario → AUSILIARIO_NON_ATTIVO", async () => {
    await verificaErrore(facade().segnalazioniNonChiuse(7, 1), "AUSILIARIO_NON_ATTIVO");
  });

  // --- segnalazioniModificateDopo ---

  it("RF_OP_1 · TF-ENT-08 · istante precedente alle modifiche → [12] e cursore 2026-11-15 08:00:00+01", async () => {
    const r = await facade().segnalazioniModificateDopo(5, 2, PRIMA_DELLE_MODIFICHE);

    expect(r.segnalazioni.map((s) => s.id)).toEqual([12]);
    expect(r.cursore).not.toBeNull();
    expect(r.cursore!.getTime()).toBe(ULTIMA_MODIFICA_DATASET.getTime());
  });

  it("RF_OP_1 · TF-ENT-09 · istante uguale all'ultima modifica → nessuna segnalazione e cursore null", async () => {
    const r = await facade().segnalazioniModificateDopo(5, 2, ULTIMA_MODIFICA_DATASET);

    expect(r).toEqual({ segnalazioni: [], cursore: null });
  });

  it("NRF_SIC_1 · TF-ENT-10 · ente di un altro Ausiliario → ENTE_NON_AMMESSO", async () => {
    await verificaErrore(
      facade().segnalazioniModificateDopo(3, 2, PRIMA_DELLE_MODIFICHE),
      "ENTE_NON_AMMESSO",
    );
  });

  it("ISSUE_10 · TF-ENT-11 · istante non valido → ISTANTE_NON_VALIDO", async () => {
    await verificaErrore(
      facade().segnalazioniModificateDopo(6, 3, new Date("non valida")),
      "ISTANTE_NON_VALIDO",
    );
  });

  it("RF_OP_1 · TF-ENT-12 · segnalazione appena creata, poi cursore + 1 ms → solo la nuova APERTA con il suo cursore, poi nessuna e cursore null", async () => {
    const id = await creaSegnalazioneDaLettura(poolDiTest(), {
      stalloId: 28,
      targa: "EN12AA",
      dataEOra: new Date("2026-11-20T09:00:00+01:00"),
      motivo: "SOSTA_ASSENTE",
    });
    const f = facade();

    const prima = await f.segnalazioniModificateDopo(6, 3, ULTIMA_MODIFICA_DATASET);

    expect(prima.segnalazioni.map((s) => s.id)).toEqual([id]);
    expect(prima.segnalazioni[0].stato).toBe("APERTA");
    expect(prima.cursore).not.toBeNull();
    expect(prima.cursore!.getTime()).toBe(prima.segnalazioni[0].ultimaModifica.getTime());

    const seconda = await f.segnalazioniModificateDopo(
      6,
      3,
      new Date(prima.cursore!.getTime() + 1),
    );

    expect(seconda).toEqual({ segnalazioni: [], cursore: null });
  });

  it("VD_19 · TF-ENT-13 · Ausiliario disattivato → AUSILIARIO_NON_ATTIVO", async () => {
    await verificaErrore(
      facade().segnalazioniModificateDopo(4, 1, PRIMA_DELLE_MODIFICHE),
      "AUSILIARIO_NON_ATTIVO",
    );
  });
});
