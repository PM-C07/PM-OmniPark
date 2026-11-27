// Test di sistema delle segnalazioni (docs/test/test_di_sistema.md §5): TS-06, dalla lettura ANPR
// alla chiusura con esito dell'Ausiliario dell'ente competente; da OMP-63 (RAD 0.6) la chiusura
// segue la presa in carico. TS-17 (OMP-63): presa in carico vista da un secondo Ausiliario dello
// stesso ente, stato del pagamento e chiusura.
import { expect, test } from "@playwright/test";
import { accedi, chiudiSegnalazione, segnalazioniNonChiuse } from "./supporto/api.ts";
import { nuovoIdEsecuzione, STALLI_PER_LE_LETTURE, targaAnpr } from "./supporto/dati.ts";
import { accediDallaPagina, bloccaSfondo } from "./supporto/pagina.ts";
import { AUSILIARI, passwordAusiliario, sessioneApi, urlDelTest } from "./supporto/preparazione.ts";
import { inviaLetture } from "./supporto/simulatori.ts";

const idEsecuzione = nuovoIdEsecuzione();
/** Stallo 7: Via Raffaele Viviani n. 3, ente 1 (Gragnano). */
const NUMERO_STALLO_A = 3;
/** Stallo 8: Via Raffaele Viviani n. 4, ente 1 (Gragnano). */
const NUMERO_STALLO_B = 4;

