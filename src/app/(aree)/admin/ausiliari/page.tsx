// Boundary :SchermataAusiliari (MU_6), gestione degli account degli Ausiliari del Traffico: elenco,
// creazione, modifica e disattivazione (UC_ADM_2, OMP-62).
import type { Metadata } from "next";
import { SchermataAusiliari } from "../../../../presentation/SchermataAusiliari.tsx";

export const metadata: Metadata = { title: "Gestione Ausiliari · OmniPark" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">Gestione Ausiliari</h1>
      <p className="text-base text-slate-700">
        Crea, modifica e disattiva gli account degli Ausiliari del Traffico degli enti clienti.
      </p>
      <SchermataAusiliari />
    </>
  );
}
