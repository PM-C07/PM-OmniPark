import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { creaFacadeGestioneSoste } from "../gestione-soste/facade";
import { creaFacadeUtentiAccessi } from "../utenti-accessi/facade";
import { creaFacadeWallet } from "../wallet/facade";
import { istanteDelDatabase } from "../../persistence/accessoDati/istante";
import {
  dettaglioSegnalazione,
  permessiDaVerificare,
  registraVerifica,
  segnalazioniModificateDopo,
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
} from "../../persistence/accessoDati/walletSoste";
import {
  chiudiDatabaseDiTest,
  poolDiTest,
  preparaDatabaseDiTest,
} from "../../persistence/test/databaseDiTest";
import { SimulatorePagamento } from "../../simulators/pagamento/simulatorePagamento";
import {
  creaFacadeSegnalazioni,
  ErroreSegnalazioni,
  type CodiceErroreSegnalazioni,
  type EsitoVerifica,
  type FacadeSegnalazioni,
} from "./facade";

// Test frame TF-VP-01…21 di docs/test/cp_verificaPermesso.md (OMP-63, issue #40, parte B).
// Le transazioni vanno in commit (§3): ogni frame crea soste proprie (automobilista
// verifica.<n>@test.example, veicolo VP<n>AA); l'afterEach porta a TERMINATA le soste ancora ATTIVA
// del frame, perché lo schema ammette una sola sosta ATTIVA per stallo.

const T = new Date("2026-11-20T10:00:00+01:00");
const orologio = { adesso: () => T };
const INESISTENTE = 999999;
const DICHIARAZIONE = "Dichiaro di esporre il permesso previsto per lo stallo";
const STALLI_DISABILI = new Set([14, 24]);

function ora(hhmm: string): Date {
  return new Date(`2026-11-20T${hhmm}:00+01:00`);
}

function fotoJpeg(): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 0x01)]);
}

function fotoPng(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(60, 0x02),
  ]);
}

