"use client";
// Boundary :SchermataAusiliari (MU_6, UC_ADM_2, SD_ADM_2; OMP-62): elenco degli Ausiliari per ente
// con stato dell'account (2.1–2.2, 2.a1), modulo di creazione e modifica nella pagina (4–7, 5.a1,
// 6.a1) e disattivazione con richiesta di conferma nella pagina (3.a1, 3.a2), senza window.confirm.
// Le pagine chiamano solo le API /api/admin/*; il server resta l'autorità su ogni controllo.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Avviso } from "./Avviso.tsx";
import { BadgeStato } from "./BadgeStato.tsx";
import { Bottone } from "./Bottone.tsx";
import { Campo } from "./Campo.tsx";
import {
  CAMPI_AUSILIARIO,
  CAMPI_DISATTIVAZIONE,
  corpoAusiliario,
  MODULO_VUOTO,
  moduloDa,
  raggruppaPerEnte,
  validaModuloAusiliario,
  type AusiliarioDellElenco,
  type CampoModulo,
  type Modalita,
  type ModuloAusiliario,
} from "./logica/amministrazione.ts";
import { chiamaApi, type EsitoRisposta } from "./logica/risposteApi.ts";
import { vaiAllAccesso } from "./vaiAllAccesso.ts";

type Ente = { id: number; nome: string };
type ErroriModulo = Partial<Record<CampoModulo | "generale", string>>;
type StatoModulo = {
  modalita: Modalita;
  ausiliario: AusiliarioDellElenco | null;
  dati: ModuloAusiliario;
  errori: ErroriModulo;
  invio: boolean;
};

const ORDINE_CAMPI: readonly CampoModulo[] = ["nome", "cognome", "email", "password", "ente"];
const RITORNO = "/admin/ausiliari";

/** richiediAusiliari() di SD_ADM_2 1.1: GET dell'elenco, senza toccare lo stato. */
function richiediAusiliari(): Promise<EsitoRisposta> {
  return chiamaApi("/api/admin/ausiliari", { method: "GET" }, {});
}

function nomeCompleto(a: AusiliarioDellElenco): string {
  return `${a.nome} ${a.cognome}`;
}

