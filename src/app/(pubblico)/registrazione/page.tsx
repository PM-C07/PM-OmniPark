// Registrazione dell'Automobilista (UC_AUTH_1, MU_1, SC_UT_1).
import type { Metadata } from "next";
import { FormRegistrazione } from "../../../presentation/FormRegistrazione.tsx";

export const metadata: Metadata = { title: "Registrati · OmniPark" };

export default function PaginaRegistrazione() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Registrati</h1>
      <p className="text-base text-zinc-800">
        Crea il tuo account da Automobilista con email, password e la targa del tuo veicolo.
      </p>
      <FormRegistrazione />
    </>
  );
}
