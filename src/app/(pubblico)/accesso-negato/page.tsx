// Pagina 403 (OMP-48, OMP-57): il proxy ci porta chi apre l'area di un altro ruolo.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Accesso non consentito · OmniPark" };

export default function PaginaAccessoNegato() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">Accesso non consentito</h1>
      <p className="text-base text-slate-700">
        Il tuo ruolo non può aprire questa area di OmniPark.
      </p>
      <p>
        <Link
          href="/"
          className="font-semibold text-marca-800 underline decoration-2 underline-offset-2 hover:text-marca-950"
        >
          Torna alla tua schermata iniziale
        </Link>
      </p>
    </>
  );
}
