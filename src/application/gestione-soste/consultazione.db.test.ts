import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { creaFacadeWallet } from "../wallet/facade";
import { trovaStallo, type StatoStallo } from "../../persistence/accessoDati/stalliTariffe";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  creaSosta,
  impostaSostaScaduta,
  terminaSosteScaduteDelloStallo,
  trovaSosta,
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { creaEnteDiProva, rilevazioniAllIstante } from "../../persistence/test/datiDiProva";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeGestioneSoste,
  ErroreGestioneSoste,
  osservatoreGestioneSoste,
  type CodiceErroreGestioneSoste,
  type FacadeGestioneSoste,
} from "./facade";

// Test frame TF-CNS-01…18 di docs/test/cp_consultazione.md (OMP-45; TF-CNS-16…18 OMP-46).

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const INESISTENTE = 999999;

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-45 · cp_consultazione", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
    // COD-23 (RF_IOT_2): rilevazioni recenti rispetto all'orologio dei test (§3).
    await rilevazioniAllIstante(poolDiTest(), ADESSO);
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§3) ---

  function facade(): FacadeGestioneSoste {
    const pool = poolDiTest();
    return creaFacadeGestioneSoste({
      wallet: creaFacadeWallet({
        pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
        pool,
        orologio,
      }),
      pool,
      orologio,
    });
  }

  function gestioneStalli() {
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [osservatoreGestioneSoste],
    });
  }

  type AutomobilistaDiProva = { id: number; veicoli: Record<string, number> };

  // Automobilista di prova: email consultazione.<n>@test.example e le targhe indicate.
  async function automobilista(
    suffisso: string,
    targhe: readonly string[],
  ): Promise<AutomobilistaDiProva> {
    const pool = poolDiTest();
    const id = await creaAutomobilista(pool, {
      email: `consultazione.${suffisso}@test.example`,
      hashPassword: "hash-di-prova",
    });
    const veicoli: Record<string, number> = {};
    for (const targa of targhe) {
      const veicoloId = await trovaOCreaVeicolo(pool, targa);
      await associaVeicolo(pool, id, veicoloId);
      veicoli[targa] = veicoloId;
    }
    return { id, veicoli };
  }

  type ModoSosta = "attiva" | "nonDisponibile" | "scaduta" | "terminata";

  async function sosta(
    proprietario: AutomobilistaDiProva,
    targa: string,
    stallo: number,
    avvio: string,
    scadenza: string,
    modo: ModoSosta,
  ): Promise<number> {
    const pool = poolDiTest();
    const id = await creaSosta(pool, {
      automobilistaId: proprietario.id,
      veicoloId: proprietario.veicoli[targa],
      stalloId: stallo,
      orarioDiAvvio: ora(avvio),
      orarioDiScadenza: ora(scadenza),
      pagamento: "PAGATA",
    });
    if (modo === "nonDisponibile") {
      await gestioneStalli().impostaNonDisponibile(stallo);
    }
    if (modo === "scaduta" || modo === "terminata") {
      expect(await impostaSostaScaduta(pool, id)).toBe(true);
    }
    if (modo === "terminata") {
      await terminaSosteScaduteDelloStallo(pool, stallo);
      expect((await trovaSosta(pool, id))?.stato).toBe("TERMINATA");
    }
    return id;
  }

  // --- Verifiche ---

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: CodiceErroreGestioneSoste,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreGestioneSoste);
    expect((ottenuto as ErroreGestioneSoste).codice).toBe(codice);
  }

  async function verificaStallo(id: number, stato: StatoStallo): Promise<void> {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    expect(stallo!.stato).toBe(stato);
  }

  // --- sostaInCorso ---

  it("ISSUE_9 · TF-CNS-01 · stallo senza soste → null", async () => {
    expect(await facade().sostaInCorso(16)).toBeNull();
  });

  it("RF_ANPR_1 · TF-CNS-02 · sosta attiva sullo stallo → la sosta Attiva con targa e orari", async () => {
    const c2 = await automobilista("2", ["CN002AA"]);
    const s = await sosta(c2, "CN002AA", 3, "09:00", "12:00", "nonDisponibile");

    const risultato = await facade().sostaInCorso(3);

    expect(risultato).not.toBeNull();
    expect(risultato!.id).toBe(s);
    expect(risultato!.stato).toBe("ATTIVA");
    expect(risultato!.targa).toBe("CN002AA");
    expect(risultato!.automobilistaId).toBe(c2.id);
    expect(risultato!.stalloId).toBe(3);
    expect(risultato!.orarioDiAvvio.getTime()).toBe(ora("09:00").getTime());
    expect(risultato!.orarioDiScadenza.getTime()).toBe(ora("12:00").getTime());
  });

  it("RF_ANPR_1 · TF-CNS-03 · sosta scaduta sullo stallo → la sosta Scaduta", async () => {
    const c3 = await automobilista("3", ["CN003AA"]);
    const s = await sosta(c3, "CN003AA", 7, "08:00", "09:00", "scaduta");

    const risultato = await facade().sostaInCorso(7);

    expect(risultato).not.toBeNull();
    expect(risultato!.id).toBe(s);
    expect(risultato!.stato).toBe("SCADUTA");
    expect(risultato!.targa).toBe("CN003AA");
  });

  it("RF_ANPR_1 · TF-CNS-04 · solo soste terminate sullo stallo → null", async () => {
    expect(await facade().sostaInCorso(11)).toBeNull();
  });

  it("RF_ANPR_1 · TF-CNS-05 · sosta attiva e scaduta sullo stallo → la attiva", async () => {
    const c5 = await automobilista("5", ["CN005AA"]);
    const c5b = await automobilista("5b", ["CN005BB"]);
    await sosta(c5, "CN005AA", 8, "08:00", "08:30", "scaduta");
    const s2 = await sosta(c5b, "CN005BB", 8, "09:00", "12:00", "nonDisponibile");

    const risultato = await facade().sostaInCorso(8);

    expect(risultato).not.toBeNull();
    expect(risultato!.id).toBe(s2);
    expect(risultato!.stato).toBe("ATTIVA");
    expect(risultato!.targa).toBe("CN005BB");
  });

  it("RF_SOSTA_7 · TF-CNS-06 · sosta attiva con scadenza raggiunta non allineata → Scaduta, stallo Occupato", async () => {
    const c6 = await automobilista("6", ["CN006AA"]);
    const s = await sosta(c6, "CN006AA", 17, "08:00", "09:30", "nonDisponibile");

    const risultato = await facade().sostaInCorso(17);

    expect(risultato).not.toBeNull();
    expect(risultato!.id).toBe(s);
    expect(risultato!.stato).toBe("SCADUTA");
    await verificaStallo(17, "OCCUPATO");
  });

  it("ISSUE_9 · TF-CNS-07 · stallo inesistente → null", async () => {
    expect(await facade().sostaInCorso(INESISTENTE)).toBeNull();
  });

  // --- contaSosteAttive ---

  it("RF_ADM_1 · TF-CNS-08 · ente con due soste attive → 2", async () => {
    const c8 = await automobilista("8", ["CN008AA"]);
    const c8b = await automobilista("8b", ["CN008BB"]);
    await sosta(c8, "CN008AA", 23, "09:00", "12:00", "nonDisponibile");
    await sosta(c8b, "CN008BB", 26, "09:00", "12:00", "nonDisponibile");

    expect(await facade().contaSosteAttive(2)).toBe(2);
  });

  it("RF_ADM_1 · TF-CNS-09 · ente con una sosta attiva e una con scadenza raggiunta → 1, la seconda Scaduta e stallo Occupato", async () => {
    const stato28 = await gestioneStalli().registraRilevazione({
      stallo: 28,
      presenza: true,
      dataOra: ADESSO, // COD-23: entro 60 s da T (§3)
    });
    expect(stato28).toBe("OCCUPATO");
    const c9 = await automobilista("9", ["CN009AA"]);
    const c9b = await automobilista("9b", ["CN009BB"]);
    await sosta(c9, "CN009AA", 28, "09:00", "12:00", "nonDisponibile");
    const s = await sosta(c9b, "CN009BB", 29, "08:00", "09:30", "nonDisponibile");

    const conteggio = await facade().contaSosteAttive(3);

    expect(conteggio).toBe(1);
    expect((await trovaSosta(poolDiTest(), s))?.stato).toBe("SCADUTA");
    await verificaStallo(29, "OCCUPATO");
  });

  it("RF_ADM_1 · TF-CNS-10 · ente senza aree di sosta → 0", async () => {
    const ente = await creaEnteDiProva(poolDiTest(), "Ente di prova consultazione");

    expect(await facade().contaSosteAttive(ente)).toBe(0);
  });

  it("RF_ADM_1 · TF-CNS-11 · ente inesistente → ENTE_INESISTENTE", async () => {
    await rifiutato(facade().contaSosteAttive(INESISTENTE), "ENTE_INESISTENTE");
  });

  // --- sosteDellAutomobilista ---

  it("ISSUE_9 · TF-CNS-12 · soste attiva, scaduta e terminata → [attiva, scaduta] senza la terminata", async () => {
    const c12 = await automobilista("12", ["CN012AA", "CN012BB"]);
    const s0 = await sosta(c12, "CN012AA", 12, "07:00", "07:30", "terminata");
    const s1 = await sosta(c12, "CN012AA", 18, "08:00", "08:30", "scaduta");
    const s2 = await sosta(c12, "CN012BB", 19, "09:00", "12:00", "nonDisponibile");

    const risultato = await facade().sosteDellAutomobilista(c12.id);

    expect(risultato.map((x) => x.id)).toEqual([s2, s1]);
    expect(risultato.map((x) => x.stato)).toEqual(["ATTIVA", "SCADUTA"]);
    expect(risultato.map((x) => x.id)).not.toContain(s0);
  });

  it("ISSUE_9 · TF-CNS-13 · automobilista con sole soste terminate → []", async () => {
    expect(await facade().sosteDellAutomobilista(8)).toEqual([]);
  });

  it("RF_SOSTA_7 · TF-CNS-14 · sosta attiva con scadenza raggiunta non allineata → [S] Scaduta, stallo Occupato", async () => {
    const c14 = await automobilista("14", ["CN014AA"]);
    const s = await sosta(c14, "CN014AA", 20, "08:00", "09:30", "nonDisponibile");

    const risultato = await facade().sosteDellAutomobilista(c14.id);

    expect(risultato.map((x) => x.id)).toEqual([s]);
    expect(risultato[0].stato).toBe("SCADUTA");
    await verificaStallo(20, "OCCUPATO");
  });

  it("ISSUE_9 · TF-CNS-15 · automobilista inesistente → []", async () => {
    expect(await facade().sosteDellAutomobilista(INESISTENTE)).toEqual([]);
  });

  // --- sosteInCorsoDellaTarga (OMP-46) ---

  it("RF_SOSTA_7 · TF-CNS-16 · sosta attiva con scadenza raggiunta non allineata → [S] Scaduta, stallo Occupato", async () => {
    const c16 = await automobilista("16", ["CN016AA"]);
    const s = await sosta(c16, "CN016AA", 21, "08:00", "09:30", "nonDisponibile");

    const risultato = await facade().sosteInCorsoDellaTarga("CN016AA");

    expect(risultato.map((x) => x.id)).toEqual([s]);
    expect(risultato[0].stato).toBe("SCADUTA");
    await verificaStallo(21, "OCCUPATO");
  });

  it("ISSUE_10 · TF-CNS-17 · sosta attiva, targa in minuscolo e con uno spazio → [S] Attiva con targa CN017AA", async () => {
    const c17 = await automobilista("17", ["CN017AA"]);
    const s = await sosta(c17, "CN017AA", 4, "09:00", "12:00", "nonDisponibile");

    const risultato = await facade().sosteInCorsoDellaTarga("cn017 aa");

    expect(risultato.map((x) => x.id)).toEqual([s]);
    expect(risultato[0].stato).toBe("ATTIVA");
    expect(risultato[0].targa).toBe("CN017AA");
  });

  it("ISSUE_10 · TF-CNS-18 · targa con sole soste terminate → []", async () => {
    const c18 = await automobilista("18", ["CN018AA"]);
    await sosta(c18, "CN018AA", 15, "07:00", "07:30", "terminata");

    expect(await facade().sosteInCorsoDellaTarga("CN018AA")).toEqual([]);
  });
});
