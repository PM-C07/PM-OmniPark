// Pagina provvisoria 403 (OMP-48): il proxy ci porta chi apre l'area di un altro ruolo. COD-16 la
// sostituisce con la schermata definitiva.
export default function PaginaAccessoNegato() {
  return (
    <main>
      <h1>Accesso non consentito</h1>
      <p>Il tuo ruolo non può aprire questa area.</p>
    </main>
  );
}