export function SchermataAusiliari() {
  const [ausiliari, setAusiliari] = useState<AusiliarioDellElenco[] | null>(null);
  const [elencoNonDisponibile, setElencoNonDisponibile] = useState(false);
  const [enti, setEnti] = useState<Ente[]>([]);
  const [modulo, setModulo] = useState<StatoModulo | null>(null);
  const [daConfermare, setDaConfermare] = useState<number | null>(null);
  const [inDisattivazione, setInDisattivazione] = useState<number | null>(null);
  const [erroriRiga, setErroriRiga] = useState<Record<number, string>>({});
  const [messaggio, setMessaggio] = useState<{ tipo: "successo" | "errore"; testo: string } | null>(
    null,
  );
  const titoloModulo = useRef<HTMLHeadingElement>(null);
  const zonaMessaggio = useRef<HTMLDivElement>(null);

  // mostraElenco(ausiliari) (SD_ADM_2 2.2), con la risposta di richiediAusiliari.
  const mostraElenco = useCallback((esito: EsitoRisposta) => {
    if (esito.esito === "sessioneScaduta") {
      vaiAllAccesso(RITORNO);
    } else if (esito.esito === "successo") {
      setElencoNonDisponibile(false);
      setAusiliari((esito.dati as { ausiliari: AusiliarioDellElenco[] }).ausiliari);
    } else {
      setElencoNonDisponibile(true);
    }
  }, []);

  async function aggiornaElenco() {
    mostraElenco(await richiediAusiliari());
  }

  useEffect(() => {
    let attivo = true;
    void richiediAusiliari().then((esito) => {
      if (attivo) {
        mostraElenco(esito);
      }
    });
    // Enti per il campo «Ente» del modulo.
    void chiamaApi("/api/admin/enti", { method: "GET" }, {}).then((esito) => {
      if (attivo && esito.esito === "successo") {
        setEnti((esito.dati as { enti: Ente[] }).enti);
      }
    });
    return () => {
      attivo = false;
    };
  }, [mostraElenco]);

  function mostraMessaggio(tipo: "successo" | "errore", testo: string) {
    setMessaggio({ tipo, testo });
    requestAnimationFrame(() => zonaMessaggio.current?.focus());
  }

  // apriModulo(ausiliario) → mostraModulo(dati) (SD_ADM_2 3.1–4.1).
  function apriModulo(ausiliario: AusiliarioDellElenco | null) {
    setMessaggio(null);
    setDaConfermare(null);
    setModulo({
      modalita: ausiliario ? "modifica" : "creazione",
      ausiliario,
      dati: ausiliario ? moduloDa(ausiliario) : MODULO_VUOTO,
      errori: {},
      invio: false,
    });
    requestAnimationFrame(() => titoloModulo.current?.focus());
  }

  function aggiornaCampo(campo: CampoModulo, valore: string) {
    setModulo((attuale) =>
      attuale ? { ...attuale, dati: { ...attuale.dati, [campo]: valore } } : attuale,
    );
  }

  // salva(nome, cognome, email, ente): controllo lato client, poi POST o PUT (5.1–7.2).
  async function salva(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!modulo) {
      return;
    }
    const errori = validaModuloAusiliario(modulo.dati, modulo.modalita);
    const primo = ORDINE_CAMPI.find((campo) => errori[campo]);
    if (primo) {
      setModulo({ ...modulo, errori });
      document.getElementById(`ausiliario-${primo}`)?.focus();
      return;
    }
    setModulo({ ...modulo, errori: {}, invio: true });
    const creazione = modulo.modalita === "creazione";
    const esito = await chiamaApi(
      creazione ? "/api/admin/ausiliari" : `/api/admin/ausiliari/${modulo.ausiliario?.id}`,
      {
        method: creazione ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpoAusiliario(modulo.dati, modulo.modalita)),
      },
      CAMPI_AUSILIARIO,
    );
    if (esito.esito === "sessioneScaduta") {
      vaiAllAccesso(RITORNO);
      return;
    }
    if (esito.esito === "successo") {
      const { ausiliario } = esito.dati as { ausiliario: AusiliarioDellElenco };
      setModulo(null);
      await aggiornaElenco();
      mostraMessaggio(
        "successo",
        creazione
          ? `Account di ${nomeCompleto(ausiliario)} creato. Comunica la password iniziale all'Ausiliario.`
          : `Account di ${nomeCompleto(ausiliario)} aggiornato.`,
      );
      return;
    }
    const campo = esito.campo as CampoModulo | "generale";
    setModulo({ ...modulo, invio: false, errori: { [campo]: esito.messaggio } });
    if (campo !== "generale") {
      document.getElementById(`ausiliario-${campo}`)?.focus();
    }
  }

  // elimina(ausiliario) → chiediConferma (3.a1–3.a1.2).
  function chiediConferma(ausiliario: AusiliarioDellElenco) {
    setMessaggio(null);
    setModulo(null);
    setErroriRiga({});
    setDaConfermare(ausiliario.id);
    requestAnimationFrame(() => document.getElementById(`conferma-${ausiliario.id}`)?.focus());
  }

  // conferma() → disattiva o segnalaDisattivazioneNonConsentita (3.a1.3–3.a2.1).
  async function confermaDisattivazione(ausiliario: AusiliarioDellElenco) {
    setInDisattivazione(ausiliario.id);
    const esito = await chiamaApi(
      `/api/admin/ausiliari/${ausiliario.id}/disattivazione`,
      { method: "POST" },
      CAMPI_DISATTIVAZIONE,
    );
    setInDisattivazione(null);
    setDaConfermare(null);
    if (esito.esito === "sessioneScaduta") {
      vaiAllAccesso(RITORNO);
      return;
    }
    if (esito.esito === "successo") {
      await aggiornaElenco();
      mostraMessaggio(
        "successo",
        `Account di ${nomeCompleto(ausiliario)} disattivato: non può più accedere.`,
      );
      return;
    }
    if (esito.campo === "riga") {
      setErroriRiga({ [ausiliario.id]: esito.messaggio });
      requestAnimationFrame(() => document.getElementById(`errore-riga-${ausiliario.id}`)?.focus());
    } else {
      mostraMessaggio("errore", esito.messaggio);
    }
  }

  const gruppi = raggruppaPerEnte(ausiliari ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div ref={zonaMessaggio} tabIndex={-1} aria-live="polite">
        {messaggio ? <Avviso tipo={messaggio.tipo}>{messaggio.testo}</Avviso> : null}
      </div>

      {modulo ? (
        <form
          onSubmit={salva}
          noValidate
          aria-labelledby="titolo-modulo-ausiliario"
          className="scheda flex flex-col gap-4 p-4 lg:max-w-3xl"
        >
          <h2
            id="titolo-modulo-ausiliario"
            ref={titoloModulo}
            tabIndex={-1}
            className="-mx-4 -mt-4 rounded-t-2xl border-b border-slate-200 bg-marca-50 px-4 pt-4 pb-3 text-lg font-semibold text-marca-900"
          >
            {modulo.modalita === "creazione"
              ? "Nuovo Ausiliario del Traffico"
              : `Modifica di ${nomeCompleto(modulo.ausiliario as AusiliarioDellElenco)}`}
          </h2>
          {modulo.errori.generale ? <Avviso tipo="errore">{modulo.errori.generale}</Avviso> : null}
          <Campo
            id="ausiliario-nome"
            etichetta="Nome"
            autoComplete="off"
            value={modulo.dati.nome}
            onChange={(e) => aggiornaCampo("nome", e.target.value)}
            errore={modulo.errori.nome}
            disabled={modulo.invio}
          />
          <Campo
            id="ausiliario-cognome"
            etichetta="Cognome"
            autoComplete="off"
            value={modulo.dati.cognome}
            onChange={(e) => aggiornaCampo("cognome", e.target.value)}
            errore={modulo.errori.cognome}
            disabled={modulo.invio}
          />
          <Campo
            id="ausiliario-email"
            etichetta="Email"
            type="email"
            autoComplete="off"
            value={modulo.dati.email}
            onChange={(e) => aggiornaCampo("email", e.target.value)}
            errore={modulo.errori.email}
            disabled={modulo.invio}
          />
          {modulo.modalita === "creazione" ? (
            <Campo
              id="ausiliario-password"
              etichetta="Password iniziale"
              type="password"
              autoComplete="new-password"
              suggerimento="Almeno 8 caratteri. Comunicala all'Ausiliario fuori da OmniPark."
              value={modulo.dati.password}
              onChange={(e) => aggiornaCampo("password", e.target.value)}
              errore={modulo.errori.password}
              disabled={modulo.invio}
            />
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="ausiliario-ente" className="text-base font-medium text-slate-900">
              Ente
            </label>
            <select
              id="ausiliario-ente"
              value={modulo.dati.ente}
              onChange={(e) => aggiornaCampo("ente", e.target.value)}
              disabled={modulo.invio}
              aria-invalid={modulo.errori.ente ? true : undefined}
              aria-describedby={modulo.errori.ente ? "ausiliario-ente-errore" : undefined}
              className={`min-h-11 rounded-xl border bg-white px-3 py-2 text-base text-slate-900 ${
                modulo.errori.ente ? "border-2 border-rose-700" : "border-slate-500"
              }`}
            >
              <option value="">Scegli l&apos;ente</option>
              {enti.map((ente) => (
                <option key={ente.id} value={String(ente.id)}>
                  {ente.nome}
                </option>
              ))}
            </select>
            {modulo.errori.ente ? (
              <p id="ausiliario-ente-errore" className="text-sm font-medium text-rose-800">
                Errore: {modulo.errori.ente}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Bottone type="submit" inCorso={modulo.invio} testoInCorso="Salvataggio in corso…">
              Salva
            </Bottone>
            {/* annulla() (5.a1): nessun account è modificato. */}
            <Bottone variante="secondario" disabled={modulo.invio} onClick={() => setModulo(null)}>
              Annulla
            </Bottone>
          </div>
        </form>
      ) : (
        <div>
          <Bottone onClick={() => apriModulo(null)}>Nuovo Ausiliario</Bottone>
        </div>
      )}

      <section aria-labelledby="titolo-elenco-ausiliari" className="flex flex-col gap-4">
        <h2 id="titolo-elenco-ausiliari" className="text-lg font-semibold text-marca-900">
          Ausiliari del Traffico per ente
        </h2>
        {elencoNonDisponibile ? (
          <Avviso tipo="errore">
            L&apos;elenco degli Ausiliari non è disponibile. Riprova più tardi.
          </Avviso>
        ) : null}
        {ausiliari === null && !elencoNonDisponibile ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-base text-slate-700">
            Caricamento degli Ausiliari…
          </p>
        ) : null}
        {ausiliari !== null && gruppi.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-base text-slate-700">
            Non è registrato alcun Ausiliario del Traffico: puoi crearne uno con «Nuovo Ausiliario».
          </p>
        ) : null}
        {gruppi.map((gruppo) => (
          <div key={gruppo.enteId} className="flex flex-col gap-2">
            <h3 className="text-base font-semibold text-marca-900">{gruppo.ente}</h3>
            <ul className="flex flex-col gap-2">
              {gruppo.ausiliari.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-velo-50 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{nomeCompleto(a)}</p>
                      <p className="text-sm break-all text-slate-700">{a.email}</p>
                    </div>
                    <BadgeStato tipo="account" stato={a.statoDellAccount} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Bottone
                      variante="secondario"
                      onClick={() => apriModulo(a)}
                      aria-label={`Modifica ${nomeCompleto(a)}`}
                    >
                      Modifica
                    </Bottone>
                    {a.statoDellAccount === "ATTIVO" ? (
                      <Bottone
                        variante="pericolo"
                        onClick={() => chiediConferma(a)}
                        aria-label={`Disattiva ${nomeCompleto(a)}`}
                      >
                        Disattiva
                      </Bottone>
                    ) : null}
                  </div>
                  {erroriRiga[a.id] ? (
                    <p
                      id={`errore-riga-${a.id}`}
                      tabIndex={-1}
                      role="alert"
                      className="text-sm font-medium text-rose-800"
                    >
                      Errore: {erroriRiga[a.id]}
                    </p>
                  ) : null}
                  {daConfermare === a.id ? (
                    <div
                      role="group"
                      aria-labelledby={`conferma-${a.id}`}
                      className="flex flex-col gap-3 rounded-xl border-l-4 border-rose-700 bg-rose-50 p-3"
                    >
                      <p
                        id={`conferma-${a.id}`}
                        tabIndex={-1}
                        className="text-base font-semibold text-slate-900"
                      >
                        Confermi la disattivazione di {nomeCompleto(a)}?
                      </p>
                      <p className="text-base text-slate-900">
                        Non potrà più accedere e le sue sessioni aperte saranno chiuse; le
                        segnalazioni e le verifiche già registrate restano associate a lui.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Bottone
                          variante="pericolo"
                          inCorso={inDisattivazione === a.id}
                          testoInCorso="Disattivazione in corso…"
                          onClick={() => confermaDisattivazione(a)}
                        >
                          Conferma la disattivazione
                        </Bottone>
                        <Bottone
                          variante="secondario"
                          disabled={inDisattivazione === a.id}
                          onClick={() => setDaConfermare(null)}
                        >
                          Annulla
                        </Bottone>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
