// Logica delle schermate dell'Amministratore (OMP-62, docs/test/cp_amministrazioneInterfaccia.md):
// modulo dell'Ausiliario (UC_ADM_2 passi 4–6), elenco per ente (passo 2, 2.a1), errori del server
// accanto al campo o all'Ausiliario (6.a1, 3.a2) e righe della panoramica degli enti (UC_ADM_1,
// 2.a1 e 4.a1). Il server resta l'unica autorità sui controlli.
import { validaEmail, validaPasswordNuova } from "./validazione.ts";

export type ModuloAusiliario = {
  nome: string;
  cognome: string;
  email: string;
  password: string;
  ente: string; // valore del select: id dell'ente come stringa, "" se non scelto
};
export type Modalita = "creazione" | "modifica";
export type CampoModulo = "nome" | "cognome" | "email" | "password" | "ente";

export type AusiliarioDellElenco = {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  enteId: number;
  ente: string;
  statoDellAccount: string;
};

export type RiepilogoCaricato =
  | { stato: "caricamento" }
  | { stato: "pronto"; stalliGestiti: number; sosteAttive: number; segnalazioniAperte: number }
  | { stato: "errore" };

export const MODULO_VUOTO: ModuloAusiliario = {
  nome: "",
  cognome: "",
  email: "",
  password: "",
  ente: "",
};

/** Un messaggio per ogni campo da correggere; la password solo in creazione (decisione D1). */
export function validaModuloAusiliario(
  dati: ModuloAusiliario,
  modalita: Modalita,
): Partial<Record<CampoModulo, string>> {
  const errori: Partial<Record<CampoModulo, string>> = {};
  if (dati.nome.trim() === "") {
    errori.nome = "Inserisci il nome.";
  }
  if (dati.cognome.trim() === "") {
    errori.cognome = "Inserisci il cognome.";
  }
  const email = validaEmail(dati.email);
  if (email) {
    errori.email = email;
  }
  if (modalita === "creazione") {
    const password = validaPasswordNuova(dati.password);
    if (password) {
      errori.password = password;
    }
  }
  if (dati.ente === "") {
    errori.ente = "Scegli l'ente.";
  }
  return errori;
}

/** Corpo di POST /api/admin/ausiliari (creazione) o PUT /api/admin/ausiliari/<id> (modifica). */
export function corpoAusiliario(
  dati: ModuloAusiliario,
  modalita: Modalita,
): { nome: string; cognome: string; email: string; ente: number; password?: string } {
  const corpo = {
    nome: dati.nome.trim(),
    cognome: dati.cognome.trim(),
    email: dati.email,
    ente: Number(dati.ente),
  };
  return modalita === "creazione" ? { ...corpo, password: dati.password } : corpo;
}

/** Modulo già compilato per la modifica (UC_ADM_2 passo 4), senza password. */
export function moduloDa(ausiliario: AusiliarioDellElenco): ModuloAusiliario {
  return {
    nome: ausiliario.nome,
    cognome: ausiliario.cognome,
    email: ausiliario.email,
    password: "",
    ente: String(ausiliario.enteId),
  };
}

/** Un gruppo per ente, nell'ordine di arrivo (le API ordinano già per ente, cognome e nome). */
export function raggruppaPerEnte(
  ausiliari: readonly AusiliarioDellElenco[],
): { enteId: number; ente: string; ausiliari: AusiliarioDellElenco[] }[] {
  const gruppi: { enteId: number; ente: string; ausiliari: AusiliarioDellElenco[] }[] = [];
  for (const ausiliario of ausiliari) {
    let gruppo = gruppi.find((g) => g.enteId === ausiliario.enteId);
    if (!gruppo) {
      gruppo = { enteId: ausiliario.enteId, ente: ausiliario.ente, ausiliari: [] };
      gruppi.push(gruppo);
    }
    gruppo.ausiliari.push(ausiliario);
  }
  return gruppi;
}

/** Righe della tabella della panoramica: tre celle per ente, secondo lo stato del riepilogo. */
export function righePanoramica(
  enti: readonly { id: number; nome: string }[],
  riepiloghi: ReadonlyMap<number, RiepilogoCaricato>,
): { id: number; ente: string; celle: [string, string, string] }[] {
  return enti.map((ente) => {
    const r = riepiloghi.get(ente.id) ?? { stato: "caricamento" };
    const celle: [string, string, string] =
      r.stato === "pronto"
        ? [String(r.stalliGestiti), String(r.sosteAttive), String(r.segnalazioniAperte)]
        : r.stato === "errore"
          ? ["Non disponibile", "Non disponibile", "Non disponibile"]
          : ["Caricamento…", "Caricamento…", "Caricamento…"];
    return { id: ente.id, ente: ente.nome, celle };
  });
}

/** Errori del modulo dell'Ausiliario mostrati accanto al campo; gli altri sull'avviso generale. */
export const CAMPI_AUSILIARIO: Readonly<Record<string, string>> = {
  EMAIL_NON_VALIDA: "email",
  EMAIL_GIA_REGISTRATA: "email",
  PASSWORD_TROPPO_CORTA: "password",
  ENTE_INESISTENTE: "ente",
  CAMBIO_ENTE_NON_CONSENTITO: "ente",
};

/** Errori della disattivazione mostrati accanto all'Ausiliario (UC_ADM_2 3.a2). */
export const CAMPI_DISATTIVAZIONE: Readonly<Record<string, string>> = {
  AUSILIARIO_CON_SEGNALAZIONI_PRESE_IN_CARICO: "riga",
  AUSILIARIO_GIA_DISATTIVATO: "riga",
  AUSILIARIO_INESISTENTE: "riga",
};
