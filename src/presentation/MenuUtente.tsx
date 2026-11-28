"use client";
// Boundary :MenuUtente (barra comune, SD_AUTH_4 3.a1, np_00): utente collegato con il ruolo, menu del ruolo e «Esci».
// Legge l'utente da GET /api/auth/io; con la sessione scaduta torna a /accesso.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { etichettaRuolo, vociDiMenu } from "./logica/navigazione.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import { vaiAllAccesso } from "./vaiAllAccesso.ts";

type Utente = { id: number; ruolo: string; ente: number | null };

export function MenuUtente() {
  const percorso = usePathname();
  const [utente, setUtente] = useState<Utente | null>(null);
  const [erroreUtente, setErroreUtente] = useState(false);
  const [inUscita, setInUscita] = useState(false);

  useEffect(() => {
    let attivo = true;
    void chiamaApi("/api/auth/io", { method: "GET" }, {}).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        vaiAllAccesso(percorso);
      } else if (esito.esito === "successo") {
        setErroreUtente(false);
        setUtente((esito.dati as { utente: Utente }).utente);
      } else {
        // Server o rete non disponibili: niente «Caricamento…» infinito; «Esci» resta attivo.
        setErroreUtente(true);
      }
    });
    return () => {
      attivo = false;
    };
  }, [percorso]);

  async function esci() {
    setInUscita(true);
    // Il cookie lo cancella la risposta; si torna all'accesso anche se la chiamata fallisce.
    await chiamaApi("/api/auth/uscita", { method: "POST" }, {});
    // Caricamento completo (vaiAllAccesso): non deve restare nulla dell'utente precedente.
    vaiAllAccesso();
  }

  const voci = utente ? vociDiMenu(utente.ruolo) : [];
  return (
    // Dalla OMP-68: intestazione scura con la sfumatura della palette e il logo decorativo, uguale
    // per i tre ruoli e per le pagine pubbliche ((pubblico)/layout.tsx).
    <header className="border-b-4 bg-linear-to-r from-marca-900 to-marca-700 [border-image:linear-gradient(to_right,var(--color-marca-700),var(--color-foglia-400))_1]">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3 lg:max-w-5xl">
        <p className="flex items-center gap-2 text-xl font-bold text-white">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10" />
          OmniPark
        </p>
        <div className="flex items-center gap-3">
          <p className="text-sm text-marca-50" aria-live="polite">
            {utente
              ? etichettaRuolo(utente.ruolo, utente.ente)
              : erroreUtente
                ? "Utente non disponibile"
                : "Caricamento…"}
          </p>
          <button
            type="button"
            onClick={esci}
            disabled={inUscita}
            aria-busy={inUscita || undefined}
            className="min-h-11 rounded-xl border border-white/80 px-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10 disabled:opacity-60 motion-reduce:transition-none"
          >
            {inUscita ? "Uscita…" : "Esci"}
          </button>
        </div>
      </div>
      {voci.length > 0 ? (
        <nav
          aria-label="Menu principale"
          className="mx-auto w-full max-w-3xl px-2 pb-2 lg:max-w-5xl"
        >
          <ul className="flex gap-1 overflow-x-auto">
            {voci.map((voce) => {
              const corrente = percorso === voce.percorso;
              return (
                <li key={voce.percorso}>
                  <Link
                    href={voce.percorso}
                    aria-current={corrente ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-xl px-3 text-base transition-colors duration-150 motion-reduce:transition-none ${
                      corrente
                        ? "bg-white font-semibold text-marca-900 underline decoration-2 underline-offset-4"
                        : "text-white hover:bg-white/10"
                    }`}
                  >
                    {voce.etichetta}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
