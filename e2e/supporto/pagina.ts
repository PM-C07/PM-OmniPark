// Localizzatori e azioni comuni sulle pagine dei test di sistema.
import { expect, type Locator, type Page } from "@playwright/test";
import {
  elementoDelloStallo,
  type StalloDellaMappa,
} from "../../src/presentation/logica/mappaStalli.ts";

/** Blocca le tile di OpenStreetMap (docs/test/test_di_sistema.md §3, «Sfondo della mappa»). */
export async function bloccaSfondo(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
}

/** Etichetta accessibile del marker dello stallo nello stato indicato, come la costruisce la mappa. */
export function etichettaMarker(stallo: StalloDellaMappa, stato: string): string {
  return elementoDelloStallo({ ...stallo, stato }).etichetta;
}

/** Marker dello stallo, riconosciuto dall'inizio dell'etichetta (numero e area). */
export function marker(page: Page, stallo: StalloDellaMappa): Locator {
  const prefisso = `Stallo n. ${stallo.numero}, ${stallo.areaDiSosta.nome},`;
  return page.locator(`.leaflet-marker-icon[aria-label^="${prefisso}"]`);
}

/** Riga dello stallo nell'elenco «Stalli della zona», dentro il gruppo della sua area. */
export function rigaStallo(page: Page, stallo: StalloDellaMappa): Locator {
  const gruppo = page.locator("section[aria-labelledby='titolo-elenco-mappa'] div").filter({
    has: page.getByRole("heading", { level: 3, name: stallo.areaDiSosta.nome, exact: true }),
  });
  return gruppo.getByRole("button", { name: new RegExp(`^Stallo n\\. ${stallo.numero} `) });
}

/** Sezione «La mia sosta». */
export function laMiaSosta(page: Page): Locator {
  return page.locator("section[aria-labelledby='titolo-mia-sosta']");
}

/** Attende n risposte del polling delle variazioni degli stalli. */
export async function attendiAggiornamenti(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.waitForResponse((r) => r.url().includes("/api/stalli/modifiche"));
  }
}

/** Compila e invia il form di accesso della pagina già aperta. */
export async function compilaAccesso(page: Page, email: string, password: string) {
  // Dopo un redirect (per esempio a /accesso?da=…) la pagina può non avere ancora collegato React
  // ai campi: i valori ci sono nel DOM ma il modulo li vede vuoti e la validazione blocca l'invio.
  // Si ripetono compilazione e clic finché la richiesta di accesso parte davvero. Nessuna attesa
  // fissa: i timeout limitano solo il singolo tentativo. Chi attende la risposta crea la sua
  // promessa prima di chiamare questa funzione.
  const campoEmail = page.getByLabel("Email", { exact: true });
  const campoPassword = page.getByLabel("Password", { exact: true });
  await expect(async () => {
    await campoEmail.fill(email);
    await campoPassword.fill(password);
    await expect(campoEmail).toHaveValue(email, { timeout: 1000 });
    await expect(campoPassword).toHaveValue(password, { timeout: 1000 });
    const inviata = page.waitForRequest(
      (r) => r.url().endsWith("/api/auth/accesso") && r.method() === "POST",
      { timeout: 2000 },
    );
    await page.getByRole("button", { name: "Accedi" }).click();
    await inviata;
  }).toPass();
}

/** Accesso dalla schermata /accesso, come un utente. */
export async function accediDallaPagina(page: Page, email: string, password: string) {
  await page.goto("/accesso");
  await compilaAccesso(page, email, password);
}
