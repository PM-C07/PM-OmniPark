// Profilo dell'Automobilista (MU_3): targhe (UC_AUTH_5) e, con COD-17, il wallet.
import type { Metadata } from "next";
import { Avviso } from "../../../presentation/Avviso.tsx";
import { GestioneTarghe } from "../../../presentation/GestioneTarghe.tsx";
import { Pannello } from "../../../presentation/Pannello.tsx";

export const metadata: Metadata = { title: "Profilo · OmniPark" };

export default function PaginaProfilo() {
  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Profilo</h1>
      <Pannello titolo="Targhe" idTitolo="titolo-targhe">
        <GestioneTarghe />
      </Pannello>
      <Pannello titolo="Wallet" idTitolo="titolo-wallet">
        <Avviso tipo="informazione">Contenuto in arrivo con COD-17.</Avviso>
      </Pannello>
    </>
  );
}
