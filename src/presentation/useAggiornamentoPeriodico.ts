"use client";
// Aggiornamento periodico con cursore (estratto da MappaStalli in OMP-59, NRF_PER_3): prima la
// fotografia, poi le variazioni dopo il cursore, un intervallo dopo la risposta precedente. Le
// richieste non si accavallano, si sospendono con la scheda nascosta e si fermano lasciando la
// pagina; 401 → onSessioneScaduta. Tutto riparte da una nuova fotografia quando cambia
// urlFotografia. Non conosce stalli né segnalazioni: le righe le estrae il chiamante.
import { useEffect, useRef, useState } from "react";
import { chiamaApi } from "./logica/risposteApi.ts";

export type Caricamento = "inCorso" | "pronto" | "nonDisponibile";

export type OpzioniAggiornamento<R> = {
  urlFotografia: string;
  urlModifiche(cursore: string): string;
  righe(dati: unknown): readonly R[];
  onFotografia(righe: readonly R[]): void;
  onModifiche(righe: readonly R[]): void;
  onSessioneScaduta(): void;
  intervalloMs?: number;
};

const INTERVALLO_MS = 1000;

export function useAggiornamentoPeriodico<R>(opzioni: OpzioniAggiornamento<R>): {
  caricamento: Caricamento;
  nonAggiornati: boolean;
} {
  const [caricamento, setCaricamento] = useState<Caricamento>("inCorso");
  const [nonAggiornati, setNonAggiornati] = useState(false);
  // Le callback cambiano a ogni rendering: il ciclo le legge da qui senza ripartire.
  const correnti = useRef(opzioni);
  useEffect(() => {
    correnti.current = opzioni;
  });

  const { urlFotografia } = opzioni;
  useEffect(() => {
    let attivo = true;
    let inCorso = false;
    let cursore: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controllo: AbortController | undefined;

    async function ciclo() {
      if (!attivo || inCorso || document.visibilityState === "hidden") {
        return;
      }
      inCorso = true;
      controllo = new AbortController();
      const url = cursore === null ? urlFotografia : correnti.current.urlModifiche(cursore);
      const esito = await chiamaApi(url, { method: "GET", signal: controllo.signal }, {});
      inCorso = false;
      if (!attivo) {
        return;
      }
      const o = correnti.current;
      if (esito.esito === "sessioneScaduta") {
        o.onSessioneScaduta();
        return;
      }
      if (esito.esito === "successo") {
        const righe = o.righe(esito.dati);
        if (cursore === null) {
          o.onFotografia(righe);
        } else {
          o.onModifiche(righe);
        }
        cursore = (esito.dati as { cursore: string }).cursore;
        setCaricamento("pronto");
        setNonAggiornati(false);
      } else if (cursore === null) {
        setCaricamento("nonDisponibile"); // dati iniziali non disponibili
      } else {
        setNonAggiornati(true); // si ritenta al giro successivo
      }
      timer = setTimeout(ciclo, o.intervalloMs ?? INTERVALLO_MS);
    }

    function visibilita() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        void ciclo();
      }
    }

    document.addEventListener("visibilitychange", visibilita);
    void ciclo();
    return () => {
      attivo = false;
      clearTimeout(timer);
      controllo?.abort();
      document.removeEventListener("visibilitychange", visibilita);
    };
  }, [urlFotografia]);

  return { caricamento, nonAggiornati };
}
