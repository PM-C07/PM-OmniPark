import { describe, expect, it } from "vitest";
import {
  destinazioneDopoAccesso,
  etichettaRuolo,
  indirizzoDiAccesso,
  ruoloDellArea,
  schermataIniziale,
  vociDiMenu,
} from "./navigazione.ts";

describe("navigazione per ruolo (cp_navigazioneRuoli)", () => {
  it("RF_AUTH_4 · TF-NAV-01 · schermata iniziale dell'Automobilista → /mappa", () => {
    expect(schermataIniziale("AUTOMOBILISTA")).toBe("/mappa");
  });

  it("RF_AUTH_4 · TF-NAV-02 · schermata iniziale dell'Ausiliario → /ausiliario", () => {
    expect(schermataIniziale("AUSILIARIO_DEL_TRAFFICO")).toBe("/ausiliario");
  });

  it("RF_AUTH_4 · TF-NAV-03 · schermata iniziale dell'Amministratore → /admin", () => {
    expect(schermataIniziale("AMMINISTRATORE")).toBe("/admin");
  });

  it("ISSUE_28 · TF-NAV-04 · schermata iniziale di un ruolo sconosciuto → /accesso", () => {
    expect(schermataIniziale("ALTRO")).toBe("/accesso");
  });

  it("NRF_SIC_1 · TF-NAV-05 · /mappa appartiene all'area dell'Automobilista → AUTOMOBILISTA", () => {
    expect(ruoloDellArea("/mappa")).toBe("AUTOMOBILISTA");
  });

  it("NRF_SIC_1 · TF-NAV-06 · /profilo appartiene all'area dell'Automobilista → AUTOMOBILISTA", () => {
    expect(ruoloDellArea("/profilo")).toBe("AUTOMOBILISTA");
  });

  it("NRF_SIC_1 · TF-NAV-07 · sotto-percorso di /mappa → AUTOMOBILISTA", () => {
    expect(ruoloDellArea("/mappa/stalli/14")).toBe("AUTOMOBILISTA");
  });

  it("NRF_SIC_1 · TF-NAV-08 · sotto-percorso di /ausiliario → AUSILIARIO_DEL_TRAFFICO", () => {
    expect(ruoloDellArea("/ausiliario/segnalazioni")).toBe("AUSILIARIO_DEL_TRAFFICO");
  });

  it("NRF_SIC_1 · TF-NAV-09 · /admin/ausiliari appartiene all'area dell'Amministratore → AMMINISTRATORE", () => {
    expect(ruoloDellArea("/admin/ausiliari")).toBe("AMMINISTRATORE");
  });

  it("NRF_SIC_1 · TF-NAV-10 · radice / fuori dalle aree → null", () => {
    expect(ruoloDellArea("/")).toBeNull();
  });

  it("NRF_SIC_1 · TF-NAV-11 · /accesso fuori dalle aree → null", () => {
    expect(ruoloDellArea("/accesso")).toBeNull();
  });

  it("NRF_SIC_1 · TF-NAV-12 · prefisso simile /mappatura non è un'area → null", () => {
    expect(ruoloDellArea("/mappatura")).toBeNull();
  });

  it("NRF_SIC_1 · TF-NAV-13 · prefisso simile /administrator non è un'area → null", () => {
    expect(ruoloDellArea("/administrator")).toBeNull();
  });

  it("RF_AUTH_4 · TF-NAV-14 · Automobilista senza ?da= → /mappa", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", null)).toBe("/mappa");
  });

  it("ISSUE_28 · TF-NAV-15 · Automobilista con ?da= della sua area → /profilo", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", "/profilo")).toBe("/profilo");
  });

  it("ISSUE_28 · TF-NAV-16 · Ausiliario con ?da= della sua area → /ausiliario/segnalazioni", () => {
    expect(destinazioneDopoAccesso("AUSILIARIO_DEL_TRAFFICO", "/ausiliario/segnalazioni")).toBe(
      "/ausiliario/segnalazioni",
    );
  });

  it("NRF_SIC_1 · TF-NAV-17 · Automobilista con ?da= dell'area Amministratore → /mappa", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", "/admin")).toBe("/mappa");
  });

  it("NRF_SIC_1 · TF-NAV-18 · Amministratore con ?da= dell'area Automobilista → /admin", () => {
    expect(destinazioneDopoAccesso("AMMINISTRATORE", "/mappa")).toBe("/admin");
  });

  it("ISSUE_28 · TF-NAV-19 · ?da= indirizzo esterno con schema → /mappa", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", "https://esempio.example/mappa")).toBe(
      "/mappa",
    );
  });

  it("ISSUE_28 · TF-NAV-20 · ?da= che inizia con //host → /mappa", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", "//esempio.example/mappa")).toBe("/mappa");
  });

  it("ISSUE_28 · TF-NAV-21 · ?da= che inizia con /\\host → /mappa", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", "/\\esempio.example/mappa")).toBe("/mappa");
  });

  it("ISSUE_28 · TF-NAV-22 · ?da= con query non ammessa → /mappa", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", "/profilo?x=1")).toBe("/mappa");
  });

  it("ISSUE_28 · TF-NAV-23 · ?da= con punti non ammessi → /mappa", () => {
    expect(destinazioneDopoAccesso("AUTOMOBILISTA", "/mappa/../admin")).toBe("/mappa");
  });

  it("RF_AUTH_4 · TF-NAV-24 · Amministratore con ?da= vuoto → /admin", () => {
    expect(destinazioneDopoAccesso("AMMINISTRATORE", "")).toBe("/admin");
  });

  it("ISSUE_28 · TF-NAV-25 · menu dell'Automobilista → Mappa e Profilo", () => {
    expect(vociDiMenu("AUTOMOBILISTA")).toEqual([
      { etichetta: "Mappa", percorso: "/mappa" },
      { etichetta: "Profilo", percorso: "/profilo" },
    ]);
  });

  it("ISSUE_28 · TF-NAV-26 · menu dell'Ausiliario → Segnalazioni", () => {
    expect(vociDiMenu("AUSILIARIO_DEL_TRAFFICO")).toEqual([
      { etichetta: "Segnalazioni", percorso: "/ausiliario" },
    ]);
  });

  it("ISSUE_28 · TF-NAV-27 · menu dell'Amministratore → Panoramica enti e Gestione Ausiliari", () => {
    expect(vociDiMenu("AMMINISTRATORE")).toEqual([
      { etichetta: "Panoramica enti", percorso: "/admin" },
      { etichetta: "Gestione Ausiliari", percorso: "/admin/ausiliari" },
    ]);
  });

  it("ISSUE_28 · TF-NAV-28 · etichetta dell'Automobilista → Automobilista", () => {
    expect(etichettaRuolo("AUTOMOBILISTA", null)).toBe("Automobilista");
  });

  it("ISSUE_28 · TF-NAV-29 · etichetta dell'Ausiliario con ente → Ausiliario del Traffico · ente 1", () => {
    expect(etichettaRuolo("AUSILIARIO_DEL_TRAFFICO", 1)).toBe("Ausiliario del Traffico · ente 1");
  });

  it("ISSUE_28 · TF-NAV-30 · etichetta dell'Amministratore → Amministratore", () => {
    expect(etichettaRuolo("AMMINISTRATORE", null)).toBe("Amministratore");
  });

  it("ISSUE_28 · TF-NAV-31 · indirizzo di accesso da /profilo → /accesso?da=%2Fprofilo", () => {
    expect(indirizzoDiAccesso("/profilo")).toBe("/accesso?da=%2Fprofilo");
  });
});
