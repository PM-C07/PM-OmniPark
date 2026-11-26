// Test di sistema della sosta (docs/test/test_di_sistema.md §4 e §5): TS-01, TS-04 e TS-07 in
// quest'ordine (TS-04 e TS-07 usano la sosta di TS-01), TS-15 (prolungamento, OMP-61), TS-02 lento
// (@lenta). Dalla OMP-61 TS-01 verifica anche le correzioni di DIF-02, DIF-03 e DIF-04.
import { expect, test } from "@playwright/test";
import type { StalloDellaMappa } from "../src/presentation/logica/mappaStalli.ts";
import { formattaEuro, formattaOra } from "../src/presentation/logica/importi.ts";
import { descrizioneStallo } from "../src/presentation/logica/mappaStalli.ts";
import { messaggioRicaricaApprovata } from "../src/presentation/logica/wallet.ts";
import {
  accedi,
  avviaSosta,
  chiudiSegnalazione,
  ricarica,
  saldo,
  segnalazioniNonChiuse,
  sosteInCorso,
  type Automobilista,
} from "./supporto/api.ts";
import {
  centesimiDa,
  emailDiProva,
  MOTIVO_FUORI_FASCIA,
  nellaFasciaAPagamento,
  nuovoIdEsecuzione,
  passwordDiProva,
  STALLI_PER_LE_LETTURE,
  targaAnpr,
  targaDiProva,
} from "./supporto/dati.ts";
import {
  attendiAggiornamenti,
  bloccaSfondo,
  etichettaMarker,
  laMiaSosta,
  marker,
  rigaStallo,
} from "./supporto/pagina.ts";
import {
  AUSILIARI,
  nuovoAutomobilista,
  passwordAusiliario,
  preparaStalloPerLaSosta,
  sessioneApi,
  urlDelTest,
} from "./supporto/preparazione.ts";
import { inviaLetture, inviaRilevazioni } from "./supporto/simulatori.ts";

const idEsecuzione = nuovoIdEsecuzione();
const RICARICA_DALLA_SCHEDA = 500;
const NON_ESEGUITO_SENZA_TS01 =
  "Non eseguito: TS-01 non ha avviato la sosta di cui questo caso di test ha bisogno.";

/** Sosta Attiva avviata da TS-01, usata da TS-04 e TS-07 (stesso processo, in ordine). */
let sostaDiTs01: { utente: Automobilista; stallo: StalloDellaMappa } | null = null;

