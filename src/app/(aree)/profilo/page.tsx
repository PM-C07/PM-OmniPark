// /profilo: boundary :SchermataProfilo (MU_3): targhe (UC_AUTH_5) e, con COD-17, il wallet.
import type { Metadata } from "next";
import { SchermataProfilo } from "../../../presentation/SchermataProfilo.tsx";

export const metadata: Metadata = { title: "Profilo · OmniPark" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">Profilo</h1>
      <SchermataProfilo />
    </>
  );
}
