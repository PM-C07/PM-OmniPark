import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeUtentiAccessi } from "../utenti-accessi/facade";
import { creaFacadeWallet } from "../wallet/facade";
import {
  creaSegnalazioneDaLettura,
  dettaglioSegnalazione,
  prendiInCarico,
} from "../../persistence/accessoDati/segnalazioniVerifiche";
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
  type Esito,
  type FacadeSegnalazioni,
} from "./facade";

// Test frame TF-CHI-01…13 di docs/test/cp_chiusuraSegnalazione.md (OMP-46).
// Le chiusure vanno in commit: ogni frame che chiude usa una segnalazione propria
// (11, 12, 5 del dataset o una segnalazione di prova); i frame di errore usano 4, 1, 10.

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const INESISTENTE = 999999;

const LETTURA_DI_PROVA = new Date("2026-11-20T09:00:00+01:00");
const PRESA_IN_CARICO_DI_PROVA = new Date("2026-11-20T09:30:00+01:00");
const PRESA_IN_CARICO_SEGNALAZIONE_5 = new Date("2026-11-04T09:21:00+01:00");

describe("OMP-46 · cp_chiusuraSegnalazione", () => {
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

  async function segnalazioneDiProva(
    stalloId: number,
    targa: string,
    presaInCaricoDa?: number,
  ): Promise<number> {
    const id = await creaSegnalazioneDaLettura(poolDiTest(), {
      stalloId,
      targa,
      dataEOra: LETTURA_DI_PROVA,
      motivo: "SOSTA_ASSENTE",
    });
    if (presaInCaricoDa !== undefined) {
      const presa = await prendiInCarico(
        poolDiTest(),
        id,
        presaInCaricoDa,
        PRESA_IN_CARICO_DI_PROVA,
      );
      expect(presa).toBe(true);
    }
    return id;
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
      esito: d.esito,
      dataEOraDellaPresaInCarico: d.dataEOraDellaPresaInCarico?.getTime() ?? null,
      dataEOraDellaChiusura: d.dataEOraDellaChiusura?.getTime() ?? null,
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

  // --- Chiusure riuscite ---

  it("RF_OP_6 · TF-CHI-01 · segnalazione aperta, esito accertata → CHIUSA, assegnata all'Ausiliario 2, data di chiusura T", async () => {
    await facade().chiudi(2, 11, "SOSTA_IRREGOLARE_ACCERTATA");

    const d = await dettaglio(11);
    expect(d.stato).toBe("CHIUSA");
    expect(d.ausiliarioId).toBe(2);
    expect(d.esito).toBe("SOSTA_IRREGOLARE_ACCERTATA");
    expect(d.dataEOraDellaChiusura?.getTime()).toBe(ADESSO.getTime());
    expect(d.dataEOraDellaPresaInCarico).toBeNull();
  });

  it("RF_OP_6 · TF-CHI-02 · segnalazione aperta di un altro ente, esito non confermata → CHIUSA, assegnata all'Ausiliario 5, data di chiusura T", async () => {
    await facade().chiudi(5, 12, "NON_CONFERMATA");

    const d = await dettaglio(12);
    expect(d.stato).toBe("CHIUSA");
    expect(d.ausiliarioId).toBe(5);
    expect(d.esito).toBe("NON_CONFERMATA");
    expect(d.dataEOraDellaChiusura?.getTime()).toBe(ADESSO.getTime());
  });

  it("RF_OP_6 · TF-CHI-03 · presa in carico dallo stesso Ausiliario → CHIUSA, presa in carico invariata", async () => {
    await facade().chiudi(2, 5, "NON_CONFERMATA");

    const d = await dettaglio(5);
    expect(d.stato).toBe("CHIUSA");
    expect(d.ausiliarioId).toBe(2);
    expect(d.esito).toBe("NON_CONFERMATA");
    expect(d.dataEOraDellaChiusura?.getTime()).toBe(ADESSO.getTime());
    expect(d.dataEOraDellaPresaInCarico?.getTime()).toBe(PRESA_IN_CARICO_SEGNALAZIONE_5.getTime());
  });

  // --- Errori ---

  it("VD_17 · TF-CHI-04 · presa in carico da un altro Ausiliario → SEGNALAZIONE_PRESA_DA_ALTRI", async () => {
    await verificaErroreEInvariata(
      4,
      () => facade().chiudi(2, 4, "NON_CONFERMATA"),
      "SEGNALAZIONE_PRESA_DA_ALTRI",
    );
  });

  it("RF_OP_6 · TF-CHI-05 · segnalazione già chiusa → SEGNALAZIONE_GIA_CHIUSA", async () => {
    await verificaErroreEInvariata(
      1,
      () => facade().chiudi(2, 1, "NON_CONFERMATA"),
      "SEGNALAZIONE_GIA_CHIUSA",
    );
  });

  it("RF_OP_6 · TF-CHI-06 · segnalazione inesistente → SEGNALAZIONE_INESISTENTE", async () => {
    await verificaErrore(
      facade().chiudi(2, INESISTENTE, "NON_CONFERMATA"),
      "SEGNALAZIONE_INESISTENTE",
    );
  });

  it("NRF_SIC_1 · TF-CHI-07 · segnalazione di un altro ente → ENTE_NON_AMMESSO", async () => {
    await verificaErroreEInvariata(
      10,
      () => facade().chiudi(5, 10, "NON_CONFERMATA"),
      "ENTE_NON_AMMESSO",
    );
  });

  it("NRF_SIC_1 · TF-CHI-08 · segnalazione chiusa di un altro ente → ENTE_NON_AMMESSO (non SEGNALAZIONE_GIA_CHIUSA)", async () => {
    await verificaErroreEInvariata(
      1,
      () => facade().chiudi(5, 1, "NON_CONFERMATA"),
      "ENTE_NON_AMMESSO",
    );
  });

  it("RF_OP_6 · TF-CHI-09 · esito mancante → ESITO_NON_VALIDO", async () => {
    await verificaErroreEInvariata(
      10,
      () => facade().chiudi(3, 10, undefined as unknown as Esito),
      "ESITO_NON_VALIDO",
    );
  });

  it("RF_OP_6 · TF-CHI-10 · esito non previsto → ESITO_NON_VALIDO", async () => {
    await verificaErroreEInvariata(
      10,
      () => facade().chiudi(3, 10, "ALTRO" as unknown as Esito),
      "ESITO_NON_VALIDO",
    );
  });

  it("VD_19 · TF-CHI-11 · Ausiliario disattivato → AUSILIARIO_NON_ATTIVO", async () => {
    const s = await segnalazioneDiProva(16, "CH11AA");

    await verificaErroreEInvariata(
      s,
      () => facade().chiudi(4, s, "NON_CONFERMATA"),
      "AUSILIARIO_NON_ATTIVO",
    );

    const d = await dettaglio(s);
    expect(d.stato).toBe("APERTA");
    expect(d.ausiliarioId).toBeNull();
  });

  it("RF_OP_6 · TF-CHI-12 · presa in carico di prova dallo stesso Ausiliario → CHIUSA, presa in carico 09:30, data di chiusura T", async () => {
    const s = await segnalazioneDiProva(17, "CH12AA", 3);

    await facade().chiudi(3, s, "SOSTA_IRREGOLARE_ACCERTATA");

    const d = await dettaglio(s);
    expect(d.stato).toBe("CHIUSA");
    expect(d.ausiliarioId).toBe(3);
    expect(d.esito).toBe("SOSTA_IRREGOLARE_ACCERTATA");
    expect(d.dataEOraDellaPresaInCarico?.getTime()).toBe(PRESA_IN_CARICO_DI_PROVA.getTime());
    expect(d.dataEOraDellaChiusura?.getTime()).toBe(ADESSO.getTime());
  });

  // --- Concorrenza ---

  it("ISSUE_10 · TF-CHI-13 · due Ausiliari chiudono insieme la stessa segnalazione aperta → una riesce, l'altra SEGNALAZIONE_GIA_CHIUSA", async () => {
    const s = await segnalazioneDiProva(19, "CH13AA");
    const f = facade();
    const chiamate: { ausiliario: number; esito: Esito }[] = [
      { ausiliario: 2, esito: "SOSTA_IRREGOLARE_ACCERTATA" },
      { ausiliario: 3, esito: "NON_CONFERMATA" },
    ];

    const risultati = await Promise.allSettled(
      chiamate.map((c) => f.chiudi(c.ausiliario, s, c.esito)),
    );

    const riuscite = risultati.filter((r) => r.status === "fulfilled");
    const fallite = risultati.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(riuscite).toHaveLength(1);
    expect(fallite).toHaveLength(1);
    expect(fallite[0].reason).toBeInstanceOf(ErroreSegnalazioni);
    expect((fallite[0].reason as ErroreSegnalazioni).codice).toBe("SEGNALAZIONE_GIA_CHIUSA");

    const vincente = chiamate[risultati.findIndex((r) => r.status === "fulfilled")];
    const d = await dettaglio(s);
    expect(d.stato).toBe("CHIUSA");
    expect(d.ausiliarioId).toBe(vincente.ausiliario);
    expect(d.esito).toBe(vincente.esito);
    expect(d.dataEOraDellaChiusura?.getTime()).toBe(ADESSO.getTime());
  });
});
