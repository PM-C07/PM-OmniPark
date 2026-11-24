"use client";
// Boundary :MenuUtente (barra comune, SD_AUTH_4 3.a1, np_00): utente collegato con il ruolo, menu del ruolo e «Esci».
// Legge l'utente da GET /api/auth/io; con la sessione scaduta torna a /accesso.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { etichettaRuolo, indirizzoDiAccesso, vociDiMenu } from "./logica/navigazione.ts";
import { chiamaApi } from "./logica/risposteApi.ts";

type Utente = { id: number; ruolo: string; ente: number | null };

export function MenuUtente() {
  const router = useRouter();
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
        router.replace(indirizzoDiAccesso(percorso));
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
  }, [percorso, router]);

  async function esci() {
    setInUscita(true);
    // Il cookie lo cancella la risposta; si torna all'accesso anche se la chiamata fallisce.
    await chiamaApi("/api/auth/uscita", { method: "POST" }, {});
    router.replace("/accesso");
  }

  const voci = utente ? vociDiMenu(utente.ruolo) : [];
  return (
    <header className="border-b border-zinc-300 bg-white">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className="text-xl font-bold text-emerald-900">OmniPark</p>
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-800" aria-live="polite">
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
            className="min-h-11 rounded-md border border-zinc-500 px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
          >
            {inUscita ? "Uscita…" : "Esci"}
          </button>
        </div>
      </div>
      {voci.length > 0 ? (
        <nav aria-label="Menu principale" className="mx-auto w-full max-w-3xl px-2 pb-2">
          <ul className="flex gap-1 overflow-x-auto">
            {voci.map((voce) => {
              const corrente = percorso === voce.percorso;
              return (
                <li key={voce.percorso}>
                  <Link
                    href={voce.percorso}
                    aria-current={corrente ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-md px-3 text-base ${
                      corrente
                        ? "bg-emerald-100 font-semibold text-emerald-950 underline"
                        : "text-zinc-900 hover:bg-zinc-100"
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
