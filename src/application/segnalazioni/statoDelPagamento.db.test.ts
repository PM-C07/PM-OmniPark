import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste, osservatoreGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeGestioneStalli } from "../gestione-stalli/facade";
import { creaFacadeUtentiAccessi } from "../utenti-accessi/facade";
import { creaFacadeWallet } from "../wallet/facade";
import {
  creaSegnalazioneDaLettura,
  prendiInCarico,
} from "../../persistence/accessoDati/segnalazioniVerifiche";
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
  type Pagamento,
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
  type FacadeSegnalazioni,
} from "./facade";

// Test frame TF-PAG-01…12 di docs/test/cp_statoDelPagamento.md (OMP-63, issue #40); TF-PAG-13 è in
// statoDelPagamento.sconosciuto.db.test.ts (§6). Le transazioni vanno in commit (§3): ogni frame
// che prepara dati usa stallo, automobilista, targa (PG0<nn>AA) e segnalazione propri; i frame di
// errore senza preparazione usano le segnalazioni 11, 4 e 1 del dataset, che nessun frame modifica.

const T = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => T };
const INESISTENTE = 999999;
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

describe("OMP-63 · cp_statoDelPagamento", () => {
  beforeAll(async () => {
    await preparaDatabaseDiTest();
    // Precondizione (§3): rilevazioni recenti rispetto all'orologio dei test.
    await rilevazioniAllIstante(poolDiTest(), T);
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

  function gestioneStalli() {
    return creaFacadeGestioneStalli({
      pool: poolDiTest(),
      osservatori: [osservatoreGestioneSoste],
    });
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

  function targa(n: number): string {
    return `PG0${String(n).padStart(2, "0")}AA`;
  }

  type Automobilista = { id: number; veicoloId: number; targa: string };

  // Targa del frame n: automobilista pagamento.<n>@test.example con il veicolo PG0<nn>AA.
  async function automobilista(n: number): Promise<Automobilista> {
    const pool = poolDiTest();
    const id = await creaAutomobilista(pool, {
      email: `pagamento.${n}@test.example`,
      hashPassword: "hash-di-prova",
    });
    const veicoloId = await trovaOCreaVeicolo(pool, targa(n));
    await associaVeicolo(pool, id, veicoloId);
    return { id, veicoloId, targa: targa(n) };
  }

  // Sosta (§3): «attiva» aggiunge impostaNonDisponibile; «scaduta» impostaSostaScaduta;
  // «terminata» aggiunge, dopo la scadenza, terminaSosteScaduteDelloStallo.
  async function sosta(
    a: Automobilista,
    stallo: number,
    avvio: string,
    scadenza: string,
    tipo: "attiva" | "scaduta" | "terminata",
    opzioni: { pagamento?: Pagamento; permesso?: boolean } = {},
  ): Promise<number> {
    const pool = poolDiTest();
    const id = await creaSosta(pool, {
      automobilistaId: a.id,
      veicoloId: a.veicoloId,
      stalloId: stallo,
      orarioDiAvvio: ora(avvio),
      orarioDiScadenza: ora(scadenza),
      pagamento: opzioni.pagamento ?? "PAGATA",
      ...(opzioni.permesso
        ? { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: Buffer.alloc(1024, 0xff) }
        : {}),
    });
    if (tipo === "attiva") {
      await gestioneStalli().impostaNonDisponibile(stallo);
    } else {
      expect(await impostaSostaScaduta(pool, id)).toBe(true);
      if (tipo === "terminata") {
        await terminaSosteScaduteDelloStallo(pool, stallo);
        expect((await trovaSosta(pool, id))?.stato).toBe("TERMINATA");
      }
    }
    return id;
  }

  // Segnalazione presa in carico del frame n: lettura 09:50, SOSTA_ASSENTE, presa da 2 alle 09:55.
  async function segnalazionePresa(n: number, stalloId: number): Promise<number> {
    const pool = poolDiTest();
    const id = await creaSegnalazioneDaLettura(pool, {
      stalloId,
      targa: targa(n),
      dataEOra: ora("09:50"),
      motivo: "SOSTA_ASSENTE",
    });
    expect(await prendiInCarico(pool, id, 2, ora("09:55"))).toBe(true);
    return id;
  }

  // --- Stato della sosta ---

  it("RF_OP_4 · TF-PAG-01 · sosta attiva pagata della targa sullo stallo → ATTIVA 09:00–12:00 PAGATA, senza dichiarazione né foto", async () => {
    const a = await automobilista(1);
    await sosta(a, 17, "09:00", "12:00", "attiva");
    const s = await segnalazionePresa(1, 17);

    const risultato = await facade().statoDelPagamento(2, s);

    expect(risultato).toEqual({
      sosta: {
        stato: "ATTIVA",
        orarioDiAvvio: ora("09:00"),
        orarioDiScadenza: ora("12:00"),
        pagamento: "PAGATA",
      },
    });
  });

  it("RF_OP_4 · TF-PAG-02 · sosta attiva gratuita su stallo per persone con disabilità → ATTIVA GRATUITA, senza dichiarazione né foto", async () => {
    expect(
      await gestioneStalli().registraRilevazione({ stallo: 14, presenza: true, dataOra: T }),
    ).toBe("OCCUPATO");
    const a = await automobilista(2);
    await sosta(a, 14, "09:00", "10:30", "attiva", { pagamento: "GRATUITA", permesso: true });
    const s = await segnalazionePresa(2, 14);

    const risultato = await facade().statoDelPagamento(2, s);

    expect(risultato.sosta).not.toBeNull();
    expect(risultato.sosta!.stato).toBe("ATTIVA");
    expect(risultato.sosta!.pagamento).toBe("GRATUITA");
    expect(Object.keys(risultato)).toEqual(["sosta"]);
    expect(Object.keys(risultato.sosta!).sort()).toEqual(
      ["orarioDiAvvio", "orarioDiScadenza", "pagamento", "stato"].sort(),
    );
    expect(JSON.stringify(risultato)).not.toContain(DICHIARAZIONE);
  });

  it("RF_OP_4 · TF-PAG-03 · sosta scaduta → SCADUTA 08:00–08:30", async () => {
    const a = await automobilista(3);
    await sosta(a, 18, "08:00", "08:30", "scaduta");
    const s = await segnalazionePresa(3, 18);

    const risultato = await facade().statoDelPagamento(2, s);

    expect(risultato.sosta).not.toBeNull();
    expect(risultato.sosta!.stato).toBe("SCADUTA");
    expect(risultato.sosta!.orarioDiAvvio.getTime()).toBe(ora("08:00").getTime());
    expect(risultato.sosta!.orarioDiScadenza.getTime()).toBe(ora("08:30").getTime());
  });

  it("RF_OP_4 · TF-PAG-04 · sosta terminata → TERMINATA", async () => {
    const a = await automobilista(4);
    await sosta(a, 19, "08:00", "08:30", "terminata");
    const s = await segnalazionePresa(4, 19);

    const risultato = await facade().statoDelPagamento(2, s);

    expect(risultato.sosta).not.toBeNull();
    expect(risultato.sosta!.stato).toBe("TERMINATA");
  });

  it("RF_OP_4 · TF-PAG-05 · sosta della targa su un altro stallo → nessuna sosta (null)", async () => {
    const a = await automobilista(5);
    await sosta(a, 20, "09:00", "12:00", "attiva");
    const s = await segnalazionePresa(5, 3);

    const risultato = await facade().statoDelPagamento(2, s);

    expect(risultato).toEqual({ sosta: null });
  });

  it("RF_OP_4 · TF-PAG-06 · più soste della targa sullo stallo → la più recente, ATTIVA dalle 09:00", async () => {
    const a = await automobilista(6);
    await sosta(a, 7, "08:00", "08:30", "terminata");
    await sosta(a, 7, "09:00", "11:00", "attiva");
    const s = await segnalazionePresa(6, 7);

    const risultato = await facade().statoDelPagamento(2, s);

    expect(risultato.sosta).not.toBeNull();
    expect(risultato.sosta!.stato).toBe("ATTIVA");
    expect(risultato.sosta!.orarioDiAvvio.getTime()).toBe(ora("09:00").getTime());
  });

  it("RF_OP_4 · TF-PAG-07 · sosta attiva con scadenza raggiunta e non ancora allineata → SCADUTA, anche nel database", async () => {
    const a = await automobilista(7);
    const id = await sosta(a, 8, "08:00", "09:30", "attiva");
    expect((await trovaSosta(poolDiTest(), id))?.stato).toBe("ATTIVA");
    const s = await segnalazionePresa(7, 8);

    const risultato = await facade().statoDelPagamento(2, s);

    expect(risultato.sosta).not.toBeNull();
    expect(risultato.sosta!.stato).toBe("SCADUTA");
    expect((await trovaSosta(poolDiTest(), id))?.stato).toBe("SCADUTA");
  });

  // --- Controlli della segnalazione ---

  it("ISSUE_40 · TF-PAG-08 · segnalazione aperta, non presa in carico → SEGNALAZIONE_NON_PRESA_IN_CARICO", async () => {
    await verificaErrore(facade().statoDelPagamento(2, 11), "SEGNALAZIONE_NON_PRESA_IN_CARICO");
  });

  it("NRF_SIC_1 · TF-PAG-09 · segnalazione presa in carico da un altro Ausiliario → SEGNALAZIONE_PRESA_DA_ALTRI", async () => {
    await verificaErrore(facade().statoDelPagamento(2, 4), "SEGNALAZIONE_PRESA_DA_ALTRI");
  });

  it("ISSUE_40 · TF-PAG-10 · segnalazione già chiusa → SEGNALAZIONE_GIA_CHIUSA", async () => {
    await verificaErrore(facade().statoDelPagamento(2, 1), "SEGNALAZIONE_GIA_CHIUSA");
  });

  it("NRF_SIC_1 · TF-PAG-11 · segnalazione di un altro ente → ENTE_NON_AMMESSO", async () => {
    const s = await segnalazionePresa(11, 12);

    await verificaErrore(facade().statoDelPagamento(5, s), "ENTE_NON_AMMESSO");
  });

  it("RF_OP_4 · TF-PAG-12 · segnalazione inesistente → SEGNALAZIONE_INESISTENTE", async () => {
    await verificaErrore(facade().statoDelPagamento(2, INESISTENTE), "SEGNALAZIONE_INESISTENTE");
  });
});
