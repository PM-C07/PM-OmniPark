"use client";
// Boundary :MappaSegnalazioni, dettaglio della segnalazione (UC_OP_1 passo 4, SD_OP_1
// mostraDettaglio) e chiusura con esito (UC_OP_4, SD_OP_4). Prima dell'esito il dettaglio verifica
// stato e assegnatario (statoEAssegnatario): se la segnalazione è presa in carico da un altro
// Ausiliario mostra segnalaNonChiudibile al posto dei comandi. indicaEsito apre la richiesta di
// conferma con targa, stallo e motivo (mostraSegnalazione); «Conferma» chiama registraEsito
// (POST /api/segnalazioni/<id>/chiusura), «Annulla» lascia la segnalazione com'era (3.a1).
// Dopo la risposta si torna alla mappa (np_02), tranne per gli errori da riprovare.
// La segnalazione è una possibile sosta irregolare, non una sanzione (RD_10).
import { useEffect, useRef, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { BadgeStato } from "./BadgeStato.tsx";
import { Bottone } from "./Bottone.tsx";
import {
  azioneDopoLaChiusura,
  CAMPI_CHIUSURA,
  descriviMotivo,
  ESITI,
  formattaDataOra,
  passoChiusura,
  rispostaAllaChiusura,
  type AzioneDopoLaChiusura,
  type Chiudibilita,
  type Esito,
  type SegnalazioneDellaMappa,
  type StatoChiusura,
} from "./logica/mappaSegnalazioni.ts";
import { chiamaApi } from "./logica/risposteApi.ts";

export function SchedaSegnalazione({
  segnalazione,
  chiudibilita,
  onTornaAllaMappa,
  onAzioneDopoLaChiusura,
}: {
  segnalazione: SegnalazioneDellaMappa;
  /** statoEAssegnatario, già valutato dalla mappa con l'utente della sessione. */
  chiudibilita: Chiudibilita;
  onTornaAllaMappa(): void;
  /** Rimozione, ritorno alla mappa, messaggio e sessione scaduta li gestisce la mappa. */
  onAzioneDopoLaChiusura(segnalazione: number, azione: AzioneDopoLaChiusura): void;
}) {
  const [chiusura, setChiusura] = useState<StatoChiusura>({ fase: "inattiva" });
  const [errore, setErrore] = useState<string | null>(null);
  const titolo = useRef<HTMLHeadingElement>(null);
  const titoloConferma = useRef<HTMLHeadingElement>(null);
  const motivo = descriviMotivo(segnalazione.motivo);
  const targa = segnalazione.targaRilevata ?? "non letta";

  useEffect(() => {
    titolo.current?.focus();
  }, []);

  // indicaEsito(esito): richiesta di conferma (mostraSegnalazione), nessuna chiamata alle API.
  function indicaEsito(esito: Esito) {
    setErrore(null);
    setChiusura(
      (attuale) => passoChiusura(segnalazione.id, attuale, { tipo: "indicaEsito", esito }).stato,
    );
    requestAnimationFrame(() => titoloConferma.current?.focus());
  }

  // annulla() (3.a1): la segnalazione resta nello stato in cui si trovava.
  function annulla() {
    setChiusura((attuale) => passoChiusura(segnalazione.id, attuale, { tipo: "annulla" }).stato);
    requestAnimationFrame(() => titolo.current?.focus());
  }

  // registraEsito(esito): POST della chiusura, una sola richiesta per conferma. Il 409 «presa da
  // altri» resta possibile: la situazione può cambiare tra la lettura e la chiusura.
  async function registraEsito() {
    const passo = passoChiusura(segnalazione.id, chiusura, { tipo: "conferma" });
    if (!passo.richiesta) {
      return;
    }
    setChiusura(passo.stato);
    setErrore(null);
    const risposta = rispostaAllaChiusura(
      await chiamaApi(
        passo.richiesta.url,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(passo.richiesta.corpo),
        },
        CAMPI_CHIUSURA,
      ),
    );
    const azione = azioneDopoLaChiusura(risposta, segnalazione.numeroStallo);
    if (azione.tornaAllaMappa || azione.accesso) {
      onAzioneDopoLaChiusura(segnalazione.id, azione);
    } else {
      // Errore da riprovare: si resta nella conferma con lo stesso esito.
      setChiusura({ fase: "daConfermare", esito: passo.richiesta.corpo.esito });
      setErrore(azione.messaggioScheda);
    }
  }

  const inInvio = chiusura.fase === "inInvio";

  return (
    <section
      aria-labelledby="titolo-scheda-segnalazione"
      className="flex flex-col gap-4 rounded-lg border border-zinc-300 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2
            id="titolo-scheda-segnalazione"
            ref={titolo}
            tabIndex={-1}
            className="text-lg font-semibold text-zinc-900"
          >
            Possibile sosta irregolare
          </h2>
          <p className="text-base text-zinc-800">Stallo n. {segnalazione.numeroStallo}</p>
        </div>
        <Bottone variante="secondario" onClick={onTornaAllaMappa} disabled={inInvio}>
          Torna alla mappa
        </Bottone>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base text-zinc-900">
        <dt className="font-medium">Stallo</dt>
        <dd>n. {segnalazione.numeroStallo}</dd>
        <dt className="font-medium">Motivo</dt>
        <dd className="flex items-center gap-2">
          <span aria-hidden="true" className="legenda-simbolo" data-tono={motivo.tono}>
            {motivo.simbolo}
          </span>
          {motivo.testo}
        </dd>
        <dt className="font-medium">Targa</dt>
        <dd>{targa}</dd>
        <dt className="font-medium">Lettura</dt>
        <dd>{formattaDataOra(segnalazione.dataEOraDellaLettura)}</dd>
        <dt className="font-medium">Stato</dt>
        <dd>
          <BadgeStato tipo="segnalazione" stato={segnalazione.stato} />
        </dd>
      </dl>

      {errore ? <Avviso tipo="errore">{errore}</Avviso> : null}

      {chiusura.fase === "inattiva" ? (
        !chiudibilita.chiudibile ? (
          // segnalaNonChiudibile (UC_OP_4 2.a1), prima della scelta dell'esito.
          <p className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-base text-zinc-900">
            {chiudibilita.messaggio}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-base text-zinc-900">Esito della verifica sul posto:</p>
            <div className="flex flex-wrap gap-2">
              <Bottone onClick={() => indicaEsito("SOSTA_IRREGOLARE_ACCERTATA")}>
                {ESITI.SOSTA_IRREGOLARE_ACCERTATA}
              </Bottone>
              <Bottone variante="secondario" onClick={() => indicaEsito("NON_CONFERMATA")}>
                {ESITI.NON_CONFERMATA}
              </Bottone>
            </div>
          </div>
        )
      ) : (
        <div
          role="group"
          aria-labelledby="titolo-conferma-chiusura"
          className="flex flex-col gap-3 rounded-md border-l-4 border-emerald-800 bg-emerald-50 p-3"
        >
          <h3
            id="titolo-conferma-chiusura"
            ref={titoloConferma}
            tabIndex={-1}
            className="text-base font-semibold text-zinc-900"
          >
            Confermi la chiusura con esito «{ESITI[chiusura.esito]}»?
          </h3>
          <p className="text-base text-zinc-900">
            Stallo n. {segnalazione.numeroStallo}, targa {targa}, {motivo.testo.toLowerCase()}. La
            segnalazione sarà chiusa e uscirà dalla mappa.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bottone onClick={registraEsito} inCorso={inInvio} testoInCorso="Chiusura in corso…">
              Conferma
            </Bottone>
            <Bottone variante="secondario" onClick={annulla} disabled={inInvio}>
              Annulla
            </Bottone>
          </div>
        </div>
      )}
    </section>
  );
}
