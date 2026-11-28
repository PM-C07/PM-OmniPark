// Bottone di base (OMP-57): durante l'invio è disabilitato e lo dice anche a parole.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "primario" | "secondario" | "pericolo";

const CLASSI: Readonly<Record<Variante, string>> = {
  primario:
    "bg-linear-to-b from-marca-700 to-marca-800 text-white shadow-md shadow-marca-900/25 hover:from-marca-800 hover:to-marca-900",
  secondario: "border border-marca-700 bg-white text-marca-900 hover:bg-marca-50",
  pericolo: "border border-rose-700 bg-white text-rose-800 hover:bg-rose-50",
};

/**
 * Classi del bottone, anche per i link con l'aspetto di un bottone (OMP-67). Dalla OMP-68 (B4) il
 * bottone disabilitato è grigio pieno (slate-600 su slate-100, 6,9:1) invece che trasparente: con
 * l'opacità il testo diventava bianco su azzurro chiaro (2,9:1) o azzurro su bianco.
 */
export function classiBottone(variante: Variante = "primario"): string {
  return `min-h-11 rounded-xl px-4 py-2 text-base font-semibold transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-none disabled:bg-slate-100 disabled:text-slate-600 disabled:shadow-none ${CLASSI[variante]}`;
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
