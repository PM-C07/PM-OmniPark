import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { istanteDelDatabase } from "../../persistence/accessoDati/istante";
import { impostaStatoStallo } from "../../persistence/accessoDati/stalliTariffe";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import {
  creaFacadeGestioneStalli,
  ErroreGestioneStalli,
  type CodiceErroreGestioneStalli,
  type FacadeGestioneStalli,
  type StalloZona,
  type Zona,
} from "./facade";

// Test frame TF-MAP-01…16 di docs/test/cp_mappa.md (OMP-43) e TF-MAP-17…24 (§7, OMP-48:
// fotografia e variazioni con il cursore del database).

const ISTANTE_DATASET = new Date("2026-11-15T08:00:00+01:00");
const PRIMA_DEL_DATASET = new Date("2026-11-15T07:59:59+01:00");
const ISTANTE_PROVA = new Date("2026-11-20T09:00:00+01:00");

// Zone usate (§3)
const PIAZZA_AUBRY: Zona = { latMin: 40.688, latMax: 40.689, lonMin: 14.522, lonMax: 14.5223 };
const STALLO_13_ESATTO: Zona = {
  latMin: 40.69149,
  latMax: 40.69149,
  lonMin: 14.51616,
  lonMax: 14.51616,
};
const VIVIANI: Zona = { latMin: 40.7077, latMax: 40.7079, lonMin: 14.5033, lonMax: 14.5034 };
const VIA_ROMA: Zona = { latMin: 40.6913, latMax: 40.6915, lonMin: 14.5161, lonMax: 14.5162 };
const GIOVANNI_PAOLO_II: Zona = {
  latMin: 40.7804,
  latMax: 40.7806,
  lonMin: 14.7706,
  lonMax: 14.7707,
};
const PENTA: Zona = { latMin: 40.7673, latMax: 40.7675, lonMin: 14.7972, lonMax: 14.7973 };
const MARE: Zona = { latMin: 40.0, latMax: 40.1, lonMin: 14.0, lonMax: 14.1 };
const LATITUDINI_INVERTITE: Zona = {
  latMin: 40.689,
  latMax: 40.688,
  lonMin: 14.522,
  lonMax: 14.5223,
};
const LONGITUDINI_INVERTITE: Zona = {
  latMin: 40.688,
  latMax: 40.689,
  lonMin: 14.5223,
  lonMax: 14.522,
};
const LATITUDINE_FUORI_INTERVALLO: Zona = {
  latMin: 40.688,
  latMax: 91,
  lonMin: 14.522,
  lonMax: 14.5223,
};
const VALORE_NON_FINITO: Zona = { latMin: 40.688, latMax: 40.689, lonMin: NaN, lonMax: 14.5223 };

const ID_PIAZZA_AUBRY = [14, 15, 16, 17, 18, 19, 20, 21];

// Zone aggiunte da OMP-48 (§7)
const SORRENTINO: Zona = { latMin: 40.6896, latMax: 40.6898, lonMin: 14.5201, lonMax: 14.5202 };
const SAN_LEONE: Zona = { latMin: 40.6917, latMax: 40.6919, lonMin: 14.523, lonMax: 14.5231 };
const GARIBALDI: Zona = { latMin: 40.7457, latMax: 40.7459, lonMin: 14.7705, lonMax: 14.7706 };

const SEI_SECONDI_MS = 6000;

