"use client";
// Boundary :MappaSegnalazioni, dettaglio della segnalazione (UC_OP_1 passo 4, SD_OP_1
// mostraDettaglio) e chiusura con esito (UC_OP_4, SD_OP_4). Prima dell'esito il dettaglio verifica
// stato e assegnatario (statoEAssegnatario): se la segnalazione è presa in carico da un altro
// Ausiliario mostra segnalaNonChiudibile al posto dei comandi. indicaEsito apre la richiesta di
// conferma con targa, stallo e motivo (mostraSegnalazione); «Conferma» chiama registraEsito
// (POST /api/segnalazioni/<id>/chiusura), «Annulla» lascia la segnalazione com'era (3.a1).
// Dopo la risposta si torna alla mappa (np_02), tranne per gli errori da riprovare.
// La segnalazione è una possibile sosta irregolare, non una sanzione (RD_10).
// Da OMP-63 (RAD 0.6, np_02): tipo di stallo nel dettaglio; una segnalazione Aperta ha solo
// «Prendi in carico» (UC_OP_2); stato del pagamento (UC_OP_3) e chiusura solo per chi l'ha presa in
// carico. I comandi li decide azioniPer; la regola resta del server.
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
  CAMPI_PRESA,
  descriviPagamento,
  rispostaAllaPresa,
  type AzioneDopoLaChiusura,
  type Azioni,
  type Esito,
  type SegnalazioneDellaMappa,
  type SostaDelPagamento,
  type StatoChiusura,
} from "./logica/mappaSegnalazioni.ts";
import { descriviTipo } from "./logica/mappaStalli.ts";
import { chiamaApi } from "./logica/risposteApi.ts";

type Pagamento =
  | { fase: "inattivo" }
  | { fase: "caricamento" }
  | { fase: "pronto"; testo: string }
  | { fase: "errore"; testo: string };

