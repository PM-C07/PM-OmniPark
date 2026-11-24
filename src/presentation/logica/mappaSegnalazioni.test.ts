import { describe, expect, it } from "vitest";
import {
  applicaModificheSegnalazioni,
  azioneDopoLaChiusura,
  CAMPI_CHIUSURA,
  chiudibilitaPer,
  descriviMotivo,
  elementoDellaSegnalazione,
  ESITI,
  formattaDataOra,
  LEGENDA_SEGNALAZIONI,
  ordinaDallaPiuRecente,
  passoChiusura,
  rispostaAllaChiusura,
  scartaChiuseLocalmente,
  type SegnalazioneDellaMappa,
  utenteDaRisposta,
} from "./mappaSegnalazioni.ts";
import { erroreDiRete, interpretaRisposta } from "./risposteApi.ts";

// Specifica: docs/test/cp_mappaSegnalazioni.md (TF-SEGUI-01…57)

const L1 = "2026-11-20T08:00:00.000Z";
const L2 = "2026-11-20T08:10:00.000Z";
const L3 = "2026-11-20T08:20:00.000Z";
const M1 = "2026-11-20T09:00:00.000Z";
const M2 = "2026-11-20T09:00:05.000Z";

const GIA = "La segnalazione è già chiusa.";
const ALTRI = "La segnalazione è presa in carico da un altro Ausiliario.";
const ESITO = "Indica l'esito: sosta irregolare accertata o non confermata.";
const RETE = "Impossibile contattare il server. Controlla la connessione e riprova.";
const GENERICO = "Si è verificato un errore. Riprova più tardi.";

const TERMINI_DI_SANZIONE = ["sanzion", "multa", "infrazion", "contravvenzion", "verbale"];

function G(
  id: number,
  stato: string,
  lettura: string | null,
  modifiche: Partial<SegnalazioneDellaMappa> = {},
): SegnalazioneDellaMappa {
  return {
    id,
    stalloId: 100 + id,
    numeroStallo: id,
    latitudine: 40.688,
    longitudine: 14.522,
    stato,
    motivo: "SOSTA_ASSENTE",
    targaRilevata: "AB123CD",
    dataEOraDellaLettura: lettura,
    ausiliarioId: stato === "APERTA" ? null : 2,
    ultimaModifica: M1,
    ...modifiche,
  };
}

function ids(segnalazioni: readonly SegnalazioneDellaMappa[]): number[] {
  return segnalazioni.map((s) => s.id);
}

