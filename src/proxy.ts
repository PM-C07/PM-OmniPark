// Controllo ottimistico delle pagine protette (OMP-48, OMP-57). Senza una sessione valida porta su
// /accesso, con il ruolo di un'altra area su /accesso-negato (pagina 403). Su "/" porta alla
// schermata iniziale del ruolo, o su /accesso senza sessione. Il controllo vero lo fa ogni route
// API con richiediSessione: il proxy non sostituisce l'autorizzazione e non tocca /api. Se la
// verifica della sessione fallisce per un errore del database, porta su /accesso: non lascia mai
// passare e non risponde mai 500. Aree e ruoli vengono da src/presentation/logica/navigazione.ts.
import { NextResponse, type NextRequest } from "next/server";
import { componiSottosistemi } from "./app/_composizione.ts";
import { leggiTokenDiSessione } from "./app/api/_sessione.ts";
import { ruoloDellArea, schermataIniziale } from "./presentation/logica/navigazione.ts";

function versoAccesso(richiesta: NextRequest, conRitorno: boolean): NextResponse {
  const destinazione = new URL("/accesso", richiesta.url);
  if (conRitorno) {
    destinazione.searchParams.set("da", richiesta.nextUrl.pathname);
  }
  return NextResponse.redirect(destinazione);
}

/** Ruolo della sessione del cookie; null senza cookie, con sessione non valida o database giù. */
async function ruoloDellaSessione(richiesta: NextRequest): Promise<string | null> {
  const token = leggiTokenDiSessione(richiesta);
  if (token === null) {
    return null;
  }
  try {
    return (await componiSottosistemi().utentiAccessi.utenteDellaSessione(token)).ruolo;
  } catch {
    return null;
  }
}

export async function proxy(richiesta: NextRequest): Promise<NextResponse> {
  const percorso = richiesta.nextUrl.pathname;
  if (percorso === "/") {
    const ruolo = await ruoloDellaSessione(richiesta);
    return ruolo === null
      ? versoAccesso(richiesta, false)
      : NextResponse.redirect(new URL(schermataIniziale(ruolo), richiesta.url));
  }
  const ruoloAtteso = ruoloDellArea(percorso);
  if (ruoloAtteso === null) {
    return NextResponse.next();
  }
  const ruolo = await ruoloDellaSessione(richiesta);
  if (ruolo === null) {
    return versoAccesso(richiesta, true);
  }
  if (ruolo !== ruoloAtteso) {
    return NextResponse.redirect(new URL("/accesso-negato", richiesta.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/mappa/:path*", "/profilo/:path*", "/ausiliario/:path*", "/admin/:path*"],
};
