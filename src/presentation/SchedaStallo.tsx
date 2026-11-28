"use client";
// Boundary :MappaStalli, scheda dello stallo (UC_STALLI_2, SD_STALLI_2) e avvio della sosta
// (UC_SOSTA_1, SD_SOSTA_1) in tre interazioni (NRF_USA_2): 1) selezione dello stallo, che apre
// questa scheda; 2) «Avvia sosta», con targa e durata già proposte e importo già calcolato dal
// server; 3) «Conferma e paga». Con il credito insufficiente la ricarica si fa qui, senza perdere
// targa e durata (np_01: Ricarica → «torna alla conferma»), e dopo la ricarica restano visibili la
// conferma e il nuovo saldo (UC_WALLET_1 passo 4, DIF-03). Sugli stalli riservati il modulo ha il
// passaggio della dichiarazione e della foto del permesso (UC_SOSTA_5, OMP-61). Prima dell'avvio la
// scheda mostra tariffa, durata massima e, sugli stalli riservati, il permesso richiesto
// (RF_STALLI_2, UC_STALLI_2 2.a1, COD-23).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Avviso } from "./Avviso.tsx";
import { BadgeStato } from "./BadgeStato.tsx";
import { Bottone } from "./Bottone.tsx";
import {
  CAMPI_AVVIO_SOSTA,
  condizioniDelloStallo,
  creditoSufficiente,
  disponibilitaAvvio,
  durataPredefinita,
  etichettaConferma,
  etichettaDurata,
  opzioniDurata,
  richiestaDiAvvio,
  type PermessoDiAvvio,
  type TariffaDelloStallo,
} from "./logica/avvioSosta.ts";
import { formattaEuro, formattaOra } from "./logica/importi.ts";
import { descriviTipo, type StalloDellaMappa } from "./logica/mappaStalli.ts";
import { richiedePermesso } from "./logica/permesso.ts";
import { chiamaApi, type EsitoRisposta } from "./logica/risposteApi.ts";
import { messaggioRicaricaApprovata, riquadroRicarica } from "./logica/wallet.ts";
import { NavigaVersoStallo } from "./NavigaVersoStallo.tsx";
import { PermessoStallo } from "./PermessoStallo.tsx";
import { Ricarica } from "./Ricarica.tsx";

