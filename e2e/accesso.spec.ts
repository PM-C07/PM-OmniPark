// Test di sistema degli accessi (docs/test/test_di_sistema.md §5): TS-08 (accesso per ruolo e
// uscita) e TS-10 (segregazione per ente e per ruolo, NRF_SIC_1). La password dell'Amministratore
// non è usata: il suo accesso è il caso manuale TS-09.
import { expect, test } from "@playwright/test";
import {
  accedi,
  chiudiSegnalazione,
  codiceErrore,
  registraAutomobilista,
  segnalazioniNonChiuse,
} from "./supporto/api.ts";
import {
  emailDiProva,
  nuovoIdEsecuzione,
  passwordDiProva,
  STALLI_PER_LE_LETTURE,
  targaAnpr,
  targaDiProva,
} from "./supporto/dati.ts";
import { accediDallaPagina, bloccaSfondo, compilaAccesso } from "./supporto/pagina.ts";
import {
  AUSILIARI,
  nuovoAutomobilista,
  passwordAusiliario,
  sessioneApi,
  urlDelTest,
} from "./supporto/preparazione.ts";
import { inviaLetture } from "./supporto/simulatori.ts";

const idEsecuzione = nuovoIdEsecuzione();

test("TS-08 · RF_AUTH_4 · accesso per ruolo, aree degli altri ruoli, credenziali errate, account disattivato, uscita", async ({
  page,
  playwright,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  const utente = {
    email: emailDiProva(idEsecuzione, "ts08"),
    password: passwordDiProva(),
    targa: targaDiProva(),
  };
  const registrazione = await sessioneApi(playwright, url);
  try {
    await registraAutomobilista(registrazione, utente);
  } finally {
    await registrazione.dispose();
  }
  await bloccaSfondo(page);
  const rispostaAccesso = () => page.waitForResponse((r) => r.url().endsWith("/api/auth/accesso"));

  await test.step("NRF_SIC_1 · senza sessione /mappa → accesso con ritorno", async () => {
    await page.goto("/mappa");
    await expect(page).toHaveURL(/\/accesso\?da=%2Fmappa$/);
  });

  await test.step("UC_AUTH_4 2.a1 · password errata → accesso negato", async () => {
    const risposta = rispostaAccesso();
    await compilaAccesso(page, utente.email, `${utente.password}-errata`);
    const r = await risposta;
    expect(r.status()).toBe(401);
    expect(await codiceErrore(r)).toBe("CREDENZIALI_NON_VALIDE");
    await expect(page.getByRole("alert").filter({ hasText: "Errore" })).toBeVisible();
    await expect(page).toHaveURL(/\/accesso/);
  });

  await test.step("RF_AUTH_4 · Automobilista → mappa degli stalli", async () => {
    await compilaAccesso(page, utente.email, utente.password);
    await expect(page).toHaveURL(/\/mappa$/);
    await expect(page.getByText("Automobilista", { exact: true })).toBeVisible();
  });

  await test.step("NRF_SIC_1 · Automobilista su /ausiliario → accesso negato", async () => {
    await page.goto("/ausiliario");
    await expect(page).toHaveURL(/\/accesso-negato$/);
  });

  await test.step("UC_AUTH_4 3.a1 · uscita → /mappa non è più raggiungibile", async () => {
    await page.goto("/mappa");
    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page).toHaveURL(/\/accesso$/);
    await page.goto("/mappa");
    await expect(page).toHaveURL(/\/accesso\?da=%2Fmappa$/);
  });

  await test.step("RF_AUTH_4 · Ausiliario → mappa delle segnalazioni", async () => {
    await accediDallaPagina(page, AUSILIARI.paoloFerri, passwordAusiliario());
    await expect(page).toHaveURL(/\/ausiliario$/);
    await expect(page.getByText(/^Ausiliario del Traffico/)).toBeVisible();
  });

  await test.step("NRF_SIC_1 · Ausiliario su /mappa → accesso negato", async () => {
    await page.goto("/mappa");
    await expect(page).toHaveURL(/\/accesso-negato$/);
  });

  await test.step("UC_AUTH_4 2.a2 · Ausiliario disattivato → accesso negato", async () => {
    await page.goto("/ausiliario");
    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page).toHaveURL(/\/accesso$/);
    const risposta = rispostaAccesso();
    await compilaAccesso(page, AUSILIARI.lucaRusso, passwordAusiliario());
    const r = await risposta;
    expect(r.status()).toBe(403);
    expect(await codiceErrore(r)).toBe("ACCOUNT_DISATTIVATO");
    await expect(page.getByRole("alert").filter({ hasText: "Errore" })).toBeVisible();
    expect((await page.request.get("/api/auth/io")).status()).toBe(401);
  });
});

