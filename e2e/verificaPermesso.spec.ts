// Test di sistema della verifica del permesso (docs/test/test_di_sistema.md §5, TS-18, OMP-63
// parte B): l'Automobilista avvia dalle API una sosta con dichiarazione e foto su uno stallo
// riservato (l'avvio dalla schermata è già in TS-14); Paolo Ferri, Ausiliario dello stesso ente,
// la trova tra i «Permessi da verificare», vede dichiarazione e foto e registra «non conforme»
// (RF_OP_2, RF_OP_5, UC_OP_1 3.a1, UC_OP_5 4.a1). Stalli candidati diversi da quelli di TS-14:
// 4 (rosa, Piazza San Leone n. 1) e 2 (disabili, Via Tommaso Sorrentino n. 2). Le soste durano
// 15 minuti e non si terminano dalle API: con due candidati si possono fare due esecuzioni di fila.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { testoDichiarazione } from "../src/presentation/logica/permesso.ts";
import { ricarica } from "./supporto/api.ts";
import { nuovoIdEsecuzione } from "./supporto/dati.ts";
import { accediDallaPagina, bloccaSfondo } from "./supporto/pagina.ts";
import {
  AUSILIARI,
  nuovoAutomobilista,
  passwordAusiliario,
  sessioneApi,
  urlDelTest,
} from "./supporto/preparazione.ts";
import { inviaRilevazioni } from "./supporto/simulatori.ts";

const idEsecuzione = nuovoIdEsecuzione();

/** Candidati in ordine, con il numero mostrato all'Ausiliario (ente 1, Gragnano). */
const CANDIDATI = [
  { id: 4, numero: 1 },
  { id: 2, numero: 2 },
] as const;

/** PNG valido di 1 × 1 pixel (lo stesso di TS-14): firma PNG, quindi servito come image/png. */
const FOTO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Primo candidato senza sosta in corso, letto con GET /api/stalli/<id> (il 4 è fuori zona). */
async function primoCandidatoLibero(request: APIRequestContext) {
  for (const candidato of CANDIDATI) {
    const risposta = await request.get(`/api/stalli/${candidato.id}`);
    expect(risposta.status(), `GET /api/stalli/${candidato.id}`).toBe(200);
    const stallo = (await risposta.json()) as { tipoDiStallo: string; stato: string };
    if (stallo.stato !== "NON_DISPONIBILE") {
      return { ...candidato, tipoDiStallo: stallo.tipoDiStallo };
    }
  }
  throw new Error(
    `Nessuno stallo candidato (${CANDIDATI.map((c) => c.id).join(", ")}) senza sosta in corso: le soste delle esecuzioni precedenti durano 15 minuti, riprova più tardi.`,
  );
}

test("TS-18 · RF_OP_5 · permesso da verificare dell'ente 1, dichiarazione e foto, esito non conforme → segnalazione accertata", async ({
  page,
  playwright,
}, testInfo) => {
  const url = urlDelTest(testInfo);
  const automobilista = await sessioneApi(playwright, url);
  try {
    const utente = await nuovoAutomobilista(automobilista, idEsecuzione, "ts18");
    let sosta = 0;
    let stallo!: Awaited<ReturnType<typeof primoCandidatoLibero>>;

    await test.step("RF_SOSTA_5 · l'Automobilista avvia dalle API una sosta con permesso su uno stallo riservato", async () => {
      await ricarica(automobilista, 500);
      stallo = await primoCandidatoLibero(automobilista);
      // Rilevazione fresca (§3, timeout di 60 s): lo stallo passa a Occupato.
      const [riga] = await inviaRilevazioni(
        url,
        [{ stallo: stallo.id, presenza: true }],
        testInfo.outputPath("ts18-stallo.json"),
      );
      expect(riga?.esito, "rilevazione «veicolo presente»").toBe("OCCUPATO");
      const risposta = await automobilista.post("/api/soste", {
        multipart: {
          stallo: String(stallo.id),
          targa: utente.targa,
          durata: "15",
          dichiarazioneDiPermesso: testoDichiarazione(stallo.tipoDiStallo) ?? "",
          fotoDelPermesso: { name: "permesso.png", mimeType: "image/png", buffer: FOTO_PNG },
        },
      });
      expect(risposta.status(), "POST /api/soste con permesso").toBe(201);
      sosta = ((await risposta.json()) as { sosta: number }).sosta;
    });

    const sezione = page.locator("section[aria-labelledby='permessi-titolo']");
    // Funzioni: l'id della sosta è noto solo dopo il primo passo.
    const riga = () => sezione.locator(`button[data-permesso="${sosta}"]`);
    const scheda = () => sezione.locator(`[data-scheda-permesso="${sosta}"]`);

    await test.step("RF_OP_2 · Paolo Ferri (ente 1) vede il permesso da verificare, senza marker nuovi", async () => {
      await bloccaSfondo(page);
      await accediDallaPagina(page, AUSILIARI.paoloFerri, passwordAusiliario());
      await expect(page).toHaveURL(/\/ausiliario$/);
      await expect(sezione.getByRole("heading", { name: "Permessi da verificare" })).toBeVisible();
      await expect(riga()).toContainText(`Stallo n. ${stallo.numero}`);
      await expect(riga()).toContainText(utente.targa);
    });

    await test.step("UC_OP_1 3.a1 · dichiarazione e foto del permesso; la foto è servita con no-store", async () => {
      await riga().click();
      await expect(scheda()).toContainText(utente.targa);
      await expect(scheda()).toContainText(testoDichiarazione(stallo.tipoDiStallo) ?? "");
      const foto = scheda().getByRole("img", { name: /Foto del permesso/ });
      await expect(foto).toBeVisible();
      await expect
        .poll(() => foto.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      const risposta = await page.request.get(`/api/permessi/${sosta}/foto`);
      expect(risposta.status()).toBe(200);
      expect(risposta.headers()["content-type"]).toBe("image/png");
      expect(risposta.headers()["cache-control"]).toBe("no-store");
    });

    await test.step("UC_OP_5 3.a1 · «Non conforme», poi «Annulla» → nessun esito registrato", async () => {
      await scheda().getByRole("button", { name: "Non conforme" }).click();
      await scheda().getByRole("button", { name: "Annulla" }).click();
      await expect(scheda().getByRole("button", { name: "Non conforme" })).toBeVisible();
    });

    await test.step("UC_OP_5 4.a1 · «Non conforme», poi «Conferma» → segnalazione accertata, il permesso esce dall'elenco", async () => {
      await scheda().getByRole("button", { name: "Non conforme" }).click();
      await scheda().getByRole("button", { name: "Conferma", exact: true }).click();
      await expect(sezione).toContainText("permesso non conforme");
      await expect(sezione).toContainText("sosta irregolare accertata");
      await expect(riga()).toHaveCount(0);
      const elenco = await page.request.get("/api/ausiliario/permessi");
      expect(elenco.status()).toBe(200);
      const { permessi } = (await elenco.json()) as { permessi: { sostaId: number }[] };
      expect(permessi.map((p) => p.sostaId)).not.toContain(sosta);
    });
  } finally {
    await automobilista.dispose();
  }
});
