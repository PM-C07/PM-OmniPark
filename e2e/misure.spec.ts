// Misure dei requisiti non funzionali sull'anteprima (docs/test/test_di_sistema.md §6), con
// npm run misura:e2e: TS-11 (NRF_PER_3) e TS-12 (NRF_USA_2). Scrivono i valori grezzi in
// docs/test/misure/, le schermate in docs/test/schermate/nrf_usa_2/ e le sezioni misura:per3 e
// misura:usa2 di docs/misure.md.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ricarica, sosteInCorso, stalliDellaZona } from "./supporto/api.ts";
import {
  MOTIVO_FUORI_FASCIA,
  nellaFasciaAPagamento,
  nuovoIdEsecuzione,
  pianoDiVariazioni,
  STALLI_PER_LE_VARIAZIONI,
} from "./supporto/dati.ts";
import {
  bloccaSfondo,
  etichettaMarker,
  laMiaSosta,
  marker,
  rigaStallo,
} from "./supporto/pagina.ts";
import {
  nuovoAutomobilista,
  preparaStalloPerLaSosta,
  urlDelTest,
} from "./supporto/preparazione.ts";
import { inviaRilevazioni } from "./supporto/simulatori.ts";
import {
  abbinaComparse,
  massimo,
  mediana,
  percentile,
  sostituisciSezione,
  type Invio,
  type Osservazione,
} from "./supporto/statistiche.ts";

const idEsecuzione = nuovoIdEsecuzione();
const RADICE = process.cwd();
const FILE_MISURE = join(RADICE, "docs", "misure.md");
const CARTELLA_VALORI = join(RADICE, "docs", "test", "misure");
const CARTELLA_SCHERMATE = join(RADICE, "docs", "test", "schermate", "nrf_usa_2");

const RISCALDAMENTO = 3;
const MISURATE = 33;
const INTERVALLO_MS = 3000;
const LIMITE_MS = 10_000;
const SOGLIA_MS = 2000;

async function aggiornaMisure(nome: string, righe: string[]) {
  const attuale = existsSync(FILE_MISURE)
    ? await readFile(FILE_MISURE, "utf8")
    : "# Misure dei requisiti non funzionali\n";
  await writeFile(FILE_MISURE, sostituisciSezione(attuale, nome, righe));
}

/** Registra nella pagina ogni cambio dell'etichetta dei marker, con l'orologio del PC. */
async function osservaMarker(page: Page) {
  await page.evaluate(() => {
    const registro: { etichetta: string; t: number }[] = [];
    (window as unknown as { __osservazioniOmniPark: typeof registro }).__osservazioniOmniPark =
      registro;
    new MutationObserver((mutazioni) => {
      const t = Date.now();
      for (const mutazione of mutazioni) {
        const elemento = mutazione.target as Element;
        if (elemento.classList.contains("leaflet-marker-icon")) {
          registro.push({ etichetta: elemento.getAttribute("aria-label") ?? "", t });
        }
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-label"] });
  });
}

function osservazioni(page: Page): Promise<Osservazione[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __osservazioniOmniPark: { etichetta: string; t: number }[] })
        .__osservazioniOmniPark,
  );
}

