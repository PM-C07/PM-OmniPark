"use client";
// Vista mappa generica (OMP-58, da riusare in COD-18): mappa Leaflet caricata solo nel browser,
// legenda, pannello di dettaglio fornito dal chiamante ed elenco degli elementi per gruppo, che
// resta consultabile se lo sfondo o la mappa non si caricano (tastiera e lettori di schermo).
// Non conosce stalli né segnalazioni.
import dynamic from "next/dynamic";
import { Component, useMemo, useState, type ReactNode } from "react";
import { Avviso } from "./Avviso.tsx";
import { Legenda, type VoceLegenda } from "./Legenda.tsx";
import type { ElementoMappa } from "./logica/mappaStalli.ts";
import type { VistaGeografica } from "./Mappa.tsx";

export type { ElementoMappa, VistaGeografica, VoceLegenda };

const Mappa = dynamic(() => import("./Mappa.tsx").then((modulo) => modulo.Mappa), {
  ssr: false,
  loading: () => <p className="p-4 text-base text-zinc-800">Caricamento della mappa…</p>,
});

/** Se il codice della mappa non si carica, resta l'elenco al posto di un errore della pagina. */
class ConfineMappa extends Component<{ children: ReactNode }, { guasta: boolean }> {
  state = { guasta: false };

  static getDerivedStateFromError() {
    return { guasta: true };
  }

  render() {
    return this.state.guasta ? (
      <div className="p-3">
        <Avviso tipo="errore">
          La mappa non si è caricata: gli elementi restano consultabili nell&apos;elenco.
        </Avviso>
      </div>
    ) : (
      this.props.children
    );
  }
}

export type PropsVistaMappa = {
  etichettaMappa: string;
  titoloElenco: string;
  elementi: readonly ElementoMappa[];
  legenda: readonly VoceLegenda[];
  vistaIniziale: { centro: [number, number]; zoom: number };
  selezionato: number | null;
  onSeleziona(id: number): void;
  onCambioVista(vista: VistaGeografica): void;
  dettaglio: ReactNode;
  avvisi?: ReactNode;
  contenutoRiga?: (elemento: ElementoMappa) => ReactNode;
};

export function VistaMappa(props: PropsVistaMappa) {
  const [sfondoAssente, setSfondoAssente] = useState(false);
  const { elementi, selezionato, onSeleziona, contenutoRiga } = props;

  const gruppi = useMemo(() => {
    const perGruppo = new Map<string, ElementoMappa[]>();
    for (const elemento of elementi) {
      const gruppo = perGruppo.get(elemento.gruppo) ?? [];
      gruppo.push(elemento);
      perGruppo.set(elemento.gruppo, gruppo);
    }
    return [...perGruppo.entries()];
  }, [elementi]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          {props.avvisi}
          {sfondoAssente ? (
            <Avviso tipo="informazione">
              Lo sfondo della mappa non è disponibile: gli elementi restano consultabili
              nell&apos;elenco sotto la mappa.
            </Avviso>
          ) : null}
          <div className="h-[55vh] min-h-72 overflow-hidden rounded-lg border border-zinc-400 bg-zinc-100">
            <ConfineMappa>
              <Mappa
                etichetta={props.etichettaMappa}
                elementi={elementi}
                vistaIniziale={props.vistaIniziale}
                selezionato={selezionato}
                onSeleziona={onSeleziona}
                onCambioVista={props.onCambioVista}
                onSfondoNonDisponibile={() => setSfondoAssente(true)}
              />
            </ConfineMappa>
          </div>
          <Legenda voci={props.legenda} />
        </div>
        <div>{props.dettaglio}</div>
      </div>
      <section aria-labelledby="titolo-elenco-mappa" className="flex flex-col gap-3">
        <h2 id="titolo-elenco-mappa" className="text-lg font-semibold text-zinc-900">
          {props.titoloElenco}
        </h2>
        {gruppi.length === 0 ? (
          <p className="text-base text-zinc-800">Nessun elemento in questa zona.</p>
        ) : (
          gruppi.map(([gruppo, voci]) => (
            <div key={gruppo} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-zinc-900">{gruppo}</h3>
              <ul className="flex flex-col gap-2">
                {voci.map((elemento) => (
                  <li key={elemento.id}>
                    <button
                      type="button"
                      aria-pressed={elemento.id === selezionato}
                      onClick={() => onSeleziona(elemento.id)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-base text-zinc-900 hover:bg-zinc-50 ${
                        elemento.id === selezionato
                          ? "border-2 border-emerald-800 bg-emerald-50"
                          : "border-zinc-300 bg-white"
                      }`}
                    >
                      {contenutoRiga ? contenutoRiga(elemento) : elemento.etichetta}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
