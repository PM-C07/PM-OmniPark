import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste, osservatoreGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { creaFacadeSegnalazioni } from "../segnalazioni/facade";
import { creaFacadeWallet } from "../wallet/facade";
import {
  chiudiSegnalazione,
  creaSegnalazioneDaLettura,
} from "../../persistence/accessoDati/segnalazioniVerifiche";
import { trovaStallo } from "../../persistence/accessoDati/stalliTariffe";
import {
  associaVeicolo,
  creaAutomobilista,
  trovaOCreaVeicolo,
} from "../../persistence/accessoDati/utentiEntiVeicoli";
import { creaSosta, trovaSosta } from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { creaEnteDiProva } from "../../persistence/test/datiDiProva";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeAmministrazione,
  ErroreAmministrazione,
  type CodiceErroreAmministrazione,
  type FacadeAmministrazione,
} from "./facade";

// Test frame TF-PAN-01…09 di docs/test/cp_panoramicaEnti.md (OMP-62).
// Le transazioni vanno in commit: i frame si eseguono nell'ordine della tabella (§3).
// TF-PAN-03 legge l'ente 1 prima che TF-PAN-05 vi aggiunga una sosta; TF-PAN-04 legge l'ente 3
// prima di TF-PAN-06.

const ADESSO = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => ADESSO };
const INESISTENTE = 999999;

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-62 · cp_panoramicaEnti", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§3) ---

  function composizione() {
    const pool = poolDiTest();
    const wallet = creaFacadeWallet({
      pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
      pool,
      orologio,
    });
    const gestioneSoste = creaFacadeGestioneSoste({ wallet, pool, orologio });
    const gestioneStalli = creaFacadeGestioneStalli({
      pool,
      orologio,
      osservatori: [osservatoreGestioneSoste],
    });
    const segnalazioni = creaFacadeSegnalazioni({ gestioneSoste, pool, orologio });
    const facade = creaFacadeAmministrazione({ gestioneStalli, gestioneSoste, segnalazioni, pool });
    return { gestioneStalli, facade };
  }

  function facade(): FacadeAmministrazione {
    return composizione().facade;
  }

  // Sosta di prova del frame n: automobilista panoramica.<n>@test.example, veicolo PA0<n>AA,
  // sosta PAGATA, poi lo stallo diventa Non disponibile.
  async function sostaDiProva(
    n: string,
    stallo: number,
    avvio: string,
    scadenza: string,
  ): Promise<number> {
    const pool = poolDiTest();
    const automobilistaId = await creaAutomobilista(pool, {
      email: `panoramica.${n}@test.example`,
      hashPassword: "hash-di-prova",
    });
    const veicoloId = await trovaOCreaVeicolo(pool, `PA0${n}AA`);
    await associaVeicolo(pool, automobilistaId, veicoloId);
    const id = await creaSosta(pool, {
      automobilistaId,
      veicoloId,
      stalloId: stallo,
      orarioDiAvvio: ora(avvio),
      orarioDiScadenza: ora(scadenza),
      pagamento: "PAGATA",
    });
    await composizione().gestioneStalli.impostaNonDisponibile(stallo);
    return id;
  }

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: CodiceErroreAmministrazione,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreAmministrazione);
    expect((ottenuto as ErroreAmministrazione).codice).toBe(codice);
  }

  it("RF_ADM_1 · TF-PAN-01 · più enti → elenco ordinato per nome (Baronissi, Fisciano, Gragnano)", async () => {
    expect(await facade().enti()).toEqual([
      { id: 3, nome: "Comune di Baronissi" },
      { id: 2, nome: "Comune di Fisciano" },
      { id: 1, nome: "Comune di Gragnano" },
    ]);
  });

  it("RF_ADM_1 · TF-PAN-02 · ente con stalli, soste attive e segnalazioni aperte → { 6, 1, 1 }", async () => {
    await sostaDiProva("02", 23, "09:00", "12:00");

    expect(await facade().riepilogo(2)).toEqual({
      stalliGestiti: 6,
      sosteAttive: 1,
      segnalazioniAperte: 1,
    });
  });

  it("RF_ADM_1 · TF-PAN-03 · ente senza soste attive, segnalazioni Aperta e Presa in carico → { 21, 0, 4 }", async () => {
    expect(await facade().riepilogo(1)).toEqual({
      stalliGestiti: 21,
      sosteAttive: 0,
      segnalazioniAperte: 4,
    });
  });

  it("RF_ADM_1 · TF-PAN-04 · ente senza segnalazioni aperte → { 3, 1, 0 }", async () => {
    await sostaDiProva("04", 29, "09:00", "12:00");

    expect(await facade().riepilogo(3)).toEqual({
      stalliGestiti: 3,
      sosteAttive: 1,
      segnalazioniAperte: 0,
    });
  });

  it("RF_ADM_1 · TF-PAN-05 · sosta con scadenza raggiunta → non contata, sosta Scaduta e stallo Occupato", async () => {
    const s = await sostaDiProva("05", 17, "08:00", "09:30");
    expect((await trovaSosta(poolDiTest(), s))?.stato).toBe("ATTIVA");

    expect(await facade().riepilogo(1)).toEqual({
      stalliGestiti: 21,
      sosteAttive: 0,
      segnalazioniAperte: 4,
    });
    expect((await trovaSosta(poolDiTest(), s))?.stato).toBe("SCADUTA");
    expect((await trovaStallo(poolDiTest(), 17))?.stato).toBe("OCCUPATO");
  });

  it("RF_ADM_1 · TF-PAN-06 · segnalazione chiusa → non contata, { 3, 1, 0 }", async () => {
    const pool = poolDiTest();
    const id = await creaSegnalazioneDaLettura(pool, {
      stalloId: 28,
      targa: "PA006AA",
      dataEOra: ora("09:00"),
      motivo: "SOSTA_ASSENTE",
    });
    expect(await chiudiSegnalazione(pool, id, 6, "NON_CONFERMATA", ora("09:30"))).toBe(true);

    expect(await facade().riepilogo(3)).toEqual({
      stalliGestiti: 3,
      sosteAttive: 1,
      segnalazioniAperte: 0,
    });
  });

  it("RF_ADM_1 · TF-PAN-07 · ente aggiunto senza stalli → compare in enti() ordinato per nome, riepilogo { 0, 0, 0 }", async () => {
    const ente = await creaEnteDiProva(poolDiTest(), "Ente di prova panoramica");
    const f = facade();

    expect(await f.enti()).toEqual([
      { id: 3, nome: "Comune di Baronissi" },
      { id: 2, nome: "Comune di Fisciano" },
      { id: 1, nome: "Comune di Gragnano" },
      { id: ente, nome: "Ente di prova panoramica" },
    ]);
    expect(await f.riepilogo(ente)).toEqual({
      stalliGestiti: 0,
      sosteAttive: 0,
      segnalazioniAperte: 0,
    });
  });

  it("RF_ADM_1 · TF-PAN-08 · ente inesistente → ENTE_INESISTENTE", async () => {
    await rifiutato(facade().riepilogo(INESISTENTE), "ENTE_INESISTENTE");
  });

  it("ISSUE_39 · TF-PAN-09 · id non valido (0, -1, 1.5) → ENTE_INESISTENTE", async () => {
    const f = facade();
    await rifiutato(f.riepilogo(0), "ENTE_INESISTENTE");
    await rifiutato(f.riepilogo(-1), "ENTE_INESISTENTE");
    await rifiutato(f.riepilogo(1.5), "ENTE_INESISTENTE");
  });
});
