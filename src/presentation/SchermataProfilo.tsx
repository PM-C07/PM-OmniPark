"use client";
// Boundary :SchermataProfilo (MU_3, SD_AUTH_5): targhe del profilo (UC_AUTH_5), con elenco,
// aggiunta e rimozione e gli errori del dominio accanto al campo o alla targa interessata; con la
// sessione scaduta torna a /accesso. Il wallet arriva con COD-17.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { Campo } from "./Campo.tsx";
import { indirizzoDiAccesso } from "./logica/navigazione.ts";
import {
  CAMPI_AGGIUNTA_TARGA,
  CAMPI_RIMOZIONE_TARGA,
  chiamaApi,
  type EsitoRisposta,
} from "./logica/risposteApi.ts";
import { validaTarga } from "./logica/validazione.ts";
import { Pannello } from "./Pannello.tsx";

type Targa = { veicolo: number; targa: string };

const URL_TARGHE = "/api/automobilista/targhe";

/** apriTarghe() di SD_AUTH_5: GET dell'elenco all'apertura della schermata. */
function apriTarghe(): Promise<EsitoRisposta> {
  return chiamaApi(URL_TARGHE, { method: "GET" }, {});
}

function idRiga(targa: string): string {
  return `targa-${targa}-errore`;
}

export function SchermataProfilo() {
  const router = useRouter();
  const [targhe, setTarghe] = useState<Targa[] | null>(null);
  const [nuova, setNuova] = useState("");
  const [erroreCampo, setErroreCampo] = useState<string | null>(null);
  const [erroriRiga, setErroriRiga] = useState<Record<string, string>>({});
  const [generale, setGenerale] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  /** true se l'esito è un successo con l'elenco; gestisce da sé sessione scaduta ed errori generali. */
  const applica = useCallback(
    (esito: EsitoRisposta): esito is { esito: "successo"; dati: unknown } => {
      if (esito.esito === "sessioneScaduta") {
        router.replace(indirizzoDiAccesso("/profilo"));
        return false;
      }
      if (esito.esito === "successo") {
        setTarghe((esito.dati as { targhe: Targa[] }).targhe);
        return true;
      }
      return false;
    },
    [router],
  );

  useEffect(() => {
    void apriTarghe().then((esito) => {
      if (!applica(esito) && esito.esito === "errore") {
        setGenerale(esito.messaggio);
      }
    });
  }, [applica]);

  /** aggiungi(targa) di SD_AUTH_5. */
  async function aggiungi(targa: string) {
    setConferma(null);
    setGenerale(null);
    setErroriRiga({});
    const errore = validaTarga(targa);
    if (errore) {
      setErroreCampo(errore);
      document.getElementById("nuova-targa")?.focus();
      return;
    }
    setErroreCampo(null);
    setInCorso("aggiunta");
    const esito = await chiamaApi(
      URL_TARGHE,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targa }),
      },
      CAMPI_AGGIUNTA_TARGA,
    );
    setInCorso(null);
    if (applica(esito)) {
      setNuova("");
      setConferma("Targa aggiunta al profilo.");
    } else if (esito.esito === "errore") {
      if (esito.campo === "targa") {
        setErroreCampo(esito.messaggio);
      } else {
        setGenerale(esito.messaggio);
      }
    }
  }

  /** rimuovi(targa) di SD_AUTH_5. */
  async function rimuovi(targa: string) {
    setConferma(null);
    setGenerale(null);
    setErroriRiga({});
    setErroreCampo(null);
    setInCorso(targa);
    const esito = await chiamaApi(
      `${URL_TARGHE}?targa=${encodeURIComponent(targa)}`,
      { method: "DELETE" },
      CAMPI_RIMOZIONE_TARGA,
    );
    setInCorso(null);
    if (applica(esito)) {
      setConferma(`Targa ${targa} rimossa dal profilo.`);
    } else if (esito.esito === "errore") {
      if (esito.campo === "riga") {
        setErroriRiga({ [targa]: esito.messaggio });
      } else {
        setGenerale(esito.messaggio);
      }
    }
  }

  return (
    <>
      <Pannello titolo="Targhe" idTitolo="titolo-targhe">
        <div className="flex flex-col gap-4">
          {generale ? <Avviso tipo="errore">{generale}</Avviso> : null}
          {conferma ? <Avviso tipo="successo">{conferma}</Avviso> : null}
          {targhe === null ? (
            // Se il primo caricamento fallisce resta solo l'avviso d'errore, non il caricamento.
            generale ? null : (
              <p className="text-base text-zinc-800">Caricamento delle targhe…</p>
            )
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Targhe del profilo">
              {targhe.map(({ targa }) => (
                <li
                  key={targa}
                  className="flex flex-col gap-1 rounded-md border border-zinc-300 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-lg font-semibold text-zinc-900">{targa}</span>
                    <Bottone
                      variante="pericolo"
                      inCorso={inCorso === targa}
                      testoInCorso="Rimozione…"
                      disabled={inCorso !== null}
                      aria-label={`Rimuovi la targa ${targa}`}
                      aria-describedby={erroriRiga[targa] ? idRiga(targa) : undefined}
                      onClick={() => rimuovi(targa)}
                    >
                      Rimuovi
                    </Bottone>
                  </div>
                  {erroriRiga[targa] ? (
                    <p id={idRiga(targa)} className="text-sm font-medium text-red-800">
                      Errore: {erroriRiga[targa]}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(evento: FormEvent<HTMLFormElement>) => {
              evento.preventDefault();
              void aggiungi(nuova);
            }}
            noValidate
            className="flex flex-col gap-3"
          >
            <Campo
              id="nuova-targa"
              etichetta="Nuova targa"
              autoComplete="off"
              autoCapitalize="characters"
              suggerimento="Formato AB123CD."
              value={nuova}
              onChange={(e) => setNuova(e.target.value)}
              errore={erroreCampo}
            />
            <Bottone type="submit" inCorso={inCorso === "aggiunta"} disabled={inCorso !== null}>
              Aggiungi targa
            </Bottone>
          </form>
        </div>
      </Pannello>
      <Pannello titolo="Wallet" idTitolo="titolo-wallet">
        <Avviso tipo="informazione">Contenuto in arrivo con COD-17.</Avviso>
      </Pannello>
    </>
  );
}
