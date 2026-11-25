// Test di sistema end-to-end (OMP-60, docs/test/test_di_sistema.md). Prima di tutto la guardia:
// solo l'app locale o l'alias di branch di un'anteprima, mai la produzione.
import { defineConfig, devices } from "@playwright/test";
import { urlDiDestinazione, verificaDestinazione } from "./e2e/supporto/ambiente.ts";

const verifica = verificaDestinazione(urlDiDestinazione(process.env));
if (!verifica.consentita) {
  throw new Error(`Indirizzo dei test rifiutato (OMNIPARK_E2E_URL): ${verifica.motivo}`);
}

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "e2e-risultati",
  // Database condiviso e pochi stalli: un test alla volta, nell'ordine dei file.
  fullyParallel: false,
  workers: 1,
  // Un fallimento intermittente deve restare visibile.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],
  use: {
    baseURL: verifica.origine,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium-mobile", use: { ...devices["Pixel 7"] } }],
});
