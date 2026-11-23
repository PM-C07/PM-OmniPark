import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
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
  type StatoSosta,
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { osservatoreGestioneSoste } from "./facade";

// Test frame TF-FIN-01…04 di docs/test/cp_scadenzaEFine.md (OMP-45).

const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-45 · cp_scadenzaEFine · fine", () => {
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

  type AutomobilistaDiProva = { id: number; veicoloId: number };

  async function automobilista(email: string, targa: string): Promise<AutomobilistaDiProva> {
    const pool = poolDiTest();
    const id = await creaAutomobilista(pool, { email, hashPassword: "hash-di-prova" });
    const veicoloId = await trovaOCreaVeicolo(pool, targa);
    await associaVeicolo(pool, id, veicoloId);
    return { id, veicoloId };
  }

  async function sosta(
    proprietario: AutomobilistaDiProva,
    stallo: number,
    avvio: string,
    scadenza: string,
    opzioni: { nonDisponibile?: boolean; scaduta?: boolean; permesso?: boolean } = {},
  ): Promise<number> {
    const pool = poolDiTest();
    const id = await creaSosta(pool, {
      automobilistaId: proprietario.id,
      veicoloId: proprietario.veicoloId,
      stalloId: stallo,
      orarioDiAvvio: ora(avvio),
      orarioDiScadenza: ora(scadenza),
      pagamento: "PAGATA",
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

  // Operazione verificata: presenza falsa alle 10:30.
  function liberazione(stallo: number): Promise<StatoStallo> {
    return gestioneStalli().registraRilevazione({ stallo, presenza: false, dataOra: ora("10:30") });
  }

  // --- Verifiche ---

  async function verificaSosta(id: number, stato: StatoSosta) {
    const s = await trovaSosta(poolDiTest(), id);
    expect(s).not.toBeNull();
    expect(s!.stato).toBe(stato);
    return s!;
  }

  async function verificaStallo(
    id: number,
    stato: StatoStallo,
    occupazione?: OccupazioneRilevata,
  ): Promise<void> {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    expect(stallo!.stato).toBe(stato);
    if (occupazione !== undefined) {
      expect(stallo!.occupazioneRilevata).toBe(occupazione);
    }
  }

  it("RF_IOT_1 · TF-FIN-01 · stallo liberato senza soste → LIBERO senza errore", async () => {
    expect(await liberazione(29)).toBe("LIBERO");
    await verificaStallo(29, "LIBERO");
  });

  it("VD_20 · TF-FIN-02 · veicolo che lascia lo stallo con sosta attiva → NON_DISPONIBILE, sosta ATTIVA", async () => {
    const a = await automobilista("fine.2@test.example", "FI002AA");
    const s = await sosta(a, 12, "09:00", "12:00", { nonDisponibile: true });

    expect(await liberazione(12)).toBe("NON_DISPONIBILE");

    const dopo = await verificaSosta(s, "ATTIVA");
    expect(dopo.orarioDiAvvio.getTime()).toBe(ora("09:00").getTime());
    expect(dopo.orarioDiScadenza.getTime()).toBe(ora("12:00").getTime());
    await verificaStallo(12, "NON_DISPONIBILE", "NESSUN_VEICOLO");
  });

  it("NRF_LEG_2 · TF-FIN-03 · stallo liberato con sosta scaduta e permesso → TERMINATA, permesso eliminato", async () => {
    const a = await automobilista("fine.3@test.example", "FI003AA");
    const s = await sosta(a, 15, "08:00", "09:00", { scaduta: true, permesso: true });

    expect(await liberazione(15)).toBe("LIBERO");

    const dopo = await verificaSosta(s, "TERMINATA");
    expect(dopo.dichiarazioneDiPermesso).toBeNull();
    expect(dopo.fotoDelPermesso).toBeNull();
    await verificaStallo(15, "LIBERO");
  });

  it("VD_11 · TF-FIN-04 · stallo liberato con più soste scadute → tutte TERMINATA", async () => {
    const a = await automobilista("fine.4@test.example", "FI004AA");
    const b = await automobilista("fine.4b@test.example", "FI004BB");
    const s1 = await sosta(a, 4, "07:00", "08:00", { scaduta: true });
    const s2 = await sosta(b, 4, "08:00", "09:00", { scaduta: true });

    expect(await liberazione(4)).toBe("LIBERO");

    await verificaSosta(s1, "TERMINATA");
    await verificaSosta(s2, "TERMINATA");
    await verificaStallo(4, "LIBERO");
  });
});
