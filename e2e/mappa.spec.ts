// Test di sistema della mappa degli stalli e dei sensori (docs/test/test_di_sistema.md §4): TS-03 e
// TS-05, sugli stalli delle variazioni (1, 3, 16), nei quali nessun test avvia soste.
import { expect, test } from "@playwright/test";
import { descriviStato } from "../src/presentation/logica/statiDominio.ts";
import { stalliDellaZona } from "./supporto/api.ts";
import { nuovoIdEsecuzione, presenzaOpposta } from "./supporto/dati.ts";
import {
  attendiAggiornamenti,
  bloccaSfondo,
  etichettaMarker,
  marker,
  rigaStallo,
} from "./supporto/pagina.ts";
import { nuovoAutomobilista, urlDelTest } from "./supporto/preparazione.ts";
import { inviaRilevazioni, inviaRilevazioniNonValide } from "./supporto/simulatori.ts";

const idEsecuzione = nuovoIdEsecuzione();

test("TS-03 · RF_IOT_1 · rilevazioni del simulatore → variazioni sulla mappa senza ricaricare; non valide scartate", async ({
  page,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  await nuovoAutomobilista(page.request, idEsecuzione, "ts03");
  const stalli = await stalliDellaZona(page.request);
  const stallo16 = stalli.find((s) => s.id === 16);
  const stallo1 = stalli.find((s) => s.id === 1);
  if (!stallo16 || !stallo1) {
    throw new Error("Stalli 1 e 16 non presenti nella zona iniziale della mappa.");
  }
  expect(stallo16.stato, "lo stallo 16 non deve avere soste in corso").not.toBe("NON_DISPONIBILE");
  await bloccaSfondo(page);

  await test.step("RF_STALLI_1 · mappa con tipo e stato degli stalli", async () => {
    await page.goto("/mappa");
    await expect(marker(page, stallo16)).toHaveAttribute(
      "aria-label",
      etichettaMarker(stallo16, stallo16.stato),
    );
  });

  const prima = presenzaOpposta(stallo16.stato);
  for (const [n, presenza] of [prima, !prima].entries()) {
    await test.step(`UC_IOT_1 passi 1–4 · variazione ${n + 1} dello stallo 16`, async () => {
      const [riga] = await inviaRilevazioni(
        url,
        [{ stallo: 16, presenza }],
        testInfo.outputPath(`ts03-variazione-${n + 1}.json`),
      );
      expect(riga.http).toBe(200);
      expect(riga.esito).toBe(presenza ? "OCCUPATO" : "LIBERO");
      await expect(marker(page, stallo16)).toHaveAttribute(
        "aria-label",
        etichettaMarker(stallo16, riga.esito),
      );
      await expect(rigaStallo(page, stallo16)).toContainText(
        descriviStato("stallo", riga.esito).testo,
      );
    });
  }

  await test.step("UC_IOT_1 2.a1 · rilevazioni non valide → scartate, stallo 1 invariato", async () => {
    const etichettaPrima = await marker(page, stallo1).getAttribute("aria-label");
    const righe = await inviaRilevazioniNonValide(url);
    expect(righe.length).toBeGreaterThan(0);
    for (const riga of righe) {
      expect.soft({ etichetta: riga.etichetta, http: riga.http, esito: riga.esito }).toEqual({
        etichetta: riga.etichetta,
        http: riga.httpAtteso,
        esito: riga.codiceAtteso,
      });
    }
    await attendiAggiornamenti(page, 2);
    await expect(marker(page, stallo1)).toHaveAttribute("aria-label", etichettaPrima ?? "");
  });
});

test("TS-05 · RF_STALLI_1 · aggiornamento interrotto → avviso, poi ripresa senza ricaricare", async ({
  page,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  await nuovoAutomobilista(page.request, idEsecuzione, "ts05");
  const stallo3 = (await stalliDellaZona(page.request)).find((s) => s.id === 3);
  if (!stallo3) {
    throw new Error("Stallo 3 non presente nella zona iniziale della mappa.");
  }
  await bloccaSfondo(page);
  await page.goto("/mappa");
  await expect(marker(page, stallo3)).toHaveCount(1);
  const avviso = page.getByText(/Gli stati mostrati potrebbero non essere aggiornati/);
  const variazioni = "**/api/stalli/modifiche**";

  await test.step("UC_STALLI_1 4.a1 · variazioni bloccate → avviso", async () => {
    await page.route(variazioni, (route) => route.abort());
    await expect(avviso).toBeVisible();
  });

  await test.step("UC_STALLI_1 4.a1 · connessione di nuovo disponibile → ripresa dal passo 4", async () => {
    const [riga] = await inviaRilevazioni(
      url,
      [{ stallo: 3, presenza: presenzaOpposta(stallo3.stato) }],
      testInfo.outputPath("ts05-variazione.json"),
    );
    expect(riga.http).toBe(200);
    await page.unroute(variazioni);
    await expect(avviso).toBeHidden();
    await expect(marker(page, stallo3)).toHaveAttribute(
      "aria-label",
      etichettaMarker(stallo3, riga.esito),
    );
  });
});
