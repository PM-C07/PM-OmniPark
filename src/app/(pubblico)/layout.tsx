// Pagine pubbliche (OMP-57): accesso, registrazione e accesso negato, in una colonna stretta.
// Dalla OMP-68 l'intestazione ha lo stesso aspetto di quella delle aree (MenuUtente), con il logo
// decorativo accanto al nome.
import Image from "next/image";

export default function LayoutPubblico({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#contenuto" className="salta-al-contenuto">
        Salta al contenuto
      </a>
      <header className="border-b-4 bg-linear-to-r from-marca-900 to-marca-700 [border-image:linear-gradient(to_right,var(--color-marca-700),var(--color-foglia-400))_1]">
        <p className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-3 text-xl font-bold text-white">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10" />
          OmniPark
        </p>
      </header>
      <main
        id="contenuto"
        tabIndex={-1}
        className="pagina-pubblica mx-4 my-8 flex max-w-md flex-col gap-6 rounded-2xl bg-white p-6 shadow-xl sm:mx-auto sm:w-full"
      >
        {children}
      </main>
    </>
  );
}
