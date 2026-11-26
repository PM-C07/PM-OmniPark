"use client";
// Mappa Leaflet generica (OMP-58): sfondo OpenStreetMap, marker divIcon con simbolo del tipo e
// dello stato, selezione da mouse, tocco e tastiera. Non conosce stalli né segnalazioni: riceve
// ElementoMappa. Va caricata solo nel browser: VistaMappa la importa con dynamic(…, { ssr: false }).
// Dalla OMP-61 (DIF-02) i marker che si sovrappongono alla zoom corrente si dispongono a griglia
// attorno alla loro posizione, così il tocco seleziona sempre l'elemento toccato.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { DIMENSIONE_MARCATORE, separaMarcatori } from "./logica/marcatori.ts";
import type { ElementoMappa } from "./logica/mappaStalli.ts";

export type VistaGeografica = { sud: number; ovest: number; nord: number; est: number };

export type PropsMappa = {
  etichetta: string;
  elementi: readonly ElementoMappa[];
  vistaIniziale: { centro: [number, number]; zoom: number };
  selezionato: number | null;
  onSeleziona(id: number): void;
  onCambioVista(vista: VistaGeografica): void;
  onSfondoNonDisponibile(): void;
};

const URL_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUZIONE =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
/** Tile fallite prima che ne arrivi una: oltre questa soglia lo sfondo è considerato non disponibile. */
const TILE_FALLITE_MASSIME = 4;
const RITARDO_VISTA_MS = 300;

function escapeHtml(testo: string): string {
  return testo.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function htmlDelMarcatore(elemento: ElementoMappa, selezionato: boolean): string {
  return (
    `<span class="marcatore${selezionato ? " marcatore--selezionato" : ""}" data-tono="${elemento.tono}">` +
    `<span class="marcatore__tipo">${escapeHtml(elemento.simbolo)}</span>` +
    `<span class="marcatore__stato">${escapeHtml(elemento.simboloStato)}</span></span>`
  );
}

function vistaDi(mappa: L.Map): VistaGeografica {
  const limiti = mappa.getBounds();
  return {
    sud: limiti.getSouth(),
    ovest: limiti.getWest(),
    nord: limiti.getNorth(),
    est: limiti.getEast(),
  };
}

type Marcatori = Map<number, { marker: L.Marker; html: string }>;

/**
 * Posiziona i marker: centri proiettati in pixel alla zoom corrente, separati se si sovrappongono
 * (separaMarcatori), poi riportati in coordinate geografiche. Con lo zoom alto tornano al loro posto.
 */
function posizionaMarcatori(
  istanza: L.Map,
  elementi: readonly ElementoMappa[],
  marcatori: Marcatori,
): void {
  const zoom = istanza.getZoom();
  const punti = elementi.map((elemento) => {
    const punto = istanza.project([elemento.latitudine, elemento.longitudine], zoom);
    return { id: elemento.id, x: punto.x, y: punto.y };
  });
  for (const { id, x, y } of separaMarcatori(punti, DIMENSIONE_MARCATORE)) {
    marcatori.get(id)?.marker.setLatLng(istanza.unproject([x, y], zoom));
  }
}

export function Mappa(props: PropsMappa) {
  const contenitore = useRef<HTMLDivElement>(null);
  const mappa = useRef<L.Map | null>(null);
  const marcatori = useRef<Marcatori>(new Map());
  // Elementi dell'ultimo allineamento dei marker, per riposizionarli al cambio di zoom.
  const elementiMostrati = useRef<readonly ElementoMappa[]>([]);
  // Le callback cambiano a ogni rendering: la mappa le legge da qui senza ricrearsi.
  const callback = useRef(props);
  useEffect(() => {
    callback.current = props;
  });

  // Creazione della mappa, una volta sola.
  useEffect(() => {
    if (!contenitore.current) {
      return;
    }
    const { centro, zoom } = callback.current.vistaIniziale;
    const istanza = L.map(contenitore.current, { center: centro, zoom, minZoom: 12 });
    mappa.current = istanza;

    let caricate = 0;
    let fallite = 0;
    let segnalato = false;
    L.tileLayer(URL_TILE, { maxZoom: 19, attribution: ATTRIBUZIONE })
      .on("tileload", () => {
        caricate += 1;
      })
      .on("tileerror", () => {
        fallite += 1;
        if (!segnalato && caricate === 0 && fallite >= TILE_FALLITE_MASSIME) {
          segnalato = true;
          callback.current.onSfondoNonDisponibile();
        }
      })
      .addTo(istanza);

    let timer: ReturnType<typeof setTimeout> | undefined;
    istanza.on("moveend", () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current.onCambioVista(vistaDi(istanza)), RITARDO_VISTA_MS);
    });
    callback.current.onCambioVista(vistaDi(istanza));
    istanza.on("zoomend", () =>
      posizionaMarcatori(istanza, elementiMostrati.current, marcatori.current),
    );

    const elencoMarcatori = marcatori.current;
    return () => {
      clearTimeout(timer);
      elencoMarcatori.clear();
      istanza.remove();
      mappa.current = null;
    };
  }, []);

  // Marker allineati agli elementi, per id: aggiunti, aggiornati solo se cambiano, rimossi.
  const { elementi, selezionato } = props;
  useEffect(() => {
    const istanza = mappa.current;
    if (!istanza) {
      return;
    }
    const presenti = marcatori.current;
    const ids = new Set(elementi.map((e) => e.id));
    for (const [id, { marker }] of presenti) {
      if (!ids.has(id)) {
        marker.remove();
        presenti.delete(id);
      }
    }
    for (const elemento of elementi) {
      const eSelezionato = elemento.id === selezionato;
      const html = htmlDelMarcatore(elemento, eSelezionato);
      const icona = L.divIcon({
        html,
        className: "marcatore-contenitore",
        iconSize: [DIMENSIONE_MARCATORE, DIMENSIONE_MARCATORE],
        iconAnchor: [DIMENSIONE_MARCATORE / 2, DIMENSIONE_MARCATORE / 2],
      });
      let voce = presenti.get(elemento.id);
      if (!voce) {
        const marker = L.marker([elemento.latitudine, elemento.longitudine], {
          icon: icona,
          keyboard: true,
          title: elemento.etichetta,
        })
          .on("click", () => callback.current.onSeleziona(elemento.id))
          // Leaflet 1.9 rende il marker raggiungibile con Tab (keyboard: true) ma con Invio apre
          // solo un popup: la selezione da tastiera la gestisce questo handler.
          .on("keydown", (evento) => {
            const tasto = (evento as L.LeafletKeyboardEvent).originalEvent;
            if (tasto.key === "Enter" || tasto.key === " ") {
              tasto.preventDefault();
              callback.current.onSeleziona(elemento.id);
            }
          })
          .addTo(istanza);
        voce = { marker, html };
        presenti.set(elemento.id, voce);
      } else {
        if (voce.html !== html) {
          voce.marker.setIcon(icona);
          voce.html = html;
        }
      }
      const nodo = voce.marker.getElement();
      if (nodo) {
        nodo.setAttribute("role", "button");
        nodo.setAttribute("aria-label", elemento.etichetta);
        nodo.setAttribute("aria-pressed", String(eSelezionato));
        nodo.setAttribute("title", elemento.etichetta);
      }
    }
    elementiMostrati.current = elementi;
    posizionaMarcatori(istanza, elementi, presenti);
  }, [elementi, selezionato]);

  return (
    <div
      ref={contenitore}
      role="region"
      aria-label={props.etichetta}
      className="h-full w-full rounded-lg"
    />
  );
}
