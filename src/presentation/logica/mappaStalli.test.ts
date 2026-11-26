import { describe, expect, it } from "vitest";
import {
  applicaModifiche,
  descrizioneStallo,
  elementoDelloStallo,
  ricordaStalli,
  zonaDallaVista,
  type StalloDellaMappa,
} from "./mappaStalli.ts";

// Specifica: docs/test/cp_mappaInterfaccia.md (TF-MAPUI-01…25)

const T1 = "2026-11-20T09:00:00.000Z";
const T2 = "2026-11-20T09:00:05.000Z";

function S(id: number, stato: string, ultimaModifica: string): StalloDellaMappa {
  return {
    id,
    numero: id,
    latitudine: 40.688,
    longitudine: 14.522,
    tipoDiStallo: "ORDINARIO_A_PAGAMENTO",
    stato,
    ultimaModifica,
    areaDiSosta: { id: 5, nome: "Piazza Aubry" },
    tariffa: { id: 1, costoOrario: 150 },
  };
}

// Lo stallo 19, n. 6 di Piazza Aubry (dalla OMP-61).
function S6(): StalloDellaMappa {
  return { ...S(19, "OCCUPATO", T1), numero: 6 };
}

function N(...stalli: StalloDellaMappa[]): Map<number, StalloDellaMappa> {
  return new Map(stalli.map((stallo) => [stallo.id, stallo]));
}

