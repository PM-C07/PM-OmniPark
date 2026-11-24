"use client";
// Boundary :MappaStalli (MU_2, UC_STALLI_1, SD_STALLI_1): mostraZona con la fotografia di
// GET /api/stalli, poi aggiornaStato con GET /api/stalli/modifiche un secondo dopo la risposta
// precedente (NRF_PER_3, hook useAggiornamentoPeriodico), applicando le righe per id; 401 →
// /accesso?da=%2Fmappa con caricamento completo (vaiAllAccesso).
// Contiene la scheda dello stallo con l'avvio della sosta e «La mia sosta».
import { useCallback, useMemo, useRef, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { BadgeStato } from "./BadgeStato.tsx";
import { formattaOra } from "./logica/importi.ts";
import {
  applicaModifiche,
  descriviTipo,
  elementoDelloStallo,
  LEGENDA_STALLI,
  VISTA_INIZIALE,
  ZONA_INIZIALE,
  zonaDallaVista,
  type StalloDellaMappa,
} from "./logica/mappaStalli.ts";
import { SchedaStallo, type SostaAvviata } from "./SchedaStallo.tsx";
import { SostaInCorso } from "./SostaInCorso.tsx";
import { useAggiornamentoPeriodico } from "./useAggiornamentoPeriodico.ts";
import { vaiAllAccesso } from "./vaiAllAccesso.ts";
import { VistaMappa, type ElementoMappa, type VistaGeografica } from "./VistaMappa.tsx";

export function MappaStalli() {
  const [zona, setZona] = useState(ZONA_INIZIALE);
  const [stalli, setStalli] = useState<readonly StalloDellaMappa[]>([]);
  const [selezionato, setSelezionato] = useState<number | null>(null);
  const [versioneSoste, setVersioneSoste] = useState(0);
  const [conferma, setConferma] = useState<string | null>(null);
  const titoloSosta = useRef<HTMLHeadingElement>(null);

  const sessioneScaduta = useCallback(() => vaiAllAccesso("/mappa"), []);

  // Fotografia della zona e poi variazioni dopo il cursore; tutto riparte quando cambia la zona.
  // Dati non disponibili all'inizio: UC_STALLI_1 2.a2; errore successivo: 4.a1, nuovo tentativo.
  const { caricamento, nonAggiornati } = useAggiornamentoPeriodico<StalloDellaMappa>({
    urlFotografia: `/api/stalli?zona=${zona}`,
    urlModifiche: (cursore) =>
      `/api/stalli/modifiche?zona=${zona}&dopo=${encodeURIComponent(cursore)}`,
    righe: (dati) => (dati as { stalli: StalloDellaMappa[] }).stalli,
    onFotografia: (righe) => setStalli(righe),
    onModifiche: (righe) => setStalli((attuali) => applicaModifiche(attuali, righe)),
    onSessioneScaduta: sessioneScaduta,
  });

  const cambioVista = useCallback((vista: VistaGeografica) => {
    setZona(zonaDallaVista(vista));
  }, []);

  const elementi = useMemo(() => stalli.map(elementoDelloStallo), [stalli]);
  const perId = useMemo(() => new Map(stalli.map((s) => [s.id, s])), [stalli]);
  const stallo = selezionato === null ? undefined : perId.get(selezionato);

  const descriviStallo = useCallback(
    (stalloId: number) => {
      const noto = perId.get(stalloId);
      return noto ? `Stallo n. ${noto.numero}, ${noto.areaDiSosta.nome}` : `Stallo ${stalloId}`;
    },
    [perId],
  );

  function sostaAvviata(sosta: SostaAvviata) {
    setSelezionato(null);
    setConferma(`Sosta avviata: scade alle ${formattaOra(sosta.orarioDiScadenza)}.`);
    setVersioneSoste((v) => v + 1);
    requestAnimationFrame(() => titoloSosta.current?.focus());
  }

  const contenutoRiga = useCallback(
    (elemento: ElementoMappa) => {
      const s = perId.get(elemento.id);
      if (!s) {
        return elemento.etichetta;
      }
      const tipo = descriviTipo(s.tipoDiStallo);
      return (
        <>
          <span aria-hidden="true" className="legenda-simbolo" data-tono={elemento.tono}>
            {elemento.simbolo}
          </span>
          <span className="flex-1">
            Stallo n. {s.numero} <span className="text-zinc-700">· {tipo.testo}</span>
          </span>
          <BadgeStato tipo="stallo" stato={s.stato} />
        </>
      );
    },
    [perId],
  );

  const avvisi = (
    <>
      {caricamento === "nonDisponibile" ? (
        <Avviso tipo="errore">I dati degli stalli non sono disponibili. Riprova più tardi.</Avviso>
      ) : null}
      {nonAggiornati ? (
        <Avviso tipo="informazione">
          Gli stati mostrati potrebbero non essere aggiornati: nuovo tentativo in corso.
        </Avviso>
      ) : null}
      {caricamento === "pronto" && stalli.length === 0 ? (
        <Avviso tipo="informazione">In questa zona non ci sono stalli gestiti.</Avviso>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <SostaInCorso
        ref={titoloSosta}
        versione={versioneSoste}
        conferma={conferma}
        descriviStallo={descriviStallo}
        onSessioneScaduta={sessioneScaduta}
      />
      <VistaMappa
        etichettaMappa="Mappa degli stalli"
        titoloElenco="Stalli della zona"
        elementi={elementi}
        legenda={LEGENDA_STALLI}
        vistaIniziale={VISTA_INIZIALE}
        selezionato={stallo ? stallo.id : null}
        onSeleziona={(id) => {
          setConferma(null);
          setSelezionato(id);
        }}
        onCambioVista={cambioVista}
        avvisi={avvisi}
        contenutoRiga={contenutoRiga}
        dettaglio={
          stallo ? (
            <SchedaStallo
              key={stallo.id}
              stallo={stallo}
              onChiudi={() => setSelezionato(null)}
              onSostaAvviata={sostaAvviata}
              onSessioneScaduta={sessioneScaduta}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-400 p-4 text-base text-zinc-800">
              Seleziona uno stallo sulla mappa o nell&apos;elenco per vederne tariffa e stato e
              avviare la sosta.
            </p>
          )
        }
      />
    </div>
  );
}
