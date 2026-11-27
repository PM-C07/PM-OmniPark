// Bottone di base (OMP-57): durante l'invio è disabilitato e lo dice anche a parole.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "primario" | "secondario" | "pericolo";

const CLASSI: Readonly<Record<Variante, string>> = {
  primario: "bg-emerald-800 text-white hover:bg-emerald-900",
  secondario: "border border-zinc-500 bg-white text-zinc-900 hover:bg-zinc-100",
  pericolo: "border border-red-800 bg-white text-red-800 hover:bg-red-50",
};

/** Classi del bottone, anche per i link con l'aspetto di un bottone (OMP-67). */
export function classiBottone(variante: Variante = "primario"): string {
  return `min-h-11 rounded-md px-4 py-2 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${CLASSI[variante]}`;
}

export function Bottone({
  variante = "primario",
  inCorso = false,
  testoInCorso = "Invio in corso…",
  disabled,
  className = "",
  children,
  type = "button",
  ...altri
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  inCorso?: boolean;
  testoInCorso?: string;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || inCorso}
      aria-busy={inCorso || undefined}
      className={`${classiBottone(variante)} ${className}`}
      {...altri}
    >
      {inCorso ? testoInCorso : children}
    </button>
  );
}
