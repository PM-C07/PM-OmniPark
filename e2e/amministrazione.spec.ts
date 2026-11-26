// Test di sistema dell'Amministratore (docs/test/test_di_sistema.md §5, OMP-62): TS-09 (accesso e
// panoramica degli enti) e TS-13 (gestione di un account di Ausiliario). La password
// dell'Amministratore arriva solo da OMNIPARK_E2E_PASSWORD_AMMINISTRATORE, impostata con read -s:
// senza la variabile i due casi di test sono saltati con il motivo.
import { expect, test } from "@playwright/test";
import { codiceErrore } from "./supporto/api.ts";
import { emailDiProva, nuovoIdEsecuzione, passwordDiProva } from "./supporto/dati.ts";
import { accediDallaPagina, bloccaSfondo, compilaAccesso } from "./supporto/pagina.ts";
import {
  AMMINISTRATORE,
  MOTIVO_SENZA_AMMINISTRATORE,
  passwordAmministratore,
} from "./supporto/preparazione.ts";

const idEsecuzione = nuovoIdEsecuzione();

test("TS-09 · RF_AUTH_4 · accesso dell'Amministratore → panoramica degli enti, altre aree negate, uscita", async ({
  page,
}) => {
  const password = passwordAmministratore();
  test.skip(password === undefined, MOTIVO_SENZA_AMMINISTRATORE);
  if (password === undefined) {
    return;
  }
  await bloccaSfondo(page);

  await test.step("RF_AUTH_4 · accesso → /admin con la panoramica degli enti", async () => {
    await accediDallaPagina(page, AMMINISTRATORE, password);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Panoramica degli enti" }),
    ).toBeVisible();
    await expect(page.getByText("Amministratore", { exact: true })).toBeVisible();
  });

  await test.step("RF_ADM_1 · tabella degli enti con i tre valori", async () => {
    const riga = page.getByRole("row", { name: /Comune di Gragnano/ });
    await expect(riga).toBeVisible();
    await expect(riga).not.toContainText("Caricamento…");
    await expect(riga.getByRole("cell")).toHaveCount(3);
    for (const cella of await riga.getByRole("cell").all()) {
      await expect(cella).toHaveText(/^\d+$/);
    }
  });

  await test.step("NRF_SIC_1 · /mappa e /ausiliario → accesso negato", async () => {
    await page.goto("/mappa");
    await expect(page).toHaveURL(/\/accesso-negato$/);
    await page.goto("/ausiliario");
    await expect(page).toHaveURL(/\/accesso-negato$/);
  });

  await test.step("UC_AUTH_4 3.a1 · uscita → /admin non è più raggiungibile", async () => {
    await page.goto("/admin");
    await page.getByRole("button", { name: "Esci" }).click();
    // Dopo «Esci» si arriva su /accesso, oppure su /accesso?da=%2Fadmin se un 401 delle richieste
    // ancora in corso nella pagina vince la corsa con il redirect dell'uscita: entrambi corretti.
    await expect(page).toHaveURL(/\/accesso(\?da=%2Fadmin)?$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/accesso\?da=%2Fadmin$/);
  });
});

