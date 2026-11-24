// Schermata iniziale dell'Automobilista (MU_2): segnaposto fino a COD-17.
import type { Metadata } from "next";
import { Avviso } from "../../../presentation/Avviso.tsx";

export const metadata: Metadata = { title: "Mappa degli stalli · OmniPark" };

export default function PaginaMappa() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Mappa degli stalli</h1>
      <p className="text-base text-zinc-800">
        Qui vedrai gli stalli liberi e occupati e potrai avviare la sosta.
      </p>
      <Avviso tipo="informazione">Contenuto in arrivo con COD-17.</Avviso>
    </>
  );
}