test(
  "TS-11 · NRF_PER_3 · 33 variazioni dal simulatore dei sensori → comparsa sulla mappa entro 2 s",
  {
    tag: "@misura",
  },
  async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    const url = urlDelTest(testInfo);
    await nuovoAutomobilista(page.request, idEsecuzione, "ts11");
    const stalli = await stalliDellaZona(page.request);
    const usati = STALLI_PER_LE_VARIAZIONI.flatMap((id) =>
      stalli.filter((s) => s.id === id && s.stato !== "NON_DISPONIBILE"),
    );
    expect(usati.length, "stalli delle variazioni senza sosta in corso").toBeGreaterThan(0);
    const perId = new Map(usati.map((s) => [s.id, s]));
    const piano = pianoDiVariazioni(usati, RISCALDAMENTO + MISURATE, INTERVALLO_MS);

    await bloccaSfondo(page);
    await page.goto("/mappa");
    for (const stallo of usati) {
      await expect(marker(page, stallo)).toHaveAttribute(
        "aria-label",
        etichettaMarker(stallo, stallo.stato),
      );
    }
    await osservaMarker(page);

    const righe = await inviaRilevazioni(
      url,
      piano.map(({ stallo, presenza, attesaMs }) => ({ stallo, presenza, attesaMs })),
      testInfo.outputPath("ts11-scenario.json"),
    );
    await page.waitForTimeout(LIMITE_MS);
    const osservate = await osservazioni(page);

    // Le righe del registro sono «scenario-<n>» nell'ordine del piano.
    const invii: Invio[] = piano.map((passo, i) => {
      const riga = righe.find((r) => r.etichetta === `scenario-${i + 1}`);
      const stallo = perId.get(passo.stallo);
      return {
        indice: i + 1,
        stallo: passo.stallo,
        inviatoIl: riga ? Date.parse(riga.inviatoIl) : Number.NaN,
        etichettaAttesa:
          riga?.http === 200 && riga.esito === passo.statoAtteso && stallo
            ? etichettaMarker(stallo, passo.statoAtteso)
            : null,
      };
    });
    const abbinamenti = abbinaComparse(invii, osservate, LIMITE_MS).filter(
      (a) => a.indice > RISCALDAMENTO,
    );
    const esclusi = invii.slice(RISCALDAMENTO).filter((i) => i.etichettaAttesa === null).length;
    const ritardi = abbinamenti.flatMap((a) => (a.ritardoMs === null ? [] : [a.ritardoMs]));
    const nonComparse = abbinamenti.length - ritardi.length;
    const statistiche =
      ritardi.length > 0
        ? { max: massimo(ritardi), mediana: mediana(ritardi), p95: percentile(ritardi, 95) }
        : null;
    const superata =
      abbinamenti.length >= 30 &&
      nonComparse === 0 &&
      statistiche !== null &&
      statistiche.max <= SOGLIA_MS;

    // Valori grezzi, comprese le variazioni di riscaldamento e gli invii esclusi.
    const perIndice = new Map(abbinamenti.map((a) => [a.indice, a]));
    const csv = [
      "n,stallo,presenza,stato_atteso,http,esito,inviato_il,comparso_il,ritardo_ms,nota",
      ...piano.map((passo, i) => {
        const riga = righe.find((r) => r.etichetta === `scenario-${i + 1}`);
        const invio = invii[i];
        const ritardo = perIndice.get(i + 1)?.ritardoMs ?? null;
        const nota =
          i < RISCALDAMENTO
            ? "riscaldamento"
            : invio.etichettaAttesa === null
              ? "escluso"
              : ritardo === null
                ? "non comparsa"
                : "";
        const comparso = ritardo === null ? "" : new Date(invio.inviatoIl + ritardo).toISOString();
        return [
          i + 1,
          passo.stallo,
          passo.presenza,
          passo.statoAtteso,
          riga?.http ?? "",
          riga?.esito ?? "",
          riga?.inviatoIl ?? "",
          comparso,
          ritardo ?? "",
          nota,
        ].join(",");
      }),
    ];
    await mkdir(CARTELLA_VALORI, { recursive: true });
    await writeFile(join(CARTELLA_VALORI, "nrf_per_3.csv"), `${csv.join("\n")}\n`);
    await aggiornaMisure("misura:per3", [
      "",
      "## NRF_PER_3 – Aggiornamento dello stato sulla mappa",
      "",
      `- Data della misura: ${new Date().toISOString()}`,
      "- Comando: `npm run misura:e2e` (TS-11), sull'anteprima del branch",
      `- Variazioni misurate: ${abbinamenti.length} (più ${RISCALDAMENTO} di riscaldamento), sugli stalli ${usati.map((s) => s.id).join(", ")}, una ogni ${INTERVALLO_MS / 1000} s`,
      `- Non comparse entro ${LIMITE_MS / 1000} s: ${nonComparse}; invii esclusi (errore o esito inatteso): ${esclusi}`,
      statistiche
        ? `- Ritardo massimo ${statistiche.max} ms, mediana ${statistiche.mediana} ms, 95° percentile ${statistiche.p95} ms`
        : "- Nessun ritardo misurato",
      `- **Esito: ${superata ? "superata" : "NON superata"}** (soglia ${SOGLIA_MS} ms per ogni variazione)`,
      "- Valori grezzi: `docs/test/misure/nrf_per_3.csv`",
      "",
    ]);
    testInfo.annotations.push({
      type: "NRF_PER_3",
      description: JSON.stringify({
        misurate: abbinamenti.length,
        nonComparse,
        esclusi,
        ...statistiche,
      }),
    });

    expect(abbinamenti.length, "variazioni misurate").toBeGreaterThanOrEqual(30);
    expect(nonComparse, "variazioni non comparse entro il limite").toBe(0);
    expect(statistiche?.max ?? Infinity, "ritardo massimo (ms)").toBeLessThanOrEqual(SOGLIA_MS);
  },
);

