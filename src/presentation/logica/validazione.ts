// Validazione dei form lato client (OMP-57, docs/test/cp_validazioneCampi.md). Duplica le regole del
// server solo per un riscontro immediato: l'unica autorità resta il server, i cui errori si
// mostrano comunque accanto al campo. Nessuna dipendenza da React né dai sottosistemi.

// Stesso formato del server (Utenti e accessi, vincolo utente_email_formato).
const FORMATO_EMAIL = /^[^@\s]+@[^@\s]+$/;
// Stesso formato del server (utenti-accessi/targa.ts).
const FORMATO_TARGA = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
const LUNGHEZZA_MINIMA_PASSWORD = 8;

export function validaEmail(email: string): string | null {
  if (email === "") {
    return "Inserisci l'email.";
  }
  return FORMATO_EMAIL.test(email) ? null : "L'email non è valida.";
}

/** Registrazione: almeno 8 caratteri, contati come caratteri Unicode come fa il server. */
export function validaPasswordNuova(password: string): string | null {
  if (password === "") {
    return "Inserisci la password.";
  }
  return [...password].length >= LUNGHEZZA_MINIMA_PASSWORD
    ? null
    : "La password deve avere almeno 8 caratteri.";
}

/** Accesso: solo non vuota; le credenziali le verifica il server. */
export function validaPasswordAccesso(password: string): string | null {
  return password === "" ? "Inserisci la password." : null;
}

/** Senza spazi e in maiuscolo, come il server. */
export function normalizzaTarga(targa: string): string {
  return targa.replace(/\s+/g, "").toUpperCase();
}

export function validaTarga(targa: string): string | null {
  const normalizzata = normalizzaTarga(targa);
  if (normalizzata === "") {
    return "Inserisci la targa.";
  }
  return FORMATO_TARGA.test(normalizzata) ? null : "La targa non è valida: usa il formato AB123CD.";
}

type Errori<Campo extends string> = Partial<Record<Campo, string>>;

function raccogli<Campo extends string>(controlli: [Campo, string | null][]): Errori<Campo> {
  const errori: Errori<Campo> = {};
  for (const [campo, messaggio] of controlli) {
    if (messaggio !== null) {
      errori[campo] = messaggio;
    }
  }
  return errori;
}

export function validaRegistrazione(dati: {
  email: string;
  password: string;
  targa: string;
}): Errori<"email" | "password" | "targa"> {
  return raccogli<"email" | "password" | "targa">([
    ["email", validaEmail(dati.email)],
    ["password", validaPasswordNuova(dati.password)],
    ["targa", validaTarga(dati.targa)],
  ]);
}

export function validaAccesso(dati: {
  email: string;
  password: string;
}): Errori<"email" | "password"> {
  return raccogli<"email" | "password">([
    ["email", validaEmail(dati.email)],
    ["password", validaPasswordAccesso(dati.password)],
  ]);
}
