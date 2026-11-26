"use client";
// Boundary :MappaStalli, passaggio «Dichiarazione e foto del permesso» degli stalli riservati
// (np_01_automobilista, UC_SOSTA_5 passi 1–2, RF_SOSTA_5, OMP-61): la casella della dichiarazione
// e la foto del permesso esposto, scattata con la fotocamera o scelta dalla galleria (decisione D6).
// La foto si riduce nel browser a 1600 px in JPEG (decisione D5) e si controlla prima dell'invio;
// formato e dimensione li ricontrolla il server. Gli errori del server arrivano in `errore`.
import { useEffect, useState, type ChangeEvent } from "react";
import type { PermessoDiAvvio } from "./logica/avvioSosta.ts";
import { dimensioniRidotte, testoDichiarazione, verificaFotoPermesso } from "./logica/permesso.ts";

/** Qualità della codifica JPEG della foto ridotta (decisione D5). */
const QUALITA_JPEG = 0.85;

/**
 * Foto ridotta con il lato maggiore a 1600 px, in JPEG. Se il browser non riesce a leggere
 * l'immagine (per esempio un HEIC), resta il file originale: lo segnala il controllo successivo.
 */
async function riduciFoto(file: File): Promise<Blob> {
  try {
    const immagine = await createImageBitmap(file);
    const { larghezza, altezza } = dimensioniRidotte(immagine.width, immagine.height);
    const tela = document.createElement("canvas");
    tela.width = larghezza;
    tela.height = altezza;
    const contesto = tela.getContext("2d");
    if (!contesto) {
      immagine.close();
      return file;
    }
    contesto.drawImage(immagine, 0, 0, larghezza, altezza);
    immagine.close();
    const ridotta = await new Promise<Blob | null>((risolvi) =>
      tela.toBlob(risolvi, "image/jpeg", QUALITA_JPEG),
    );
    return ridotta ?? file;
  } catch {
    return file;
  }
}

const CLASSI_SCELTA =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md border border-zinc-500 bg-white px-4 py-2 text-base font-semibold text-zinc-900 hover:bg-zinc-100 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-800";

export function PermessoStallo({
  tipoDiStallo,
  errore,
  disabilitato,
  onCambio,
}: {
  tipoDiStallo: string;
  errore?: string;
  disabilitato?: boolean;
  onCambio(permesso: PermessoDiAvvio | null): void;
}) {
  const dichiarazione = testoDichiarazione(tipoDiStallo) ?? "";
  const [dichiarata, setDichiarata] = useState(false);
  // La foto valida con il suo URL locale per l'anteprima.
  const [foto, setFoto] = useState<{ contenuto: Blob; anteprima: string } | null>(null);
  const [erroreFoto, setErroreFoto] = useState<string | null>(null);
  const [lettura, setLettura] = useState(false);

  // L'URL dell'anteprima si rilascia quando cambia la foto o si chiude il passaggio.
  useEffect(() => {
    if (!foto) {
      return;
    }
    const { anteprima } = foto;
    return () => URL.revokeObjectURL(anteprima);
  }, [foto]);

  // Il permesso è completo solo con la dichiarazione spuntata e una foto valida.
  function comunica(conDichiarazione: boolean, contenuto: Blob | null) {
    onCambio(conDichiarazione && contenuto ? { dichiarazione, foto: contenuto } : null);
  }

  function cambiaDichiarazione(spuntata: boolean) {
    setDichiarata(spuntata);
    comunica(spuntata, foto?.contenuto ?? null);
  }

  async function scegliFoto(evento: ChangeEvent<HTMLInputElement>) {
    const file = evento.target.files?.[0];
    evento.target.value = "";
    if (!file) {
      return;
    }
    setLettura(true);
    const ridotta = await riduciFoto(file);
    setLettura(false);
    const problema = verificaFotoPermesso({ tipo: ridotta.type, dimensione: ridotta.size });
    setErroreFoto(problema);
    setFoto(problema ? null : { contenuto: ridotta, anteprima: URL.createObjectURL(ridotta) });
    comunica(dichiarata, problema ? null : ridotta);
  }

  const messaggio = erroreFoto ?? errore;
  return (
    <fieldset
      aria-describedby={messaggio ? "permesso-errore" : undefined}
      className={`flex flex-col gap-3 rounded-md border p-3 ${
        messaggio ? "border-2 border-red-700" : "border-zinc-300"
      }`}
    >
      <legend className="px-1 text-base font-semibold text-zinc-900">
        Dichiarazione e foto del permesso
      </legend>
      <p className="text-base text-zinc-800">
        Questo stallo è riservato: per avviare la sosta dichiara di esporre il permesso e carica la
        foto del permesso esposto. Dichiarazione e foto valgono solo per questa sosta e si
        cancellano quando termina.
      </p>
      <label className="flex min-h-11 items-start gap-3 text-base text-zinc-900">
        <input
          type="checkbox"
          checked={dichiarata}
          disabled={disabilitato}
          onChange={(e) => cambiaDichiarazione(e.target.checked)}
          className="mt-1 h-5 w-5"
        />
        <span>{dichiarazione}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <label className={CLASSI_SCELTA}>
          Scatta una foto
          <input
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            disabled={disabilitato || lettura}
            onChange={scegliFoto}
            className="sr-only"
          />
        </label>
        <label className={CLASSI_SCELTA}>
          Scegli dalla galleria
          <input
            type="file"
            accept="image/jpeg,image/png"
            disabled={disabilitato || lettura}
            onChange={scegliFoto}
            className="sr-only"
          />
        </label>
      </div>
      <p className="text-base text-zinc-900" aria-live="polite">
        {lettura ? "Preparazione della foto…" : foto ? "Foto del permesso pronta." : ""}
      </p>
      {foto ? (
        // L'anteprima è un URL blob: locale, non ottimizzabile da next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto.anteprima}
          alt="Anteprima della foto del permesso"
          className="max-h-48 w-auto self-start rounded-md border border-zinc-300"
        />
      ) : null}
      {messaggio ? (
        <p id="permesso-errore" className="text-sm font-medium text-red-800">
          Errore: {messaggio}
        </p>
      ) : null}
    </fieldset>
  );
}