type Importo = { importo: number; pagamento: string; orarioDiScadenza: string };
export type SostaAvviata = { sosta: number; orarioDiScadenza: string; importo: number };
type CampoErrore = "targa" | "durata" | "credito" | "permesso" | "generale";

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
      <label htmlFor={id} className="text-base font-medium text-slate-900">
        {etichetta}
      </label>
      <select
        id={id}
        value={valore}
        disabled={disabilitato}
        onChange={(e) => onCambia(e.target.value)}
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? `${id}-errore` : undefined}
        className={`min-h-11 rounded-xl border bg-white px-3 py-2 text-base text-slate-900 ${
          errore ? "border-2 border-rose-700" : "border-slate-500"
        }`}
      >
        {children}
      </select>
      {errore ? (
        <p id={`${id}-errore`} className="text-sm font-medium text-rose-800">
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
  const [tariffa, setTariffa] = useState<TariffaDelloStallo | null>(null);
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
  // Permesso completo (dichiarazione spuntata e foto valida) sugli stalli riservati, altrimenti null.
  const [permesso, setPermesso] = useState<PermessoDiAvvio | null>(null);
  // Ricarica approvata in questo avvio: il messaggio e il nuovo saldo restano visibili (DIF-03).
  const [ricaricaApprovata, setRicaricaApprovata] = useState<{
    importo: number;
    saldo: number;
  } | null>(null);
  const titolo = useRef<HTMLHeadingElement>(null);
  const titoloModulo = useRef<HTMLHeadingElement>(null);
  // Vero solo dopo una ricarica approvata in questo avvio, fino al primo rendering che la applica.
  const focusDopoRicarica = useRef(false);
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
        setTariffa((esito.dati as { tariffa: TariffaDelloStallo }).tariffa);
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
  const condizioni = tariffa ? condizioniDelloStallo(stallo.tipoDiStallo, tariffa) : null;
  const senzaDettaglio = dettaglioAssente ? "Non disponibile" : "Caricamento…";
  const durate = tariffa ? opzioniDurata(tariffa.durataMassima) : [];
  const creditoScarso =
    saldo !== null && importo !== null && !creditoSufficiente(saldo, importo.importo);
  const riquadro = riquadroRicarica({
    creditoScarso,
    erroreCredito: errori.credito !== undefined,
    ricaricaApprovata: ricaricaApprovata !== null,
  });
  const conPermesso = richiedePermesso(stallo.tipoDiStallo);
  // Condizione di «Conferma e paga» disabilitato, usata dal bottone e dal focus dopo la ricarica.
  const confermaDisabilitata =
    !importo || calcolo || creditoScarso || (conPermesso && !permesso) || invio;

  // Dopo la ricarica il focus va su «Conferma e paga» (DIF-03), ma solo quando lo stato con il
  // nuovo saldo è applicato e il bottone è abilitato: con un requestAnimationFrame il fotogramma
  // poteva arrivare prima e il focus restava perso (OMP-68, TS-01 intermittente). Il ref si consuma
  // al primo rendering dopo la ricarica: se il credito non basta ancora, il focus non si sposta più.
  useEffect(() => {
    if (!focusDopoRicarica.current) {
      return;
    }
    focusDopoRicarica.current = false;
    if (!confermaDisabilitata) {
      document.getElementById("avvio-conferma")?.focus();
    }
  }, [confermaDisabilitata, ricaricaApprovata]);

  // Interazione 2: modulo già compilato con la prima targa e la durata proposta.
  function avviaSosta() {
    if (!tariffa || !targhe) {
      return;
    }
    setErrori({});
    setPermesso(null);
    setRicaricaApprovata(null);
    setTarga(targhe[0] ?? "");
    setDurata(durataPredefinita(tariffa.durataMassima));
    setModulo(true);
    requestAnimationFrame(() => titoloModulo.current?.focus());
  }

  // «Annulla» (4.a1): il modulo si chiude e il focus torna su «Avvia sosta» (OMP-68, WCAG 2.4.3).
  function annullaAvvio() {
    setModulo(false);
    requestAnimationFrame(() => document.getElementById("avvio-avvia")?.focus());
  }

  // Interazione 3: conferma e pagamento (POST /api/soste).
  async function conferma(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!importo || durata === null || (conPermesso && !permesso)) {
      return;
    }
    setErrori({});
    setInvio(true);
    const esito = await chiamaApi(
      "/api/soste",
      richiestaDiAvvio({
        stallo: stallo.id,
        targa,
        durata,
        permesso: conPermesso && permesso ? permesso : undefined,
      }),
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

  function ricaricata(nuovoSaldo: number, importoRicaricato: number) {
    setSaldo(nuovoSaldo);
    setRicaricaApprovata({ importo: importoRicaricato, saldo: nuovoSaldo });
    setErrori((attuali) => senza(attuali, "credito"));
    focusDopoRicarica.current = true;
  }

  return (
    <section
      aria-labelledby="titolo-scheda-stallo"
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2
            id="titolo-scheda-stallo"
            ref={titolo}
            tabIndex={-1}
            className="text-lg font-semibold text-marca-900"
          >
            Stallo n. {stallo.numero}
          </h2>
          <p className="text-base text-slate-700">{stallo.areaDiSosta.nome}</p>
        </div>
        <Bottone
          variante="secondario"
          onClick={onChiudi}
          aria-label="Chiudi la scheda dello stallo"
        >
          Chiudi
        </Bottone>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base text-slate-900">
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
        <dd>{condizioni ? condizioni.tariffa : senzaDettaglio}</dd>
        <dt className="font-medium">Durata massima</dt>
        <dd>{condizioni ? condizioni.durataMassima : senzaDettaglio}</dd>
        {condizioni?.permesso ? (
          <>
            <dt className="font-medium">Permesso</dt>
            <dd>{condizioni.permesso}</dd>
          </>
        ) : null}
      </dl>
      {dettaglioAssente ? (
        <Avviso tipo="errore">I dettagli dello stallo non sono disponibili.</Avviso>
      ) : null}
      <NavigaVersoStallo stallo={stallo} />

      {!disponibilita.disponibile ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-900">
          {disponibilita.motivo}
        </p>
      ) : !modulo ? (
        <Bottone
          id="avvio-avvia"
          onClick={avviaSosta}
          inCorso={!tariffa || !targhe}
          testoInCorso="Caricamento…"
          disabled={dettaglioAssente || durate.length === 0}
        >
          Avvia sosta
        </Bottone>
      ) : (
        <form onSubmit={conferma} noValidate className="flex flex-col gap-4">
          <h3 ref={titoloModulo} tabIndex={-1} className="text-base font-semibold text-marca-900">
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
          {conPermesso ? (
            <PermessoStallo
              tipoDiStallo={stallo.tipoDiStallo}
              errore={errori.permesso}
              disabilitato={invio}
              onCambio={setPermesso}
            />
          ) : null}
          <p className="text-base text-slate-900" aria-live="polite">
            {importo
              ? `Importo ${formattaEuro(importo.importo)}, scadenza alle ${formattaOra(importo.orarioDiScadenza)}.`
              : calcolo
                ? "Calcolo dell'importo…"
                : ""}
          </p>
          {riquadro === "proposta" ? (
            <div className="flex flex-col gap-3 rounded-xl border-l-4 border-amber-700 bg-amber-50 p-3">
              <p className="text-base text-amber-950" role="alert">
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
          {riquadro === "approvata" && ricaricaApprovata ? (
            <Avviso tipo="successo">
              {messaggioRicaricaApprovata(ricaricaApprovata.importo, ricaricaApprovata.saldo)}
            </Avviso>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Bottone
              id="avvio-conferma"
              type="submit"
              inCorso={invio}
              testoInCorso="Pagamento in corso…"
              disabled={confermaDisabilitata}
            >
              {importo ? etichettaConferma(importo.importo) : "Calcolo dell'importo…"}
            </Bottone>
            <Bottone variante="secondario" disabled={invio} onClick={annullaAvvio}>
              Annulla
            </Bottone>
          </div>
        </form>
      )}
    </section>
  );
}
