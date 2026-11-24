// Localizzatori e azioni comuni sulle pagine dei test di sistema.
import type { Locator, Page } from "@playwright/test";
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
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
}

/** Accesso dalla schermata /accesso, come un utente. */
export async function accediDallaPagina(page: Page, email: string, password: string) {
  await page.goto("/accesso");
  await compilaAccesso(page, email, password);
}