describe("cp_mappaInterfaccia", () => {
  it("RF_STALLI_1 · TF-MAPUI-01 · estremi con più di 5 decimali → arrotondati verso l'esterno", () => {
    expect(
      zonaDallaVista({ sud: 40.6879912, ovest: 14.5219987, nord: 40.6890001, est: 14.5223004 }),
    ).toBe("40.68799,14.52199,40.68901,14.52231");
  });

  it("RF_STALLI_1 · TF-MAPUI-02 · estremi già a 5 decimali → scritti con 5 decimali", () => {
    expect(zonaDallaVista({ sud: 40.688, ovest: 14.522, nord: 40.689, est: 14.5223 })).toBe(
      "40.68800,14.52200,40.68900,14.52230",
    );
  });

  it("ISSUE_29 · TF-MAPUI-03 · estremi già arrotondati con errore di rappresentazione → non allargati", () => {
    expect(
      zonaDallaVista({
        sud: 40.6884 - 0.002,
        ovest: 14.5221 - 0.002,
        nord: 40.6884 + 0.002,
        est: 14.5221 + 0.002,
      }),
    ).toBe("40.68640,14.52010,40.69040,14.52410");
  });

  it("ISSUE_29 · TF-MAPUI-04 · estremi oltre i limiti → limitati a ±90 e ±180", () => {
    expect(zonaDallaVista({ sud: -95, ovest: -200, nord: 95, est: 190 })).toBe(
      "-90.00000,-180.00000,90.00000,180.00000",
    );
  });

  it("NRF_PER_3 · TF-MAPUI-05 · riga nuova con stato diverso → array nuovo con stato aggiornato", () => {
    const stalli = [S(1, "LIBERO", T1), S(2, "LIBERO", T1)];
    const risultato = applicaModifiche(stalli, [S(2, "OCCUPATO", T2)]);
    expect(risultato).not.toBe(stalli);
    expect(risultato).toEqual([S(1, "LIBERO", T1), S(2, "OCCUPATO", T2)]);
    expect(stalli).toEqual([S(1, "LIBERO", T1), S(2, "LIBERO", T1)]);
  });

  it("NRF_PER_3 · TF-MAPUI-06 · riga già applicata → stesso array", () => {
    const stalli = [S(1, "LIBERO", T1), S(2, "OCCUPATO", T2)];
    expect(applicaModifiche(stalli, [S(2, "OCCUPATO", T2)])).toBe(stalli);
  });

  it("NRF_PER_3 · TF-MAPUI-07 · nessuna riga → stesso array", () => {
    const stalli = [S(1, "LIBERO", T1)];
    expect(applicaModifiche(stalli, [])).toBe(stalli);
  });

  it("NRF_PER_3 · TF-MAPUI-08 · riga con ultimaModifica più vecchia e stato diverso → applicata", () => {
    const stalli = [S(1, "OCCUPATO", T2)];
    expect(applicaModifiche(stalli, [S(1, "NON_DISPONIBILE", T1)])).toEqual([
      S(1, "NON_DISPONIBILE", T1),
    ]);
  });

  it("NRF_PER_3 · TF-MAPUI-09 · rilevazione che conferma lo stato → array nuovo con ultimaModifica aggiornata", () => {
    const stalli = [S(1, "LIBERO", T1)];
    const risultato = applicaModifiche(stalli, [S(1, "LIBERO", T2)]);
    expect(risultato).not.toBe(stalli);
    expect(risultato).toEqual([S(1, "LIBERO", T2)]);
  });

  it("RF_STALLI_1 · TF-MAPUI-10 · riga di uno stallo nuovo della zona → aggiunto in ordine di id", () => {
    const stalli = [S(1, "LIBERO", T1), S(3, "LIBERO", T1)];
    expect(applicaModifiche(stalli, [S(2, "OCCUPATO", T2)])).toEqual([
      S(1, "LIBERO", T1),
      S(2, "OCCUPATO", T2),
      S(3, "LIBERO", T1),
    ]);
  });

  it("NRF_PER_3 · TF-MAPUI-11 · più righe, solo alcune diverse → aggiornate solo quelle diverse", () => {
    const stalli = [S(1, "LIBERO", T1), S(2, "LIBERO", T1)];
    expect(applicaModifiche(stalli, [S(1, "LIBERO", T1), S(2, "SCONOSCIUTO", T2)])).toEqual([
      S(1, "LIBERO", T1),
      S(2, "SCONOSCIUTO", T2),
    ]);
  });

  it("RF_STALLI_1 · TF-MAPUI-12 · stallo libero a pagamento → elemento verde con P e ✓", () => {
    expect(elementoDelloStallo(S(16, "LIBERO", T1))).toEqual({
      id: 16,
      latitudine: 40.688,
      longitudine: 14.522,
      tono: "verde",
      simbolo: "P",
      simboloStato: "✓",
      etichetta: "Stallo n. 16, Piazza Aubry, a pagamento, Libero",
      gruppo: "Piazza Aubry",
    });
  });

  it("RF_STALLI_1 · TF-MAPUI-13 · stallo occupato → rosso con ●", () => {
    expect(elementoDelloStallo(S(17, "OCCUPATO", T1))).toMatchObject({
      tono: "rosso",
      simboloStato: "●",
      etichetta: "Stallo n. 17, Piazza Aubry, a pagamento, Occupato",
    });
  });

  it("RF_STALLI_1 · TF-MAPUI-14 · stallo non disponibile → arancione con ✕", () => {
    expect(elementoDelloStallo(S(18, "NON_DISPONIBILE", T1))).toMatchObject({
      tono: "arancione",
      simboloStato: "✕",
      etichetta: "Stallo n. 18, Piazza Aubry, a pagamento, Non disponibile",
    });
  });

  it("RF_STALLI_1 · TF-MAPUI-15 · stallo sconosciuto → grigio con ?", () => {
    expect(elementoDelloStallo(S(13, "SCONOSCIUTO", T1))).toMatchObject({
      tono: "grigio",
      simboloStato: "?",
      etichetta: "Stallo n. 13, Piazza Aubry, a pagamento, Sconosciuto",
    });
  });

  it("RF_STALLI_1 · TF-MAPUI-16 · stallo per persone con disabilità → simbolo ♿", () => {
    expect(elementoDelloStallo({ ...S(14, "LIBERO", T1), tipoDiStallo: "DISABILI" })).toMatchObject(
      {
        simbolo: "♿",
        etichetta: "Stallo n. 14, Piazza Aubry, per persone con disabilità, Libero",
      },
    );
  });

  it("RF_STALLI_1 · TF-MAPUI-17 · stallo rosa → simbolo R", () => {
    expect(elementoDelloStallo({ ...S(15, "OCCUPATO", T1), tipoDiStallo: "ROSA" })).toMatchObject({
      simbolo: "R",
      etichetta: "Stallo n. 15, Piazza Aubry, rosa, Occupato",
    });
  });

  it("NRF_USA_1 · TF-MAPUI-18 · stato non riconosciuto → grigio con ? e Stato non riconosciuto", () => {
    expect(elementoDelloStallo(S(19, "GUASTO", T1))).toMatchObject({
      tono: "grigio",
      simboloStato: "?",
      etichetta: "Stallo n. 19, Piazza Aubry, a pagamento, Stato non riconosciuto",
    });
  });

  it("ISSUE_33 · TF-MAPUI-19 · nessuno stallo già visto, riga nuova → mappa con il solo stallo 19", () => {
    expect(ricordaStalli(new Map(), [S6()])).toEqual(N(S6()));
  });

  it("ISSUE_33 · TF-MAPUI-20 · fotografia di un'altra zona senza lo stallo → lo stallo 19 resta noto", () => {
    const noti = N(S6());
    const risultato = ricordaStalli(noti, [S(1, "LIBERO", T1)]);
    expect([...risultato.keys()].sort((a, b) => a - b)).toEqual([1, 19]);
    expect(risultato.get(19)).toEqual(S6());
  });

  it("ISSUE_33 · TF-MAPUI-21 · riga più recente dello stesso stallo → sostituita", () => {
    const noti = N(S6());
    const risultato = ricordaStalli(noti, [
      { ...S6(), stato: "NON_DISPONIBILE", ultimaModifica: T2 },
    ]);
    expect([...risultato.keys()]).toEqual([19]);
    expect(risultato.get(19)).toMatchObject({ stato: "NON_DISPONIBILE", ultimaModifica: T2 });
  });

  it("ISSUE_33 · TF-MAPUI-22 · nessuna riga → stessa mappa", () => {
    const noti = N(S6());
    expect(ricordaStalli(noti, [])).toBe(noti);
  });

  it('RF_SOSTA_1 · TF-MAPUI-23 · stallo noto → "Stallo n. 6, Piazza Aubry"', () => {
    expect(descrizioneStallo(19, N(S6()))).toBe("Stallo n. 6, Piazza Aubry");
  });

  it('ISSUE_33 · TF-MAPUI-24 · stallo mai visto → "Stallo 19"', () => {
    expect(descrizioneStallo(19, new Map())).toBe("Stallo 19");
  });

  it('RF_SOSTA_1 · TF-MAPUI-25 · stallo noto da una zona precedente → "Stallo n. 6, Piazza Aubry"', () => {
    const noti = ricordaStalli(ricordaStalli(new Map(), [S6()]), [S(1, "LIBERO", T1)]);
    expect(descrizioneStallo(19, noti)).toBe("Stallo n. 6, Piazza Aubry");
  });
});