test("TS-13 · RF_ADM_2 · creazione, modifica e disattivazione di un Ausiliario → accesso negato dopo la disattivazione", async ({
  page,
  browser,
}) => {
  const password = passwordAmministratore();
  test.skip(password === undefined, MOTIVO_SENZA_AMMINISTRATORE);
  if (password === undefined) {
    return;
  }
  const nuovo = {
    nome: "Prova",
    cognome: `E2E ${idEsecuzione}`,
    email: emailDiProva(idEsecuzione, "ts13"),
    password: passwordDiProva(),
  };
  const riga = page.getByRole("listitem").filter({ hasText: nuovo.email });
  const messaggio = page.getByRole("status").filter({ hasText: "Fatto" });
  const ausiliario = await browser.newContext();
  const paginaAusiliario = await ausiliario.newPage();
  await bloccaSfondo(page);
  await bloccaSfondo(paginaAusiliario);

  try {
    await accediDallaPagina(page, AMMINISTRATORE, password);
    await expect(page).toHaveURL(/\/admin$/);

    await test.step("UC_ADM_2 passi 3–7 · creazione con la password iniziale", async () => {
      await page.goto("/admin/ausiliari");
      await page.getByRole("button", { name: "Nuovo Ausiliario" }).click();
      await page.getByLabel("Nome", { exact: true }).fill(nuovo.nome);
      await page.getByLabel("Cognome", { exact: true }).fill(nuovo.cognome);
      await page.getByLabel("Email", { exact: true }).fill(nuovo.email);
      await page.getByLabel("Password iniziale").fill(nuovo.password);
      await page.getByLabel("Ente", { exact: true }).selectOption({ label: "Comune di Baronissi" });
      await page.getByRole("button", { name: "Salva" }).click();
      await expect(messaggio).toContainText("creato");
      await expect(riga).toContainText("Attivo");
    });

    await test.step("RF_AUTH_4 · il nuovo Ausiliario accede alla mappa delle segnalazioni", async () => {
      await accediDallaPagina(paginaAusiliario, nuovo.email, nuovo.password);
      await expect(paginaAusiliario).toHaveURL(/\/ausiliario$/);
    });

    await test.step("UC_ADM_2 · modifica del cognome", async () => {
      await riga.getByRole("button", { name: /^Modifica / }).click();
      await page.getByLabel("Cognome", { exact: true }).fill(`${nuovo.cognome} Modificato`);
      await page.getByRole("button", { name: "Salva" }).click();
      await expect(messaggio).toContainText("aggiornato");
      await expect(riga).toContainText(`${nuovo.cognome} Modificato`);
    });

    await test.step("UC_ADM_2 · disattivazione chiesta e annullata → resta Attivo", async () => {
      await riga.getByRole("button", { name: /^Disattiva / }).click();
      await expect(riga.getByText(/^Confermi la disattivazione di /)).toBeVisible();
      await riga.getByRole("button", { name: "Annulla" }).click();
      await expect(riga.getByText(/^Confermi la disattivazione di /)).toBeHidden();
      await expect(riga).toContainText("Attivo");
    });

    await test.step("UC_ADM_2 3.a1 · disattivazione confermata → Disattivato", async () => {
      await riga.getByRole("button", { name: /^Disattiva / }).click();
      await riga.getByRole("button", { name: "Conferma la disattivazione" }).click();
      await expect(messaggio).toContainText("disattivato");
      await expect(riga).toContainText("Disattivato");
      await expect(riga.getByRole("button", { name: /^Disattiva / })).toHaveCount(0);
    });

    await test.step("VD_19 · sessione dell'Ausiliario chiusa e nuovo accesso negato", async () => {
      expect((await paginaAusiliario.request.get("/api/auth/io")).status()).toBe(401);
      // Il ritorno automatico all'accesso dopo il 401 del polling non si verifica qui: è coperto
      // dai test dell'interfaccia di OMP-57. Si chiude la pagina aperta, così il nuovo accesso
      // non si sovrappone a quel redirect.
      await ausiliario.close();
      const nuovoContesto = await browser.newContext();
      try {
        const pagina = await nuovoContesto.newPage();
        await bloccaSfondo(pagina);
        await pagina.goto("/accesso");
        const risposta = pagina.waitForResponse((r) => r.url().endsWith("/api/auth/accesso"));
        await compilaAccesso(pagina, nuovo.email, nuovo.password);
        const r = await risposta;
        expect(r.status()).toBe(403);
        expect(await codiceErrore(r)).toBe("ACCOUNT_DISATTIVATO");
        await expect(pagina.getByRole("alert").filter({ hasText: "Errore" })).toContainText(
          "L'account è stato disattivato.",
        );
        await expect(pagina).toHaveURL(/\/accesso$/);
      } finally {
        await nuovoContesto.close();
      }
    });
  } finally {
    await ausiliario.close();
  }
});
