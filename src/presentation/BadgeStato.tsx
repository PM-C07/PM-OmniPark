// Stato di stallo, sosta o segnalazione con testo e colore, mai solo colore (OMP-57, NRF_USA_1).
import { descriviStato, type TipoStato, type Tono } from "./logica/statiDominio.ts";

const CLASSI: Readonly<Record<Tono, string>> = {
  verde: "border-emerald-700 bg-emerald-50 text-emerald-900",
  rosso: "border-red-700 bg-red-50 text-red-900",
  arancione: "border-orange-700 bg-orange-50 text-orange-900",
  grigio: "border-zinc-600 bg-zinc-100 text-zinc-900",
  blu: "border-blue-700 bg-blue-50 text-blue-900",
};

export function BadgeStato({ tipo, stato }: { tipo: TipoStato; stato: string }) {
  const { testo, tono } = descriviStato(tipo, stato);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium ${CLASSI[tono]}`}
    >
      {testo}
    </span>
  );
}
