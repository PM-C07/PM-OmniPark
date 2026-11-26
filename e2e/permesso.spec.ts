// Test di sistema della sosta con permesso (docs/test/test_di_sistema.md §4, TS-14, OMP-61):
// stallo rosa con la tariffa e stallo per persone con disabilità gratuito, con la dichiarazione e la
// foto del permesso caricata come file (RF_SOSTA_5, UC_SOSTA_1 4.a3 del RAD 0.6, UC_SOSTA_5).
import { expect, test, type Page } from "@playwright/test";
import type { StalloDellaMappa } from "../src/presentation/logica/mappaStalli.ts";
import { testoDichiarazione } from "../src/presentation/logica/permesso.ts";
import { ricarica, saldo, sosteInCorso, type Automobilista } from "./supporto/api.ts";
import { nuovoIdEsecuzione, STALLI_RISERVATI } from "./supporto/dati.ts";
import { bloccaSfondo, laMiaSosta, rigaStallo } from "./supporto/pagina.ts";
import {
  nuovoAutomobilista,
  preparaStalloPerLaSosta,
  urlDelTest,
} from "./supporto/preparazione.ts";

const idEsecuzione = nuovoIdEsecuzione();

/** PNG valido di 1 × 1 pixel: il browser lo legge, lo riduce e lo invia in JPEG. */
const FOTO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
/** File GIF non leggibile come immagine: resta GIF e il controllo anticipato lo rifiuta. */
const FOTO_NON_VALIDA = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(64)]);

async function apriAvvio(page: Page, stallo: StalloDellaMappa) {
  await page.goto("/mappa");
  await rigaStallo(page, stallo).click();
  const scheda = page.locator("section[aria-labelledby='titolo-scheda-stallo']");
  await scheda.getByRole("button", { name: "Avvia sosta" }).click();
  await page.getByLabel("Durata").selectOption("15");
  return scheda;
}

async function sostaDi(page: Page, utente: Automobilista) {
  const sosta = (await sosteInCorso(page.request)).find(
    (s) => s.targa === utente.targa && s.stato === "ATTIVA",
  );
  expect(sosta, "sosta Attiva in GET /api/soste").toBeDefined();
  return sosta;
}

test("TS-14 · RF_SOSTA_5 · avvio con dichiarazione e foto del permesso → rosa PAGATA, disabili GRATUITA", async ({
  page,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  await bloccaSfondo(page);
  const conferma = page.locator("#avvio-conferma");

  await test.step("RF_SOSTA_5 · stallo rosa: permesso con foto non valida, poi valida → sosta PAGATA", async () => {
    const utente = await nuovoAutomobilista(page.request, idEsecuzione, "ts14r");
    await ricarica(page.request, 500);
    const stallo = await preparaStalloPerLaSosta(
      page.request,
      url,
      testInfo.outputPath("ts14-rosa.json"),
      [STALLI_RISERVATI.rosa],
    );
    const scheda = await apriAvvio(page, stallo);
    const permesso = scheda.getByRole("group", { name: "Dichiarazione e foto del permesso" });
    await expect(permesso).toBeVisible();
    await expect(conferma).toBeDisabled();
    // Decisione D6: fotocamera con capture, galleria senza.
    await expect(permesso.getByLabel("Scatta una foto")).toHaveAttribute("capture", "environment");
    await expect(permesso.getByLabel("Scegli dalla galleria")).not.toHaveAttribute("capture");

    // UC_SOSTA_5 2.a1: la foto non è un'immagine valida → segnalata, si resta al passo 1.
    await permesso.getByLabel("Scegli dalla galleria").setInputFiles({
      name: "permesso.gif",
      mimeType: "image/gif",
      buffer: FOTO_NON_VALIDA,
    });
    await expect(permesso.getByText("La foto deve essere un'immagine JPEG o PNG.")).toBeVisible();
    await expect(conferma).toBeDisabled();

    await permesso.getByLabel(testoDichiarazione("ROSA") ?? "").check();
    await permesso.getByLabel("Scegli dalla galleria").setInputFiles({
      name: "permesso.png",
      mimeType: "image/png",
      buffer: FOTO_PNG,
    });
    await expect(permesso.getByText("Foto del permesso pronta.")).toBeVisible();
    await expect(conferma).toBeEnabled();
    await conferma.click();
    await expect(laMiaSosta(page)).toContainText("Attiva");
    const sosta = await sostaDi(page, utente);
    expect(sosta?.stalloId).toBe(STALLI_RISERVATI.rosa);
    expect(sosta?.pagamento).toBe("PAGATA");
  });

  await test.step("RF_SOSTA_5 · stallo per persone con disabilità con saldo 0 → sosta GRATUITA", async () => {
    const utente = await nuovoAutomobilista(page.request, idEsecuzione, "ts14d");
    const stallo = await preparaStalloPerLaSosta(
      page.request,
      url,
      testInfo.outputPath("ts14-disabili.json"),
      [STALLI_RISERVATI.disabili],
    );
    const scheda = await apriAvvio(page, stallo);
    const permesso = scheda.getByRole("group", { name: "Dichiarazione e foto del permesso" });
    await permesso.getByLabel(testoDichiarazione("DISABILI") ?? "").check();
    await permesso.getByLabel("Scatta una foto").setInputFiles({
      name: "permesso.png",
      mimeType: "image/png",
      buffer: FOTO_PNG,
    });
    await expect(permesso.getByText("Foto del permesso pronta.")).toBeVisible();
    await expect(conferma).toHaveText("Conferma (senza addebito)");
    await conferma.click();
    await expect(laMiaSosta(page)).toContainText("Attiva");
    const sosta = await sostaDi(page, utente);
    expect(sosta?.stalloId).toBe(STALLI_RISERVATI.disabili);
    expect(sosta?.pagamento).toBe("GRATUITA");
    expect(await saldo(page.request)).toBe(0);
  });
});
