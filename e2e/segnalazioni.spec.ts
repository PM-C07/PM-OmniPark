// Test di sistema delle segnalazioni (docs/test/test_di_sistema.md §5): TS-06, dalla lettura ANPR
// alla chiusura con esito dell'Ausiliario dell'ente competente.
import { expect, test } from "@playwright/test";
import { accedi, chiudiSegnalazione, segnalazioniNonChiuse } from "./supporto/api.ts";
import { nuovoIdEsecuzione, STALLI_PER_LE_LETTURE, targaAnpr } from "./supporto/dati.ts";
import { accediDallaPagina, bloccaSfondo } from "./supporto/pagina.ts";
import { AUSILIARI, passwordAusiliario, sessioneApi, urlDelTest } from "./supporto/preparazione.ts";
import { inviaLetture } from "./supporto/simulatori.ts";

const idEsecuzione = nuovoIdEsecuzione();
/** Stallo 7: Via Raffaele Viviani n. 3, ente 1 (Gragnano). */
const NUMERO_STALLO_A = 3;

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
    });

    await test.step("UC_OP_4 3.a1 · esito scelto e poi annullato → resta Aperta", async () => {
      await scheda.getByRole("button", { name: "Sosta irregolare accertata" }).click();
      await expect(titoloConferma).toBeVisible();
      await scheda.getByRole("button", { name: "Annulla", exact: true }).click();
      await expect(titoloConferma).toBeHidden();
      const aperta = (await segnalazioniNonChiuse(page.request)).find((s) => s.id === id);
      expect(aperta?.stato).toBe("APERTA");
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
