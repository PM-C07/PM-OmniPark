"use client";
// Boundary :MappaSegnalazioni, voce «Permessi da verificare» (MU_4, RF_OP_2, UC_OP_1 3.a1, UC_OP_5,
// SD_OP_5; OMP-63 parte B). Nessun marker sulla mappa: un elenco nella pagina dell'Ausiliario,
// caricato all'apertura e dopo ogni esito, senza aggiornamento periodico. Il permesso selezionato
// mostra tipo di stallo, targa, dichiarazione e foto (GET /api/permessi/<sosta>/foto, no-store);
// indicaEsito apre la conferma, «Conferma» chiama registraEsito (POST /api/permessi/<sosta>/esito),
// «Annulla» non registra nulla (3.a1). Con esito non conforme nasce una segnalazione di sosta
// irregolare accertata, già chiusa (4.a1): è un esito della verifica, non una sanzione.
import { useCallback, useEffect, useRef, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { descriviTipo } from "./logica/mappaStalli.ts";
import {
  CAMPI_ESITO_VERIFICA,
  descriviPermesso,
  ESITI_VERIFICA,
  rispostaAllEsito,
  type EsitoVerifica,
  type PermessoDellElenco,
} from "./logica/permessiDaVerificare.ts";
import { chiamaApi, type EsitoRisposta } from "./logica/risposteApi.ts";

const URL_ELENCO = "/api/ausiliario/permessi";

type Caricamento = "inCorso" | "pronto" | "nonDisponibile";
type Messaggio = { tipo: "successo" | "errore"; testo: string };

export function PermessiDaVerificare({ onSessioneScaduta }: { onSessioneScaduta(): void }) {
  const [permessi, setPermessi] = useState<readonly PermessoDellElenco[]>([]);
  const [caricamento, setCaricamento] = useState<Caricamento>("inCorso");
  const [selezionato, setSelezionato] = useState<number | null>(null);
  const [daConfermare, setDaConfermare] = useState<EsitoVerifica | null>(null);
  const [inInvio, setInInvio] = useState(false);
  const [messaggio, setMessaggio] = useState<Messaggio | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const zonaMessaggio = useRef<HTMLDivElement>(null);

  // richiediPermessi: all'apertura della pagina e dopo ogni esito registrato.
  const applicaElenco = useCallback(
    (esito: EsitoRisposta) => {
      if (esito.esito === "sessioneScaduta") {
        onSessioneScaduta();
      } else if (esito.esito === "successo") {
        setPermessi((esito.dati as { permessi: PermessoDellElenco[] }).permessi);
        setCaricamento("pronto");
      } else {
        setCaricamento("nonDisponibile");
      }
    },
    [onSessioneScaduta],
  );

  useEffect(() => {
    let attivo = true;
    void chiamaApi(URL_ELENCO, { method: "GET" }, {}).then((esito) => {
      if (attivo) {
        applicaElenco(esito);
      }
    });
    return () => {
      attivo = false;
    };
  }, [applicaElenco]);

  const permesso = permessi.find((p) => p.sostaId === selezionato) ?? null;

  function seleziona(sosta: number | null) {
    setSelezionato(sosta);
    setDaConfermare(null);
    setErrore(null);
  }

  function mostraMessaggio(nuovo: Messaggio) {
    setMessaggio(nuovo);
    requestAnimationFrame(() => zonaMessaggio.current?.focus());
  }

  // I bottoni premuti escono dalla pagina: dopo la scelta il focus va sull'esito scelto, dopo
  // «Annulla» (3.a1) torna sul bottone di quell'esito (OMP-68, WCAG 2.4.3).
  function scegliEsito(esito: EsitoVerifica) {
    setDaConfermare(esito);
    requestAnimationFrame(() => document.getElementById("permesso-esito-scelto")?.focus());
  }

  function annullaEsito(esito: EsitoVerifica) {
    setDaConfermare(null);
    requestAnimationFrame(() => document.getElementById(`permesso-esito-${esito}`)?.focus());
  }

  // registraEsito (UC_OP_5 passo 4): dopo la risposta l'elenco si ricarica.
  async function conferma(sosta: number, esitoScelto: EsitoVerifica) {
    setErrore(null);
    setInInvio(true);
    const risposta = rispostaAllEsito(
      await chiamaApi(
        `/api/permessi/${sosta}/esito`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ esito: esitoScelto }),
        },
        CAMPI_ESITO_VERIFICA,
      ),
      esitoScelto,
    );
    setInInvio(false);
    if (risposta.tipo === "sessioneScaduta") {
      onSessioneScaduta();
      return;
    }
    if (risposta.tipo === "errore") {
      setErrore(risposta.messaggio);
      return;
    }
    seleziona(null);
    mostraMessaggio({
      tipo: risposta.tipo === "registrato" ? "successo" : "errore",
      testo: risposta.messaggio,
    });
    applicaElenco(await chiamaApi(URL_ELENCO, { method: "GET" }, {}));
  }

  return (
    <section aria-labelledby="permessi-titolo" className="flex flex-col gap-3">
      <h2 id="permessi-titolo" className="text-lg font-semibold text-marca-900">
        Permessi da verificare
      </h2>
      <div ref={zonaMessaggio} tabIndex={-1} aria-live="polite">
        {messaggio ? <Avviso tipo={messaggio.tipo}>{messaggio.testo}</Avviso> : null}
      </div>
      {caricamento === "nonDisponibile" ? (
        <Avviso tipo="errore">
          I permessi da verificare non sono disponibili. Riprova più tardi.
        </Avviso>
      ) : null}
      {caricamento === "pronto" && permessi.length === 0 ? (
        <Avviso tipo="informazione">Nel tuo comune non ci sono permessi da verificare.</Avviso>
      ) : null}
      {permessi.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {permessi.map((p) => (
            <li key={p.sostaId}>
              <button
                type="button"
                aria-pressed={p.sostaId === selezionato}
                onClick={() => seleziona(p.sostaId === selezionato ? null : p.sostaId)}
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-base text-slate-900 transition-colors duration-150 hover:bg-marca-50 aria-pressed:border-2 aria-pressed:border-marca-700 aria-pressed:bg-marca-50 motion-reduce:transition-none"
                data-permesso={p.sostaId}
              >
                {descriviPermesso(p)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {permesso ? (
        <div
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          data-scheda-permesso={permesso.sostaId}
        >
          <h3 className="text-base font-semibold text-marca-900">
            Stallo n. {permesso.numeroStallo}, {descriviTipo(permesso.tipoDiStallo).testo}
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base text-slate-900">
            <dt className="font-semibold">Targa</dt>
            <dd>{permesso.targa}</dd>
            <dt className="font-semibold">Dichiarazione</dt>
            <dd>{permesso.dichiarazioneDiPermesso}</dd>
          </dl>
          {/* La foto arriva da un'API autenticata con Cache-Control: no-store: next/image non la
              può ottimizzare (la richiesta del server non ha la sessione). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/permessi/${permesso.sostaId}/foto`}
            alt={`Foto del permesso caricata per la sosta della targa ${permesso.targa}`}
            className="max-h-72 w-auto self-start rounded-xl border border-slate-200"
          />
          {daConfermare === null ? (
            <div className="flex flex-wrap gap-2">
              <Bottone id="permesso-esito-CONFORME" onClick={() => scegliEsito("CONFORME")}>
                {ESITI_VERIFICA.CONFORME}
              </Bottone>
              <Bottone
                id="permesso-esito-NON_CONFORME"
                variante="pericolo"
                onClick={() => scegliEsito("NON_CONFORME")}
              >
                {ESITI_VERIFICA.NON_CONFORME}
              </Bottone>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p id="permesso-esito-scelto" tabIndex={-1} className="text-base text-slate-900">
                Esito scelto: <strong>{ESITI_VERIFICA[daConfermare]}</strong>
                {daConfermare === "NON_CONFORME"
                  ? ". Verrà registrata una segnalazione di sosta irregolare accertata."
                  : "."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Bottone inCorso={inInvio} onClick={() => conferma(permesso.sostaId, daConfermare)}>
                  Conferma
                </Bottone>
                <Bottone
                  variante="secondario"
                  disabled={inInvio}
                  onClick={() => annullaEsito(daConfermare)}
                >
                  Annulla
                </Bottone>
              </div>
            </div>
          )}
          {errore ? <Avviso tipo="errore">{errore}</Avviso> : null}
        </div>
      ) : null}
    </section>
  );
}
