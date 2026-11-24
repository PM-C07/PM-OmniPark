// Gestione degli Ausiliari (MU_5): segnaposto fino a COD-24.
import type { Metadata } from "next";
import { Avviso } from "../../../../presentation/Avviso.tsx";

export const metadata: Metadata = { title: "Gestione Ausiliari · OmniPark" };

export default function PaginaGestioneAusiliari() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Gestione Ausiliari</h1>
      <p className="text-base text-zinc-800">
        Qui potrai creare, modificare e disattivare gli account degli Ausiliari del Traffico.
      </p>
      <Avviso tipo="informazione">Contenuto in arrivo con COD-24.</Avviso>
    </>
  );
}
