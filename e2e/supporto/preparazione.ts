// Preparazione comune dei test di sistema (docs/test/test_di_sistema.md §3): Automobilisti nuovi,
// stallo candidato per le soste, sessioni solo API.
import type { APIRequestContext, PlaywrightWorkerArgs, TestInfo } from "@playwright/test";
import type { StalloDellaMappa } from "../../src/presentation/logica/mappaStalli.ts";
import { variabileObbligatoria } from "./ambiente.ts";
import { registraAutomobilista, stalliDellaZona, type Automobilista } from "./api.ts";
import { emailDiProva, passwordDiProva, primoStalloSenzaSosta, targaDiProva } from "./dati.ts";
import { inviaRilevazioni } from "./simulatori.ts";

export const AUSILIARI = {
  paoloFerri: "paolo.ferri@omnipark.example", // ente 1, Gragnano
  annaMoretti: "anna.moretti@omnipark.example", // ente 2, Fisciano
  lucaRusso: "luca.russo@omnipark.example", // ente 1, disattivato
} as const;

/** Password dimostrativa degli Ausiliari del README, letta dall'ambiente. */
export function passwordAusiliario(): string {
  return variabileObbligatoria(process.env, "OMNIPARK_E2E_PASSWORD_AUSILIARIO");
}

/** Indirizzo dell'applicazione dei test, già controllato dalla guardia in playwright.config.ts. */
export function urlDelTest(testInfo: TestInfo): string {
  return testInfo.project.use.baseURL as string;
}

/** Contesto solo API con una sessione propria. */
export function sessioneApi(
  playwright: PlaywrightWorkerArgs["playwright"],
  url: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: url });
}

/** Registra un Automobilista nuovo: la sessione resta nel contesto della richiesta. */
export async function nuovoAutomobilista(
  request: APIRequestContext,
  idEsecuzione: string,
  n: string,
): Promise<Automobilista> {
  const utente = {
    email: emailDiProva(idEsecuzione, n),
    password: passwordDiProva(),
    targa: targaDiProva(),
  };
  await registraAutomobilista(request, utente);
  return utente;
}

/** Primo stallo candidato senza sosta, portato a Occupato con il simulatore dei sensori. */
export async function preparaStalloPerLaSosta(
  request: APIRequestContext,
  url: string,
  fileScenario: string,
): Promise<StalloDellaMappa> {
  const stallo = primoStalloSenzaSosta(await stalliDellaZona(request));
  if (!stallo) {
    throw new Error(
      "Nessuno stallo candidato (17…21) senza sosta in corso: le soste delle esecuzioni precedenti scadono entro 60 minuti, riprova più tardi.",
    );
  }
  const [riga] = await inviaRilevazioni(url, [{ stallo: stallo.id, presenza: true }], fileScenario);
  if (riga?.http !== 200 || riga.esito !== "OCCUPATO") {
    throw new Error(
      `Lo stallo ${stallo.id} non è passato a Occupato: ${riga?.http ?? "rete"} ${riga?.esito ?? ""}`,
    );
  }
  return { ...stallo, stato: "OCCUPATO" };
}
