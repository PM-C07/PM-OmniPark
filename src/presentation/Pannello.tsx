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
      className="flex flex-col gap-3 rounded-lg border border-zinc-300 bg-white p-4"
    >
      <h2 id={idTitolo} className="text-lg font-semibold text-zinc-900">
        {titolo}
      </h2>
      {children}
    </section>
  );
}
