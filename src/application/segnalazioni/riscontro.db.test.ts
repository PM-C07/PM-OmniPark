import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste, osservatoreGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { creaFacadeWallet } from "../wallet/facade";
import {
  dettaglioSegnalazione,
  esisteSegnalazioneNonChiusa,
  segnalazioniNonChiuseDellEnte,
} from "../../persistence/accessoDati/segnalazioniVerifiche";
import { trovaStallo, type StatoStallo } from "../../persistence/accessoDati/stalliTariffe";
import {
  associaVeicolo,
  creaAutomobilista,
  enti,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  creaSosta,
  impostaSostaScaduta,
  trovaSosta,
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { rilevazioniAllIstante } from "../../persistence/test/datiDiProva";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeSegnalazioni,
  ErroreSegnalazioni,
  type CodiceErroreSegnalazioni,
  type EsitoRiscontro,
  type FacadeSegnalazioni,
  type Lettura,
  type Motivo,
} from "./facade";

// Test frame TF-RIS-01…27 di docs/test/cp_riscontroAnpr.md (OMP-46).
// Le scritture vanno in commit: ogni frame usa stalli, automobilisti, veicoli e targhe propri.

const ADESSO = new Date("2026-11-20T10:00:00+01:00"); // T
const orologio = { adesso: () => ADESSO };
const INESISTENTE = 999999;

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

const LETTURA = ora("09:50"); // L, data e ora predefinita della lettura

