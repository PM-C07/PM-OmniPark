"use client";
// Boundary :MappaStalli, scheda dello stallo (UC_STALLI_2, SD_STALLI_2) e avvio della sosta
// (UC_SOSTA_1, SD_SOSTA_1) in tre interazioni (NRF_USA_2): 1) selezione dello stallo, che apre
// questa scheda; 2) «Avvia sosta», con targa e durata già proposte e importo già calcolato dal
// server; 3) «Conferma e paga». Con il credito insufficiente la ricarica si fa qui, senza perdere
// targa e durata (np_01: Ricarica → «torna alla conferma»).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Avviso } from "./Avviso.tsx";
import { BadgeStato } from "./BadgeStato.tsx";
import { Bottone } from "./Bottone.tsx";
import {
  CAMPI_AVVIO_SOSTA,
  creditoSufficiente,
  disponibilitaAvvio,
  durataPredefinita,
  etichettaConferma,
  etichettaDurata,
  opzioniDurata,
} from "./logica/avvioSosta.ts";
import { formattaEuro, formattaOra } from "./logica/importi.ts";
import { descriviTipo, type StalloDellaMappa } from "./logica/mappaStalli.ts";
import { chiamaApi, type EsitoRisposta } from "./logica/risposteApi.ts";
import { Ricarica } from "./Ricarica.tsx";

type Tariffa = {
  costoOrario: number;
  orarioInizioVigenza: string;
  orarioFineVigenza: string;
  durataMassima: number;
};
type Importo = { importo: number; pagamento: string; orarioDiScadenza: string };
export type SostaAvviata = { sosta: number; orarioDiScadenza: string; importo: number };
type CampoErrore = "targa" | "durata" | "credito" | "generale";

function CampoSelezione({
  id,
  etichetta,
  valore,
  onCambia,
  errore,
  disabilitato,
  children,
}: {
  id: string;
  etichetta: string;
  valore: string;
  onCambia(valore: string): void;
  errore?: string;
  disabilitato?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-base font-medium text-zinc-900">
        {etichetta}
      </label>
      <select
        id={id}
        value={valore}
        disabled={disabilitato}
        onChange={(e) => onCambia(e.target.value)}
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? `${id}-errore` : undefined}
        className={`min-h-11 rounded-md border bg-white px-3 py-2 text-base text-zinc-900 ${
          errore ? "border-2 border-red-700" : "border-zinc-500"
        }`}
      >
        {children}
      </select>
      {errore ? (
        <p id={`${id}-errore`} className="text-sm font-medium text-red-800">
          Errore: {errore}
        </p>
      ) : null}
    </div>
  );
}

/** Gli errori senza i campi indicati. */
function senza(
  errori: Partial<Record<CampoErrore, string>>,
  ...campi: CampoErrore[]
): Partial<Record<CampoErrore, string>> {
  return Object.fromEntries(
    Object.entries(errori).filter(([campo]) => !campi.includes(campo as CampoErrore)),
  );
}

function ora(orario: string): string {
  return orario.slice(0, 5);
}

