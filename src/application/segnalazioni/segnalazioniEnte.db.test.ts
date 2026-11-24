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
  type SegnalazioneMappa,
} from "./facade";

// Test frame TF-ENT-01…13 di docs/test/cp_segnalazioniEnte.md (OMP-46) e TF-ENT-14…22 (§7, OMP-48:
// fotografia e variazioni con il cursore del database).
// I frame vanno eseguiti nell'ordine della tabella: TF-ENT-12 scrive dati (ente 3, in commit);
// TF-ENT-15…18 creano segnalazioni in commit sugli stalli 22, 24 (ente 2), 29, 30 (ente 3).

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const INESISTENTE = 999999;

const PRIMA_DELLE_MODIFICHE = new Date("2026-11-15T07:59:59+01:00");
const ULTIMA_MODIFICA_DATASET = new Date("2026-11-15T08:00:00+01:00");
const ISTANTE_LETTURA = new Date("2026-11-20T09:00:00+01:00");
const SEI_SECONDI_MS = 6000;

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

  // --- OMP-48 · fotografiaSegnalazioni e variazioniDopo (§7) ---

  function conTarga(
    segnalazioni: SegnalazioneMappa[],
    targa: string,
  ): SegnalazioneMappa | undefined {
    return segnalazioni.find((s) => s.targaRilevata === targa);
  }

  function lettura(stalloId: number, targa: string) {
    return { stalloId, targa, dataEOra: ISTANTE_LETTURA, motivo: "SOSTA_ASSENTE" as const };
  }

  it("RF_OP_1 · TF-ENT-14 · fotografia dell'ente con segnalazioni → [12] e cursore Date valido", async () => {
    const r = await facade().fotografiaSegnalazioni(5, 2);

    expect(r.segnalazioni.map((s) => s.id)).toEqual([12]);
    expect(r.cursore).toBeInstanceOf(Date);
    expect(Number.isNaN(r.cursore.getTime())).toBe(false);
  });

  it("NRF_PER_3 · TF-ENT-15 · cursore precedente a una variazione → contiene EN15AA APERTA, cursore non precedente a c0", async () => {
    const f = facade();
    const c0 = (await f.fotografiaSegnalazioni(5, 2)).cursore;
    await creaSegnalazioneDaLettura(poolDiTest(), lettura(22, "EN15AA"));

    const r = await f.variazioniDopo(5, 2, c0);

    expect(conTarga(r.segnalazioni, "EN15AA")?.stato).toBe("APERTA");
    expect(r.cursore).toBeInstanceOf(Date);
    expect(r.cursore.getTime()).toBeGreaterThanOrEqual(c0.getTime());
  });

  it("ISSUE_10 · TF-ENT-16 · cursore appena restituito con variazione negli ultimi 5 s → r1 e r2 contengono EN16AA", async () => {
    const f = facade();
    const c0 = (await f.fotografiaSegnalazioni(5, 2)).cursore;
    await creaSegnalazioneDaLettura(poolDiTest(), lettura(24, "EN16AA"));

    const r1 = await f.variazioniDopo(5, 2, c0);
    const r2 = await f.variazioniDopo(5, 2, r1.cursore);

    expect(conTarga(r1.segnalazioni, "EN16AA")).toBeDefined();
    expect(conTarga(r2.segnalazioni, "EN16AA")).toBeDefined();
  });

  it("NRF_PER_3 · TF-ENT-17 · cursore successivo all'ultima variazione di più di 5 s → r1 con EN17AA, r2 vuoto", async () => {
    const f = facade();
    const c0 = (await f.fotografiaSegnalazioni(6, 3)).cursore;
    await creaSegnalazioneDaLettura(poolDiTest(), lettura(29, "EN17AA"));

    const r1 = await f.variazioniDopo(6, 3, c0);
    expect(conTarga(r1.segnalazioni, "EN17AA")).toBeDefined();

    const r2 = await f.variazioniDopo(6, 3, new Date(r1.cursore.getTime() + SEI_SECONDI_MS));
    expect(r2.segnalazioni).toEqual([]);
  });

  it("NRF_PER_3 · TF-ENT-18 · variazione confermata con ritardo entro il margine → r1 senza EN18AA, r2 con EN18AA", async () => {
    const f = facade();
    const c0 = (await f.fotografiaSegnalazioni(6, 3)).cursore;

    const client = await poolDiTest().connect();
    let r1: { segnalazioni: SegnalazioneMappa[]; cursore: Date } | undefined;
    try {
      await client.query("BEGIN");
      await creaSegnalazioneDaLettura(client, lettura(30, "EN18AA"));
      r1 = await f.variazioniDopo(6, 3, c0);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    expect(r1).toBeDefined();
    const r2 = await f.variazioniDopo(6, 3, r1!.cursore);

    expect(conTarga(r1!.segnalazioni, "EN18AA")).toBeUndefined();
    expect(conTarga(r2.segnalazioni, "EN18AA")).toBeDefined();
  });

  it("NRF_SIC_1 · TF-ENT-19 · variazioniDopo con ente di un altro Ausiliario → ENTE_NON_AMMESSO", async () => {
    await verificaErrore(facade().variazioniDopo(2, 2, ISTANTE_LETTURA), "ENTE_NON_AMMESSO");
  });

  it("ISSUE_10 · TF-ENT-20 · variazioniDopo con cursore non valido → ISTANTE_NON_VALIDO", async () => {
    await verificaErrore(
      facade().variazioniDopo(6, 3, new Date("non valida")),
      "ISTANTE_NON_VALIDO",
    );
  });

  it("VD_19 · TF-ENT-21 · fotografiaSegnalazioni di un Ausiliario disattivato → AUSILIARIO_NON_ATTIVO", async () => {
    await verificaErrore(facade().fotografiaSegnalazioni(4, 1), "AUSILIARIO_NON_ATTIVO");
  });

  it("NRF_SIC_1 · TF-ENT-22 · fotografiaSegnalazioni con ente di un altro Ausiliario → ENTE_NON_AMMESSO", async () => {
    await verificaErrore(facade().fotografiaSegnalazioni(2, 2), "ENTE_NON_AMMESSO");
  });
});
