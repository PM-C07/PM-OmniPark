"use client";
// Boundary :MappaSegnalazioni (MU_4, UC_OP_1, SD_OP_1; chiusura UC_OP_4, SD_OP_4): richiediSegnalazioni
// con la fotografia di GET /api/ausiliario/segnalazioni, poi le variazioni di
// GET /api/ausiliario/segnalazioni/modifiche un secondo dopo la risposta precedente (hook
// useAggiornamentoPeriodico), senza ricaricare la pagina. Mappa ed elenco mostrano le segnalazioni
// aperte e prese in carico dalla più recente, distinte per motivo con colore, simbolo e testo.
// Le segnalazioni chiuse qui non ricompaiono finché non arriva la loro riga CHIUSA. L'ente lo
// filtrano le API. 401 → /accesso?da=%2Fausiliario. L'utente della sessione (GET /api/auth/io,
// chiamata propria) serve solo a mostrare segnalaNonChiudibile prima dell'esito: decide il server.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { BadgeStato } from "./BadgeStato.tsx";
import {
  applicaModificheSegnalazioni,
  chiudibilitaPer,
  descriviMotivo,
  elementoDellaSegnalazione,
  ESITI,
  formattaDataOra,
  LEGENDA_SEGNALAZIONI,
  ordinaDallaPiuRecente,
  scartaChiuseLocalmente,
  utenteDaRisposta,
  type AzioneDopoLaChiusura,
  type Messaggio,
  type SegnalazioneDellaMappa,
} from "./logica/mappaSegnalazioni.ts";
import { VISTA_INIZIALE } from "./logica/mappaStalli.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import { SchedaSegnalazione } from "./SchedaSegnalazione.tsx";
import { useAggiornamentoPeriodico } from "./useAggiornamentoPeriodico.ts";
import { vaiAllAccesso } from "./vaiAllAccesso.ts";
import { VistaMappa, type ElementoMappa } from "./VistaMappa.tsx";

function nessunCambioVista() {
  // La mappa delle segnalazioni non dipende dalla zona visibile.
}

