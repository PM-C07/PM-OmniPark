// Legenda della mappa generica (OMP-58): ogni voce ha il simbolo e il testo, il colore non è mai
// l'unica informazione (NRF_USA_1). Dalla OMP-68 il titolo è un h2: segue l'h1 della pagina senza
// saltare livelli (heading-order).
import type { Tono } from "./logica/statiDominio.ts";

export type VoceLegenda = { tono?: Tono; simbolo: string; testo: string };

export function Legenda({ voci }: { voci: readonly VoceLegenda[] }) {
  return (
    <div className="scheda p-4">
      <h2 className="-mx-4 -mt-4 rounded-t-2xl border-b border-slate-200 bg-marca-50 px-4 pt-4 pb-3 text-lg font-semibold text-marca-900">
        Legenda
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-slate-900 sm:grid-cols-2">
        {voci.map((voce) => (
          <li key={voce.testo} className="flex items-center gap-2">
            <span aria-hidden="true" className="legenda-simbolo" data-tono={voce.tono ?? "neutro"}>
              {voce.simbolo}
            </span>
            {voce.testo}
          </li>
        ))}
      </ul>
    </div>
  );
}
