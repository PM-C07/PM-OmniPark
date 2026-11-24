// Boundary :MappaSegnalazioni (MU_4), schermata iniziale dell'Ausiliario del Traffico: segnaposto fino a COD-18.
import type { Metadata } from "next";
import { Avviso } from "../../../presentation/Avviso.tsx";

export const metadata: Metadata = { title: "Mappa delle segnalazioni · OmniPark" };

export default function MappaSegnalazioni() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Mappa delle segnalazioni</h1>
      <p className="text-base text-zinc-800">
        Qui vedrai la mappa delle segnalazioni del tuo ente.
      </p>
      <Avviso tipo="informazione">Contenuto in arrivo con COD-18.</Avviso>
    </>
  );
}
