// Schermata di accesso (UC_AUTH_4, MU_1). Il form legge ?da= dall'indirizzo al momento dell'invio.
import type { Metadata } from "next";
import { FormAccesso } from "../../../presentation/FormAccesso.tsx";

export const metadata: Metadata = { title: "Accedi · OmniPark" };

export default function PaginaAccesso() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Accedi</h1>
      <FormAccesso />
    </>
  );
}