test(
  "TS-12 · NRF_USA_2 · dalla mappa alla sosta pagata → 3 interazioni",
  {
    tag: "@misura",
  },
  async ({ page }, testInfo) => {
    test.skip(!nellaFasciaAPagamento(new Date()), MOTIVO_FUORI_FASCIA);
    const url = urlDelTest(testInfo);
    const utente = await nuovoAutomobilista(page.request, idEsecuzione, "ts12");
    await ricarica(page.request, 1000);
    const stallo = await preparaStalloPerLaSosta(
      page.request,
      url,
      testInfo.outputPath("ts12-presenza.json"),
    );
    await mkdir(CARTELLA_SCHERMATE, { recursive: true });
    const schermata = (nome: string) =>
      page.screenshot({
        path: join(CARTELLA_SCHERMATE, `${nome}.jpg`),
        type: "jpeg",
        quality: 70,
        scale: "css",
      });

    // Schermata principale con lo sfondo della mappa (nessun blocco delle tile in questo caso).
    await page.goto("/mappa");
    await expect(rigaStallo(page, stallo)).toContainText("Occupato");
    await expect(marker(page, stallo)).toBeVisible();
    const sfondo = await page
      .locator(".leaflet-tile-loaded")
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => "caricato")
      .catch(() => "non caricato");
    // Il marker dello stallo si può toccare al centro, o è coperto da un marker vicino?
    const coperto = await marker(page, stallo).evaluate((elemento) => {
      const r = elemento.getBoundingClientRect();
      const sopra = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(sopra && elemento.contains(sopra));
    });
    testInfo.annotations.push(
      { type: "sfondo della mappa", description: sfondo },
      { type: "marker dello stallo coperto al centro", description: coperto ? "sì" : "no" },
    );

    let interazioni = 0;
    const interagisci = async (descrizione: string, azione: () => Promise<void>) => {
      interazioni += 1;
      await test.step(`interazione ${interazioni}: ${descrizione}`, azione);
    };

    await schermata("01-mappa");
    await interagisci(
      `tocco sullo stallo n. ${stallo.numero} nell'elenco «Stalli della zona»`,
      () => rigaStallo(page, stallo).click(),
    );
    const avvia = page.getByRole("button", { name: "Avvia sosta" });
    await expect(avvia).toBeEnabled();
    await schermata("02-scheda-stallo");
    await interagisci("«Avvia sosta» con targa e durata già proposte", () => avvia.click());
    const conferma = page.getByRole("button", { name: /^Conferma e paga \(/ });
    await expect(conferma).toBeEnabled();
    await schermata("03-conferma");
    await interagisci("«Conferma e paga»", () => conferma.click());
    await expect(laMiaSosta(page)).toContainText("Attiva");
    await laMiaSosta(page).scrollIntoViewIfNeeded();
    await schermata("04-sosta-pagata");

    const soste = await sosteInCorso(page.request);
    const pagata = soste.some((s) => s.targa === utente.targa && s.stato === "ATTIVA");
    await aggiornaMisure("misura:usa2", [
      "",
      "## NRF_USA_2 – Procedura di sosta in tre interazioni",
      "",
      `- Data della misura: ${new Date().toISOString()}`,
      "- Comando: `npm run misura:e2e` (TS-12), sull'anteprima del branch",
      `- Interazioni dalla mappa alla sosta pagata: ${interazioni} (soglia 3); sosta Attiva: ${pagata ? "sì" : "no"}`,
      `- Stallo n. ${stallo.numero}, ${stallo.areaDiSosta.nome}; sfondo della mappa ${sfondo}; marker coperto al centro: ${coperto ? "sì" : "no"}`,
      `- **Esito: ${interazioni <= 3 && pagata ? "superata" : "NON superata"}**`,
      "- Schermate: `docs/test/schermate/nrf_usa_2/`",
      "",
    ]);

    expect(interazioni).toBeLessThanOrEqual(3);
    expect(pagata, "sosta Attiva in GET /api/soste").toBe(true);
  },
);
