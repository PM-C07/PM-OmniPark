// /registrazione: boundary :SchermataAccesso (MU_1, UC_AUTH_1, SC_UT_1), vista di registrazione.
import type { Metadata } from "next";
import { SchermataAccesso } from "../../../presentation/SchermataAccesso.tsx";

export const metadata: Metadata = { title: "Registrati · OmniPark" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">Registrati</h1>
      <p className="text-base text-slate-700">
        Crea il tuo account da Automobilista con email, password e la targa del tuo veicolo.
      </p>
      <SchermataAccesso vista="registrazione" />
    </>
  );
}
