// Boundary :PanoramicaEnti (MU_5), schermata iniziale dell'Amministratore: segnaposto fino a COD-24.
import type { Metadata } from "next";
import { Avviso } from "../../../presentation/Avviso.tsx";

export const metadata: Metadata = { title: "Panoramica degli enti · OmniPark" };

export default function PanoramicaEnti() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Panoramica degli enti</h1>
      <p className="text-base text-zinc-800">Qui vedrai la panoramica degli enti.</p>
      <Avviso tipo="informazione">Contenuto in arrivo con COD-24.</Avviso>
    </>
  );
}
