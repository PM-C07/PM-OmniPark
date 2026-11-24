// Avviso di informazione, successo o errore (OMP-57): titolo testuale oltre al colore; l'errore è
// annunciato subito (role="alert"), gli altri come stato (role="status").
import type { ReactNode } from "react";

type Tipo = "informazione" | "successo" | "errore";

const STILE: Readonly<Record<Tipo, { classi: string; titolo: string }>> = {
  informazione: { classi: "border-sky-700 bg-sky-50 text-sky-950", titolo: "Informazione" },
  successo: { classi: "border-emerald-700 bg-emerald-50 text-emerald-950", titolo: "Fatto" },
  errore: { classi: "border-red-700 bg-red-50 text-red-950", titolo: "Errore" },
};

export function Avviso({ tipo, children }: { tipo: Tipo; children: ReactNode }) {
  const { classi, titolo } = STILE[tipo];
  return (
    <div
      role={tipo === "errore" ? "alert" : "status"}
      className={`rounded-md border-l-4 p-3 ${classi}`}
    >
      <p className="font-semibold">{titolo}</p>
      <div>{children}</div>
    </div>
  );
}