export function SchedaSegnalazione({
  segnalazione,
  azioni,
  onTornaAllaMappa,
  onAzioneDopoLaChiusura,
  onPresaInCarico,
}: {
  segnalazione: SegnalazioneDellaMappa;
  /** Comandi secondo stato e assegnatario, già valutati dalla mappa con l'utente della sessione. */
  azioni: Azioni;
  onTornaAllaMappa(): void;
  /** Rimozione, ritorno alla mappa, messaggio e sessione scaduta li gestisce la mappa. */
  onAzioneDopoLaChiusura(segnalazione: number, azione: AzioneDopoLaChiusura): void;
  /** La mappa sostituisce la riga con quella restituita dalla presa in carico. */
  onPresaInCarico(segnalazione: SegnalazioneDellaMappa): void;
}) {
  const [chiusura, setChiusura] = useState<StatoChiusura>({ fase: "inattiva" });
  const [errore, setErrore] = useState<string | null>(null);
  const [presaInCorso, setPresaInCorso] = useState(false);
  const [pagamento, setPagamento] = useState<Pagamento>({ fase: "inattivo" });
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

  // prendiInCarico (UC_OP_2): POST, poi la riga aggiornata; se non è più disponibile si torna alla
  // mappa con il messaggio (np_02 ErrPresa → Mappa).
  async function prendiInCarico() {
    setErrore(null);
    setPresaInCorso(true);
    const risposta = rispostaAllaPresa(
      await chiamaApi(
        `/api/segnalazioni/${segnalazione.id}/presa-in-carico`,
        { method: "POST" },
        CAMPI_PRESA,
      ),
    );
    setPresaInCorso(false);
    if (risposta.tipo === "presa") {
      onPresaInCarico(risposta.segnalazione);
      requestAnimationFrame(() => titolo.current?.focus());
    } else if (risposta.tipo === "sessioneScaduta") {
      onAzioneDopoLaChiusura(segnalazione.id, {
        rimuovi: false,
        tornaAllaMappa: false,
        accesso: true,
        messaggioMappa: null,
        messaggioScheda: null,
      });
    } else if (risposta.tipo === "nonDisponibile") {
      onAzioneDopoLaChiusura(segnalazione.id, {
        rimuovi: risposta.rimuovi,
        tornaAllaMappa: true,
        accesso: false,
        messaggioMappa: { tipo: "errore", testo: risposta.messaggio },
        messaggioScheda: null,
      });
    } else {
      setErrore(risposta.messaggio);
    }
  }

  // verificaPagamento (UC_OP_3): GET dello stato della sosta della targa sullo stallo.
  async function verificaPagamento() {
    setPagamento({ fase: "caricamento" });
    const esito = await chiamaApi(
      `/api/segnalazioni/${segnalazione.id}/pagamento`,
      { method: "GET" },
      {},
    );
    if (esito.esito === "sessioneScaduta") {
      onAzioneDopoLaChiusura(segnalazione.id, {
        rimuovi: false,
        tornaAllaMappa: false,
        accesso: true,
        messaggioMappa: null,
        messaggioScheda: null,
      });
    } else if (esito.esito === "successo") {
      const { sosta } = esito.dati as { sosta: SostaDelPagamento | null };
      setPagamento({ fase: "pronto", testo: descriviPagamento(sosta) });
    } else {
      // 2.a1: le informazioni sul pagamento non sono disponibili.
      setPagamento({ fase: "errore", testo: esito.messaggio });
    }
  }

  const inInvio = chiusura.fase === "inInvio";
  const tipo = segnalazione.tipoDiStallo ? descriviTipo(segnalazione.tipoDiStallo) : null;

  return (
    <section
      aria-labelledby="titolo-scheda-segnalazione"
      className="scheda flex flex-col gap-4 p-4"
    >
      <div className="-mx-4 -mt-4 flex items-start justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-marca-50 px-4 pt-4 pb-3">
        <div>
          <h2
            id="titolo-scheda-segnalazione"
            ref={titolo}
            tabIndex={-1}
            className="text-lg font-semibold text-marca-900"
          >
            Possibile sosta irregolare
          </h2>
          <p className="text-base text-slate-700">Stallo n. {segnalazione.numeroStallo}</p>
        </div>
        <Bottone variante="secondario" onClick={onTornaAllaMappa} disabled={inInvio}>
          Torna alla mappa
        </Bottone>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base text-slate-900">
        <dt className="font-medium">Stallo</dt>
        <dd>n. {segnalazione.numeroStallo}</dd>
        {tipo ? (
          <>
            <dt className="font-medium">Tipo</dt>
            <dd>
              <span aria-hidden="true">{tipo.simbolo} </span>
              {tipo.testo}
            </dd>
          </>
        ) : null}
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
        azioni.messaggio ? (
          // segnalaNonChiudibile (UC_OP_4 2.a1): presa in carico da un altro Ausiliario.
          <p className="rounded-xl border border-slate-200 bg-velo-50 p-3 text-base text-slate-900">
            {azioni.messaggio}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {azioni.prendiInCarico ? (
              <div>
                <Bottone
                  onClick={prendiInCarico}
                  inCorso={presaInCorso}
                  testoInCorso="Presa in carico…"
                >
                  Prendi in carico
                </Bottone>
              </div>
            ) : null}
            {azioni.pagamento ? (
              <div className="flex flex-col gap-2">
                <div>
                  <Bottone
                    variante="secondario"
                    onClick={verificaPagamento}
                    inCorso={pagamento.fase === "caricamento"}
                    testoInCorso="Verifica in corso…"
                  >
                    Verifica il pagamento
                  </Bottone>
                </div>
                <div aria-live="polite">
                  {pagamento.fase === "pronto" ? (
                    <p className="rounded-xl border border-slate-200 bg-velo-50 p-3 text-base text-slate-900">
                      {pagamento.testo}
                    </p>
                  ) : null}
                  {pagamento.fase === "errore" ? (
                    <Avviso tipo="errore">{pagamento.testo}</Avviso>
                  ) : null}
                </div>
              </div>
            ) : null}
            {azioni.chiusura ? (
              <div className="flex flex-col gap-2">
                <p className="text-base text-slate-900">Esito della verifica sul posto:</p>
                <div className="flex flex-wrap gap-2">
                  <Bottone onClick={() => indicaEsito("SOSTA_IRREGOLARE_ACCERTATA")}>
                    {ESITI.SOSTA_IRREGOLARE_ACCERTATA}
                  </Bottone>
                  <Bottone variante="secondario" onClick={() => indicaEsito("NON_CONFERMATA")}>
                    {ESITI.NON_CONFERMATA}
                  </Bottone>
                </div>
              </div>
            ) : null}
          </div>
        )
      ) : (
        <div
          role="group"
          aria-labelledby="titolo-conferma-chiusura"
          className="flex flex-col gap-3 rounded-xl border-l-4 border-marca-700 bg-marca-50 p-3"
        >
          <h3
            id="titolo-conferma-chiusura"
            ref={titoloConferma}
            tabIndex={-1}
            className="text-base font-semibold text-marca-900"
          >
            Confermi la chiusura con esito «{ESITI[chiusura.esito]}»?
          </h3>
          <p className="text-base text-slate-900">
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