describe("OMP-43 · cp_mappa", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  function facade(): FacadeGestioneStalli {
    return creaFacadeGestioneStalli({ pool: poolDiTest() });
  }

  async function rifiutato(
    operazione: Promise<unknown>,
    codice: CodiceErroreGestioneStalli,
  ): Promise<void> {
    let ottenuto: unknown;
    try {
      await operazione;
    } catch (errore) {
      ottenuto = errore;
    }
    expect(ottenuto).toBeInstanceOf(ErroreGestioneStalli);
    expect((ottenuto as ErroreGestioneStalli).codice).toBe(codice);
  }

  function ids(stalli: StalloZona[]): number[] {
    return stalli.map((s) => s.id);
  }

  function piuUnMs(cursore: Date | null): Date {
    expect(cursore).toBeInstanceOf(Date);
    return new Date(cursore!.getTime() + 1);
  }

  // --- stalliNellaZona ---

  it("RF_STALLI_1 · TF-MAP-01 · zona con più stalli → stalli 14…21 con area e tariffa", async () => {
    const stalli = await facade().stalliNellaZona(PIAZZA_AUBRY);

    expect(ids(stalli)).toEqual(ID_PIAZZA_AUBRY);
    const s14 = stalli[0];
    expect(s14.numero).toBe(1);
    expect(s14.tipoDiStallo).toBe("DISABILI");
    expect(s14.stato).toBe("LIBERO");
    expect(s14.latitudine).toBe(40.68824);
    expect(s14.longitudine).toBe(14.52214);
    expect(s14.areaDiSosta).toEqual({ id: 5, nome: "Piazza Aubry" });
    expect(s14.tariffa).toEqual({ id: 1, costoOrario: 150 });
  });

  it("RF_STALLI_1 · TF-MAP-02 · zona senza stalli → elenco vuoto", async () => {
    expect(await facade().stalliNellaZona(MARE)).toEqual([]);
  });

  it("RF_STALLI_1 · TF-MAP-03 · zona con un solo stallo sugli estremi → solo lo stallo 13", async () => {
    const stalli = await facade().stalliNellaZona(STALLO_13_ESATTO);

    expect(ids(stalli)).toEqual([13]);
    expect(stalli[0].stato).toBe("SCONOSCIUTO");
    expect(stalli[0].areaDiSosta).toEqual({ id: 4, nome: "Via Roma" });
    expect(stalli[0].tariffa).toEqual({ id: 1, costoOrario: 150 });
  });

  it("ISSUE_7 · TF-MAP-04 · latitudini invertite → ZONA_NON_VALIDA", async () => {
    await rifiutato(facade().stalliNellaZona(LATITUDINI_INVERTITE), "ZONA_NON_VALIDA");
  });

  it("ISSUE_7 · TF-MAP-05 · longitudini invertite → ZONA_NON_VALIDA", async () => {
    await rifiutato(facade().stalliNellaZona(LONGITUDINI_INVERTITE), "ZONA_NON_VALIDA");
  });

  it("ISSUE_7 · TF-MAP-06 · latitudine fuori intervallo → ZONA_NON_VALIDA", async () => {
    await rifiutato(facade().stalliNellaZona(LATITUDINE_FUORI_INTERVALLO), "ZONA_NON_VALIDA");
  });

  it("ISSUE_7 · TF-MAP-07 · valore non finito → ZONA_NON_VALIDA", async () => {
    await rifiutato(facade().stalliNellaZona(VALORE_NON_FINITO), "ZONA_NON_VALIDA");
  });

  // --- stalliModificatiDopo ---

  it("NRF_PER_3 · TF-MAP-08 · istante precedente al dataset → stalli 14…21, cursore all'istante del dataset", async () => {
    const r = await facade().stalliModificatiDopo(PIAZZA_AUBRY, PRIMA_DEL_DATASET);

    expect(ids(r.stalli)).toEqual(ID_PIAZZA_AUBRY);
    for (const s of r.stalli) {
      expect(s.areaDiSosta).toEqual({ id: 5, nome: "Piazza Aubry" });
      expect(s.tariffa).toEqual({ id: 1, costoOrario: 150 });
    }
    expect(r.cursore?.getTime()).toBe(ISTANTE_DATASET.getTime());
  });

  it("NRF_PER_3 · TF-MAP-09 · istante uguale all'ultima modifica → nessuno stallo, cursore null", async () => {
    const r = await facade().stalliModificatiDopo(PIAZZA_AUBRY, ISTANTE_DATASET);

    expect(r).toEqual({ stalli: [], cursore: null });
  });

  it("NRF_PER_3 · TF-MAP-10 · variazione dopo l'istante → solo lo stallo 9 Occupato, cursore alla sua ultima modifica", async () => {
    const f = facade();
    await f.registraRilevazione({ stallo: 9, presenza: true, dataOra: ISTANTE_PROVA });

    const r = await f.stalliModificatiDopo(VIVIANI, ISTANTE_DATASET);

    expect(ids(r.stalli)).toEqual([9]);
    const s9 = r.stalli[0];
    expect(s9.stato).toBe("OCCUPATO");
    expect(s9.areaDiSosta).toEqual({ id: 3, nome: "Via Raffaele Viviani" });
    expect(s9.tariffa).toEqual({ id: 1, costoOrario: 150 });
    expect(r.cursore?.getTime()).toBe(s9.ultimaModifica.getTime());
  });

  it("NRF_PER_3 · TF-MAP-11 · cursore + 1 ms senza nuove variazioni → nessuno stallo, cursore null", async () => {
    const f = facade();
    await f.registraRilevazione({ stallo: 10, presenza: true, dataOra: ISTANTE_PROVA });

    const r1 = await f.stalliModificatiDopo(VIA_ROMA, ISTANTE_DATASET);
    expect(ids(r1.stalli)).toEqual([10]);

    const r2 = await f.stalliModificatiDopo(VIA_ROMA, piuUnMs(r1.cursore));
    expect(r2).toEqual({ stalli: [], cursore: null });
  });

  it("NRF_PER_3 · TF-MAP-12 · cursore + 1 ms con nuova variazione su un altro stallo → solo lo stallo 23 Libero", async () => {
    const f = facade();
    await f.registraRilevazione({ stallo: 22, presenza: true, dataOra: ISTANTE_PROVA });

    const r1 = await f.stalliModificatiDopo(GIOVANNI_PAOLO_II, ISTANTE_DATASET);
    expect(ids(r1.stalli)).toEqual([22]);
    expect(r1.stalli[0].stato).toBe("OCCUPATO");

    await f.registraRilevazione({ stallo: 23, presenza: false, dataOra: ISTANTE_PROVA });

    const r2 = await f.stalliModificatiDopo(GIOVANNI_PAOLO_II, piuUnMs(r1.cursore));
    expect(ids(r2.stalli)).toEqual([23]);
    expect(r2.stalli[0].stato).toBe("LIBERO");
    expect(r2.cursore?.getTime()).toBe(r2.stalli[0].ultimaModifica.getTime());
  });

  it("ISSUE_7 · TF-MAP-13 · rilevazione che conferma lo stato → stallo 27 tra i modificati, Libero invariato", async () => {
    const f = facade();
    await f.registraRilevazione({ stallo: 27, presenza: false, dataOra: ISTANTE_PROVA });

    const r = await f.stalliModificatiDopo(PENTA, ISTANTE_DATASET);

    expect(ids(r.stalli)).toEqual([27]);
    expect(r.stalli[0].stato).toBe("LIBERO");
  });

  it("NRF_PER_3 · TF-MAP-14 · zona senza stalli → nessuno stallo, cursore null", async () => {
    const r = await facade().stalliModificatiDopo(MARE, PRIMA_DEL_DATASET);

    expect(r).toEqual({ stalli: [], cursore: null });
  });

  it("ISSUE_7 · TF-MAP-15 · zona non valida → ZONA_NON_VALIDA", async () => {
    await rifiutato(
      facade().stalliModificatiDopo(LATITUDINI_INVERTITE, PRIMA_DEL_DATASET),
      "ZONA_NON_VALIDA",
    );
  });

  it("ISSUE_7 · TF-MAP-16 · istante non valido → ISTANTE_NON_VALIDO", async () => {
    await rifiutato(
      facade().stalliModificatiDopo(PIAZZA_AUBRY, new Date(NaN)),
      "ISTANTE_NON_VALIDO",
    );
  });

  // --- OMP-48 · fotografiaZona e variazioniDopo (§7) ---

  function stallo(stalli: StalloZona[], id: number): StalloZona | undefined {
    return stalli.find((s) => s.id === id);
  }

  it("NRF_PER_3 · TF-MAP-17 · fotografia di Piazza Aubry → stalli 14…21 con area e tariffa, cursore tra prima e dopo", async () => {
    const prima = await istanteDelDatabase(poolDiTest());
    const r = await facade().fotografiaZona(PIAZZA_AUBRY);
    const dopo = await istanteDelDatabase(poolDiTest());

    expect(ids(r.stalli)).toEqual(ID_PIAZZA_AUBRY);
    for (const s of r.stalli) {
      expect(s.areaDiSosta).toEqual({ id: 5, nome: "Piazza Aubry" });
      expect(s.tariffa).toEqual({ id: 1, costoOrario: 150 });
    }
    expect(r.cursore).toBeInstanceOf(Date);
    expect(r.cursore.getTime()).toBeGreaterThanOrEqual(prima.getTime());
    expect(r.cursore.getTime()).toBeLessThanOrEqual(dopo.getTime());
  });

  it("NRF_PER_3 · TF-MAP-18 · cursore precedente a una variazione → contiene lo stallo 1 Occupato, cursore non precedente a c0", async () => {
    const f = facade();
    const c0 = (await f.fotografiaZona(SORRENTINO)).cursore;
    await f.registraRilevazione({ stallo: 1, presenza: true, dataOra: ISTANTE_PROVA });

    const r = await f.variazioniDopo(SORRENTINO, c0);

    expect(stallo(r.stalli, 1)?.stato).toBe("OCCUPATO");
    expect(r.cursore).toBeInstanceOf(Date);
    expect(r.cursore.getTime()).toBeGreaterThanOrEqual(c0.getTime());
  });

  it("ISSUE_27 · TF-MAP-19 · cursore appena restituito con variazione negli ultimi 5 s → r1 e r2 contengono lo stallo 5 Occupato", async () => {
    const f = facade();
    const c0 = (await f.fotografiaZona(SAN_LEONE)).cursore;
    await f.registraRilevazione({ stallo: 5, presenza: true, dataOra: ISTANTE_PROVA });

    const r1 = await f.variazioniDopo(SAN_LEONE, c0);
    const r2 = await f.variazioniDopo(SAN_LEONE, r1.cursore);

    expect(stallo(r1.stalli, 5)?.stato).toBe("OCCUPATO");
    expect(stallo(r2.stalli, 5)?.stato).toBe("OCCUPATO");
  });

  it("NRF_PER_3 · TF-MAP-20 · cursore successivo all'ultima variazione di più di 5 s → r1 con lo stallo 28, r2 vuoto", async () => {
    const f = facade();
    const c0 = (await f.fotografiaZona(GARIBALDI)).cursore;
    await f.registraRilevazione({ stallo: 28, presenza: true, dataOra: ISTANTE_PROVA });

    const r1 = await f.variazioniDopo(GARIBALDI, c0);
    expect(stallo(r1.stalli, 28)).toBeDefined();

    const r2 = await f.variazioniDopo(GARIBALDI, new Date(r1.cursore.getTime() + SEI_SECONDI_MS));
    expect(r2.stalli).toEqual([]);
  });

  it("NRF_PER_3 · TF-MAP-21 · variazione confermata con ritardo entro il margine → r1 senza lo stallo 16, r2 con lo stallo 16 Non disponibile", async () => {
    const f = facade();
    const c0 = (await f.fotografiaZona(PIAZZA_AUBRY)).cursore;

    const client = await poolDiTest().connect();
    let r1: { stalli: StalloZona[]; cursore: Date } | undefined;
    try {
      await client.query("BEGIN");
      await impostaStatoStallo(client, 16, "NON_DISPONIBILE");
      r1 = await f.variazioniDopo(PIAZZA_AUBRY, c0);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    expect(r1).toBeDefined();
    const r2 = await f.variazioniDopo(PIAZZA_AUBRY, r1!.cursore);

    expect(stallo(r1!.stalli, 16)).toBeUndefined();
    expect(stallo(r2.stalli, 16)?.stato).toBe("NON_DISPONIBILE");
  });

  it("ISSUE_7 · TF-MAP-22 · variazioniDopo con cursore non valido → ISTANTE_NON_VALIDO", async () => {
    await rifiutato(facade().variazioniDopo(PIAZZA_AUBRY, new Date(NaN)), "ISTANTE_NON_VALIDO");
  });

  it("ISSUE_7 · TF-MAP-23 · fotografiaZona con zona non valida → ZONA_NON_VALIDA", async () => {
    await rifiutato(facade().fotografiaZona(LATITUDINI_INVERTITE), "ZONA_NON_VALIDA");
  });

  it("ISSUE_7 · TF-MAP-24 · variazioniDopo con zona non valida → ZONA_NON_VALIDA", async () => {
    await rifiutato(
      facade().variazioniDopo(LATITUDINI_INVERTITE, ISTANTE_PROVA),
      "ZONA_NON_VALIDA",
    );
  });
});
