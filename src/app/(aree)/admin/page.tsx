// Boundary :PanoramicaEnti (MU_5), schermata iniziale dell'Amministratore: riepilogo degli enti
// clienti con stalli gestiti, soste attive e segnalazioni aperte (UC_ADM_1, OMP-62).
import type { Metadata } from "next";
import { PanoramicaEnti } from "../../../presentation/PanoramicaEnti.tsx";

export const metadata: Metadata = { title: "Panoramica degli enti · OmniPark" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">Panoramica degli enti</h1>
      <PanoramicaEnti />
    </>
  );
}
