// Boundary :MappaStalli (MU_2), schermata iniziale dell'Automobilista: mappa degli stalli con
// aggiornamento automatico, scheda dello stallo, avvio della sosta e «La mia sosta» (OMP-58).
import type { Metadata } from "next";
import { MappaStalli } from "../../../presentation/MappaStalli.tsx";

export const metadata: Metadata = { title: "Mappa degli stalli · OmniPark" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">Mappa degli stalli</h1>
      <MappaStalli />
    </>
  );
}
