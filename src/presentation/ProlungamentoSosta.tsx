"use client";
// Boundary :MappaStalli, pannello «Prolungamento» della sosta in corso (np_01_automobilista,
// UC_SOSTA_2, SD_SOSTA_2, RF_SOSTA_2, OMP-61): tempo aggiuntivo entro la durata massima dello
// stallo, importo aggiuntivo e nuova scadenza dal server prima della conferma (passo 3), conferma e
// pagamento (passi 4–6), annullamento (4.a1) e ricarica con il credito insufficiente, con ritorno
// alla conferma (5.a1). Le regole restano del server (GET e POST /api/soste/<id>/prolungamento).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { creditoSufficiente, etichettaConferma, etichettaDurata } from "./logica/avvioSosta.ts";
import { formattaEuro, formattaOra } from "./logica/importi.ts";
import {
  CAMPI_PROLUNGAMENTO,
  disponibilitaProlungamento,
  opzioniProlungamento,
  tempoAggiuntivoProposto,
} from "./logica/prolungamento.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import { messaggioRicaricaApprovata, riquadroRicarica } from "./logica/wallet.ts";
import { Ricarica } from "./Ricarica.tsx";

export type SostaDaProlungare = {
  id: number;
  stalloId: number;
  orarioDiAvvio: string;
  orarioDiScadenza: string;
};
export type SostaProlungata = { sosta: number; orarioDiScadenza: string; importo: number };
type Anteprima = { importo: number; orarioDiScadenza: string };
type CampoErrore = "tempo" | "credito" | "generale";

