// Aree dei ruoli (OMP-57): :MenuUtente con utente, menu del ruolo ed «Esci». L'accesso alle aree
// lo controlla src/proxy.ts; i dati li proteggono le route API.
import { MenuUtente } from "../../presentation/MenuUtente.tsx";

export default function LayoutAree({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#contenuto" className="salta-al-contenuto">
        Salta al contenuto
      </a>
      <MenuUtente />
      <main
        id="contenuto"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6"
      >
        {children}
      </main>
    </>
  );
}
