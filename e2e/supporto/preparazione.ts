// Preparazione comune dei test di sistema (docs/test/test_di_sistema.md §3): Automobilisti nuovi,
// stallo candidato per le soste, sessioni solo API.
import type { APIRequestContext, PlaywrightWorkerArgs, TestInfo } from "@playwright/test";
import type { StalloDellaMappa } from "../../src/presentation/logica/mappaStalli.ts";
import { variabileObbligatoria } from "./ambiente.ts";
import { registraAutomobilista, stalliDellaZona, type Automobilista } from "./api.ts";
import {
  emailDiProva,
  passwordDiProva,
  primoStalloSenzaSosta,
  STALLI_PER_LE_SOSTE,
  targaDiProva,
} from "./dati.ts";
import { inviaRilevazioni } from "./simulatori.ts";

export const AUSILIARI = {
  paoloFerri: "paolo.ferri@omnipark.example", // ente 1, Gragnano
  saraGalli: "sara.galli@omnipark.example", // ente 1, Gragnano (OMP-63, TS-17)
  annaMoretti: "anna.moretti@omnipark.example", // ente 2, Fisciano
  lucaRusso: "luca.russo@omnipark.example", // ente 1, disattivato
} as const;

/** Amministratore dei dati di partenza: la sua password non è nel repository (OMP-62). */
export const AMMINISTRATORE = "marco.esposito@omnipark.example";

export const MOTIVO_SENZA_AMMINISTRATORE =
  "Non eseguito: OMNIPARK_E2E_PASSWORD_AMMINISTRATORE non è impostata (la password dell'Amministratore la conoscono solo i PM).";

/** Password dell'Amministratore, facoltativa: senza, TS-09 e TS-13 sono saltati. */
export function passwordAmministratore(): string | undefined {
  return process.env.OMNIPARK_E2E_PASSWORD_AMMINISTRATORE || undefined;
}

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

/**
 * Primo stallo candidato senza sosta, portato a Occupato con il simulatore dei sensori. Candidati
 * predefiniti: gli stalli delle soste 17…21; TS-14 passa gli stalli riservati (OMP-61).
 */
export async function preparaStalloPerLaSosta(
  request: APIRequestContext,
  url: string,
  fileScenario: string,
  candidati: readonly number[] = STALLI_PER_LE_SOSTE,
): Promise<StalloDellaMappa> {
  const stallo = primoStalloSenzaSosta(await stalliDellaZona(request), candidati);
  if (!stallo) {
    throw new Error(
      `Nessuno stallo candidato (${candidati.join(", ")}) senza sosta in corso: le soste delle esecuzioni precedenti scadono entro 60 minuti, riprova più tardi.`,
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
