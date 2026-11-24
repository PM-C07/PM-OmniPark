// Chiamate alle API dei test di sistema, con la sessione del contesto del browser (page.request) o
// di un contesto solo API: preparazione dei dati e verifiche che l'interfaccia non mostra.
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { ZONA_INIZIALE, type StalloDellaMappa } from "../../src/presentation/logica/mappaStalli.ts";

export type Automobilista = { email: string; password: string; targa: string };
export type SostaInCorso = {
  id: number;
  stato: string;
  targa: string;
  stalloId: number;
  orarioDiAvvio: string;
  orarioDiScadenza: string;
};
export type SegnalazioneApi = {
  id: number;
  stalloId: number;
  stato: string;
  motivo: string | null;
  targaRilevata: string | null;
};

/** Risposta di page.request o di page.waitForResponse: basta il corpo JSON. */
type ConCorpo = { json(): Promise<unknown> };

/** Corpo JSON della risposta, se c'è. */
export async function corpo(risposta: ConCorpo): Promise<unknown> {
  return risposta.json().catch(() => null);
}

/** Codice dell'errore nella forma { errore: { codice, messaggio } }. */
export async function codiceErrore(risposta: ConCorpo): Promise<string | undefined> {
  return ((await corpo(risposta)) as { errore?: { codice?: string } } | null)?.errore?.codice;
}

async function richiedi(risposta: APIResponse, attesi: number[], descrizione: string) {
  if (!attesi.includes(risposta.status())) {
    throw new Error(
      `${descrizione}: risposta ${risposta.status()} ${JSON.stringify(await corpo(risposta))}`,
    );
  }
  return corpo(risposta);
}

export async function registraAutomobilista(request: APIRequestContext, dati: Automobilista) {
  await richiedi(
    await request.post("/api/auth/registrazione", { data: dati }),
    [201],
    "Registrazione dell'Automobilista di prova",
  );
}

export async function accedi(request: APIRequestContext, email: string, password: string) {
  await richiedi(
    await request.post("/api/auth/accesso", { data: { email, password } }),
    [200],
    `Accesso di ${email}`,
  );
}

export async function ricarica(request: APIRequestContext, importo: number): Promise<number> {
  const dati = await richiedi(
    await request.post("/api/wallet/ricarica", { data: { importo } }),
    [200],
    "Ricarica del wallet",
  );
  return (dati as { saldo: number }).saldo;
}

/** Stalli della zona iniziale della mappa (GET /api/stalli). */
export async function stalliDellaZona(request: APIRequestContext): Promise<StalloDellaMappa[]> {
  const dati = await richiedi(
    await request.get(`/api/stalli?zona=${ZONA_INIZIALE}`),
    [200],
    "Lettura degli stalli",
  );
  return (dati as { stalli: StalloDellaMappa[] }).stalli;
}

export async function sosteInCorso(request: APIRequestContext): Promise<SostaInCorso[]> {
  const dati = await richiedi(await request.get("/api/soste"), [200], "Lettura delle soste");
  return (dati as { soste: SostaInCorso[] }).soste;
}

export async function segnalazioniNonChiuse(
  request: APIRequestContext,
): Promise<SegnalazioneApi[]> {
  const dati = await richiedi(
    await request.get("/api/ausiliario/segnalazioni"),
    [200],
    "Lettura delle segnalazioni",
  );
  return (dati as { segnalazioni: SegnalazioneApi[] }).segnalazioni.filter(
    (s) => s.stato !== "CHIUSA",
  );
}

/** Chiusura di pulizia: 200, oppure 409 se la segnalazione è già chiusa. */
export async function chiudiSegnalazione(
  request: APIRequestContext,
  id: number,
  esito: "SOSTA_IRREGOLARE_ACCERTATA" | "NON_CONFERMATA" = "NON_CONFERMATA",
) {
  await richiedi(
    await request.post(`/api/segnalazioni/${id}/chiusura`, { data: { esito } }),
    [200, 409],
    `Chiusura della segnalazione ${id}`,
  );
}
