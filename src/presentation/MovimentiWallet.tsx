"use client";
// Sezione «Movimenti» del wallet (MU_3, UC_WALLET_3, SD_WALLET_3 2.2–2.4): cronologia da
// GET /api/wallet/movimenti, dal più recente. Si ricarica quando cambia `versione` (dopo una
// ricarica fatta nel pannello), senza ricaricare la pagina.
import { useEffect, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { chiamaApi } from "./logica/risposteApi.ts";
import { rigaMovimento, type MovimentoApi } from "./logica/wallet.ts";
import { vaiAllAccesso } from "./vaiAllAccesso.ts";

export function MovimentiWallet({ versione }: { versione: number }) {
  const [movimenti, setMovimenti] = useState<MovimentoApi[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    void chiamaApi("/api/wallet/movimenti", { method: "GET" }, {}).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        vaiAllAccesso("/profilo");
      } else if (esito.esito === "successo") {
        setErrore(null);
        setMovimenti((esito.dati as { movimenti: MovimentoApi[] }).movimenti);
      } else {
        // 2.a2 di UC_WALLET_3: dati del wallet non disponibili.
        setErrore("I movimenti del wallet non sono disponibili. Riprova più tardi.");
      }
    });
    return () => {
      attivo = false;
    };
  }, [versione]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titolo-movimenti">
      <h3 id="titolo-movimenti" className="text-base font-semibold text-zinc-900">
        Movimenti
      </h3>
      {errore ? <Avviso tipo="errore">{errore}</Avviso> : null}
      {movimenti === null ? (
        errore ? null : (
          <p className="text-base text-zinc-800">Caricamento…</p>
        )
      ) : movimenti.length === 0 ? (
        <p className="text-base text-zinc-800">Non ci sono ancora movimenti.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Movimenti del wallet">
          {movimenti.map((movimento) => {
            const riga = rigaMovimento(movimento);
            return (
              <li
                key={movimento.id}
                className="flex flex-col gap-1 rounded-md border border-zinc-300 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-900">{riga.tipo}</span>
                  <span className="font-semibold text-zinc-900 tabular-nums">{riga.importo}</span>
                </div>
                <p className="text-sm text-zinc-800">{riga.dataEOra}</p>
                {riga.stallo !== null ? (
                  <p className="text-sm text-zinc-800">
                    {riga.stallo} · targa <span className="font-mono">{riga.targa}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