describe("cp_mappaSegnalazioni", () => {
  it("RF_OP_1 · TF-SEGUI-01 · motivo sosta assente → Sosta assente, rosso, !", () => {
    expect(descriviMotivo("SOSTA_ASSENTE")).toEqual({
      testo: "Sosta assente",
      tono: "rosso",
      simbolo: "!",
    });
  });

  it("RF_OP_1 · TF-SEGUI-02 · motivo sosta scaduta → Sosta scaduta, arancione, ⏱", () => {
    expect(descriviMotivo("SOSTA_SCADUTA")).toEqual({
      testo: "Sosta scaduta",
      tono: "arancione",
      simbolo: "⏱",
    });
  });

  it("RF_OP_1 · TF-SEGUI-03 · motivo targa non corrispondente → Targa non corrispondente, viola, ≠", () => {
    expect(descriviMotivo("TARGA_NON_CORRISPONDENTE")).toEqual({
      testo: "Targa non corrispondente",
      tono: "viola",
      simbolo: "≠",
    });
  });

  it("NRF_USA_1 · TF-SEGUI-04 · motivo assente → Motivo non indicato, grigio, ?", () => {
    expect(descriviMotivo(null)).toEqual({
      testo: "Motivo non indicato",
      tono: "grigio",
      simbolo: "?",
    });
  });

  it("NRF_USA_1 · TF-SEGUI-05 · motivo non riconosciuto → Motivo non riconosciuto, grigio, ?", () => {
    expect(descriviMotivo("ALTRO")).toEqual({
      testo: "Motivo non riconosciuto",
      tono: "grigio",
      simbolo: "?",
    });
  });

  it("RF_OP_1 · TF-SEGUI-06 · segnalazione aperta per sosta assente → elemento rosso con ! e ○", () => {
    expect(elementoDellaSegnalazione(G(12, "APERTA", L1))).toEqual({
      id: 12,
      latitudine: 40.688,
      longitudine: 14.522,
      tono: "rosso",
      simbolo: "!",
      simboloStato: "○",
      etichetta: "Possibile sosta irregolare, stallo n. 12, Sosta assente, targa AB123CD, Aperta",
      gruppo: "Segnalazioni aperte e prese in carico",
    });
  });

  it("RF_OP_1 · TF-SEGUI-07 · segnalazione presa in carico per sosta scaduta → arancione con ⏱ e ◐", () => {
    expect(
      elementoDellaSegnalazione(G(13, "PRESA_IN_CARICO", L1, { motivo: "SOSTA_SCADUTA" })),
    ).toMatchObject({
      tono: "arancione",
      simbolo: "⏱",
      simboloStato: "◐",
      etichetta:
        "Possibile sosta irregolare, stallo n. 13, Sosta scaduta, targa AB123CD, Presa in carico",
    });
  });

  it("ISSUE_30 · TF-SEGUI-08 · targa non letta → viola con ≠ e «targa non letta» nell'etichetta", () => {
    expect(
      elementoDellaSegnalazione(
        G(14, "APERTA", L1, { motivo: "TARGA_NON_CORRISPONDENTE", targaRilevata: null }),
      ),
    ).toMatchObject({
      tono: "viola",
      simbolo: "≠",
      etichetta:
        "Possibile sosta irregolare, stallo n. 14, Targa non corrispondente, targa non letta, Aperta",
    });
  });

  it("NRF_USA_1 · TF-SEGUI-09 · stato non riconosciuto → ? e Stato non riconosciuto", () => {
    expect(elementoDellaSegnalazione(G(15, "SOSPESA", L1))).toMatchObject({
      simboloStato: "?",
      etichetta:
        "Possibile sosta irregolare, stallo n. 15, Sosta assente, targa AB123CD, Stato non riconosciuto",
    });
  });

  it("NRF_USA_1 · TF-SEGUI-10 · legenda → sei voci nell'ordine, ciascuna con simbolo e testo", () => {
    expect(LEGENDA_SEGNALAZIONI).toEqual([
      { tono: "rosso", simbolo: "!", testo: "Sosta assente" },
      { tono: "arancione", simbolo: "⏱", testo: "Sosta scaduta" },
      { tono: "viola", simbolo: "≠", testo: "Targa non corrispondente" },
      { tono: "grigio", simbolo: "?", testo: "Motivo non indicato o non riconosciuto" },
      { simbolo: "○", testo: "Aperta" },
      { simbolo: "◐", testo: "Presa in carico" },
    ]);
    for (const voce of LEGENDA_SEGNALAZIONI) {
      expect(voce.simbolo.length).toBeGreaterThan(0);
      expect(voce.testo.length).toBeGreaterThan(0);
    }
  });

  it("ISSUE_30 · TF-SEGUI-11 · esiti, legenda, etichette e messaggi → nessun termine di sanzione", () => {
    expect(ESITI).toEqual({
      SOSTA_IRREGOLARE_ACCERTATA: "Sosta irregolare accertata",
      NON_CONFERMATA: "Non confermata",
    });
    const testi = [
      ...LEGENDA_SEGNALAZIONI.map((voce) => voce.testo),
      ...Object.values(ESITI),
      elementoDellaSegnalazione(G(12, "APERTA", L1)).etichetta,
      elementoDellaSegnalazione(G(13, "PRESA_IN_CARICO", L1, { motivo: "SOSTA_SCADUTA" }))
        .etichetta,
      elementoDellaSegnalazione(
        G(14, "APERTA", L1, { motivo: "TARGA_NON_CORRISPONDENTE", targaRilevata: null }),
      ).etichetta,
      elementoDellaSegnalazione(G(15, "SOSPESA", L1)).etichetta,
    ];
    const chiudibilita = chiudibilitaPer(G(4, "PRESA_IN_CARICO", L1, { ausiliarioId: 3 }), 2);
    expect(chiudibilita.chiudibile).toBe(false);
    if (!chiudibilita.chiudibile) testi.push(chiudibilita.messaggio);
    const messaggioMappa = azioneDopoLaChiusura({ tipo: "chiusa" }, 12).messaggioMappa;
    expect(messaggioMappa).not.toBeNull();
    if (messaggioMappa !== null) testi.push(messaggioMappa.testo);
    for (const testo of testi) {
      for (const termine of TERMINI_DI_SANZIONE) {
        expect(testo.toLowerCase()).not.toContain(termine);
      }
    }
  });

  it("ISSUE_30 · TF-SEGUI-12 · letture diverse → dalla più recente, array ricevuto invariato", () => {
    const s = [G(1, "APERTA", L1), G(2, "APERTA", L3), G(3, "APERTA", L2)];
    expect(ids(ordinaDallaPiuRecente(s))).toEqual([2, 3, 1]);
    expect(ids(s)).toEqual([1, 2, 3]);
  });

  it("ISSUE_30 · TF-SEGUI-13 · stessa lettura → dall'id più alto", () => {
    expect(
      ids(ordinaDallaPiuRecente([G(4, "APERTA", L1), G(9, "APERTA", L1), G(6, "APERTA", L2)])),
    ).toEqual([6, 9, 4]);
  });

  it("ISSUE_30 · TF-SEGUI-14 · lettura assente → in fondo, dall'id più alto", () => {
    expect(
      ids(ordinaDallaPiuRecente([G(5, "APERTA", null), G(1, "APERTA", L1), G(8, "APERTA", null)])),
    ).toEqual([1, 8, 5]);
  });

  it("ISSUE_30 · TF-SEGUI-15 · nessuna segnalazione → elenco vuoto", () => {
    expect(ordinaDallaPiuRecente([])).toEqual([]);
  });

  it("RF_OP_1 · TF-SEGUI-16 · segnalazione nuova → aggiunta in ordine, array nuovo", () => {
    const a = [G(1, "APERTA", L1)];
    const righe = [G(2, "APERTA", L2, { ultimaModifica: M2 })];
    const risultato = applicaModificheSegnalazioni(a, righe);
    expect(risultato).not.toBe(a);
    expect(risultato).toEqual([G(2, "APERTA", L2, { ultimaModifica: M2 }), G(1, "APERTA", L1)]);
    expect(a).toEqual([G(1, "APERTA", L1)]);
    expect(righe).toEqual([G(2, "APERTA", L2, { ultimaModifica: M2 })]);
  });

  it("ISSUE_30 · TF-SEGUI-17 · riga già applicata → stesso array", () => {
    const a = [G(2, "APERTA", L2), G(1, "APERTA", L1)];
    expect(applicaModificheSegnalazioni(a, [G(2, "APERTA", L2)])).toBe(a);
  });

  it("RF_OP_1 · TF-SEGUI-18 · riga CHIUSA di una segnalazione chiusa da un altro Ausiliario → rimossa", () => {
    const a = [G(2, "APERTA", L2), G(1, "APERTA", L1)];
    const risultato = applicaModificheSegnalazioni(a, [
      G(2, "CHIUSA", L2, { ausiliarioId: 3, ultimaModifica: M2 }),
    ]);
    expect(risultato).not.toBe(a);
    expect(risultato).toEqual([G(1, "APERTA", L1)]);
    expect(a).toEqual([G(2, "APERTA", L2), G(1, "APERTA", L1)]);
  });

  it("RF_OP_1 · TF-SEGUI-19 · da Aperta a Presa in carico → sostituita, array nuovo", () => {
    const a = [G(1, "APERTA", L1)];
    const risultato = applicaModificheSegnalazioni(a, [
      G(1, "PRESA_IN_CARICO", L1, { ultimaModifica: M2 }),
    ]);
    expect(risultato).not.toBe(a);
    expect(risultato).toEqual([G(1, "PRESA_IN_CARICO", L1, { ultimaModifica: M2 })]);
    expect(a).toEqual([G(1, "APERTA", L1)]);
  });

  it("ISSUE_30 · TF-SEGUI-20 · riga CHIUSA di una segnalazione mai vista → stesso array", () => {
    const a = [G(1, "APERTA", L1)];
    expect(applicaModificheSegnalazioni(a, [G(7, "CHIUSA", L2)])).toBe(a);
  });

  it("ISSUE_30 · TF-SEGUI-21 · nessuna riga → stesso array", () => {
    const a = [G(1, "APERTA", L1)];
    expect(applicaModificheSegnalazioni(a, [])).toBe(a);
  });

  it("RF_OP_1 · TF-SEGUI-22 · più righe di tipi diversi → aggiunta, rimozione e invariata, in ordine", () => {
    const a = [G(3, "APERTA", L3), G(2, "APERTA", L2), G(1, "APERTA", L1)];
    const risultato = applicaModificheSegnalazioni(a, [
      G(1, "APERTA", L1),
      G(2, "CHIUSA", L2),
      G(4, "APERTA", L2, { motivo: "SOSTA_SCADUTA" }),
    ]);
    expect(risultato).not.toBe(a);
    expect(risultato).toEqual([
      G(3, "APERTA", L3),
      G(4, "APERTA", L2, { motivo: "SOSTA_SCADUTA" }),
      G(1, "APERTA", L1),
    ]);
    expect(a).toEqual([G(3, "APERTA", L3), G(2, "APERTA", L2), G(1, "APERTA", L1)]);
  });

  it("ISSUE_30 · TF-SEGUI-23 · riga non chiusa di un id chiuso qui → scartata, insieme invariato", () => {
    const r = [G(7, "APERTA", L1)];
    const c = new Set([7]);
    const risultato = scartaChiuseLocalmente(r, c);
    expect(risultato.righe).toEqual([]);
    expect(risultato.chiuse).toBe(c);
    expect(c.has(7)).toBe(true);
    expect(r).toEqual([G(7, "APERTA", L1)]);
  });

  it("ISSUE_30 · TF-SEGUI-24 · riga CHIUSA di un id chiuso qui → id tolto dall'insieme", () => {
    const r = [G(7, "CHIUSA", L1, { ultimaModifica: M2 })];
    const c = new Set([7, 9]);
    const risultato = scartaChiuseLocalmente(r, c);
    expect(risultato.righe).toBe(r);
    expect(risultato.chiuse).not.toBe(c);
    expect([...risultato.chiuse]).toEqual([9]);
    expect([...c].sort()).toEqual([7, 9]);
  });

  it("ISSUE_30 · TF-SEGUI-25 · righe di altri id → stesse righe e stesso insieme", () => {
    const r = [G(1, "APERTA", L1), G(2, "CHIUSA", L2)];
    const c = new Set([7]);
    const risultato = scartaChiuseLocalmente(r, c);
    expect(risultato.righe).toBe(r);
    expect(risultato.chiuse).toBe(c);
  });

  it("ISSUE_30 · TF-SEGUI-26 · insieme vuoto → stesse righe e stesso insieme", () => {
    const r = [G(1, "APERTA", L1)];
    const c = new Set<number>();
    const risultato = scartaChiuseLocalmente(r, c);
    expect(risultato.righe).toBe(r);
    expect(risultato.chiuse).toBe(c);
  });

  it("ISSUE_30 · TF-SEGUI-27 · risposta del polling partita prima della chiusura → la segnalazione non ricompare", () => {
    const a = [G(1, "APERTA", L1)];
    const c = new Set([7]);
    const { righe } = scartaChiuseLocalmente([G(7, "PRESA_IN_CARICO", L2)], c);
    expect(applicaModificheSegnalazioni(a, righe)).toBe(a);
  });

  it("RF_OP_6 · TF-SEGUI-28 · esito accertata confermato → richiesta di chiusura con l'esito", () => {
    const p1 = passoChiusura(
      7,
      { fase: "inattiva" },
      { tipo: "indicaEsito", esito: "SOSTA_IRREGOLARE_ACCERTATA" },
    );
    expect(p1).toEqual({
      stato: { fase: "daConfermare", esito: "SOSTA_IRREGOLARE_ACCERTATA" },
      richiesta: null,
    });
    const p2 = passoChiusura(7, p1.stato, { tipo: "conferma" });
    expect(p2).toEqual({
      stato: { fase: "inInvio", esito: "SOSTA_IRREGOLARE_ACCERTATA" },
      richiesta: {
        url: "/api/segnalazioni/7/chiusura",
        corpo: { esito: "SOSTA_IRREGOLARE_ACCERTATA" },
      },
    });
  });

  it("RF_OP_6 · TF-SEGUI-29 · esito non confermata confermato → richiesta di chiusura con l'esito", () => {
    const p1 = passoChiusura(
      12,
      { fase: "inattiva" },
      { tipo: "indicaEsito", esito: "NON_CONFERMATA" },
    );
    expect(p1.richiesta).toBeNull();
    const p2 = passoChiusura(12, p1.stato, { tipo: "conferma" });
    expect(p2.richiesta).toEqual({
      url: "/api/segnalazioni/12/chiusura",
      corpo: { esito: "NON_CONFERMATA" },
    });
  });

  it("ISSUE_30 · TF-SEGUI-30 · conferma annullata → inattiva, nessuna richiesta", () => {
    expect(
      passoChiusura(
        7,
        { fase: "daConfermare", esito: "SOSTA_IRREGOLARE_ACCERTATA" },
        { tipo: "annulla" },
      ),
    ).toEqual({ stato: { fase: "inattiva" }, richiesta: null });
  });

  it("ISSUE_30 · TF-SEGUI-31 · conferma senza esito indicato → stesso stato, nessuna richiesta", () => {
    expect(passoChiusura(7, { fase: "inattiva" }, { tipo: "conferma" })).toEqual({
      stato: { fase: "inattiva" },
      richiesta: null,
    });
  });

  it("ISSUE_30 · TF-SEGUI-32 · seconda conferma durante l'invio → stesso stato, nessuna richiesta", () => {
    expect(
      passoChiusura(7, { fase: "inInvio", esito: "NON_CONFERMATA" }, { tipo: "conferma" }),
    ).toEqual({ stato: { fase: "inInvio", esito: "NON_CONFERMATA" }, richiesta: null });
  });

  it("RF_OP_6 · TF-SEGUI-33 · chiusura riuscita → chiusa", () => {
    expect(rispostaAllaChiusura(interpretaRisposta(200, {}, CAMPI_CHIUSURA))).toEqual({
      tipo: "chiusa",
    });
  });

  it("RF_OP_6 · TF-SEGUI-34 · segnalazione già chiusa → nonChiudibile con rimozione", () => {
    expect(
      rispostaAllaChiusura(
        interpretaRisposta(
          409,
          { errore: { codice: "SEGNALAZIONE_GIA_CHIUSA", messaggio: GIA } },
          CAMPI_CHIUSURA,
        ),
      ),
    ).toEqual({ tipo: "nonChiudibile", messaggio: GIA, rimuovi: true });
  });

  it("RF_OP_6 · TF-SEGUI-35 · segnalazione presa da altri → nonChiudibile senza rimozione", () => {
    expect(
      rispostaAllaChiusura(
        interpretaRisposta(
          409,
          { errore: { codice: "SEGNALAZIONE_PRESA_DA_ALTRI", messaggio: ALTRI } },
          CAMPI_CHIUSURA,
        ),
      ),
    ).toEqual({ tipo: "nonChiudibile", messaggio: ALTRI, rimuovi: false });
  });

  it("ISSUE_30 · TF-SEGUI-36 · 401 → sessioneScaduta", () => {
    expect(
      rispostaAllaChiusura(
        interpretaRisposta(
          401,
          { errore: { codice: "SESSIONE_NON_VALIDA", messaggio: "Sessione scaduta." } },
          CAMPI_CHIUSURA,
        ),
      ),
    ).toEqual({ tipo: "sessioneScaduta" });
  });

  it("RF_OP_6 · TF-SEGUI-37 · esito non valido → errore con il messaggio della API", () => {
    expect(
      rispostaAllaChiusura(
        interpretaRisposta(
          422,
          { errore: { codice: "ESITO_NON_VALIDO", messaggio: ESITO } },
          CAMPI_CHIUSURA,
        ),
      ),
    ).toEqual({ tipo: "errore", messaggio: ESITO });
  });

  it("ISSUE_30 · TF-SEGUI-38 · errore di rete → errore con il messaggio di rete", () => {
    expect(rispostaAllaChiusura(erroreDiRete())).toEqual({ tipo: "errore", messaggio: RETE });
  });

  it("ISSUE_30 · TF-SEGUI-39 · risposta non JSON → errore con il messaggio generico", () => {
    expect(
      rispostaAllaChiusura(interpretaRisposta(500, "Internal Server Error", CAMPI_CHIUSURA)),
    ).toEqual({ tipo: "errore", messaggio: GENERICO });
  });

  it("RF_OP_1 · TF-SEGUI-40 · lettura in ora solare e in ora legale → gg/mm/aaaa hh:mm nel fuso Europe/Rome", () => {
    expect(formattaDataOra("2026-11-20T08:00:00.000Z")).toBe("20/11/2026 09:00");
    expect(formattaDataOra("2026-07-01T06:05:00.000Z")).toBe("01/07/2026 08:05");
  });

  it("ISSUE_30 · TF-SEGUI-41 · lettura assente → Non disponibile", () => {
    expect(formattaDataOra(null)).toBe("Non disponibile");
  });

  it("RF_OP_6 · TF-SEGUI-42 · segnalazione Aperta → chiudibile", () => {
    expect(chiudibilitaPer(G(11, "APERTA", L1), 2)).toEqual({ chiudibile: true });
  });

  it("RF_OP_6 · TF-SEGUI-43 · presa in carico dall'utente → chiudibile", () => {
    expect(chiudibilitaPer(G(5, "PRESA_IN_CARICO", L1, { ausiliarioId: 2 }), 2)).toEqual({
      chiudibile: true,
    });
  });

  it("RF_OP_6 · TF-SEGUI-44 · presa in carico da un altro Ausiliario → non chiudibile", () => {
    expect(chiudibilitaPer(G(4, "PRESA_IN_CARICO", L1, { ausiliarioId: 3 }), 2)).toEqual({
      chiudibile: false,
      messaggio: "Presa in carico da un altro Ausiliario.",
    });
  });

  it("ISSUE_30 · TF-SEGUI-45 · utente non noto → chiudibile", () => {
    expect(chiudibilitaPer(G(4, "PRESA_IN_CARICO", L1, { ausiliarioId: 3 }), null)).toEqual({
      chiudibile: true,
    });
  });

  it("ISSUE_30 · TF-SEGUI-46 · presa in carico senza assegnatario → chiudibile", () => {
    expect(chiudibilitaPer(G(6, "PRESA_IN_CARICO", L1, { ausiliarioId: null }), 2)).toEqual({
      chiudibile: true,
    });
  });

  it("RF_OP_6 · TF-SEGUI-47 · chiusa → rimossa, ritorno alla mappa con messaggio di successo", () => {
    expect(azioneDopoLaChiusura({ tipo: "chiusa" }, 12)).toEqual({
      rimuovi: true,
      tornaAllaMappa: true,
      accesso: false,
      messaggioMappa: {
        tipo: "successo",
        testo: "Segnalazione dello stallo n. 12 chiusa: esito registrato.",
      },
      messaggioScheda: null,
    });
  });

  it("RF_OP_6 · TF-SEGUI-48 · già chiusa → rimossa, ritorno alla mappa con messaggio di errore", () => {
    expect(
      azioneDopoLaChiusura({ tipo: "nonChiudibile", messaggio: GIA, rimuovi: true }, 12),
    ).toEqual({
      rimuovi: true,
      tornaAllaMappa: true,
      accesso: false,
      messaggioMappa: { tipo: "errore", testo: GIA },
      messaggioScheda: null,
    });
  });

  it("RF_OP_6 · TF-SEGUI-49 · presa da altri → ritorno alla mappa, segnalazione non rimossa", () => {
    expect(
      azioneDopoLaChiusura({ tipo: "nonChiudibile", messaggio: ALTRI, rimuovi: false }, 12),
    ).toEqual({
      rimuovi: false,
      tornaAllaMappa: true,
      accesso: false,
      messaggioMappa: { tipo: "errore", testo: ALTRI },
      messaggioScheda: null,
    });
  });

  it("ISSUE_30 · TF-SEGUI-50 · sessione scaduta → accesso", () => {
    expect(azioneDopoLaChiusura({ tipo: "sessioneScaduta" }, 12)).toEqual({
      rimuovi: false,
      tornaAllaMappa: false,
      accesso: true,
      messaggioMappa: null,
      messaggioScheda: null,
    });
  });

  it("ISSUE_30 · TF-SEGUI-51 · altro errore → resta nella scheda con il messaggio", () => {
    expect(azioneDopoLaChiusura({ tipo: "errore", messaggio: ESITO }, 12)).toEqual({
      rimuovi: false,
      tornaAllaMappa: false,
      accesso: false,
      messaggioMappa: null,
      messaggioScheda: ESITO,
    });
  });

  it("ISSUE_30 · TF-SEGUI-52 · risposta di GET /api/auth/io con id intero → id dell'utente", () => {
    expect(utenteDaRisposta({ utente: { id: 2, ruolo: "AUSILIARIO_DEL_TRAFFICO", ente: 1 } })).toBe(
      2,
    );
  });

  it("ISSUE_30 · TF-SEGUI-53 · oggetto senza utente → null", () => {
    expect(utenteDaRisposta({})).toBeNull();
  });

  it("ISSUE_30 · TF-SEGUI-54 · id non numerico → null", () => {
    expect(utenteDaRisposta({ utente: { id: "2" } })).toBeNull();
  });

  it("ISSUE_30 · TF-SEGUI-55 · dati non oggetto → null, nessuna eccezione", () => {
    expect(() => utenteDaRisposta(null)).not.toThrow();
    expect(utenteDaRisposta(null)).toBeNull();
    expect(() => utenteDaRisposta("testo")).not.toThrow();
    expect(utenteDaRisposta("testo")).toBeNull();
  });

  it("ISSUE_30 · TF-SEGUI-56 · id non intero → null", () => {
    expect(utenteDaRisposta({ utente: { id: 2.5 } })).toBeNull();
  });

  it("ISSUE_30 · TF-SEGUI-57 · utente nullo → null, nessuna eccezione", () => {
    expect(() => utenteDaRisposta({ utente: null })).not.toThrow();
    expect(utenteDaRisposta({ utente: null })).toBeNull();
  });
});