export function SchedaStallo({
  stallo,
  onChiudi,
  onSostaAvviata,
  onSessioneScaduta,
}: {
  stallo: StalloDellaMappa;
  onChiudi(): void;
  onSostaAvviata(sosta: SostaAvviata): void;
  onSessioneScaduta(): void;
}) {
  const [tariffa, setTariffa] = useState<Tariffa | null>(null);
  const [dettaglioAssente, setDettaglioAssente] = useState(false);
  const [targhe, setTarghe] = useState<string[] | null>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [modulo, setModulo] = useState(false);
  const [targa, setTarga] = useState("");
  const [durata, setDurata] = useState<number | null>(null);
  // L'importo vale solo per la durata con cui è stato calcolato.
  const [calcolato, setCalcolato] = useState<{ durata: number; importo: Importo } | null>(null);
  const [errori, setErrori] = useState<Partial<Record<CampoErrore, string>>>({});
  const [invio, setInvio] = useState(false);
  const titolo = useRef<HTMLHeadingElement>(null);
  const titoloModulo = useRef<HTMLHeadingElement>(null);
  const sessione = useRef(onSessioneScaduta);
  useEffect(() => {
    sessione.current = onSessioneScaduta;
  });

  // Interazione 1 (selezionaStallo → richiediScheda): dettaglio, targhe e saldo in parallelo, così
  // il modulo dell'interazione 2 è già pronto.
  useEffect(() => {
    let attivo = true;
    titolo.current?.focus();
    const leggi = (url: string, applica: (esito: EsitoRisposta) => void) =>
      void chiamaApi(url, { method: "GET" }, {}).then((esito) => {
        if (!attivo) {
          return;
        }
        if (esito.esito === "sessioneScaduta") {
          sessione.current();
          return;
        }
        applica(esito);
      });
    leggi(`/api/stalli/${stallo.id}`, (esito) => {
      if (esito.esito === "successo") {
        setTariffa((esito.dati as { tariffa: Tariffa }).tariffa);
      } else {
        setDettaglioAssente(true);
      }
    });
    leggi("/api/automobilista/targhe", (esito) => {
      if (esito.esito === "successo") {
        setTarghe((esito.dati as { targhe: { targa: string }[] }).targhe.map((t) => t.targa));
      }
    });
    leggi("/api/wallet", (esito) => {
      if (esito.esito === "successo") {
        setSaldo((esito.dati as { saldo: number }).saldo);
      }
    });
    return () => {
      attivo = false;
    };
  }, [stallo.id]);

  // Importo e scadenza dal server (GET /api/soste/importo) a ogni durata scelta; vale l'ultima.
  useEffect(() => {
    if (!modulo || durata === null) {
      return;
    }
    let attivo = true;
    void chiamaApi(
      `/api/soste/importo?stallo=${stallo.id}&durata=${durata}`,
      { method: "GET" },
      CAMPI_AVVIO_SOSTA,
    ).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        sessione.current();
      } else if (esito.esito === "successo") {
        setCalcolato({ durata, importo: esito.dati as Importo });
      } else {
        setErrori((attuali) => ({ ...attuali, [esito.campo]: esito.messaggio }));
      }
    });
    return () => {
      attivo = false;
    };
  }, [modulo, durata, stallo.id]);

  const importo = calcolato !== null && calcolato.durata === durata ? calcolato.importo : null;
  const calcolo =
    modulo && durata !== null && importo === null && !errori.durata && !errori.generale;
  const disponibilita = disponibilitaAvvio(stallo.stato, stallo.tipoDiStallo);
  const tipo = descriviTipo(stallo.tipoDiStallo);
  const durate = tariffa ? opzioniDurata(tariffa.durataMassima) : [];
  const creditoScarso =
    saldo !== null && importo !== null && !creditoSufficiente(saldo, importo.importo);
  const proponiRicarica = creditoScarso || errori.credito !== undefined;

  // Interazione 2: modulo già compilato con la prima targa e la durata proposta.
  function avviaSosta() {
    if (!tariffa || !targhe) {
      return;
    }
    setErrori({});
    setTarga(targhe[0] ?? "");
    setDurata(durataPredefinita(tariffa.durataMassima));
    setModulo(true);
    requestAnimationFrame(() => titoloModulo.current?.focus());
  }

  // Interazione 3: conferma e pagamento (POST /api/soste).
  async function conferma(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!importo || durata === null) {
      return;
    }
    setErrori({});
    setInvio(true);
    const esito = await chiamaApi(
      "/api/soste",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stallo: stallo.id, targa, durata }),
      },
      CAMPI_AVVIO_SOSTA,
    );
    setInvio(false);
    if (esito.esito === "sessioneScaduta") {
      onSessioneScaduta();
    } else if (esito.esito === "successo") {
      onSostaAvviata(esito.dati as SostaAvviata);
    } else {
      setErrori({ [esito.campo]: esito.messaggio });
    }
  }

  function ricaricata(nuovoSaldo: number) {
    setSaldo(nuovoSaldo);
    setErrori((attuali) => senza(attuali, "credito"));
    requestAnimationFrame(() => document.getElementById("avvio-conferma")?.focus());
  }

  return (
    <section
      aria-labelledby="titolo-scheda-stallo"
      className="flex flex-col gap-4 rounded-lg border border-zinc-300 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2
            id="titolo-scheda-stallo"
            ref={titolo}
            tabIndex={-1}
            className="text-lg font-semibold text-zinc-900"
          >
            Stallo n. {stallo.numero}
          </h2>
          <p className="text-base text-zinc-800">{stallo.areaDiSosta.nome}</p>
        </div>
        <Bottone
          variante="secondario"
          onClick={onChiudi}
          aria-label="Chiudi la scheda dello stallo"
        >
          Chiudi
        </Bottone>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base text-zinc-900">
        <dt className="font-medium">Tipo</dt>
        <dd>
          <span aria-hidden="true">{tipo.simbolo} </span>
          {tipo.testo}
        </dd>
        <dt className="font-medium">Stato</dt>
        <dd>
          <BadgeStato tipo="stallo" stato={stallo.stato} />
        </dd>
        <dt className="font-medium">Tariffa</dt>
        <dd>
          {tariffa
            ? `${formattaEuro(tariffa.costoOrario)} l'ora, dalle ${ora(tariffa.orarioInizioVigenza)} alle ${ora(tariffa.orarioFineVigenza)}, durata massima ${etichettaDurata(tariffa.durataMassima)}`
            : dettaglioAssente
              ? "Non disponibile"
              : "Caricamento…"}
        </dd>
      </dl>
      {dettaglioAssente ? (
        <Avviso tipo="errore">I dettagli dello stallo non sono disponibili.</Avviso>
      ) : null}

      {!disponibilita.disponibile ? (
        <p className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-base text-zinc-900">
          {disponibilita.motivo}
        </p>
      ) : !modulo ? (
        <Bottone
          onClick={avviaSosta}
          inCorso={!tariffa || !targhe}
          testoInCorso="Caricamento…"
          disabled={dettaglioAssente || durate.length === 0}
        >
          Avvia sosta
        </Bottone>
      ) : (
        <form onSubmit={conferma} noValidate className="flex flex-col gap-4">
          <h3 ref={titoloModulo} tabIndex={-1} className="text-base font-semibold text-zinc-900">
            Avvio della sosta
          </h3>
          {errori.generale ? <Avviso tipo="errore">{errori.generale}</Avviso> : null}
          <CampoSelezione
            id="avvio-targa"
            etichetta="Targa"
            valore={targa}
            onCambia={setTarga}
            errore={errori.targa}
            disabilitato={invio}
          >
            {(targhe ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </CampoSelezione>
          <CampoSelezione
            id="avvio-durata"
            etichetta="Durata"
            valore={durata === null ? "" : String(durata)}
            onCambia={(valore) => {
              setErrori((attuali) => senza(attuali, "durata", "credito"));
              setDurata(Number(valore));
            }}
            errore={errori.durata}
            disabilitato={invio}
          >
            {durate.map((minuti) => (
              <option key={minuti} value={minuti}>
                {etichettaDurata(minuti)}
              </option>
            ))}
          </CampoSelezione>
          <p className="text-base text-zinc-900" aria-live="polite">
            {importo
              ? `Importo ${formattaEuro(importo.importo)}, scadenza alle ${formattaOra(importo.orarioDiScadenza)}.`
              : calcolo
                ? "Calcolo dell'importo…"
                : ""}
          </p>
          {proponiRicarica ? (
            <div className="flex flex-col gap-3 rounded-md border-l-4 border-orange-700 bg-orange-50 p-3">
              <p className="text-base text-orange-950" role="alert">
                <strong>Credito insufficiente.</strong>{" "}
                {errori.credito ??
                  `Il saldo è ${formattaEuro(saldo ?? 0)}, l'importo è ${formattaEuro(importo?.importo ?? 0)}.`}{" "}
                Ricarica il wallet e torna alla conferma: targa e durata restano quelle scelte.
              </p>
              <Ricarica
                idTitolo="titolo-ricarica-avvio"
                onRicaricata={ricaricata}
                onSessioneScaduta={onSessioneScaduta}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Bottone
              id="avvio-conferma"
              type="submit"
              inCorso={invio}
              testoInCorso="Pagamento in corso…"
              disabled={!importo || calcolo || creditoScarso}
            >
              {importo ? etichettaConferma(importo.importo) : "Calcolo dell'importo…"}
            </Bottone>
            <Bottone variante="secondario" disabled={invio} onClick={() => setModulo(false)}>
              Annulla
            </Bottone>
          </div>
        </form>
      )}
    </section>
  );
}
