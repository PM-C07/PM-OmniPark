// Test della guardia sull'indirizzo dei test di sistema (OMP-60): l'esito atteso viene dal piano
// approvato (docs/test/test_di_sistema.md §2): solo locale e alias di branch delle anteprime.
import { describe, expect, it } from "vitest";
import {
  ALIAS_DI_BRANCH,
  ANTICIPO_PREDEFINITO_MS,
  anticipoMs,
  URL_PREDEFINITO,
  urlDiDestinazione,
  variabileObbligatoria,
  verificaDestinazione,
} from "./ambiente.ts";

const { progetto, scope } = ALIAS_DI_BRANCH;
const alias = (branch: string) => `https://${progetto}-git-${branch}-${scope}.vercel.app`;

describe("verificaDestinazione: indirizzi consentiti", () => {
  it.each([
    ["localhost con porta", "http://localhost:3000", "locale"],
    ["127.0.0.1", "http://127.0.0.1:3000/mappa", "locale"],
    ["alias di branch", alias("omp-60-test-di-sistema"), "anteprima"],
    [
      "alias con il branch accorciato da Vercel e l'hash",
      alias("omp-60-test-di-sis-a1b2c3"),
      "anteprima",
    ],
    [
      "alias reale di OMP-59 con un percorso",
      "https://omnipark-git-omp-59-interfaccia-ausiliario-lruocco22s-projects.vercel.app/accesso",
      "anteprima",
    ],
  ])("%s → consentito", (_nome, indirizzo, tipo) => {
    const verifica = verificaDestinazione(indirizzo);
    expect(verifica).toEqual({ consentita: true, origine: new URL(indirizzo).origin, tipo });
  });
});

describe("verificaDestinazione: indirizzi rifiutati", () => {
  it.each([
    ["produzione", "https://omnipark-two.vercel.app"],
    ["produzione con percorso e maiuscole", "https://OMNIPARK-TWO.vercel.app/mappa"],
    ["produzione in http", "http://omnipark-two.vercel.app"],
    ["alias del branch main", "https://omnipark-git-main-lruocco22s-projects.vercel.app"],
    ["alias del branch main con un percorso", `${alias("main")}/accesso`],
    ["link unico di un deploy", `https://${progetto}-8fk2l1q9z-${scope}.vercel.app`],
    [
      "alias di branch oltre 63 caratteri (Vercel lo accorcia)",
      alias("omp-58-interfaccia-automobilista"),
    ],
    ["alias di un altro progetto", `https://altro-progetto-git-omp-60-${scope}.vercel.app`],
    ["alias di un altro scope", `https://${progetto}-git-omp-60-altro-scope.vercel.app`],
    ["alias in http", alias("omp-60").replace("https:", "http:")],
    ["sottodominio di un alias", `https://x.${progetto}-git-omp-60-${scope}.vercel.app`],
    ["etichetta oltre 63 caratteri", alias("b".repeat(64))],
    ["branch vuoto", `https://${progetto}-git--${scope}.vercel.app`],
    ["host che imita la produzione", "https://omnipark-two.vercel.app.esempio.com"],
    ["altro host", "https://esempio.com"],
    ["credenziali nell'indirizzo", "http://utente:segreto@localhost:3000"],
    ["testo non URL", "anteprima"],
  ])("%s → rifiutato", (_nome, indirizzo) => {
    const verifica = verificaDestinazione(indirizzo);
    expect(verifica.consentita).toBe(false);
  });

  it("il messaggio della produzione la nomina", () => {
    expect(verificaDestinazione("https://omnipark-two.vercel.app")).toEqual({
      consentita: false,
      motivo: expect.stringContaining("produzione"),
    });
  });
});

describe("variabili d'ambiente", () => {
  it("OMNIPARK_E2E_URL assente → localhost", () => {
    expect(urlDiDestinazione({})).toBe(URL_PREDEFINITO);
  });

  it("OMNIPARK_E2E_URL presente → il suo valore", () => {
    expect(urlDiDestinazione({ OMNIPARK_E2E_URL: " https://x.vercel.app " })).toBe(
      "https://x.vercel.app",
    );
  });

  it("variabile obbligatoria mancante → errore con il nome e senza valori", () => {
    expect(() => variabileObbligatoria({}, "SIMULATORE_TOKEN")).toThrow(/SIMULATORE_TOKEN/);
  });

  it("variabile obbligatoria presente → il valore", () => {
    expect(variabileObbligatoria({ A: "valore" }, "A")).toBe("valore");
  });

  it.each([
    [undefined, ANTICIPO_PREDEFINITO_MS],
    ["", ANTICIPO_PREDEFINITO_MS],
    ["0", 0],
    ["2500", 2500],
  ])("anticipo %s → %i", (testo, atteso) => {
    expect(anticipoMs({ OMNIPARK_E2E_ANTICIPO_MS: testo })).toBe(atteso);
  });

  it.each(["-1", "1.5", "due"])("anticipo %s → errore", (testo) => {
    expect(() => anticipoMs({ OMNIPARK_E2E_ANTICIPO_MS: testo })).toThrow();
  });
});