describe("OMP-46 · cp_riscontroAnpr", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
    // COD-23 (RF_IOT_2): rilevazioni recenti rispetto all'orologio dei test (§3).
    await rilevazioniAllIstante(poolDiTest(), ADESSO);
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
    return creaFacadeSegnalazioni({ gestioneSoste, pool, orologio });
  }

  function gestioneStalli() {
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [osservatoreGestioneSoste],
    });
  }

  function leggi(targa: string, stallo: number, dataOra: Date = LETTURA): Promise<EsitoRiscontro> {
    return facade().elaboraLettura({ targa, stallo, dataOra });
  }

  // Stallo «portato a OCCUPATO» (§3).
  async function portaAOccupato(stallo: number): Promise<void> {
    const stato = await gestioneStalli().registraRilevazione({
      stallo,
      presenza: true,
      dataOra: ADESSO, // COD-23: entro 60 s da T (§3)
    });
    expect(stato).toBe("OCCUPATO");
  }

  type Proprietario = { automobilistaId: number; veicoloId: number };

  // Automobilista di prova riscontro.<targa minuscola>@test.example con il veicolo della targa.
  async function proprietario(targa: string): Promise<Proprietario> {
    const pool = poolDiTest();
    const automobilistaId = await creaAutomobilista(pool, {
      email: `riscontro.${targa.toLowerCase()}@test.example`,
      hashPassword: "hash-di-prova",
    });
    const veicoloId = await trovaOCreaVeicolo(pool, targa);
    await associaVeicolo(pool, automobilistaId, veicoloId);
    return { automobilistaId, veicoloId };
  }

  type ModoSosta = "attiva" | "scaduta" | "scadenzaRaggiunta";

  const ORARI: Record<ModoSosta, [string, string]> = {
    attiva: ["09:00", "12:00"],
    scaduta: ["08:00", "08:30"],
    scadenzaRaggiunta: ["08:00", "09:30"],
  };

  // «attiva»: 09:00 → 12:00 e stallo non disponibile; «scaduta»: 08:00 → 08:30 e impostaSostaScaduta;
  // «scadenzaRaggiunta» (TF-RIS-15): 08:00 → 09:30 e stallo non disponibile, senza allineamento.
  async function sosta(p: Proprietario, stallo: number, modo: ModoSosta): Promise<number> {
    const pool = poolDiTest();
    const [avvio, scadenza] = ORARI[modo];
    const id = await creaSosta(pool, {
      automobilistaId: p.automobilistaId,
      veicoloId: p.veicoloId,
      stalloId: stallo,
      orarioDiAvvio: ora(avvio),
      orarioDiScadenza: ora(scadenza),
      pagamento: "PAGATA",
    });
    if (modo === "scaduta") {
      expect(await impostaSostaScaduta(pool, id)).toBe(true);
    } else {
      await gestioneStalli().impostaNonDisponibile(stallo);
    }
    return id;
  }

  // --- Verifiche (§3) ---

  // Id delle segnalazioni non chiuse con la targa indicata, su tutti gli enti.
  async function nonChiuseDellaTarga(targa: string): Promise<number[]> {
    const pool = poolDiTest();
    const ids: number[] = [];
    for (const ente of await enti(pool)) {
      for (const s of await segnalazioniNonChiuseDellEnte(pool, ente.id)) {
        if (s.targaRilevata === targa) ids.push(s.id);
      }
    }
    return ids.sort((a, b) => a - b);
  }

  // Creata (C).
  async function verificaCreata(
    esito: EsitoRiscontro,
    atteso: { stallo: number; targa: string; dataOra: Date; motivo: Motivo },
  ): Promise<void> {
    expect(esito).toEqual({
      esito: "SEGNALAZIONE_CREATA",
      segnalazione: expect.any(Number),
      motivo: atteso.motivo,
    });
    if (esito.esito !== "SEGNALAZIONE_CREATA") return;
    const d = await dettaglioSegnalazione(poolDiTest(), esito.segnalazione);
    expect(d).not.toBeNull();
    expect(d!.stato).toBe("APERTA");
    expect(d!.stalloId).toBe(atteso.stallo);
    expect(d!.targaRilevata).toBe(atteso.targa);
    expect(d!.dataEOraDellaLettura?.getTime()).toBe(atteso.dataOra.getTime());
    expect(d!.motivo).toBe(atteso.motivo);
    expect(d!.ausiliarioId).toBeNull();
    expect(d!.assegnatario).toBeNull();
    expect(d!.esito).toBeNull();
  }

  // Nessuna (0).
  async function verificaNessuna(esito: EsitoRiscontro, targa: string): Promise<void> {
    expect(esito).toEqual({ esito: "NESSUNA_SEGNALAZIONE" });
    expect(await esisteSegnalazioneNonChiusa(poolDiTest(), targa)).toBe(false);
  }

  // Errore (E): l'errore indicato e, se la targa è valida, nessuna segnalazione non chiusa.
  async function verificaErrore(
    lettura: Lettura,
    codice: CodiceErroreSegnalazioni,
    targaValida: string | null,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await facade().elaboraLettura(lettura);
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreSegnalazioni);
    expect((ottenuto as ErroreSegnalazioni).codice).toBe(codice);
    if (targaValida !== null) {
      expect(await esisteSegnalazioneNonChiusa(poolDiTest(), targaValida)).toBe(false);
    }
  }

  async function verificaStallo(id: number, stato: StatoStallo): Promise<void> {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    expect(stallo!.stato).toBe(stato);
  }

  // --- Classificazione ---

  it("RF_ANPR_1 · TF-RIS-01 · nessuna sosta sullo stallo né altrove → SOSTA_ASSENTE", async () => {
    const esito = await leggi("RA01AA", 16);

    await verificaCreata(esito, {
      stallo: 16,
      targa: "RA01AA",
      dataOra: LETTURA,
      motivo: "SOSTA_ASSENTE",
    });
  });

  it("ISSUE_10 · TF-RIS-02 · nessuna sosta sullo stallo, targa con sosta attiva su un altro stallo → TARGA_NON_CORRISPONDENTE", async () => {
    await sosta(await proprietario("RA02AA"), 3, "attiva");

    const esito = await leggi("RA02AA", 1);

    await verificaCreata(esito, {
      stallo: 1,
      targa: "RA02AA",
      dataOra: LETTURA,
      motivo: "TARGA_NON_CORRISPONDENTE",
    });
  });

  it("NRF_AFF_2 · TF-RIS-03 · sosta attiva della stessa targa sullo stallo → NESSUNA_SEGNALAZIONE", async () => {
    await sosta(await proprietario("RA03AA"), 7, "attiva");

    const esito = await leggi("RA03AA", 7);

    await verificaNessuna(esito, "RA03AA");
  });

  it("RF_ANPR_1 · TF-RIS-04 · sosta attiva di un'altra targa sullo stallo → TARGA_NON_CORRISPONDENTE", async () => {
    await sosta(await proprietario("RA04BB"), 8, "attiva");

    const esito = await leggi("RA04AA", 8);

    await verificaCreata(esito, {
      stallo: 8,
      targa: "RA04AA",
      dataOra: LETTURA,
      motivo: "TARGA_NON_CORRISPONDENTE",
    });
  });

  it("RF_ANPR_1 · TF-RIS-05 · sosta attiva di un'altra targa sullo stallo e targa attiva altrove → TARGA_NON_CORRISPONDENTE", async () => {
    await sosta(await proprietario("RA05BB"), 11, "attiva");
    await sosta(await proprietario("RA05AA"), 12, "attiva");

    const esito = await leggi("RA05AA", 11);

    await verificaCreata(esito, {
      stallo: 11,
      targa: "RA05AA",
      dataOra: LETTURA,
      motivo: "TARGA_NON_CORRISPONDENTE",
    });
  });

  it("RF_ANPR_1 · TF-RIS-06 · sosta scaduta della stessa targa sullo stallo → SOSTA_SCADUTA", async () => {
    await sosta(await proprietario("RA06AA"), 17, "scaduta");

    const esito = await leggi("RA06AA", 17);

    await verificaCreata(esito, {
      stallo: 17,
      targa: "RA06AA",
      dataOra: LETTURA,
      motivo: "SOSTA_SCADUTA",
    });
  });

  it("ISSUE_10 · TF-RIS-07 · sosta scaduta della stessa targa sullo stallo e attiva altrove → SOSTA_SCADUTA", async () => {
    const p = await proprietario("RA07AA");
    await sosta(p, 18, "scaduta");
    await sosta(p, 19, "attiva");

    const esito = await leggi("RA07AA", 18);

    await verificaCreata(esito, {
      stallo: 18,
      targa: "RA07AA",
      dataOra: LETTURA,
      motivo: "SOSTA_SCADUTA",
    });
  });

  it("RF_ANPR_1 · TF-RIS-08 · sosta scaduta di un'altra targa sullo stallo → SOSTA_ASSENTE", async () => {
    await sosta(await proprietario("RA08BB"), 20, "scaduta");

    const esito = await leggi("RA08AA", 20);

    await verificaCreata(esito, {
      stallo: 20,
      targa: "RA08AA",
      dataOra: LETTURA,
      motivo: "SOSTA_ASSENTE",
    });
  });

  it("ISSUE_10 · TF-RIS-09 · sosta scaduta di un'altra targa sullo stallo e targa attiva altrove → TARGA_NON_CORRISPONDENTE", async () => {
    await sosta(await proprietario("RA09BB"), 21, "scaduta");
    await sosta(await proprietario("RA09AA"), 26, "attiva");

    const esito = await leggi("RA09AA", 21);

    await verificaCreata(esito, {
      stallo: 21,
      targa: "RA09AA",
      dataOra: LETTURA,
      motivo: "TARGA_NON_CORRISPONDENTE",
    });
  });

  it("NRF_AFF_2 · TF-RIS-10 · sosta attiva della stessa targa e scaduta di un'altra targa sullo stallo → NESSUNA_SEGNALAZIONE", async () => {
    await sosta(await proprietario("RA10BB"), 29, "scaduta");
    await sosta(await proprietario("RA10AA"), 29, "attiva");

    const esito = await leggi("RA10AA", 29);

    await verificaNessuna(esito, "RA10AA");
  });

  it("NRF_AFF_2 · TF-RIS-11 · sosta attiva e scaduta della stessa targa sullo stallo → NESSUNA_SEGNALAZIONE", async () => {
    const p = await proprietario("RA11AA");
    await sosta(p, 4, "scaduta");
    await sosta(p, 4, "attiva");

    const esito = await leggi("RA11AA", 4);

    await verificaNessuna(esito, "RA11AA");
  });

  it("ISSUE_10 · TF-RIS-12 · sosta scaduta della stessa targa e attiva di un'altra targa sullo stallo → SOSTA_SCADUTA", async () => {
    await sosta(await proprietario("RA12AA"), 15, "scaduta");
    await sosta(await proprietario("RA12BB"), 15, "attiva");

    const esito = await leggi("RA12AA", 15);

    await verificaCreata(esito, {
      stallo: 15,
      targa: "RA12AA",
      dataOra: LETTURA,
      motivo: "SOSTA_SCADUTA",
    });
  });

  it("RF_ANPR_1 · TF-RIS-13 · sosta attiva e scaduta di altre targhe sullo stallo → TARGA_NON_CORRISPONDENTE", async () => {
    await sosta(await proprietario("RA13CC"), 23, "scaduta");
    await sosta(await proprietario("RA13BB"), 23, "attiva");

    const esito = await leggi("RA13AA", 23);

    await verificaCreata(esito, {
      stallo: 23,
      targa: "RA13AA",
      dataOra: LETTURA,
      motivo: "TARGA_NON_CORRISPONDENTE",
    });
  });

  it("RF_ANPR_1 · TF-RIS-14 · sosta attiva e scaduta di altre targhe sullo stallo e targa attiva altrove → TARGA_NON_CORRISPONDENTE", async () => {
    await portaAOccupato(22);
    await portaAOccupato(27);
    await sosta(await proprietario("RA14CC"), 22, "scaduta");
    await sosta(await proprietario("RA14BB"), 22, "attiva");
    await sosta(await proprietario("RA14AA"), 27, "attiva");

    const esito = await leggi("RA14AA", 22);

    await verificaCreata(esito, {
      stallo: 22,
      targa: "RA14AA",
      dataOra: LETTURA,
      motivo: "TARGA_NON_CORRISPONDENTE",
    });
  });

  it("RF_SOSTA_7 · TF-RIS-15 · sosta attiva della stessa targa con scadenza raggiunta, non allineata → SOSTA_SCADUTA, sosta Scaduta e stallo Occupato", async () => {
    await portaAOccupato(28);
    const s = await sosta(await proprietario("RA15AA"), 28, "scadenzaRaggiunta");

    const esito = await leggi("RA15AA", 28);

    await verificaCreata(esito, {
      stallo: 28,
      targa: "RA15AA",
      dataOra: LETTURA,
      motivo: "SOSTA_SCADUTA",
    });
    expect((await trovaSosta(poolDiTest(), s))?.stato).toBe("SCADUTA");
    await verificaStallo(28, "OCCUPATO");
  });

  // --- Segnalazione non chiusa già presente per la targa ---

  it("VD_16 · TF-RIS-16 · targa con segnalazione aperta, esito con segnalazione → LETTURA_SCARTATA con SOSTA_ASSENTE", async () => {
    const pool = poolDiTest();
    const prima = await dettaglioSegnalazione(pool, 11);
    expect(prima).not.toBeNull();

    const esito = await leggi("HB204KM", 5);

    expect(esito).toEqual({ esito: "LETTURA_SCARTATA", motivo: "SOSTA_ASSENTE" });
    const dellEnte1 = (await segnalazioniNonChiuseDellEnte(pool, 1))
      .filter((s) => s.targaRilevata === "HB204KM")
      .map((s) => s.id);
    expect(dellEnte1).toEqual([11]);
    expect(await nonChiuseDellaTarga("HB204KM")).toEqual([11]);
    expect(await dettaglioSegnalazione(pool, 11)).toEqual(prima);
  });

  it("RF_ANPR_1 · TF-RIS-17 · targa con segnalazione aperta e sosta attiva sullo stallo → NESSUNA_SEGNALAZIONE, segnalazione 12 invariata", async () => {
    const pool = poolDiTest();
    await portaAOccupato(24);
    await sosta(await proprietario("KC562DF"), 24, "attiva");
    const prima = await dettaglioSegnalazione(pool, 12);
    expect(prima).not.toBeNull();

    const esito = await facade().elaboraLettura({
      targa: "KC562DF",
      stallo: 24,
      dataOra: LETTURA,
    });

    expect(esito).toEqual({ esito: "NESSUNA_SEGNALAZIONE" });
    expect(await nonChiuseDellaTarga("KC562DF")).toEqual([12]);
    expect(await dettaglioSegnalazione(pool, 12)).toEqual(prima);
  });

  // --- Concorrenza ---

  it("ISSUE_10 · TF-RIS-18 · due letture contemporanee della stessa targa → una SOSTA_ASSENTE creata, l'altra LETTURA_SCARTATA", async () => {
    const f = facade();
    const lettura: Lettura = { targa: "RA18AA", stallo: 6, dataOra: LETTURA };

    const esiti = await Promise.all([f.elaboraLettura(lettura), f.elaboraLettura(lettura)]);

    const create = esiti.filter((e) => e.esito === "SEGNALAZIONE_CREATA");
    const scartate = esiti.filter((e) => e.esito === "LETTURA_SCARTATA");
    expect(create).toHaveLength(1);
    expect(scartate).toEqual([{ esito: "LETTURA_SCARTATA", motivo: "SOSTA_ASSENTE" }]);
    await verificaCreata(create[0], {
      stallo: 6,
      targa: "RA18AA",
      dataOra: LETTURA,
      motivo: "SOSTA_ASSENTE",
    });
    const ids = await nonChiuseDellaTarga("RA18AA");
    expect(ids).toHaveLength(1);
    if (create[0].esito === "SEGNALAZIONE_CREATA") {
      expect(ids).toEqual([create[0].segnalazione]);
    }
  });

  // --- Targa e data accettate ---

  it("ISSUE_10 · TF-RIS-19 · targa in minuscolo e con uno spazio → SOSTA_ASSENTE con targa RA19AA", async () => {
    const esito = await facade().elaboraLettura({
      targa: "ra19 aa",
      stallo: 2,
      dataOra: LETTURA,
    });

    await verificaCreata(esito, {
      stallo: 2,
      targa: "RA19AA",
      dataOra: LETTURA,
      motivo: "SOSTA_ASSENTE",
    });
  });

  it("ISSUE_10 · TF-RIS-20 · data e ora uguale all'istante corrente → SOSTA_ASSENTE con data della lettura T", async () => {
    const esito = await leggi("RA20AA", 14, ADESSO);

    await verificaCreata(esito, {
      stallo: 14,
      targa: "RA20AA",
      dataOra: ADESSO,
      motivo: "SOSTA_ASSENTE",
    });
  });

  // --- Errori ---

  it("RF_ANPR_1 · TF-RIS-21 · targa vuota dopo la normalizzazione → LETTURA_INCOMPLETA", async () => {
    await verificaErrore(
      { targa: "   ", stallo: 10, dataOra: LETTURA },
      "LETTURA_INCOMPLETA",
      null,
    );
  });

  it("SCHEMA · TF-RIS-22 · targa con caratteri diversi da lettere e cifre → TARGA_NON_VALIDA", async () => {
    await verificaErrore(
      { targa: "RA22-AA", stallo: 13, dataOra: LETTURA },
      "TARGA_NON_VALIDA",
      null,
    );
  });

  it("RF_ANPR_1 · TF-RIS-23 · stallo inesistente → STALLO_INESISTENTE", async () => {
    await verificaErrore(
      { targa: "RA23AA", stallo: INESISTENTE, dataOra: LETTURA },
      "STALLO_INESISTENTE",
      "RA23AA",
    );
  });

  it("RF_ANPR_1 · TF-RIS-24 · stallo mancante → LETTURA_INCOMPLETA", async () => {
    await verificaErrore(
      { targa: "RA24AA", stallo: undefined, dataOra: LETTURA },
      "LETTURA_INCOMPLETA",
      "RA24AA",
    );
  });

  it("RF_ANPR_1 · TF-RIS-25 · data e ora mancante → LETTURA_INCOMPLETA", async () => {
    await verificaErrore(
      { targa: "RA25AA", stallo: 30, dataOra: undefined },
      "LETTURA_INCOMPLETA",
      "RA25AA",
    );
  });

  it("RF_ANPR_1 · TF-RIS-26 · data e ora non valida → LETTURA_INCOMPLETA", async () => {
    await verificaErrore(
      { targa: "RA26AA", stallo: 25, dataOra: new Date("non valida") },
      "LETTURA_INCOMPLETA",
      "RA26AA",
    );
  });

  it("SCHEMA · TF-RIS-27 · data e ora successiva all'istante corrente → LETTURA_NON_VALIDA", async () => {
    await verificaErrore(
      { targa: "RA27AA", stallo: 9, dataOra: new Date(ADESSO.getTime() + 1000) },
      "LETTURA_NON_VALIDA",
      "RA27AA",
    );
  });
});
