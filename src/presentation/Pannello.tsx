// Pannello con titolo (OMP-57): una sezione della pagina con il suo titolo di secondo livello.
import type { ReactNode } from "react";

export function Pannello({
  titolo,
  idTitolo,
  children,
}: {
  titolo: string;
  idTitolo?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={idTitolo}
      className="scheda mx-auto flex w-full max-w-3xl flex-col gap-3 p-4"
    >
      <h2
        id={idTitolo}
        className="-mx-4 -mt-4 rounded-t-2xl border-b border-slate-200 bg-marca-50 px-4 pt-4 pb-3 text-lg font-semibold text-marca-900"
      >
        {titolo}
      </h2>
      {children}
    </section>
  );
}
