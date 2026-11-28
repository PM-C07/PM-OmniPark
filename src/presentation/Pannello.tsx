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
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id={idTitolo} className="text-lg font-semibold text-marca-900">
        {titolo}
      </h2>
      {children}
    </section>
  );
}
