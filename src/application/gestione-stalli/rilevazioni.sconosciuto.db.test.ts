import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bloccaStallo,
  registraRilevazione as registraRilevazionePersistenza,
  trovaStallo,
} from "../../persistence/accessoDati/stalliTariffe";
import { creaSosta, trovaSosta } from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import {
  creaFacadeGestioneStalli,
  type FacadeGestioneStalli,
  type OsservatoreStalli,
  type StalloLiberato,
} from "./facade";

// Test frame TF-RIL-27…35 di docs/test/cp_rilevazioni.md §7 (COD-23, OMP-64).

const R = new Date("2026-11-20T09:00:00+01:00");

function dopo(secondi: number): Date {
  return new Date(R.getTime() + secondi * 1000);
}

describe("COD-23 · cp_rilevazioni · stato Sconosciuto", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterAll(async () => {
    await chiudiDatabaseDiTest();
  });

  // --- Ambiente (§7): Facade con il solo osservatore "registro" ---

  function facadeCon(notifiche: StalloLiberato[]): FacadeGestioneStalli {
    const registro: OsservatoreStalli = {
      async terminaSosta(evento: StalloLiberato): Promise<void> {
        notifiche.push({ ...evento });
      },
    };
    return creaFacadeGestioneStalli({ pool: poolDiTest(), osservatori: [registro] });
  }

  async function leggiStallo(id: number) {
    const stallo = await trovaStallo(poolDiTest(), id);
    expect(stallo).not.toBeNull();
    return stallo!;
  }

  // --- Tempo dall'ultima rilevazione ---

  it("RF_IOT_2 · TF-RIL-27 · stallo Libero senza rilevazioni da più di 60 s → Sconosciuto", async () => {
    const notifiche: StalloLiberato[] = [];
    const facade = facadeCon(notifiche);
    await facade.registraRilevazione({ stallo: 1, presenza: false, dataOra: R });
    const prima = await leggiStallo(1);
    expect(prima.stato).toBe("LIBERO");
    const u0 = prima.ultimaModifica.getTime();
    notifiche.length = 0;

    const sconosciuti = await facade.marcaSconosciuti(dopo(61));

    expect(sconosciuti).toContain(1);
    const stallo = await leggiStallo(1);
    expect(stallo.stato).toBe("SCONOSCIUTO");
    expect(stallo.occupazioneRilevata).toBe("NESSUN_VEICOLO");
    expect(stallo.dataEOraUltimaRilevazione?.getTime()).toBe(R.getTime());
    expect(stallo.ultimaModifica.getTime()).toBeGreaterThan(u0);
    expect(notifiche).toEqual([]);
  });

  it("RF_IOT_2 · TF-RIL-28 · stallo Occupato senza rilevazioni da più di 60 s → Sconosciuto", async () => {
    const facade = facadeCon([]);
    await facade.registraRilevazione({ stallo: 3, presenza: true, dataOra: R });
    expect((await leggiStallo(3)).stato).toBe("OCCUPATO");

    const sconosciuti = await facade.marcaSconosciuti(dopo(61));

    expect(sconosciuti).toContain(3);
    const stallo = await leggiStallo(3);
    expect(stallo.stato).toBe("SCONOSCIUTO");
    expect(stallo.occupazioneRilevata).toBe("VEICOLO_PRESENTE");
    expect(stallo.dataEOraUltimaRilevazione?.getTime()).toBe(R.getTime());
  });

  it("RF_IOT_2 · TF-RIL-29 · stallo Occupato con rilevazione di 30 s prima → resta Occupato", async () => {
    const facade = facadeCon([]);
    await facade.registraRilevazione({ stallo: 4, presenza: true, dataOra: R });
    const prima = await leggiStallo(4);
    expect(prima.stato).toBe("OCCUPATO");
    const u0 = prima.ultimaModifica.getTime();

    const sconosciuti = await facade.marcaSconosciuti(dopo(30));

    expect(sconosciuti).not.toContain(4);
    const stallo = await leggiStallo(4);
    expect(stallo.stato).toBe("OCCUPATO");
    expect(stallo.ultimaModifica.getTime()).toBe(u0);
  });

  it("RF_IOT_2 · TF-RIL-30 · stallo Libero con rilevazione di esattamente 60 s prima → resta Libero", async () => {
    const facade = facadeCon([]);
    await facade.registraRilevazione({ stallo: 2, presenza: false, dataOra: R });
    expect((await leggiStallo(2)).stato).toBe("LIBERO");

    const sconosciuti = await facade.marcaSconosciuti(dopo(60));

    expect(sconosciuti).not.toContain(2);
    expect((await leggiStallo(2)).stato).toBe("LIBERO");
  });

  // --- Stato dello stallo ---

  it("RF_SOSTA_6 · TF-RIL-31 · stallo Non disponibile con sosta Attiva → resta Non disponibile", async () => {
    const facade = facadeCon([]);
    await facade.registraRilevazione({ stallo: 7, presenza: true, dataOra: R });
    const sosta = await creaSosta(poolDiTest(), {
      automobilistaId: 7,
      veicoloId: 1,
      stalloId: 7,
      orarioDiAvvio: R,
      orarioDiScadenza: new Date("2026-11-20T12:00:00+01:00"),
      pagamento: "PAGATA",
    });
    await facade.impostaNonDisponibile(7);
    expect((await leggiStallo(7)).stato).toBe("NON_DISPONIBILE");

    const sconosciuti = await facade.marcaSconosciuti(dopo(61));

    expect(sconosciuti).not.toContain(7);
    expect((await leggiStallo(7)).stato).toBe("NON_DISPONIBILE");
    expect((await trovaSosta(poolDiTest(), sosta))?.stato).toBe("ATTIVA");
  });

  it("RF_IOT_2 · TF-RIL-32 · stallo già Sconosciuto → non compare, ultimaModifica invariata", async () => {
    const facade = facadeCon([]);
    const prima = await leggiStallo(13);
    expect(prima.stato).toBe("SCONOSCIUTO");
    const u0 = prima.ultimaModifica.getTime();

    const sconosciuti = await facade.marcaSconosciuti(dopo(61));

    expect(sconosciuti).not.toContain(13);
    const stallo = await leggiStallo(13);
    expect(stallo.stato).toBe("SCONOSCIUTO");
    expect(stallo.ultimaModifica.getTime()).toBe(u0);
  });

  it("RF_IOT_2 · TF-RIL-33 · stallo mai rilevato → non compare, resta Sconosciuto senza rilevazione", async () => {
    const facade = facadeCon([]);
    expect((await leggiStallo(25)).stato).toBe("SCONOSCIUTO");

    const sconosciuti = await facade.marcaSconosciuti(dopo(61));

    expect(sconosciuti).not.toContain(25);
    const stallo = await leggiStallo(25);
    expect(stallo.stato).toBe("SCONOSCIUTO");
    expect(stallo.occupazioneRilevata).toBeNull();
    expect(stallo.dataEOraUltimaRilevazione).toBeNull();
  });

  // --- Concorrenza ---

  it("COD_23 · TF-RIL-34 · rilevazione confermata durante l'aggiornamento → vince la rilevazione", async () => {
    const facade = facadeCon([]);
    await facade.registraRilevazione({ stallo: 8, presenza: true, dataOra: R });
    expect((await leggiStallo(8)).stato).toBe("OCCUPATO");

    const client = await poolDiTest().connect();
    let confermato = false;
    try {
      await client.query("BEGIN");
      await bloccaStallo(client, 8);
      await registraRilevazionePersistenza(client, 8, {
        occupazioneRilevata: "NESSUN_VEICOLO",
        dataEOra: dopo(90),
        stato: "LIBERO",
      });

      const inCorso = facade.marcaSconosciuti(dopo(120));

      await client.query("COMMIT");
      confermato = true;
      const sconosciuti = await inCorso;

      expect(sconosciuti).not.toContain(8);
      const stallo = await leggiStallo(8);
      expect(stallo.stato).toBe("LIBERO");
      expect(stallo.occupazioneRilevata).toBe("NESSUN_VEICOLO");
      expect(stallo.dataEOraUltimaRilevazione?.getTime()).toBe(dopo(90).getTime());
    } finally {
      if (!confermato) {
        await client.query("ROLLBACK");
      }
      client.release();
    }
  });

  // --- Dopo Sconosciuto ---

  it("RF_IOT_2 · TF-RIL-35 · stallo Sconosciuto, rilevazione nessun veicolo → Libero e notifica", async () => {
    const notifiche: StalloLiberato[] = [];
    const facade = facadeCon(notifiche);
    await facade.registraRilevazione({ stallo: 9, presenza: true, dataOra: R });
    await facade.marcaSconosciuti(dopo(61));
    expect((await leggiStallo(9)).stato).toBe("SCONOSCIUTO");

    const stato = await facade.registraRilevazione({
      stallo: 9,
      presenza: false,
      dataOra: dopo(90),
    });

    expect(stato).toBe("LIBERO");
    const stallo = await leggiStallo(9);
    expect(stallo.stato).toBe("LIBERO");
    expect(stallo.occupazioneRilevata).toBe("NESSUN_VEICOLO");
    expect(stallo.dataEOraUltimaRilevazione?.getTime()).toBe(dopo(90).getTime());
    expect(notifiche).toEqual([{ stallo: 9 }]);
  });
});
