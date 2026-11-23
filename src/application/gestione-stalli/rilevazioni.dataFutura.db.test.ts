import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trovaStallo } from "../../persistence/accessoDati/stalliTariffe";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import {
  creaFacadeGestioneStalli,
  ErroreGestioneStalli,
  type FacadeGestioneStalli,
  type OsservatoreStalli,
  type StalloLiberato,
} from "./facade";

// Test frame TF-RIL-25 e TF-RIL-26 di docs/test/cp_rilevazioni.md (COD-14, OMP-47).

const ADESSO = new Date("2026-11-20T09:00:00+01:00");
const UN_SECONDO_DOPO = new Date("2026-11-20T09:00:01+01:00");

describe("COD-14 · cp_rilevazioni · data futura", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  function facadeCon(notifiche: StalloLiberato[]): FacadeGestioneStalli {
    const registro: OsservatoreStalli = {
      async terminaSosta(evento: StalloLiberato): Promise<void> {
        notifiche.push({ ...evento });
      },
    };
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [registro],
      orologio: { adesso: () => new Date("2026-11-20T09:00:00+01:00") },
    });
  }

  async function statoRilevato(id: number) {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    return {
      stato: stallo!.stato,
      occupazioneRilevata: stallo!.occupazioneRilevata,
      ultimaRilevazione: stallo!.dataEOraUltimaRilevazione?.getTime() ?? null,
    };
  }

  it("COD_14 · TF-RIL-25 · data e ora successiva all'istante corrente → RILEVAZIONE_NON_VALIDA", async () => {
    const notifiche: StalloLiberato[] = [];
    const facade = facadeCon(notifiche);
    const prima = await statoRilevato(5);
    expect(prima.stato).toBe("LIBERO");

    let ottenuto: unknown;
    try {
      await facade.registraRilevazione({ stallo: 5, presenza: true, dataOra: UN_SECONDO_DOPO });
    } catch (errore) {
      ottenuto = errore;
    }

    expect(ottenuto).toBeInstanceOf(ErroreGestioneStalli);
    expect((ottenuto as ErroreGestioneStalli).codice).toBe("RILEVAZIONE_NON_VALIDA");
    expect(await statoRilevato(5)).toEqual(prima);
    expect(notifiche).toEqual([]);
  });

  it("COD_14 · TF-RIL-26 · data e ora uguale all'istante corrente → OCCUPATO", async () => {
    const notifiche: StalloLiberato[] = [];
    const facade = facadeCon(notifiche);
    expect((await statoRilevato(6)).stato).toBe("LIBERO");

    const stato = await facade.registraRilevazione({ stallo: 6, presenza: true, dataOra: ADESSO });

    expect(stato).toBe("OCCUPATO");
    expect(await statoRilevato(6)).toEqual({
      stato: "OCCUPATO",
      occupazioneRilevata: "VEICOLO_PRESENTE",
      ultimaRilevazione: ADESSO.getTime(),
    });
    expect(notifiche).toEqual([]);
  });
});
