"use client";
// Ricarica simulata del wallet (UC_WALLET_1, SD_WALLET_1): scegliImporto(importo) tra i tagli
// previsti, riepilogo, conferma o annullamento. Usata dal pannello Wallet del profilo e, con il
// credito insufficiente, dalla scheda dello stallo, senza perdere i dati dell'avvio.
import { useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { formattaEuro } from "./logica/importi.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import {
  CAMPI_RICARICA,
  esitoRicaricaDa,
  messaggioRicaricaApprovata,
  TAGLI_RICARICA,
} from "./logica/wallet.ts";

/**
 * Id del bottone di un taglio, ricavato dall'id del titolo, unico per ogni Ricarica della pagina
 * (OMP-68): lo usano l'«Annulla» del riepilogo e il wallet del profilo per riportare il focus.
 */
export function idTaglioRicarica(idTitolo: string, taglio: number): string {
  return `${idTitolo}-taglio-${taglio}`;
}

export function Ricarica({
  onRicaricata,
  onSessioneScaduta,
  idTitolo,
}: {
  onRicaricata(saldo: number, importo: number): void;
  onSessioneScaduta(): void;
  idTitolo: string;
}) {
  const [scelto, setScelto] = useState<number | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<{ tipo: "successo" | "errore"; testo: string } | null>(null);
  const idTaglio = (taglio: number) => idTaglioRicarica(idTitolo, taglio);

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
      setEsito({ tipo: "successo", testo: messaggioRicaricaApprovata(scelto, risultato.saldo) });
      setScelto(null);
      onRicaricata(risultato.saldo, scelto);
      return;
    }
    setEsito({ tipo: "errore", testo: risultato.messaggio });
  }

  // «Annulla» (3.a1): il riepilogo si chiude e il focus torna sul taglio che era scelto (OMP-68,
  // WCAG 2.4.3).
  function annulla() {
    const taglio = scelto;
    setScelto(null);
    if (taglio !== null) {
      requestAnimationFrame(() => document.getElementById(idTaglio(taglio))?.focus());
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 id={idTitolo} className="text-base font-semibold text-marca-900">
        Ricarica simulata
      </h3>
      {esito ? <Avviso tipo={esito.tipo}>{esito.testo}</Avviso> : null}
      <div role="group" aria-labelledby={idTitolo} className="flex flex-wrap gap-2">
        {TAGLI_RICARICA.map((taglio) => (
          <Bottone
            key={taglio}
            id={idTaglio(taglio)}
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
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-base text-slate-900">
            Ricarica simulata di <strong>{formattaEuro(scelto)}</strong>: nessun addebito reale.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bottone inCorso={inCorso} testoInCorso="Ricarica in corso…" onClick={conferma}>
              Conferma la ricarica
            </Bottone>
            <Bottone variante="secondario" disabled={inCorso} onClick={annulla}>
              Annulla
            </Bottone>
          </div>
        </div>
      ) : null}
    </div>
  );
}