export function ProlungamentoSosta({
  sosta,
  statoMostrato,
  onProlungata,
  onSessioneScaduta,
}: {
  sosta: SostaDaProlungare;
  statoMostrato: string;
  onProlungata(prolungata: SostaProlungata): void;
  onSessioneScaduta(): void;
}) {
  const [durataMassima, setDurataMassima] = useState<number | null>(null);
  const [aperto, setAperto] = useState(false);
  const [tempo, setTempo] = useState<number | null>(null);
  // L'anteprima vale solo per il tempo con cui è stata calcolata.
  const [calcolata, setCalcolata] = useState<{ tempo: number; anteprima: Anteprima } | null>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [errori, setErrori] = useState<Partial<Record<CampoErrore, string>>>({});
  const [ricaricaApprovata, setRicaricaApprovata] = useState<{
    importo: number;
    saldo: number;
  } | null>(null);
  const [invio, setInvio] = useState(false);
  // Vero solo dopo una ricarica approvata in questo prolungamento, fino al primo rendering che la
  // applica.
  const focusDopoRicarica = useRef(false);
  const sessione = useRef(onSessioneScaduta);
  useEffect(() => {
    sessione.current = onSessioneScaduta;
  });

  // Durata massima della tariffa dello stallo (GET /api/stalli/<id>), per il tempo disponibile.
  useEffect(() => {
    let attivo = true;
    void chiamaApi(`/api/stalli/${sosta.stalloId}`, { method: "GET" }, {}).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        sessione.current();
      } else if (esito.esito === "successo") {
        setDurataMassima(
          (esito.dati as { tariffa: { durataMassima: number } }).tariffa.durataMassima,
        );
      }
    });
    return () => {
      attivo = false;
    };
  }, [sosta.stalloId]);

  // Importo aggiuntivo e nuova scadenza dal server a ogni tempo scelto; vale l'ultima risposta.
  useEffect(() => {
    if (!aperto || tempo === null) {
      return;
    }
    let attivo = true;
    void chiamaApi(
      `/api/soste/${sosta.id}/prolungamento?tempoAggiuntivo=${tempo}`,
      { method: "GET" },
      CAMPI_PROLUNGAMENTO,
    ).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        sessione.current();
      } else if (esito.esito === "successo") {
        setCalcolata({ tempo, anteprima: esito.dati as Anteprima });
      } else {
        setErrori((attuali) => ({ ...attuali, [esito.campo]: esito.messaggio }));
      }
    });
    return () => {
      attivo = false;
    };
  }, [aperto, tempo, sosta.id, sosta.orarioDiScadenza]);

  // Calcolati prima dei return anticipati: servono anche all'effetto del focus dopo la ricarica.
  const anteprima = calcolata !== null && calcolata.tempo === tempo ? calcolata.anteprima : null;
  const calcolo =
    aperto && tempo !== null && anteprima === null && !errori.tempo && !errori.generale;
  const creditoScarso =
    saldo !== null && anteprima !== null && !creditoSufficiente(saldo, anteprima.importo);
  // Condizione di «Conferma e paga» disabilitato, usata dal bottone e dal focus dopo la ricarica.
  const confermaDisabilitata = !anteprima || calcolo || creditoScarso || invio;

  // Dopo la ricarica il focus va su «Conferma e paga», ma solo quando lo stato con il nuovo saldo è
  // applicato e il bottone è abilitato (OMP-68, stessa correzione della scheda dello stallo). Il ref
  // si consuma al primo rendering dopo la ricarica.
  useEffect(() => {
    if (!focusDopoRicarica.current) {
      return;
    }
    focusDopoRicarica.current = false;
    if (!confermaDisabilitata) {
      document.getElementById(`prolunga-conferma-${sosta.id}`)?.focus();
    }
  }, [confermaDisabilitata, ricaricaApprovata, sosta.id]);

  if (durataMassima === null) {
    return null;
  }
  const opzioni = opzioniProlungamento(durataMassima, sosta.orarioDiAvvio, sosta.orarioDiScadenza);
  const disponibilita = disponibilitaProlungamento(statoMostrato, opzioni);
  if (!disponibilita.disponibile) {
    return statoMostrato === "ATTIVA" ? (
      <p className="text-base text-zinc-800">{disponibilita.motivo}</p>
    ) : null;
  }

  const riquadro = riquadroRicarica({
    creditoScarso,
    erroreCredito: errori.credito !== undefined,
    ricaricaApprovata: ricaricaApprovata !== null,
  });

  function apri() {
    setErrori({});
    setRicaricaApprovata(null);
    setTempo(
      tempoAggiuntivoProposto(durataMassima ?? 0, sosta.orarioDiAvvio, sosta.orarioDiScadenza),
    );
    setAperto(true);
    // «Prolunga» esce dalla pagina: il focus va sulla scelta del tempo (OMP-68, WCAG 2.4.3).
    requestAnimationFrame(() => document.getElementById(`prolunga-tempo-${sosta.id}`)?.focus());
    void chiamaApi("/api/wallet", { method: "GET" }, {}).then((esito) => {
      if (esito.esito === "sessioneScaduta") {
        sessione.current();
      } else if (esito.esito === "successo") {
        setSaldo((esito.dati as { saldo: number }).saldo);
      }
    });
  }

  async function conferma(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!anteprima || tempo === null) {
      return;
    }
    setErrori({});
    setInvio(true);
    const esito = await chiamaApi(
      `/api/soste/${sosta.id}/prolungamento`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tempoAggiuntivo: tempo }),
      },
      CAMPI_PROLUNGAMENTO,
    );
    setInvio(false);
    if (esito.esito === "sessioneScaduta") {
      onSessioneScaduta();
    } else if (esito.esito === "successo") {
      setAperto(false);
      setRicaricaApprovata(null);
      onProlungata(esito.dati as SostaProlungata);
    } else {
      setErrori({ [esito.campo]: esito.messaggio });
    }
  }

  function ricaricata(nuovoSaldo: number, importoRicaricato: number) {
    setSaldo(nuovoSaldo);
    setRicaricaApprovata({ importo: importoRicaricato, saldo: nuovoSaldo });
    setErrori((attuali) => ({ ...attuali, credito: undefined }));
    focusDopoRicarica.current = true;
  }

  // «Annulla» (4.a1): il pannello si chiude e il focus torna su «Prolunga» (OMP-68, WCAG 2.4.3).
  function annulla() {
    setAperto(false);
    requestAnimationFrame(() => document.getElementById(`prolunga-${sosta.id}`)?.focus());
  }

  if (!aperto) {
    return (
      <div>
        <Bottone id={`prolunga-${sosta.id}`} variante="secondario" onClick={apri}>
          Prolunga
        </Bottone>
      </div>
    );
  }

  const idTempo = `prolunga-tempo-${sosta.id}`;
  return (
    <form
      onSubmit={conferma}
      noValidate
      aria-label="Prolungamento della sosta"
      className="flex flex-col gap-3 rounded-md border border-zinc-300 bg-zinc-50 p-3"
    >
      <h3 className="text-base font-semibold text-zinc-900">Prolungamento</h3>
      {errori.generale ? <Avviso tipo="errore">{errori.generale}</Avviso> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={idTempo} className="text-base font-medium text-zinc-900">
          Tempo aggiuntivo
        </label>
        <select
          id={idTempo}
          value={tempo === null ? "" : String(tempo)}
          disabled={invio}
          onChange={(e) => {
            setErrori((attuali) => ({ ...attuali, tempo: undefined, credito: undefined }));
            setTempo(Number(e.target.value));
          }}
          aria-invalid={errori.tempo ? true : undefined}
          aria-describedby={errori.tempo ? `${idTempo}-errore` : undefined}
          className={`min-h-11 rounded-md border bg-white px-3 py-2 text-base text-zinc-900 ${
            errori.tempo ? "border-2 border-red-700" : "border-zinc-500"
          }`}
        >
          {opzioni.map((minuti) => (
            <option key={minuti} value={minuti}>
              {etichettaDurata(minuti)}
            </option>
          ))}
        </select>
        {errori.tempo ? (
          <p id={`${idTempo}-errore`} className="text-sm font-medium text-red-800">
            Errore: {errori.tempo}
          </p>
        ) : null}
      </div>
      <p className="text-base text-zinc-900" aria-live="polite">
        {anteprima
          ? `Importo aggiuntivo ${formattaEuro(anteprima.importo)}, nuova scadenza alle ${formattaOra(anteprima.orarioDiScadenza)}.`
          : calcolo
            ? "Calcolo dell'importo…"
            : ""}
      </p>
      {riquadro === "proposta" ? (
        <div className="flex flex-col gap-3 rounded-md border-l-4 border-orange-700 bg-orange-50 p-3">
          <p className="text-base text-orange-950" role="alert">
            <strong>Credito insufficiente.</strong>{" "}
            {errori.credito ??
              `Il saldo è ${formattaEuro(saldo ?? 0)}, l'importo aggiuntivo è ${formattaEuro(anteprima?.importo ?? 0)}.`}{" "}
            Ricarica il wallet e torna alla conferma: il tempo scelto resta lo stesso.
          </p>
          <Ricarica
            idTitolo={`titolo-ricarica-prolunga-${sosta.id}`}
            onRicaricata={ricaricata}
            onSessioneScaduta={onSessioneScaduta}
          />
        </div>
      ) : null}
      {riquadro === "approvata" && ricaricaApprovata ? (
        <Avviso tipo="successo">
          {messaggioRicaricaApprovata(ricaricaApprovata.importo, ricaricaApprovata.saldo)}
        </Avviso>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Bottone
          id={`prolunga-conferma-${sosta.id}`}
          type="submit"
          inCorso={invio}
          testoInCorso="Pagamento in corso…"
          disabled={confermaDisabilitata}
        >
          {anteprima ? etichettaConferma(anteprima.importo) : "Calcolo dell'importo…"}
        </Bottone>
        <Bottone variante="secondario" disabled={invio} onClick={annulla}>
          Annulla
        </Bottone>
      </div>
    </form>
  );
}