test("TS-06 · RF_ANPR_1 · lettura senza sosta → segnalazione nell'ente 1, chiusa con esito", async ({
  page,
  playwright,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  const targa = targaAnpr(idEsecuzione, "A");
  let id: number | undefined;
  try {
    await test.step("UC_ANPR_1 passi 1–5 · lettura → segnalazione Aperta, sosta assente", async () => {
      const [riga] = await inviaLetture(
        url,
        [{ targa, stallo: STALLI_PER_LE_LETTURE.a }],
        testInfo.outputPath("ts06-lettura.json"),
      );
      expect(riga.http).toBe(200);
      expect(riga.risposta).toMatchObject({
        esito: "SEGNALAZIONE_CREATA",
        motivo: "SOSTA_ASSENTE",
      });
      id = riga.risposta?.segnalazione;
      expect(id).toEqual(expect.any(Number));
    });

    const rigaElenco = page.locator(`button:has([data-riga-segnalazione="${id}"])`);
    const scheda = page.locator("section[aria-labelledby='titolo-scheda-segnalazione']");
    const titoloConferma = page.getByRole("heading", {
      name: "Confermi la chiusura con esito «Sosta irregolare accertata»?",
    });

    await test.step("RF_OP_1 · Paolo Ferri (ente 1) vede la segnalazione sulla mappa", async () => {
      await bloccaSfondo(page);
      await accediDallaPagina(page, AUSILIARI.paoloFerri, passwordAusiliario());
      await expect(page).toHaveURL(/\/ausiliario$/);
      await expect(rigaElenco).toContainText(`Stallo n. ${NUMERO_STALLO_A}`);
      await expect(rigaElenco).toContainText("Sosta assente");
      await expect(rigaElenco).toContainText("Aperta");
    });

    await test.step("UC_OP_1 passo 4 · dettaglio con targa, stallo, motivo e stato", async () => {
      await rigaElenco.click();
      await expect(scheda).toContainText(targa);
      await expect(scheda).toContainText(`n. ${NUMERO_STALLO_A}`);
      await expect(scheda).toContainText("Sosta assente");
      await expect(scheda).toContainText("Aperta");
      await expect(scheda).toContainText("a pagamento");
    });

    await test.step("UC_OP_2 · «Prendi in carico» → Presa in carico, poi gli esiti", async () => {
      await expect(scheda.getByRole("button", { name: "Sosta irregolare accertata" })).toHaveCount(
        0,
      );
      await scheda.getByRole("button", { name: "Prendi in carico" }).click();
      await expect(scheda).toContainText("Presa in carico");
      await expect(rigaElenco).toContainText("Presa in carico");
    });

    await test.step("UC_OP_4 3.a1 · esito scelto e poi annullato → resta Presa in carico", async () => {
      await scheda.getByRole("button", { name: "Sosta irregolare accertata" }).click();
      await expect(titoloConferma).toBeVisible();
      await scheda.getByRole("button", { name: "Annulla", exact: true }).click();
      await expect(titoloConferma).toBeHidden();
      const presa = (await segnalazioniNonChiuse(page.request)).find((s) => s.id === id);
      expect(presa?.stato).toBe("PRESA_IN_CARICO");
    });

    await test.step("RF_OP_6 · chiusura con «sosta irregolare accertata» → esce dalla mappa", async () => {
      await scheda.getByRole("button", { name: "Sosta irregolare accertata" }).click();
      await scheda.getByRole("button", { name: "Conferma", exact: true }).click();
      await expect(rigaElenco).toHaveCount(0);
      const nonChiuse = await segnalazioniNonChiuse(page.request);
      expect(nonChiuse.find((s) => s.id === id)).toBeUndefined();
    });

    await test.step("SCD_3 · dopo un nuovo caricamento la segnalazione chiusa non ricompare", async () => {
      const fotografia = page.waitForResponse((r) =>
        /\/api\/ausiliario\/segnalazioni(\?|$)/.test(r.url()),
      );
      await page.reload();
      expect((await fotografia).status()).toBe(200);
      await expect(page.getByRole("heading", { name: /Possibili soste irregolari/ })).toBeVisible();
      await expect(rigaElenco).toHaveCount(0);
    });
  } finally {
    if (id !== undefined) {
      const paolo = await sessioneApi(playwright, url);
      try {
        await accedi(paolo, AUSILIARI.paoloFerri, passwordAusiliario());
        await chiudiSegnalazione(paolo, id);
      } finally {
        await paolo.dispose();
      }
    }
  }
});

test("TS-17 · RF_OP_3 · presa in carico vista da Sara Galli, stato del pagamento e chiusura di Paolo Ferri", async ({
  page,
  browser,
  playwright,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  const targa = targaAnpr(idEsecuzione, "D");
  const contestoSara = await browser.newContext();
  const paginaSara = await contestoSara.newPage();
  let id: number | undefined;
  try {
    await test.step("UC_ANPR_1 · lettura → segnalazione Aperta sullo stallo 8", async () => {
      const [riga] = await inviaLetture(
        url,
        [{ targa, stallo: STALLI_PER_LE_LETTURE.b }],
        testInfo.outputPath("ts17-lettura.json"),
      );
      expect(riga.risposta?.esito).toBe("SEGNALAZIONE_CREATA");
      id = riga.risposta?.segnalazione;
      expect(id).toEqual(expect.any(Number));
    });

    const riga = (p: typeof page) => p.locator(`button:has([data-riga-segnalazione="${id}"])`);
    const scheda = (p: typeof page) =>
      p.locator("section[aria-labelledby='titolo-scheda-segnalazione']");

    await test.step("RF_OP_1 · Paolo Ferri e Sara Galli (ente 1) vedono la segnalazione Aperta", async () => {
      await bloccaSfondo(page);
      await bloccaSfondo(paginaSara);
      await accediDallaPagina(page, AUSILIARI.paoloFerri, passwordAusiliario());
      await accediDallaPagina(paginaSara, AUSILIARI.saraGalli, passwordAusiliario());
      await expect(page).toHaveURL(/\/ausiliario$/);
      await expect(paginaSara).toHaveURL(/\/ausiliario$/);
      await expect(riga(page)).toContainText(`Stallo n. ${NUMERO_STALLO_B}`);
      await expect(riga(page)).toContainText("Aperta");
      await expect(riga(paginaSara)).toContainText("Aperta");
    });

    await test.step("UC_OP_2 · Paolo Ferri prende in carico", async () => {
      await riga(page).click();
      await scheda(page).getByRole("button", { name: "Prendi in carico" }).click();
      await expect(scheda(page)).toContainText("Presa in carico");
      await expect(
        scheda(page).getByRole("button", { name: "Verifica il pagamento" }),
      ).toBeVisible();
    });

    await test.step("UC_OP_2 · Sara Galli vede la presa in carico senza ricaricare, senza comandi", async () => {
      await expect(riga(paginaSara)).toContainText("Presa in carico");
      await riga(paginaSara).click();
      await expect(scheda(paginaSara)).toContainText("Presa in carico da un altro Ausiliario.");
      await expect(
        scheda(paginaSara).getByRole("button", { name: "Prendi in carico" }),
      ).toHaveCount(0);
      await expect(
        scheda(paginaSara).getByRole("button", { name: "Sosta irregolare accertata" }),
      ).toHaveCount(0);
    });

    await test.step("UC_OP_3 · Paolo Ferri verifica il pagamento → nessuna sosta della targa", async () => {
      await scheda(page).getByRole("button", { name: "Verifica il pagamento" }).click();
      await expect(scheda(page)).toContainText(
        "Per la targa non risulta alcuna sosta su questo stallo.",
      );
    });

    await test.step("UC_OP_4 · Paolo Ferri chiude con «non confermata» → esce dalle due mappe", async () => {
      await scheda(page).getByRole("button", { name: "Non confermata" }).click();
      await scheda(page).getByRole("button", { name: "Conferma", exact: true }).click();
      await expect(riga(page)).toHaveCount(0);
      await expect(riga(paginaSara)).toHaveCount(0);
    });
  } finally {
    await contestoSara.close();
    if (id !== undefined) {
      const paolo = await sessioneApi(playwright, url);
      try {
        await accedi(paolo, AUSILIARI.paoloFerri, passwordAusiliario());
        await chiudiSegnalazione(paolo, id);
      } finally {
        await paolo.dispose();
      }
    }
  }
});
