import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { osservatoreGestioneSoste } from "../gestione-soste/facade";
import {
  trovaStallo,
  type OccupazioneRilevata,
  type StatoStallo,
} from "../../persistence/accessoDati/stalliTariffe";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import {
  creaSosta,
  impostaSostaScaduta,
  trovaSosta,
  type Pagamento,
  type StatoSosta,
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { creaAllineamentoTemporale, type EsitoAllineamento } from "./allineamento";

// Test frame TF-SCA-01…10 di docs/test/cp_scadenzaEFine.md (OMP-45).

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";

function ora(hhmmss: string): Date {
  const completo = hhmmss.length === 5 ? `${hhmmss}:00` : hhmmss;
  return new Date(`2026-11-20T${completo}+01:00`);
}

describe("OMP-45 · cp_scadenzaEFine · scadenza", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§3) ---

  function gestioneStalli() {
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [osservatoreGestioneSoste],
    });
  }

  function allineamento() {
    return creaAllineamentoTemporale({
      gestioneStalli: gestioneStalli(),
      pool: poolDiTest(),
      orologio,
    });
  }

  type AutomobilistaDiProva = { id: number; veicoloId: number };

  async function automobilista(email: string, targa: string): Promise<AutomobilistaDiProva> {
    const pool = poolDiTest();
    const id = await creaAutomobilista(pool, { email, hashPassword: "hash-di-prova" });
    const veicoloId = await trovaOCreaVeicolo(pool, targa);
    await associaVeicolo(pool, id, veicoloId);
    return { id, veicoloId };
  }

  type OpzioniSosta = {
    nonDisponibile?: boolean;
    scaduta?: boolean;
    pagamento?: Pagamento;
    permesso?: boolean;
  };

  async function sosta(
    proprietario: AutomobilistaDiProva,
    stallo: number,
    avvio: string,
    scadenza: string,
    opzioni: OpzioniSosta = {},
  ): Promise<number> {
    const pool = poolDiTest();
    const id = await creaSosta(pool, {
      automobilistaId: proprietario.id,
      veicoloId: proprietario.veicoloId,
      stalloId: stallo,
      orarioDiAvvio: ora(avvio),
      orarioDiScadenza: ora(scadenza),
      pagamento: opzioni.pagamento ?? "PAGATA",
      ...(opzioni.permesso
        ? { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: Buffer.alloc(1024, 0xff) }
        : {}),
    });
    if (opzioni.nonDisponibile) {
      await gestioneStalli().impostaNonDisponibile(stallo);
    }
    if (opzioni.scaduta) {
      expect(await impostaSostaScaduta(pool, id)).toBe(true);
    }
    return id;
  }

  async function rilevazione(stallo: number, presenza: boolean, dataOra: string): Promise<void> {
    await gestioneStalli().registraRilevazione({ stallo, presenza, dataOra: ora(dataOra) });
  }

  // --- Verifiche ---

  function nonCompare(esito: EsitoAllineamento, id: number): void {
    expect(esito.sosteScadute).not.toContain(id);
    expect(esito.sosteInConflitto).not.toContain(id);
    expect(esito.sosteAnomale).not.toContain(id);
  }

  async function verificaSosta(id: number, stato: StatoSosta) {
    const s = await trovaSosta(poolDiTest(), id);
    expect(s).not.toBeNull();
    expect(s!.stato).toBe(stato);
    return s!;
  }

  async function verificaStallo(id: number, stato: StatoStallo, occupazione?: OccupazioneRilevata) {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    expect(stallo!.stato).toBe(stato);
    if (occupazione !== undefined) {
      expect(stallo!.occupazioneRilevata).toBe(occupazione);
    }
    return stallo!;
  }

  // --- Orario di scadenza ---

  it("RF_SOSTA_7 · TF-SCA-01 · scadenza precedente all'istante corrente → SCADUTA, stallo Occupato", async () => {
    const a = await automobilista("scadenza.1@test.example", "SC001AA");
    const s = await sosta(a, 3, "08:00", "09:00", { nonDisponibile: true });

    const esito = await allineamento().allinea();

    expect(esito.sosteScadute).toContain(s);
    expect(esito.sosteAnomale).not.toContain(s);
    await verificaSosta(s, "SCADUTA");
    await verificaStallo(3, "OCCUPATO", "VEICOLO_PRESENTE");
  });

  it("RF_SOSTA_7 · TF-SCA-02 · scadenza uguale all'istante corrente → SCADUTA", async () => {
    const a = await automobilista("scadenza.2@test.example", "SC002AA");
    const s = await sosta(a, 7, "08:00", "10:00", { nonDisponibile: true });

    const esito = await allineamento().allinea();

    expect(esito.sosteScadute).toContain(s);
    await verificaSosta(s, "SCADUTA");
    await verificaStallo(7, "OCCUPATO");
  });

  it("RF_SOSTA_7 · TF-SCA-03 · scadenza successiva all'istante corrente → resta ATTIVA", async () => {
    const a = await automobilista("scadenza.3@test.example", "SC003AA");
    const s = await sosta(a, 8, "09:00", "10:00:01", { nonDisponibile: true });

    const esito = await allineamento().allinea();

    nonCompare(esito, s);
    await verificaSosta(s, "ATTIVA");
    await verificaStallo(8, "NON_DISPONIBILE");
  });

  // --- Ultima rilevazione ---

  it("RF_SOSTA_6 · TF-SCA-04 · ultima rilevazione nessun veicolo → TERMINATA, stallo Libero", async () => {
    await rilevazione(14, true, "09:00");
    const a = await automobilista("scadenza.4@test.example", "SC004AA");
    const s = await sosta(a, 14, "09:00", "10:00", {
      nonDisponibile: true,
      pagamento: "GRATUITA",
      permesso: true,
    });
    await rilevazione(14, false, "09:30");

    const esito = await allineamento().allinea();

    expect(esito.sosteScadute).toContain(s);
    const dopo = await verificaSosta(s, "TERMINATA");
    expect(dopo.dichiarazioneDiPermesso).toBeNull();
    expect(dopo.fotoDelPermesso).toBeNull();
    expect(dopo.pagamento).toBe("GRATUITA");
    await verificaStallo(14, "LIBERO", "NESSUN_VEICOLO");
  });

  // --- Stato della sosta ---

  it("VD_11 · TF-SCA-05 · sosta già scaduta → non compare, resta SCADUTA", async () => {
    const a = await automobilista("scadenza.5@test.example", "SC005AA");
    const s = await sosta(a, 17, "08:00", "09:00", { scaduta: true });

    const esito = await allineamento().allinea();

    nonCompare(esito, s);
    await verificaSosta(s, "SCADUTA");
    await verificaStallo(17, "OCCUPATO");
  });

  it("VD_11 · TF-SCA-06 · sosta terminata del dataset → non compare, resta TERMINATA", async () => {
    const esito = await allineamento().allinea();

    nonCompare(esito, 1);
    await verificaSosta(1, "TERMINATA");
    await verificaStallo(10, "LIBERO");
  });

  // --- Altre soste ---

  it("RF_SOSTA_7 · TF-SCA-07 · due soste scadute su stalli diversi → entrambe in sosteScadute, S1 SCADUTA e S2 TERMINATA", async () => {
    const a = await automobilista("scadenza.7@test.example", "SC007AA");
    const b = await automobilista("scadenza.7b@test.example", "SC007BB");
    const s1 = await sosta(a, 18, "08:00", "09:00", { nonDisponibile: true });
    const s2 = await sosta(b, 19, "08:00", "09:30", { nonDisponibile: true });
    await rilevazione(19, false, "09:30");

    const esito = await allineamento().allinea();

    expect(esito.sosteScadute).toContain(s1);
    expect(esito.sosteScadute).toContain(s2);
    await verificaSosta(s1, "SCADUTA");
    await verificaStallo(18, "OCCUPATO");
    await verificaSosta(s2, "TERMINATA");
    await verificaStallo(19, "LIBERO");
  });

  it("VD_11 · TF-SCA-08 · sosta già scaduta sullo stesso stallo → S2 in sosteScadute, S1 e S2 TERMINATA", async () => {
    const a = await automobilista("scadenza.8@test.example", "SC008AA");
    const s1 = await sosta(a, 20, "08:00", "08:30", { scaduta: true });
    const s2 = await sosta(a, 20, "08:45", "09:45", { nonDisponibile: true });
    await rilevazione(20, false, "09:30");

    const esito = await allineamento().allinea();

    expect(esito.sosteScadute).toContain(s2);
    nonCompare(esito, s1);
    await verificaSosta(s1, "TERMINATA");
    await verificaSosta(s2, "TERMINATA");
    await verificaStallo(20, "LIBERO");
  });

  it("ISSUE_9 · TF-SCA-09 · stallo non Non disponibile (dati incoerenti) → SCADUTA e anomala, stallo invariato", async () => {
    const a = await automobilista("scadenza.9@test.example", "SC009AA");
    const prima = await verificaStallo(21, "OCCUPATO");
    const s = await sosta(a, 21, "08:00", "09:00");

    const esito = await allineamento().allinea();

    expect(esito.sosteScadute).toContain(s);
    expect(esito.sosteAnomale).toContain(s);
    await verificaSosta(s, "SCADUTA");
    const dopo = await verificaStallo(21, "OCCUPATO");
    expect(dopo.occupazioneRilevata).toBe(prima.occupazioneRilevata);
    expect(dopo.dataEOraUltimaRilevazione?.getTime()).toBe(
      prima.dataEOraUltimaRilevazione?.getTime(),
    );
    expect(dopo.ultimaModifica.getTime()).toBe(prima.ultimaModifica.getTime());
  });

  // --- Concorrenza ---

  it("ISSUE_9 · TF-SCA-10 · due allineamenti contemporanei sulla stessa sosta → scaduta una sola volta, nessuna anomalia", async () => {
    const a = await automobilista("scadenza.10@test.example", "SC010AA");
    const s = await sosta(a, 23, "08:00", "09:00", { nonDisponibile: true });
    const dipendenze = { gestioneStalli: gestioneStalli(), pool: poolDiTest(), orologio };
    const primo = creaAllineamentoTemporale(dipendenze);
    const secondo = creaAllineamentoTemporale(dipendenze);

    const [e1, e2] = await Promise.all([primo.allinea(), secondo.allinea()]);

    const occorrenze = [e1, e2].filter((e) => e.sosteScadute.includes(s)).length;
    expect(occorrenze).toBe(1);
    for (const e of [e1, e2]) {
      expect(e.sosteAnomale).not.toContain(s);
      expect(e.sosteInConflitto).not.toContain(s);
    }
    await verificaSosta(s, "SCADUTA");
    await verificaStallo(23, "OCCUPATO");
  });
});