test("TS-10 · NRF_SIC_1 · segnalazione dell'ente 1 → invisibile e non chiudibile per l'ente 2; API del ruolo sbagliato rifiutate", async ({
  page,
  playwright,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  const paolo = await sessioneApi(playwright, url);
  const automobilista = await sessioneApi(playwright, url);
  let id: number | undefined;
  try {
    await accedi(paolo, AUSILIARI.paoloFerri, passwordAusiliario());
    const [riga] = await inviaLetture(
      url,
      [{ targa: targaAnpr(idEsecuzione, "C"), stallo: STALLI_PER_LE_LETTURE.c }],
      testInfo.outputPath("ts10-lettura.json"),
    );
    id = riga.risposta?.segnalazione;
    expect(riga.risposta?.esito, "segnalazione di prova dell'ente 1").toBe("SEGNALAZIONE_CREATA");

    await test.step("UC_OP_1 · Anna Moretti (ente 2) non vede la segnalazione dell'ente 1", async () => {
      await accedi(page.request, AUSILIARI.annaMoretti, passwordAusiliario());
      await bloccaSfondo(page);
      const fotografia = page.waitForResponse((r) =>
        /\/api\/ausiliario\/segnalazioni(\?|$)/.test(r.url()),
      );
      await page.goto("/ausiliario");
      expect((await fotografia).status()).toBe(200);
      await expect(page.getByRole("heading", { name: /Possibili soste irregolari/ })).toBeVisible();
      await expect(page.locator(`[data-riga-segnalazione="${id}"]`)).toHaveCount(0);
    });

    await test.step("NRF_SIC_1 · Anna Moretti chiede le segnalazioni dell'ente 1 → 403", async () => {
      const r = await page.request.get("/api/ausiliario/segnalazioni?ente=1");
      expect(r.status()).toBe(403);
      expect(await codiceErrore(r)).toBe("ENTE_NON_AMMESSO");
    });

    await test.step("VD_18 · Anna Moretti chiude la segnalazione dell'ente 1 → 403, resta Aperta", async () => {
      const r = await page.request.post(`/api/segnalazioni/${id}/chiusura`, {
        data: { esito: "NON_CONFERMATA" },
      });
      expect(r.status()).toBe(403);
      expect(await codiceErrore(r)).toBe("ENTE_NON_AMMESSO");
      const segnalazione = (await segnalazioniNonChiuse(paolo)).find((s) => s.id === id);
      expect(segnalazione?.stato).toBe("APERTA");
    });

    await test.step("NRF_SIC_1 · Automobilista sulle API dell'Ausiliario → 403", async () => {
      await nuovoAutomobilista(automobilista, idEsecuzione, "ts10");
      const r = await automobilista.get("/api/ausiliario/segnalazioni");
      expect(r.status()).toBe(403);
      expect(await codiceErrore(r)).toBe("RUOLO_NON_AMMESSO");
    });

    await test.step("NRF_SIC_1 · Ausiliario sul wallet dell'Automobilista → 403", async () => {
      const r = await paolo.get("/api/wallet");
      expect(r.status()).toBe(403);
      expect(await codiceErrore(r)).toBe("RUOLO_NON_AMMESSO");
    });
  } finally {
    if (id !== undefined) {
      await chiudiSegnalazione(paolo, id);
    }
    await paolo.dispose();
    await automobilista.dispose();
  }
});
