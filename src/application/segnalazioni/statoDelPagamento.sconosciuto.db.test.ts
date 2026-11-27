import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste, osservatoreGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { creaFacadeUtentiAccessi } from "../utenti-accessi/facade";
import { creaFacadeWallet } from "../wallet/facade";
import {
  creaSegnalazioneDaLettura,
  prendiInCarico,
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
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import { creaFacadeSegnalazioni, type FacadeSegnalazioni } from "./facade";

// Test frame TF-PAG-13 di docs/test/cp_statoDelPagamento.md, con l'ambiente della §6 (OMP-63,
// issue #40; ramo Sconosciuto di COD-23, OMP-64): preparazione propria, rilevazione dello stallo 21
// impostata esplicitamente a T, chiamata con la Facade di Segnalazioni a T2 = T + 2 min.

const T = new Date("2026-11-20T10:00:00+01:00");
const T2 = new Date(T.getTime() + 2 * 60 * 1000);

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-63 · cp_statoDelPagamento · stallo Sconosciuto", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§6) ---

  function facadeConOrologio(adesso: Date): FacadeSegnalazioni {
    const pool = poolDiTest();
    const orologio = { adesso: () => adesso };
    const wallet = creaFacadeWallet({
      pagamento: new SimulatorePagamento({ latenzaMs: 0 }),
      pool,
      orologio,
    });
    const gestioneSoste = creaFacadeGestioneSoste({ wallet, pool, orologio });
    const utentiAccessi = creaFacadeUtentiAccessi({ pool, orologio });
    return creaFacadeSegnalazioni({ gestioneSoste, pool, orologio, utentiAccessi });
  }

  function gestioneStalli() {
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [osservatoreGestioneSoste],
    });
  }

  it("RF_OP_4 · TF-PAG-13 · sosta attiva con scadenza raggiunta su uno stallo senza rilevazioni da più di 60 s → SCADUTA 09:00–10:01 PAGATA, stallo SCONOSCIUTO, sosta non TERMINATA", async () => {
    const pool = poolDiTest();
    const targa = "PG013AA";

    await gestioneStalli().registraRilevazione({ stallo: 21, presenza: true, dataOra: T });

    const automobilista = await creaAutomobilista(pool, {
      email: "pagamento.13@test.example",
      hashPassword: "hash-di-prova",
    });
    const veicolo = await trovaOCreaVeicolo(pool, targa);
    await associaVeicolo(pool, automobilista, veicolo);
    const sosta = await creaSosta(pool, {
      automobilistaId: automobilista,
      veicoloId: veicolo,
      stalloId: 21,
      orarioDiAvvio: ora("09:00"),
      orarioDiScadenza: ora("10:01"),
      pagamento: "PAGATA",
    });
    await gestioneStalli().impostaNonDisponibile(21);

    const s = await creaSegnalazioneDaLettura(pool, {
      stalloId: 21,
      targa,
      dataEOra: ora("09:50"),
      motivo: "SOSTA_ASSENTE",
    });
    expect(await prendiInCarico(pool, s, 2, ora("09:55"))).toBe(true);

    const risultato = await facadeConOrologio(T2).statoDelPagamento(2, s);

    expect(risultato).toEqual({
      sosta: {
        stato: "SCADUTA",
        orarioDiAvvio: ora("09:00"),
        orarioDiScadenza: ora("10:01"),
        pagamento: "PAGATA",
      },
    });

    const stallo = await trovaStallo(pool, 21);
    expect(stallo).not.toBeNull();
    expect(stallo!.stato).toBe("SCONOSCIUTO");
    const dopo = await trovaSosta(pool, sosta);
    expect(dopo).not.toBeNull();
    expect(dopo!.stato).toBe("SCADUTA");
  });
});
