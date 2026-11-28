// Stato di stallo, sosta o segnalazione con testo e colore, mai solo colore (OMP-57, NRF_USA_1).
// Dalla OMP-68 le tinte sono della stessa famiglia dei toni dei marker (globals.css).
import { descriviStato, type TipoStato, type Tono } from "./logica/statiDominio.ts";

const CLASSI: Readonly<Record<Tono, string>> = {
  verde: "border-emerald-700 bg-emerald-50 text-emerald-900",
  rosso: "border-rose-700 bg-rose-50 text-rose-900",
  arancione: "border-amber-700 bg-amber-50 text-amber-900",
  grigio: "border-slate-600 bg-slate-100 text-slate-900",
  blu: "border-sky-700 bg-sky-50 text-sky-900",
  viola: "border-fuchsia-700 bg-fuchsia-50 text-fuchsia-900",
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
