// Campo di un form con etichetta, suggerimento e messaggio d'errore collegati (OMP-57, NRF_USA_1):
// l'errore è legato al campo con aria-describedby e aria-invalid, e ha il prefisso «Errore:».
import type { InputHTMLAttributes } from "react";

export function Campo({
  id,
  etichetta,
  errore,
  suggerimento,
  className = "",
  ...altri
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  etichetta: string;
  errore?: string | null;
  suggerimento?: string;
}) {
  const idSuggerimento = suggerimento ? `${id}-suggerimento` : undefined;
  const idErrore = errore ? `${id}-errore` : undefined;
  const descrittori = [idSuggerimento, idErrore].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-base font-medium text-slate-900">
        {etichetta}
      </label>
      {suggerimento ? (
        <p id={idSuggerimento} className="text-sm text-slate-700">
          {suggerimento}
        </p>
      ) : null}
      <input
        id={id}
        aria-invalid={errore ? true : undefined}
        aria-describedby={descrittori}
        className={`min-h-11 rounded-xl border bg-white px-3 py-2 text-base text-slate-900 ${
          errore ? "border-2 border-rose-700" : "border-slate-500"
        } ${className}`}
        {...altri}
      />
      {errore ? (
        <p id={idErrore} className="text-sm font-medium text-rose-800">
          Errore: {errore}
        </p>
      ) : null}
    </div>
  );
}
