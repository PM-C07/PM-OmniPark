// Boundary :MappaSegnalazioni (MU_4), schermata iniziale dell'Ausiliario del Traffico: mappa ed
// elenco delle possibili soste irregolari dell'ente, dettaglio e chiusura con esito (OMP-59).
import type { Metadata } from "next";
import { MappaSegnalazioni } from "../../../presentation/MappaSegnalazioni.tsx";

export const metadata: Metadata = { title: "Mappa delle segnalazioni · OmniPark" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">Mappa delle segnalazioni</h1>
      <MappaSegnalazioni />
    </>
  );
}
