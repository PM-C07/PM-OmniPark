// /accesso: boundary :SchermataAccesso (MU_1, UC_AUTH_4), vista di accesso. Il form legge ?da=
// dall'indirizzo al momento dell'invio.
import type { Metadata } from "next";
import { SchermataAccesso } from "../../../presentation/SchermataAccesso.tsx";

export const metadata: Metadata = { title: "Accedi · OmniPark" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Accedi</h1>
      <SchermataAccesso vista="accesso" />
    </>
  );
}