export function MappaSegnalazioni() {
  const [segnalazioni, setSegnalazioni] = useState<readonly SegnalazioneDellaMappa[]>([]);
  const [selezionato, setSelezionato] = useState<number | null>(null);
  const [messaggio, setMessaggio] = useState<Messaggio | null>(null);
  const [utente, setUtente] = useState<number | null>(null);
  const chiuse = useRef<ReadonlySet<number>>(new Set());
  const zonaMessaggio = useRef<HTMLDivElement>(null);

  const sessioneScaduta = useCallback(() => vaiAllAccesso("/ausiliario"), []);

  /** Toglie le righe delle segnalazioni chiuse qui e aggiorna l'insieme. */
  function senzaChiuseQui(righe: readonly SegnalazioneDellaMappa[]) {
    const risultato = scartaChiuseLocalmente(righe, chiuse.current);
    chiuse.current = risultato.chiuse;
    return risultato.righe;
  }

  // Utente della sessione per statoEAssegnatario; se non arriva resta null e decide il server.
  useEffect(() => {
    let attivo = true;
    void chiamaApi("/api/auth/io", { method: "GET" }, {}).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        sessioneScaduta();
      } else if (esito.esito === "successo") {
        setUtente(utenteDaRisposta(esito.dati)); // forma non valida → null, decide il server
      }
    });
    return () => {
      attivo = false;
    };
  }, [sessioneScaduta]);

  // apriMappaSegnalazioni → richiediSegnalazioni (fotografia e variazioni periodiche).
  const richiediSegnalazioni = useAggiornamentoPeriodico<SegnalazioneDellaMappa>({
    urlFotografia: "/api/ausiliario/segnalazioni",
    urlModifiche: (cursore) =>
      `/api/ausiliario/segnalazioni/modifiche?dopo=${encodeURIComponent(cursore)}`,
    righe: (dati) => (dati as { segnalazioni: SegnalazioneDellaMappa[] }).segnalazioni,
    onFotografia: (righe) =>
      setSegnalazioni(
        ordinaDallaPiuRecente(senzaChiuseQui(righe).filter((s) => s.stato !== "CHIUSA")),
      ),
    onModifiche: (righe) => {
      const tenute = senzaChiuseQui(righe);
      setSegnalazioni((attuali) => applicaModificheSegnalazioni(attuali, tenute));
    },
    onSessioneScaduta: sessioneScaduta,
  });
  const { caricamento, nonAggiornati } = richiediSegnalazioni;

  // mostraSegnalazioniEPermessi: solo le segnalazioni (i permessi da verificare sono fuori ambito).
  const elementi = useMemo(() => segnalazioni.map(elementoDellaSegnalazione), [segnalazioni]);
  const perId = useMemo(() => new Map(segnalazioni.map((s) => [s.id, s])), [segnalazioni]);

  // selezionaSegnalazione → richiediDettaglio: i dati sono già quelli della mappa, aggiornati dal
  // polling, quindi nessuna richiesta in più.
  function selezionaSegnalazione(id: number) {
    setMessaggio(null);
    setSelezionato(id);
  }

  function richiediDettaglio(id: number | null): SegnalazioneDellaMappa | undefined {
    return id === null ? undefined : perId.get(id);
  }

  const segnalazione = richiediDettaglio(selezionato);

  // «Torna alla mappa»: il focus va sulla riga della segnalazione nell'elenco, o sul titolo
  // dell'elenco se nel frattempo la riga non c'è più.
  function tornaAllaMappa(id: number) {
    setSelezionato(null);
    requestAnimationFrame(() => {
      const riga = document
        .querySelector(`[data-riga-segnalazione="${id}"]`)
        ?.closest<HTMLButtonElement>("button");
      (riga ?? document.getElementById("titolo-elenco-mappa"))?.focus();
    });
  }

  function mostraMessaggio(nuovo: Messaggio) {
    setMessaggio(nuovo);
    requestAnimationFrame(() => zonaMessaggio.current?.focus());
  }

  // confermaChiusura / segnalaNonChiudibile dopo il POST: ritorno alla mappa (np_02), con la
  // segnalazione rimossa se chiusa (anche da altri) e il messaggio in cima alla pagina.
  function dopoLaChiusura(id: number, azione: AzioneDopoLaChiusura) {
    if (azione.accesso) {
      sessioneScaduta();
      return;
    }
    if (azione.rimuovi) {
      chiuse.current = new Set([...chiuse.current, id]);
      setSegnalazioni((attuali) => attuali.filter((s) => s.id !== id));
    }
    if (azione.tornaAllaMappa) {
      setSelezionato(null);
    }
    if (azione.messaggioMappa) {
      mostraMessaggio(azione.messaggioMappa);
    }
  }

  const contenutoRiga = useCallback(
    (elemento: ElementoMappa) => {
      const s = perId.get(elemento.id);
      if (!s) {
        return elemento.etichetta;
      }
      return (
        <>
          <span aria-hidden="true" className="legenda-simbolo" data-tono={elemento.tono}>
            {elemento.simbolo}
          </span>
          <span className="flex-1" data-riga-segnalazione={s.id}>
            Stallo n. {s.numeroStallo}{" "}
            <span className="text-zinc-700">
              · {descriviMotivo(s.motivo).testo} · {formattaDataOra(s.dataEOraDellaLettura)}
            </span>
          </span>
          <BadgeStato tipo="segnalazione" stato={s.stato} />
        </>
      );
    },
    [perId],
  );

  const avvisi = (
    <>
      {caricamento === "nonDisponibile" ? (
        // segnalaNonDisponibili (UC_OP_1 2.a2)
        <Avviso tipo="errore">Le segnalazioni non sono disponibili. Riprova più tardi.</Avviso>
      ) : null}
      {nonAggiornati ? (
        <Avviso tipo="informazione">
          Le segnalazioni mostrate potrebbero non essere aggiornate: nuovo tentativo in corso.
        </Avviso>
      ) : null}
      {caricamento === "pronto" && segnalazioni.length === 0 ? (
        // segnalaNessunaSegnalazione (UC_OP_1 2.a1)
        <Avviso tipo="informazione">
          Nel tuo comune non ci sono possibili soste irregolari da verificare.
        </Avviso>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div ref={zonaMessaggio} tabIndex={-1} aria-live="polite">
        {messaggio ? <Avviso tipo={messaggio.tipo}>{messaggio.testo}</Avviso> : null}
      </div>
      <VistaMappa
        etichettaMappa="Mappa delle segnalazioni"
        titoloElenco="Possibili soste irregolari, dalla più recente"
        elementi={elementi}
        legenda={LEGENDA_SEGNALAZIONI}
        vistaIniziale={VISTA_INIZIALE}
        selezionato={segnalazione ? segnalazione.id : null}
        onSeleziona={selezionaSegnalazione}
        onCambioVista={nessunCambioVista}
        avvisi={avvisi}
        contenutoRiga={contenutoRiga}
        testoElencoVuoto="Nessuna possibile sosta irregolare da verificare."
        dettaglio={
          segnalazione ? (
            <SchedaSegnalazione
              key={segnalazione.id}
              segnalazione={segnalazione}
              chiudibilita={chiudibilitaPer(segnalazione, utente)}
              onTornaAllaMappa={() => tornaAllaMappa(segnalazione.id)}
              onAzioneDopoLaChiusura={dopoLaChiusura}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-400 p-4 text-base text-zinc-800">
              {selezionato !== null
                ? "La segnalazione selezionata non è più aperta: è stata chiusa."
                : `Seleziona una segnalazione sulla mappa o nell'elenco per vederne il dettaglio e registrare l'esito: ${ESITI.SOSTA_IRREGOLARE_ACCERTATA.toLowerCase()} o ${ESITI.NON_CONFERMATA.toLowerCase()}.`}
            </p>
          )
        }
      />
    </div>
  );
}
