// Bottone di base (OMP-57): durante l'invio è disabilitato e lo dice anche a parole.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "primario" | "secondario" | "pericolo";

const CLASSI: Readonly<Record<Variante, string>> = {
  primario: "bg-marca-700 text-white hover:bg-marca-800",
  secondario: "border border-marca-700 bg-white text-marca-900 hover:bg-marca-50",
  pericolo: "border border-rose-700 bg-white text-rose-800 hover:bg-rose-50",
};

/** Classi del bottone, anche per i link con l'aspetto di un bottone (OMP-67). */
export function classiBottone(variante: Variante = "primario"): string {
  return `min-h-11 rounded-xl px-4 py-2 text-base font-semibold transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${CLASSI[variante]}`;
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
