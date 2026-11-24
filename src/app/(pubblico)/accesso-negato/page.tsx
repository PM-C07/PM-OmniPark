// Pagina 403 (OMP-48, OMP-57): il proxy ci porta chi apre l'area di un altro ruolo.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Accesso non consentito · OmniPark" };

export default function PaginaAccessoNegato() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Accesso non consentito</h1>
      <p className="text-base text-zinc-800">
        Il tuo ruolo non può aprire questa area di OmniPark.
      </p>
      <p>
        <Link href="/" className="font-semibold text-emerald-900 underline">
          Torna alla tua schermata iniziale
        </Link>
      </p>
    </>
  );
}