test("TS-01 · RF_SOSTA_1 · registrazione, ricarica dalla scheda, avvio e pagamento → sosta Attiva, stallo Non disponibile", async ({
  page,
}, testInfo) => {
  test.skip(!nellaFasciaAPagamento(new Date()), MOTIVO_FUORI_FASCIA);
  const url = urlDelTest(testInfo);
  const utente = {
    email: emailDiProva(idEsecuzione, "ts01"),
    password: passwordDiProva(),
    targa: targaDiProva(),
  };
  await bloccaSfondo(page);

  await test.step("RF_AUTH_1 · registrazione → mappa degli stalli", async () => {
    await page.goto("/registrazione");
    await page.getByLabel("Email").fill(utente.email);
    await page.getByLabel("Password").fill(utente.password);
    await page.getByLabel("Targa del tuo veicolo").fill(utente.targa);
    await page.getByRole("button", { name: "Registrati" }).click();
    await expect(page).toHaveURL(/\/mappa$/);
    await expect(page.getByText("Automobilista", { exact: true })).toBeVisible();
  });

  await test.step("RF_AUTH_5 · RF_WALLET_1 · targa nel profilo e saldo 0,00 €", async () => {
    await page.goto("/profilo");
    await expect(page.getByRole("list", { name: "Targhe del profilo" })).toContainText(
      utente.targa,
    );
    await expect(page.getByText(formattaEuro(0), { exact: true })).toBeVisible();
  });

  const stallo = await test.step("preparazione · stallo candidato portato a Occupato", () =>
    preparaStalloPerLaSosta(page.request, url, testInfo.outputPath("ts01-presenza.json")));
  const scheda = page.locator("section[aria-labelledby='titolo-scheda-stallo']");
  const conferma = scheda.getByRole("button", { name: /^Conferma e paga \(/ });
  let importo = 0;

  await test.step("DIF-02 · RF_STALLI_1 · tocco al centro del marker → scheda dello stallo toccato", async () => {
    await page.goto("/mappa");
    await expect(rigaStallo(page, stallo)).toContainText("Occupato");
    // Il centro del marker non è coperto da un marker vicino (in OMP-58 lo era: DIF-02).
    const coperto = await marker(page, stallo).evaluate((elemento) => {
      const r = elemento.getBoundingClientRect();
      const sopra = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(sopra && elemento.contains(sopra));
    });
    expect(coperto, "marker dello stallo coperto al centro").toBe(false);
    await marker(page, stallo).click();
    await expect(
      scheda.getByRole("heading", { level: 2, name: `Stallo n. ${stallo.numero}` }),
    ).toBeVisible();
    await expect(scheda).toContainText("Occupato");
  });

  await test.step("RF_SOSTA_1 · avvio di 15 minuti → importo, credito insufficiente", async () => {
    await scheda.getByRole("button", { name: "Avvia sosta" }).click();
    await page.getByLabel("Durata").selectOption("15");
    await expect(scheda.getByText(/^Importo .+, scadenza alle \d{2}:\d{2}\.$/)).toBeVisible();
    await expect(scheda.getByText("Credito insufficiente.")).toBeVisible();
    await expect(conferma).toBeDisabled();
    importo = centesimiDa((await conferma.textContent()) ?? "");
    expect(importo).toBeGreaterThan(0);
  });

  await test.step("RF_WALLET_1 · ricarica di 5 € dalla scheda → ritorno alla conferma", async () => {
    await scheda
      .getByRole("button", { name: formattaEuro(RICARICA_DALLA_SCHEDA), exact: true })
      .click();
    const ricaricaInviata = page.waitForResponse((r) => r.url().endsWith("/api/wallet/ricarica"));
    await scheda.getByRole("button", { name: "Conferma la ricarica" }).click();
    expect((await ricaricaInviata).status()).toBe(200);
    // Con il credito sufficiente la proposta esce dalla scheda, ma la conferma della ricarica e il
    // nuovo saldo restano visibili (UC_WALLET_1 passo 4, DIF-03); il focus torna su «Conferma e paga».
    await expect(scheda.getByText("Credito insufficiente.")).toBeHidden();
    await expect(
      scheda.getByText(messaggioRicaricaApprovata(RICARICA_DALLA_SCHEDA, RICARICA_DALLA_SCHEDA)),
    ).toBeVisible();
    await expect(conferma).toBeEnabled();
    await expect(conferma).toBeFocused();
    const wallet = await page.request.get("/api/wallet");
    expect(((await wallet.json()) as { saldo: number }).saldo).toBe(RICARICA_DALLA_SCHEDA);
    await expect(page.getByLabel("Targa")).toHaveValue(utente.targa);
    await expect(page.getByLabel("Durata")).toHaveValue("15");
  });

  await test.step("RF_SOSTA_1 · RF_WALLET_2 · conferma e pagamento → sosta Attiva", async () => {
    await conferma.click();
    const sosta = laMiaSosta(page);
    await expect(sosta).toContainText(utente.targa);
    await expect(sosta).toContainText("Attiva");
    await expect(sosta.getByText(/^Sosta avviata: scade alle \d{2}:\d{2}\.$/)).toBeVisible();
    // DIF-04: lo stallo nella zona della mappa si indica con numero e area, non con l'id.
    await expect(sosta).toContainText(descrizioneStallo(stallo.id, new Map([[stallo.id, stallo]])));
  });

  await test.step("RF_SOSTA_6 · stallo Non disponibile sulla mappa senza ricaricare", async () => {
    await expect(marker(page, stallo)).toHaveAttribute(
      "aria-label",
      etichettaMarker(stallo, "NON_DISPONIBILE"),
    );
    await expect(rigaStallo(page, stallo)).toContainText("Non disponibile");
  });

  await test.step("DIF-04 · ricaricamento della pagina → «La mia sosta» con numero e area", async () => {
    await page.reload();
    const sosta = laMiaSosta(page);
    await expect(sosta).toContainText(utente.targa);
    await expect(sosta).toContainText(descrizioneStallo(stallo.id, new Map([[stallo.id, stallo]])));
  });

  await test.step("RF_WALLET_2 · saldo diminuito dell'importo addebitato", async () => {
    await page.goto("/profilo");
    await expect(
      page.getByText(formattaEuro(RICARICA_DALLA_SCHEDA - importo), { exact: true }),
    ).toBeVisible();
  });

  sostaDiTs01 = { utente, stallo };
});

test("TS-04 · RF_SOSTA_6 · rilevazioni durante la sosta → stallo sempre Non disponibile", async ({
  page,
}, testInfo) => {
  const sosta = sostaDiTs01;
  test.skip(sosta === null, NON_ESEGUITO_SENZA_TS01);
  if (sosta === null) {
    return;
  }
  const url = urlDelTest(testInfo);
  const atteso = etichettaMarker(sosta.stallo, "NON_DISPONIBILE");
  await accedi(page.request, sosta.utente.email, sosta.utente.password);
  await bloccaSfondo(page);
  await page.goto("/mappa");
  await expect(marker(page, sosta.stallo)).toHaveAttribute("aria-label", atteso);

  for (const presenza of [false, true]) {
    const descrizione = presenza ? "veicolo presente" : "nessun veicolo";
    await test.step(`UC_IOT_1 3.a1 · «${descrizione}» → Non disponibile`, async () => {
      const [riga] = await inviaRilevazioni(
        url,
        [{ stallo: sosta.stallo.id, presenza }],
        testInfo.outputPath(`ts04-${presenza}.json`),
      );
      expect(riga.http).toBe(200);
      expect(riga.esito).toBe("NON_DISPONIBILE");
      await attendiAggiornamenti(page, 2);
      await expect(marker(page, sosta.stallo)).toHaveAttribute("aria-label", atteso);
    });
  }
  await expect(laMiaSosta(page)).toContainText("Attiva");
});

test("TS-07 · RF_ANPR_1 · lettura con sosta attiva e lettura duplicata → nessuna segnalazione, poi una sola", async ({
  playwright,
}, testInfo) => {
  const sosta = sostaDiTs01;
  test.skip(sosta === null, NON_ESEGUITO_SENZA_TS01);
  if (sosta === null) {
    return;
  }
  const url = urlDelTest(testInfo);
  const targaB = targaAnpr(idEsecuzione, "B");
  const paolo = await sessioneApi(playwright, url);
  let creata: number | undefined;
  try {
    await accedi(paolo, AUSILIARI.paoloFerri, passwordAusiliario());
    const righe = await inviaLetture(
      url,
      [
        { targa: sosta.utente.targa, stallo: sosta.stallo.id },
        { targa: targaB, stallo: STALLI_PER_LE_LETTURE.b },
        { targa: targaB, stallo: STALLI_PER_LE_LETTURE.c },
      ],
      testInfo.outputPath("ts07-letture.json"),
    );
    creata = righe[1].risposta?.segnalazione;

    await test.step("UC_ANPR_1 2.a1 · targa con sosta attiva sullo stallo → nessuna segnalazione", async () => {
      expect(righe[0].http).toBe(200);
      expect(righe[0].risposta?.esito).toBe("NESSUNA_SEGNALAZIONE");
      const nonChiuse = await segnalazioniNonChiuse(paolo);
      expect(nonChiuse.filter((s) => s.targaRilevata === sosta.utente.targa)).toEqual([]);
    });

    await test.step("UC_ANPR_1 4.a1 · seconda lettura della stessa targa → scartata", async () => {
      expect(righe[1].http).toBe(200);
      expect(righe[1].risposta).toMatchObject({
        esito: "SEGNALAZIONE_CREATA",
        motivo: "SOSTA_ASSENTE",
      });
      expect(righe[2].http).toBe(200);
      expect(righe[2].risposta?.esito).toBe("LETTURA_SCARTATA");
      const nonChiuse = await segnalazioniNonChiuse(paolo);
      expect(nonChiuse.filter((s) => s.targaRilevata === targaB).map((s) => s.id)).toEqual([
        creata,
      ]);
    });
  } finally {
    if (creata !== undefined) {
      await chiudiSegnalazione(paolo, creata);
    }
    await paolo.dispose();
  }
});

test("TS-15 · RF_SOSTA_2 · prolungamento di 15 minuti dalla sosta in corso → scadenza posticipata, importo aggiuntivo addebitato", async ({
  page,
}, testInfo) => {
  test.skip(!nellaFasciaAPagamento(new Date()), MOTIVO_FUORI_FASCIA);
  const url = urlDelTest(testInfo);
  const utente = await nuovoAutomobilista(page.request, idEsecuzione, "ts15");
  await ricarica(page.request, RICARICA_DALLA_SCHEDA);
  const stallo = await preparaStalloPerLaSosta(
    page.request,
    url,
    testInfo.outputPath("ts15-presenza.json"),
  );
  const avviata = await avviaSosta(page.request, {
    stallo: stallo.id,
    targa: utente.targa,
    durata: 15,
  });
  const scadenzaIniziale = Date.parse(avviata.orarioDiScadenza);
  const nuovaScadenza = scadenzaIniziale + 15 * 60_000;
  const scadenzaLetta = async () => {
    const letta = (await sosteInCorso(page.request)).find((s) => s.id === avviata.sosta);
    expect(letta, "sosta in GET /api/soste").toBeDefined();
    return { stato: letta?.stato, scadenza: Date.parse(letta?.orarioDiScadenza ?? "") };
  };

  await bloccaSfondo(page);
  await page.goto("/mappa");
  const sosta = laMiaSosta(page);
  await expect(sosta).toContainText("Attiva");
  const pannello = sosta.getByRole("form", { name: "Prolungamento della sosta" });
  const conferma = pannello.getByRole("button", { name: /^Conferma e paga \(/ });
  let importo = 0;

  await test.step("UC_SOSTA_2 4.a1 · «Prolunga», poi «Annulla» → scadenza invariata", async () => {
    await sosta.getByRole("button", { name: "Prolunga" }).click();
    await expect(pannello).toBeVisible();
    await pannello.getByRole("button", { name: "Annulla" }).click();
    await expect(pannello).toBeHidden();
    expect((await scadenzaLetta()).scadenza).toBe(scadenzaIniziale);
  });

  await test.step("UC_SOSTA_2 passi 1–3 · 15 minuti → importo aggiuntivo e nuova scadenza", async () => {
    await sosta.getByRole("button", { name: "Prolunga" }).click();
    await pannello.getByLabel("Tempo aggiuntivo").selectOption("15");
    const ora = formattaOra(new Date(nuovaScadenza));
    await expect(
      pannello.getByText(new RegExp(`^Importo aggiuntivo .+, nuova scadenza alle ${ora}\\.$`)),
    ).toBeVisible();
    await expect(conferma).toBeEnabled();
    importo = centesimiDa((await conferma.textContent()) ?? "");
    expect(importo).toBeGreaterThan(0);
  });

  await test.step("UC_SOSTA_2 passi 4–6 · RF_WALLET_2 · conferma → scadenza posticipata e addebito", async () => {
    await conferma.click();
    const ora = formattaOra(new Date(nuovaScadenza));
    await expect(sosta.getByText(`Sosta prolungata: scade alle ${ora}.`)).toBeVisible();
    await expect(sosta).toContainText(`Scadenza alle ${ora}`);
    expect(await scadenzaLetta()).toEqual({ stato: "ATTIVA", scadenza: nuovaScadenza });
    expect(await saldo(page.request)).toBe(RICARICA_DALLA_SCHEDA - avviata.importo - importo);
  });
});

test(
  "TS-02 · RF_SOSTA_7 · sosta di 15 minuti → Scaduta senza ricaricare, stallo Occupato, poi Libero e Terminata",
  {
    tag: "@lenta",
  },
  async ({ page }, testInfo) => {
    test.setTimeout(25 * 60_000);
    const url = urlDelTest(testInfo);
    const utente = await nuovoAutomobilista(page.request, idEsecuzione, "ts02");
    await ricarica(page.request, 500);
    const stallo = await preparaStalloPerLaSosta(
      page.request,
      url,
      testInfo.outputPath("ts02-presenza.json"),
    );
    await bloccaSfondo(page);
    const etichetta = (stato: string) => etichettaMarker(stallo, stato);

    await test.step("RF_SOSTA_1 · avvio di una sosta di 15 minuti", async () => {
      await page.goto("/mappa");
      await rigaStallo(page, stallo).click();
      await page.getByRole("button", { name: "Avvia sosta" }).click();
      await page.getByLabel("Durata").selectOption("15");
      const conferma = page.getByRole("button", { name: /^Conferma e paga \(/ });
      await expect(conferma).toBeEnabled();
      await conferma.click();
      await expect(laMiaSosta(page)).toContainText("Attiva");
      await expect(marker(page, stallo)).toHaveAttribute(
        "aria-label",
        etichetta("NON_DISPONIBILE"),
      );
    });

    const sosta = (await sosteInCorso(page.request)).find(
      (s) => s.targa === utente.targa && s.stato === "ATTIVA",
    );
    expect(sosta, "sosta Attiva in GET /api/soste").toBeDefined();
    const scadenza = Date.parse(sosta?.orarioDiScadenza ?? "");

    await test.step("UC_IOT_1 3.a1 · «veicolo presente» ogni 30 s → resta Non disponibile", async () => {
      for (let n = 1; Date.now() < scadenza - 35_000; n++) {
        await page.waitForTimeout(30_000);
        const [riga] = await inviaRilevazioni(
          url,
          [{ stallo: stallo.id, presenza: true }],
          testInfo.outputPath(`ts02-battito-${n}.json`),
        );
        expect(riga.esito).toBe("NON_DISPONIBILE");
        await expect(marker(page, stallo)).toHaveAttribute(
          "aria-label",
          etichetta("NON_DISPONIBILE"),
        );
      }
    });

    await test.step("UC_SOSTA_7 passo 2 · alla scadenza «Scaduta» senza ricaricare", async () => {
      await expect(laMiaSosta(page).getByText("Scaduta", { exact: true })).toBeVisible({
        timeout: Math.max(0, scadenza - Date.now()) + 15_000,
      });
    });

    await test.step("UC_SOSTA_7 passo 3 · stallo di nuovo Occupato (ultima rilevazione)", async () => {
      await expect(marker(page, stallo)).toHaveAttribute("aria-label", etichetta("OCCUPATO"), {
        timeout: 15_000,
      });
    });

    await test.step("UC_IOT_1 3.a2 · «nessun veicolo» → Libero, sosta Terminata", async () => {
      const [riga] = await inviaRilevazioni(
        url,
        [{ stallo: stallo.id, presenza: false }],
        testInfo.outputPath("ts02-uscita.json"),
      );
      expect(riga.esito).toBe("LIBERO");
      await expect(marker(page, stallo)).toHaveAttribute("aria-label", etichetta("LIBERO"));
      const soste = await sosteInCorso(page.request);
      expect(soste.find((s) => s.id === sosta?.id)).toBeUndefined();
      // «La mia sosta» rilegge le soste all'apertura: dopo un nuovo caricamento non c'è più.
      await page.reload();
      await expect(rigaStallo(page, stallo)).toContainText("Libero");
      await expect(page.getByText(utente.targa, { exact: true })).toHaveCount(0);
    });
  },
);
