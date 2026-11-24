// Legenda della mappa generica (OMP-58): ogni voce ha il simbolo e il testo, il colore non è mai
// l'unica informazione (NRF_USA_1).
import type { Tono } from "./logica/statiDominio.ts";

export type VoceLegenda = { tono?: Tono; simbolo: string; testo: string };

export function Legenda({ voci }: { voci: readonly VoceLegenda[] }) {
  return (
    <div className="rounded-md border border-zinc-300 bg-white p-3">
      <h3 className="text-sm font-semibold text-zinc-900">Legenda</h3>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-zinc-900 sm:grid-cols-2">
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
