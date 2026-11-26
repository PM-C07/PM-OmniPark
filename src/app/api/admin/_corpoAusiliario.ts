// Lettura del corpo di creazione e modifica di un Ausiliario (OMP-62, docs/test/cp_apiAmministrazione.md
// §2): stringhe per nome, cognome, email e password, intero per ente. Un campo assente o null arriva
// alla Facade vuoto (DATI_INCOMPLETI); un tipo diverso o un corpo non JSON è RICHIESTA_NON_VALIDA.
import type {
  DatiAusiliario,
  DatiNuovoAusiliario,
} from "../../../application/utenti-accessi/facade.ts";
import { ErroreApi } from "../_errori.ts";

function testo(corpo: Record<string, unknown>, campo: string): string {
  const valore = corpo[campo];
  if (valore === undefined || valore === null) {
    return "";
  }
  if (typeof valore !== "string") {
    throw new ErroreApi("RICHIESTA_NON_VALIDA");
  }
  return valore;
}

function ente(corpo: Record<string, unknown>): number | null {
  const valore = corpo.ente;
  if (valore === undefined || valore === null) {
    return null;
  }
  if (typeof valore !== "number" || !Number.isSafeInteger(valore)) {
    throw new ErroreApi("RICHIESTA_NON_VALIDA");
  }
  return valore;
}

export function leggiDatiAusiliario(corpo: Record<string, unknown> | null): DatiAusiliario {
  if (!corpo) {
    throw new ErroreApi("RICHIESTA_NON_VALIDA");
  }
  return {
    nome: testo(corpo, "nome"),
    cognome: testo(corpo, "cognome"),
    email: testo(corpo, "email"),
    ente: ente(corpo),
  };
}

export function leggiDatiNuovoAusiliario(
  corpo: Record<string, unknown> | null,
): DatiNuovoAusiliario {
  const dati = leggiDatiAusiliario(corpo);
  return { ...dati, password: testo(corpo as Record<string, unknown>, "password") };
}