describe("OMP-63 · cp_verificaPermesso", () => {
  // Soste create dal frame in corso, per la pulizia (§3).
  let sosteDelFrame: { id: number; stallo: number }[] = [];

  beforeAll(async () => {
    await preparaDatabaseDiTest();
  });

  afterEach(async () => {
    const pool = poolDiTest();
    for (const s of sosteDelFrame) {
      if ((await trovaSosta(pool, s.id))?.stato === "ATTIVA") {
        await impostaSostaScaduta(pool, s.id);
        await terminaSosteScaduteDelloStallo(pool, s.stallo);
      }
    }
    sosteDelFrame = [];
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

  // Sosta del frame n (§3): pagamento GRATUITA sugli stalli DISABILI, PAGATA sugli altri.
  async function sosta(
    n: string,
    stallo: number,
    opzioni: {
      permesso?: "jpeg" | "png";
      avvio?: string;
      scadenza?: string;
      stato?: "attiva" | "scaduta" | "terminata";
      targa?: string;
    } = {},
  ): Promise<number> {
    const pool = poolDiTest();
    const automobilistaId = await creaAutomobilista(pool, {
      email: `verifica.${n}@test.example`,
      hashPassword: "hash-di-prova",
    });
    const veicoloId = await trovaOCreaVeicolo(pool, opzioni.targa ?? `VP${n}AA`);
    await associaVeicolo(pool, automobilistaId, veicoloId);
    const foto =
      opzioni.permesso === "jpeg" ? fotoJpeg() : opzioni.permesso === "png" ? fotoPng() : null;
    const id = await creaSosta(pool, {
      automobilistaId,
      veicoloId,
      stalloId: stallo,
      orarioDiAvvio: ora(opzioni.avvio ?? "09:00"),
      orarioDiScadenza: ora(opzioni.scadenza ?? "11:00"),
      pagamento: STALLI_DISABILI.has(stallo) ? "GRATUITA" : "PAGATA",
      ...(foto ? { dichiarazioneDiPermesso: DICHIARAZIONE, fotoDelPermesso: foto } : {}),
    });
    sosteDelFrame.push({ id, stallo });
    const stato = opzioni.stato ?? "attiva";
    if (stato !== "attiva") {
      expect(await impostaSostaScaduta(pool, id)).toBe(true);
      if (stato === "terminata") {
        await terminaSosteScaduteDelloStallo(pool, stallo);
        expect((await trovaSosta(pool, id))?.stato).toBe("TERMINATA");
      }
    }
    return id;
  }

  // «Nessuna segnalazione nuova» (§3): istante del database prima della chiamata, poi nessuna
  // segnalazione dello stallo modificata dopo quell'istante.
  async function istantePrima(): Promise<Date> {
    return istanteDelDatabase(poolDiTest());
  }

  async function nessunaSegnalazioneNuova(
    ente: number,
    stallo: number,
    istante: Date,
  ): Promise<void> {
    const { segnalazioni } = await segnalazioniModificateDopo(poolDiTest(), ente, istante);
    expect(segnalazioni.filter((s) => s.stalloId === stallo)).toEqual([]);
  }

  async function sosteDaVerificare(ente: number): Promise<number[]> {
    return (await permessiDaVerificare(poolDiTest(), ente)).map((p) => p.sostaId);
  }

  // --- registraEsitoVerifica: esiti registrati ---

  it("RF_OP_5 · TF-VP-01 · esito conforme su stallo rosa → verifica registrata, nessuna segnalazione", async () => {
    const s = await sosta("01", 15, { permesso: "jpeg" });
    const istante = await istantePrima();

    const risultato = await facade().registraEsitoVerifica(2, s, "CONFORME");

    expect(Number.isInteger(risultato.verifica)).toBe(true);
    expect(risultato.verifica).toBeGreaterThan(0);
    expect(risultato.segnalazione).toBeNull();
    expect(await sosteDaVerificare(1)).not.toContain(s);
    await nessunaSegnalazioneNuova(1, 15, istante);
  });

  it("RF_OP_5 · TF-VP-02 · esito non conforme su stallo per persone con disabilità → segnalazione Chiusa accertata", async () => {
    const s = await sosta("02", 14, { permesso: "png" });

    const risultato = await facade().registraEsitoVerifica(2, s, "NON_CONFORME");

    expect(Number.isInteger(risultato.verifica)).toBe(true);
    expect(risultato.segnalazione).not.toBeNull();
    const d = await dettaglioSegnalazione(poolDiTest(), risultato.segnalazione!);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({
      stato: "CHIUSA",
      esito: "SOSTA_IRREGOLARE_ACCERTATA",
      stalloId: 14,
      ausiliarioId: 2,
      verificaDelPermessoId: risultato.verifica,
      motivo: null,
      targaRilevata: null,
      dataEOraDellaLettura: null,
    });
    expect(d!.dataEOraDellaChiusura?.getTime()).toBe(T.getTime());

    const dopo = await trovaSosta(poolDiTest(), s);
    expect(dopo?.stato).toBe("ATTIVA");
    expect(dopo?.dichiarazioneDiPermesso).toBe(DICHIARAZIONE);
    expect(dopo?.fotoDelPermesso?.equals(fotoPng())).toBe(true);
  });

  // --- registraEsitoVerifica: errori ---

  it("VD_12 · TF-VP-03 · sosta già verificata da un altro Ausiliario → VERIFICA_GIA_REGISTRATA, nessuna segnalazione", async () => {
    const s = await sosta("03", 15, { permesso: "jpeg" });
    await registraVerifica(poolDiTest(), {
      sostaId: s,
      ausiliarioId: 3,
      esito: "CONFORME",
      dataEOra: ora("09:30"),
    });
    const istante = await istantePrima();

    await verificaErrore(
      facade().registraEsitoVerifica(2, s, "NON_CONFORME"),
      "VERIFICA_GIA_REGISTRATA",
    );

    await nessunaSegnalazioneNuova(1, 15, istante);
  });

  it("RF_OP_5 · TF-VP-04 · sosta su stallo non riservato, senza permesso → NESSUN_PERMESSO_DA_VERIFICARE", async () => {
    const s = await sosta("04", 16);

    await verificaErrore(
      facade().registraEsitoVerifica(2, s, "CONFORME"),
      "NESSUN_PERMESSO_DA_VERIFICARE",
    );
  });

  it("RF_OP_5 · TF-VP-05 · sosta scaduta → SOSTA_NON_ATTIVA, nessuna segnalazione", async () => {
    const s = await sosta("05", 15, {
      permesso: "jpeg",
      avvio: "08:00",
      scadenza: "08:30",
      stato: "scaduta",
    });
    const istante = await istantePrima();

    await verificaErrore(facade().registraEsitoVerifica(2, s, "NON_CONFORME"), "SOSTA_NON_ATTIVA");

    await nessunaSegnalazioneNuova(1, 15, istante);
  });

  it("NRF_LEG_2 · TF-VP-06 · sosta terminata su stallo riservato → SOSTA_NON_ATTIVA (non NESSUN_PERMESSO_DA_VERIFICARE)", async () => {
    const s = await sosta("06", 15, {
      permesso: "jpeg",
      avvio: "08:00",
      scadenza: "08:30",
      stato: "terminata",
    });

    await verificaErrore(facade().registraEsitoVerifica(2, s, "NON_CONFORME"), "SOSTA_NON_ATTIVA");
  });

  it("RF_OP_5 · TF-VP-07 · sosta ancora ATTIVA con scadenza uguale a T → SOSTA_NON_ATTIVA", async () => {
    const s = await sosta("07", 15, { permesso: "jpeg", avvio: "09:00", scadenza: "10:00" });

    await verificaErrore(facade().registraEsitoVerifica(2, s, "CONFORME"), "SOSTA_NON_ATTIVA");
  });

  it("RF_OP_5 · TF-VP-08 · sosta inesistente → SOSTA_INESISTENTE", async () => {
    await verificaErrore(
      facade().registraEsitoVerifica(2, INESISTENTE, "CONFORME"),
      "SOSTA_INESISTENTE",
    );
  });

  it("NRF_SIC_1 · TF-VP-09 · sosta di un altro ente → ENTE_NON_AMMESSO, resta da verificare per l'ente 2", async () => {
    const s = await sosta("09", 24, { permesso: "jpeg" });

    await verificaErrore(facade().registraEsitoVerifica(2, s, "NON_CONFORME"), "ENTE_NON_AMMESSO");

    expect(await sosteDaVerificare(2)).toContain(s);
  });

  it("RF_OP_5 · TF-VP-10 · esito non previsto DUBBIO → ESITO_VERIFICA_NON_VALIDO, resta da verificare", async () => {
    const s = await sosta("10", 15, { permesso: "jpeg" });

    await verificaErrore(
      facade().registraEsitoVerifica(2, s, "DUBBIO" as unknown as EsitoVerifica),
      "ESITO_VERIFICA_NON_VALIDO",
    );

    expect(await sosteDaVerificare(1)).toContain(s);
  });

  it("VD_19 · TF-VP-11 · Ausiliario disattivato → AUSILIARIO_NON_ATTIVO, resta da verificare", async () => {
    const s = await sosta("11", 15, { permesso: "jpeg" });

    await verificaErrore(facade().registraEsitoVerifica(4, s, "CONFORME"), "AUSILIARIO_NON_ATTIVO");

    expect(await sosteDaVerificare(1)).toContain(s);
  });

  // --- registraEsitoVerifica: concorrenza ---

  it("VD_12 · TF-VP-12 · due Ausiliari insieme sulla stessa sosta → una riesce, l'altra VERIFICA_GIA_REGISTRATA", async () => {
    const s = await sosta("12", 15, { permesso: "jpeg" });
    const f = facade();
    const chiamate: { ausiliario: number; esito: EsitoVerifica }[] = [
      { ausiliario: 2, esito: "CONFORME" },
      { ausiliario: 3, esito: "NON_CONFORME" },
    ];
    const istante = await istantePrima();

    const risultati = await Promise.allSettled(
      chiamate.map((c) => f.registraEsitoVerifica(c.ausiliario, s, c.esito)),
    );

    const riuscite = risultati.filter(
      (r): r is PromiseFulfilledResult<{ verifica: number; segnalazione: number | null }> =>
        r.status === "fulfilled",
    );
    const fallite = risultati.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(riuscite).toHaveLength(1);
    expect(fallite).toHaveLength(1);
    expect(fallite[0].reason).toBeInstanceOf(ErroreSegnalazioni);
    expect((fallite[0].reason as ErroreSegnalazioni).codice).toBe("VERIFICA_GIA_REGISTRATA");

    const vincente = chiamate[risultati.findIndex((r) => r.status === "fulfilled")];
    if (vincente.esito === "NON_CONFORME") {
      expect(Number.isInteger(riuscite[0].value.segnalazione)).toBe(true);
    } else {
      expect(riuscite[0].value.segnalazione).toBeNull();
      await nessunaSegnalazioneNuova(1, 15, istante);
    }
  });

  // --- permessiDaVerificare ---

  it("RF_OP_2 · TF-VP-13 · soste miste dell'ente → solo la sosta da verificare sullo stallo 15, senza foto", async () => {
    const a = await sosta("13a", 15, { permesso: "jpeg", targa: "VP13AA" });
    const b = await sosta("13b", 14, { permesso: "png", targa: "VP13BA" });
    await registraVerifica(poolDiTest(), {
      sostaId: b,
      ausiliarioId: 3,
      esito: "CONFORME",
      dataEOra: ora("09:30"),
    });
    await sosta("13c", 16, { targa: "VP13CA" });
    await sosta("13d", 24, { permesso: "jpeg", targa: "VP13DA" });
    await sosta("13e", 4, { permesso: "jpeg", avvio: "09:00", scadenza: "10:00", targa: "VP13EA" });

    const elenco = await facade().permessiDaVerificare(2);

    expect(elenco).toHaveLength(1);
    expect(elenco[0]).toMatchObject({
      sostaId: a,
      stalloId: 15,
      numeroStallo: 2,
      tipoDiStallo: "ROSA",
      targa: "VP13AA",
      dichiarazioneDiPermesso: DICHIARAZIONE,
    });
    for (const [campo, valore] of Object.entries(elenco[0])) {
      expect(campo.toLowerCase()).not.toContain("foto");
      expect(Buffer.isBuffer(valore)).toBe(false);
    }
  });

  it("RF_OP_2 · TF-VP-14 · ente senza permessi da verificare → elenco vuoto", async () => {
    expect(await facade().permessiDaVerificare(6)).toEqual([]);
  });

  it("VD_19 · TF-VP-15 · Ausiliario disattivato → AUSILIARIO_NON_ATTIVO", async () => {
    await verificaErrore(facade().permessiDaVerificare(4), "AUSILIARIO_NON_ATTIVO");
  });

  // --- fotoDelPermesso ---

  it("RF_OP_2 · TF-VP-16 · foto JPEG → dati inseriti, image/jpeg", async () => {
    const s = await sosta("16", 15, { permesso: "jpeg" });

    const foto = await facade().fotoDelPermesso(2, s);

    expect(foto.tipo).toBe("image/jpeg");
    expect(foto.dati.equals(fotoJpeg())).toBe(true);
  });

  it("RF_OP_2 · TF-VP-17 · foto PNG su stallo per persone con disabilità → dati inseriti, image/png", async () => {
    const s = await sosta("17", 14, { permesso: "png" });

    const foto = await facade().fotoDelPermesso(2, s);

    expect(foto.tipo).toBe("image/png");
    expect(foto.dati.equals(fotoPng())).toBe(true);
  });

  it("NRF_LEG_2 · TF-VP-18 · sosta scaduta → SOSTA_NON_ATTIVA", async () => {
    const s = await sosta("18", 15, {
      permesso: "jpeg",
      avvio: "08:00",
      scadenza: "08:30",
      stato: "scaduta",
    });

    await verificaErrore(facade().fotoDelPermesso(2, s), "SOSTA_NON_ATTIVA");
  });

  it("NRF_LEG_2 · TF-VP-19 · sosta terminata → SOSTA_NON_ATTIVA", async () => {
    const s = await sosta("19", 15, {
      permesso: "jpeg",
      avvio: "08:00",
      scadenza: "08:30",
      stato: "terminata",
    });

    await verificaErrore(facade().fotoDelPermesso(2, s), "SOSTA_NON_ATTIVA");
  });

  it("ISSUE_40 · TF-VP-20 · sosta attiva già verificata → foto JPEG restituita", async () => {
    const s = await sosta("20", 15, { permesso: "jpeg" });
    await registraVerifica(poolDiTest(), {
      sostaId: s,
      ausiliarioId: 3,
      esito: "CONFORME",
      dataEOra: ora("09:30"),
    });

    const foto = await facade().fotoDelPermesso(2, s);

    expect(foto.tipo).toBe("image/jpeg");
    expect(foto.dati.equals(fotoJpeg())).toBe(true);
  });

  it("NRF_SIC_1 · TF-VP-21 · sosta di un altro ente → ENTE_NON_AMMESSO", async () => {
    const s = await sosta("21", 24, { permesso: "jpeg" });

    await verificaErrore(facade().fotoDelPermesso(2, s), "ENTE_NON_AMMESSO");
  });
});
