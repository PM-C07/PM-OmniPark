"use client";
// Boundary :PanoramicaEnti (MU_5, UC_ADM_1, SD_ADM_1; OMP-62): richiediEnti con GET /api/admin/enti,
// poi richiediRiepilogo per ogni ente con GET /api/admin/enti/<id>/riepilogo, in parallelo. La tabella
// mostra tutti gli enti con i tre valori: la selezione del passo 3 è la riga e «altro ente» (4.a2) è
// immediato. Un riepilogo non disponibile (4.a1) resta sulla sua riga con «Riprova»; nessun ente:
// segnalaNessunEnte (2.a1). 401 → /accesso?da=%2Fadmin.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { righePanoramica, type RiepilogoCaricato } from "./logica/amministrazione.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import { vaiAllAccesso } from "./vaiAllAccesso.ts";

type Ente = { id: number; nome: string };
type Riepilogo = { stalliGestiti: number; sosteAttive: number; segnalazioniAperte: number };

export function PanoramicaEnti() {
  const [enti, setEnti] = useState<Ente[] | null>(null);
  const [entiNonDisponibili, setEntiNonDisponibili] = useState(false);
  const [riepiloghi, setRiepiloghi] = useState<ReadonlyMap<number, RiepilogoCaricato>>(new Map());
  const [versione, setVersione] = useState(0);

  const imposta = useCallback((ente: number, valore: RiepilogoCaricato) => {
    setRiepiloghi((attuali) => new Map(attuali).set(ente, valore));
  }, []);

  /** richiediRiepilogo(ente): mostraRiepilogo o segnalaRiepilogoNonDisponibile sulla riga. */
  const richiediRiepilogo = useCallback(
    async (ente: number) => {
      const esito = await chiamaApi(`/api/admin/enti/${ente}/riepilogo`, { method: "GET" }, {});
      if (esito.esito === "sessioneScaduta") {
        vaiAllAccesso("/admin");
      } else if (esito.esito === "successo") {
        imposta(ente, { stato: "pronto", ...(esito.dati as Riepilogo) });
      } else {
        imposta(ente, { stato: "errore" });
      }
    },
    [imposta],
  );

  // richiediEnti, poi i riepiloghi; «Aggiorna» incrementa la versione e ricomincia.
  useEffect(() => {
    let attivo = true;
    void chiamaApi("/api/admin/enti", { method: "GET" }, {}).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        vaiAllAccesso("/admin");
        return;
      }
      if (esito.esito !== "successo") {
        setEntiNonDisponibili(true);
        return;
      }
      const elenco = (esito.dati as { enti: Ente[] }).enti;
      setEntiNonDisponibili(false);
      setRiepiloghi(new Map());
      setEnti(elenco);
      for (const ente of elenco) {
        void richiediRiepilogo(ente.id);
      }
    });
    return () => {
      attivo = false;
    };
  }, [versione, richiediRiepilogo]);

  const righe = useMemo(() => righePanoramica(enti ?? [], riepiloghi), [enti, riepiloghi]);

  function riprova(ente: number) {
    imposta(ente, { stato: "caricamento" });
    void richiediRiepilogo(ente);
  }

  return (
    <div className="flex flex-col gap-4">
      {entiNonDisponibili ? (
        <Avviso tipo="errore">Gli enti clienti non sono disponibili. Riprova più tardi.</Avviso>
      ) : null}
      {enti !== null && enti.length === 0 ? (
        <Avviso tipo="informazione">Non ci sono enti clienti.</Avviso>
      ) : null}
      {enti === null && !entiNonDisponibili ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-base text-slate-700">
          Caricamento degli enti…
        </p>
      ) : null}
      {righe.length > 0 ? (
        // Contenitore che scorre in orizzontale sul telefono: raggiungibile con Tab, così si scorre
        // anche con le frecce (OMP-68, WCAG 2.1.1).
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="titolo-tabella-enti"
          className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <table className="w-full min-w-[32rem] border-collapse text-left text-base text-slate-900">
            <caption
              id="titolo-tabella-enti"
              className="px-4 pt-3 text-left text-sm text-slate-700"
            >
              Riepilogo per ente cliente: stalli gestiti, soste attive e segnalazioni non ancora
              chiuse (aperte o prese in carico).
            </caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Ente
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Stalli gestiti
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Soste attive
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Segnalazioni aperte
                </th>
              </tr>
            </thead>
            <tbody>
              {righe.map((riga) => {
                const inErrore = riepiloghi.get(riga.id)?.stato === "errore";
                return (
                  <tr key={riga.id} className="border-b border-slate-200 last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-medium">
                      {riga.ente}
                      {inErrore ? (
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm font-normal text-rose-800">
                          Riepilogo non disponibile.
                          <Bottone
                            variante="secondario"
                            onClick={() => riprova(riga.id)}
                            aria-label={`Riprova il riepilogo di ${riga.ente}`}
                          >
                            Riprova
                          </Bottone>
                        </span>
                      ) : null}
                    </th>
                    {riga.celle.map((cella, i) => (
                      <td key={i} className="px-4 py-3 text-right tabular-nums">
                        {cella}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <div>
        <Bottone variante="secondario" onClick={() => setVersione((v) => v + 1)}>
          Aggiorna
        </Bottone>
      </div>
    </div>
  );
}
