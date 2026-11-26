"use client";
// Boundary :MappaStalli, «La mia sosta» (np_01 «Sosta in corso: stato e orario di scadenza»,
// RF_SOSTA_7): soste ATTIVA e SCADUTA da GET /api/soste, con targa, stallo, scadenza e tempo
// rimanente. Un timer locale porta la sosta a Scaduta allo zero senza ricaricare la pagina, poi una
// nuova lettura conferma lo stato del server. Il tempo usa lo scarto stimato dall'intestazione Date.
// Dalla OMP-61: «Prolunga» sulle soste Attive (UC_SOSTA_2) e messaggio di conferma dell'avvio o del
// prolungamento visibile solo finché quella sosta è Attiva.
import { useEffect, useRef, useState, type Ref } from "react";
import { Avviso } from "./Avviso.tsx";
import { BadgeStato } from "./BadgeStato.tsx";
import { formattaOra } from "./logica/importi.ts";
import { chiamaApiConOra } from "./logica/risposteApi.ts";
import {
  confermaVisibile,
  scartoOrologio,
  statoMostrato,
  tempoRimanente,
} from "./logica/sostaInCorso.ts";
import { ProlungamentoSosta, type SostaProlungata } from "./ProlungamentoSosta.tsx";

type Sosta = {
  id: number;
  stato: string;
  targa: string;
  stalloId: number;
  orarioDiAvvio: string;
  orarioDiScadenza: string;
};

/** Messaggio di conferma dell'avvio o del prolungamento, con la sosta a cui si riferisce. */
export type ConfermaSosta = { sosta: number; testo: string };

export function SostaInCorso({
  versione,
  conferma,
  descriviStallo,
  onProlungata,
  onSessioneScaduta,
  ref,
}: {
  versione: number;
  conferma: ConfermaSosta | null;
  descriviStallo(stalloId: number): string;
  onProlungata(prolungata: SostaProlungata): void;
  onSessioneScaduta(): void;
  ref?: Ref<HTMLHeadingElement>;
}) {
  const [soste, setSoste] = useState<Sosta[]>([]);
  const [scarto, setScarto] = useState(0);
  // 0 fino alla prima risposta: l'ora si legge solo nel browser, mai durante il prerender.
  const [adesso, setAdesso] = useState(0);
  const [ricarica, setRicarica] = useState(0);
  const [nonDisponibili, setNonDisponibili] = useState(false);
  const confermate = useRef(new Set<number>());
  const sessione = useRef(onSessioneScaduta);
  useEffect(() => {
    sessione.current = onSessioneScaduta;
  });

  // Lettura delle soste: all'apertura, dopo un avvio (versione) e alla scadenza locale (ricarica).
  useEffect(() => {
    let attivo = true;
    void chiamaApiConOra("/api/soste", { method: "GET" }, {}).then(
      ({ esito, dataServer, inviata, ricevuta }) => {
        if (!attivo) {
          return;
        }
        if (esito.esito === "sessioneScaduta") {
          sessione.current();
        } else if (esito.esito === "successo") {
          setNonDisponibili(false);
          setAdesso(Date.now());
          setScarto(scartoOrologio(dataServer, inviata, ricevuta));
          setSoste((esito.dati as { soste: Sosta[] }).soste);
        } else {
          setNonDisponibili(true);
        }
      },
    );
    return () => {
      attivo = false;
    };
  }, [versione, ricarica]);

  // Timer locale da un secondo, solo nel browser e solo con una sosta da seguire.
  const daSeguire = soste.some((s) => s.stato === "ATTIVA");
  useEffect(() => {
    if (!daSeguire) {
      return;
    }
    const timer = setInterval(() => setAdesso(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [daSeguire]);

  // Allo zero, una sola nuova lettura per sosta: il server la allinea e la restituisce SCADUTA.
  const oraServer = adesso + scarto;
  useEffect(() => {
    for (const sosta of soste) {
      if (
        sosta.stato === "ATTIVA" &&
        tempoRimanente(Date.parse(sosta.orarioDiScadenza), oraServer).scaduta &&
        !confermate.current.has(sosta.id)
      ) {
        confermate.current.add(sosta.id);
        setRicarica((n) => n + 1);
      }
    }
  }, [soste, oraServer]);

  const mostraConferma = conferma !== null && confermaVisibile(conferma.sosta, soste, oraServer);
  if (soste.length === 0 && !mostraConferma && !nonDisponibili) {
    return null;
  }
  return (
    <section
      aria-labelledby="titolo-mia-sosta"
      className="flex flex-col gap-3 rounded-lg border border-zinc-300 bg-white p-4"
    >
      <h2
        id="titolo-mia-sosta"
        ref={ref}
        tabIndex={-1}
        className="text-lg font-semibold text-zinc-900"
      >
        La mia sosta
      </h2>
      {mostraConferma ? <Avviso tipo="successo">{conferma.testo}</Avviso> : null}
      {nonDisponibili ? (
        <Avviso tipo="errore">Le soste in corso non sono disponibili. Riprova più tardi.</Avviso>
      ) : null}
      <ul className="flex flex-col gap-3">
        {soste.map((sosta) => {
          const tempo = tempoRimanente(Date.parse(sosta.orarioDiScadenza), oraServer);
          const stato = statoMostrato(sosta.stato, tempo.scaduta);
          return (
            <li
              key={sosta.id}
              className="flex flex-col gap-1 rounded-md border border-zinc-300 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-lg font-semibold text-zinc-900">{sosta.targa}</span>
                <BadgeStato tipo="sosta" stato={stato} />
              </div>
              <p className="text-base text-zinc-900">{descriviStallo(sosta.stalloId)}</p>
              <p className="text-base text-zinc-900">
                Scadenza alle {formattaOra(sosta.orarioDiScadenza)}
                {sosta.stato === "ATTIVA" && !tempo.scaduta ? (
                  <>
                    {" · "}tempo rimanente <strong>{tempo.testo}</strong>
                  </>
                ) : null}
              </p>
              <ProlungamentoSosta
                sosta={sosta}
                statoMostrato={stato}
                onProlungata={onProlungata}
                onSessioneScaduta={onSessioneScaduta}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
