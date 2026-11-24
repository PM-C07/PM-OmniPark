// Pagine pubbliche (OMP-57): accesso, registrazione e accesso negato, in una colonna stretta.
export default function LayoutPubblico({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#contenuto" className="salta-al-contenuto">
        Salta al contenuto
      </a>
      <header className="border-b border-zinc-300 bg-white">
        <p className="mx-auto w-full max-w-md px-4 py-3 text-xl font-bold text-emerald-900">
          OmniPark
        </p>
      </header>
      <main
        id="contenuto"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8"
      >
        {children}
      </main>
    </>
  );
}
