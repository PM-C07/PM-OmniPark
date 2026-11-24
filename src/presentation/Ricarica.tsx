"use client";
// Ricarica simulata del wallet (UC_WALLET_1, SD_WALLET_1): scegliImporto(importo) tra i tagli
// previsti, riepilogo, conferma o annullamento. Usata dal pannello Wallet del profilo e, con il
// credito insufficiente, dalla scheda dello stallo, senza perdere i dati dell'avvio.
import { useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { formattaEuro } from "./logica/importi.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import { CAMPI_RICARICA, esitoRicaricaDa, TAGLI_RICARICA } from "./logica/wallet.ts";

export function Ricarica({
  onRicaricata,
  onSessioneScaduta,
  idTitolo,
}: {
  onRicaricata(saldo: number): void;
  onSessioneScaduta(): void;
  idTitolo: string;
}) {
  const [scelto, setScelto] = useState<number | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<{ tipo: "successo" | "errore"; testo: string } | null>(null);

  function scegliImporto(importo: number) {
    setEsito(null);
    setScelto(importo);
  }

  async function conferma() {
    if (scelto === null) {
      return;
    }
    setInCorso(true);
    const risultato = esitoRicaricaDa(
      await chiamaApi(
        "/api/wallet/ricarica",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ importo: scelto }),
        },
        CAMPI_RICARICA,
      ),
    );
    setInCorso(false);
    if (risultato.esito === "sessioneScaduta") {
      onSessioneScaduta();
      return;
    }
    if (risultato.esito === "approvata") {
      setEsito({
        tipo: "successo",
        testo: `Ricarica di ${formattaEuro(scelto)} approvata. Nuovo saldo: ${formattaEuro(risultato.saldo)}.`,
      });
      setScelto(null);
      onRicaricata(risultato.saldo);
      return;
    }
    setEsito({ tipo: "errore", testo: risultato.messaggio });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 id={idTitolo} className="text-base font-semibold text-zinc-900">
        Ricarica simulata
      </h3>
      {esito ? <Avviso tipo={esito.tipo}>{esito.testo}</Avviso> : null}
      <div role="group" aria-labelledby={idTitolo} className="flex flex-wrap gap-2">
        {TAGLI_RICARICA.map((taglio) => (
          <Bottone
            key={taglio}
            variante={scelto === taglio ? "primario" : "secondario"}
            aria-pressed={scelto === taglio}
            disabled={inCorso}
            onClick={() => scegliImporto(taglio)}
          >
            {formattaEuro(taglio)}
          </Bottone>
        ))}
      </div>
      {scelto !== null ? (
        <div className="flex flex-col gap-3 rounded-md border border-zinc-300 bg-zinc-50 p-3">
          <p className="text-base text-zinc-900">
            Ricarica simulata di <strong>{formattaEuro(scelto)}</strong>: nessun addebito reale.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bottone inCorso={inCorso} testoInCorso="Ricarica in corso…" onClick={conferma}>
              Conferma la ricarica
            </Bottone>
            <Bottone variante="secondario" disabled={inCorso} onClick={() => setScelto(null)}>
              Annulla
            </Bottone>
          </div>
        </div>
      ) : null}
    </div>
  );
}
