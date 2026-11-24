// Controllo ottimistico delle pagine protette (OMP-48, issue #27). Senza una sessione valida porta
// su /accesso, con il ruolo di un'altra area su /accesso-negato (pagina 403). Il controllo vero lo
// fa ogni route API con richiediSessione: il proxy non sostituisce l'autorizzazione e non tocca
// /api. Se la verifica della sessione fallisce per un errore del database, porta su /accesso:
// non lascia mai passare e non risponde mai 500.
import { NextResponse, type NextRequest } from "next/server";
import type { Ruolo } from "./application/utenti-accessi/facade.ts";
import { componiSottosistemi } from "./app/_composizione.ts";
import { leggiTokenDiSessione } from "./app/api/_sessione.ts";

const RUOLO_DELL_AREA: Readonly<Record<string, Ruolo>> = {
  automobilista: "AUTOMOBILISTA",
  ausiliario: "AUSILIARIO_DEL_TRAFFICO",
  amministratore: "AMMINISTRATORE",
};

function versoAccesso(richiesta: NextRequest): NextResponse {
  const destinazione = new URL("/accesso", richiesta.url);
  destinazione.searchParams.set("da", richiesta.nextUrl.pathname);
  return NextResponse.redirect(destinazione);
}

export async function proxy(richiesta: NextRequest): Promise<NextResponse> {
  const area = richiesta.nextUrl.pathname.split("/")[1] ?? "";
  const ruoloAtteso = RUOLO_DELL_AREA[area];
  if (!ruoloAtteso) {
    return NextResponse.next();
  }
  const token = leggiTokenDiSessione(richiesta);
  if (token === null) {
    return versoAccesso(richiesta);
  }
  let ruolo: Ruolo;
  try {
    ruolo = (await componiSottosistemi().utentiAccessi.utenteDellaSessione(token)).ruolo;
  } catch {
    // Sessione non valida o database non raggiungibile: in entrambi i casi, di nuovo l'accesso.
    return versoAccesso(richiesta);
  }
  if (ruolo !== ruoloAtteso) {
    return NextResponse.redirect(new URL("/accesso-negato", richiesta.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/automobilista/:path*", "/ausiliario/:path*", "/amministratore/:path*"],
};
