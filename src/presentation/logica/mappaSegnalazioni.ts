// Logica della mappa delle segnalazioni (OMP-59, docs/test/cp_mappaSegnalazioni.md): motivo in
// testo, colore e simbolo, ordinamento dalla più recente, applicazione delle variazioni del
// polling, chiuse localmente, passi della chiusura (SD_OP_4) e risposta alla chiusura. La
// segnalazione è una possibile sosta irregolare, mai una sanzione (RD_10).
// Nessuna dipendenza da React, da Leaflet né dai sottosistemi.
import type { ElementoMappa } from "./mappaStalli.ts";
import type { EsitoRisposta } from "./risposteApi.ts";
import { descriviStato, type Tono } from "./statiDominio.ts";

/** Una segnalazione come arriva da GET /api/ausiliario/segnalazioni e …/modifiche. */
export type SegnalazioneDellaMappa = {
  id: number;
  stalloId: number;
  numeroStallo: number;
  latitudine: number;
  longitudine: number;
  stato: string;
  motivo: string | null;
  targaRilevata: string | null;
  dataEOraDellaLettura: string | null;
  ausiliarioId: number | null;
  ultimaModifica: string;
};

export type Esito = "SOSTA_IRREGOLARE_ACCERTATA" | "NON_CONFERMATA";

export type StatoChiusura =
  { fase: "inattiva" } | { fase: "daConfermare"; esito: Esito } | { fase: "inInvio"; esito: Esito };

export type EventoChiusura =
  { tipo: "indicaEsito"; esito: Esito } | { tipo: "annulla" } | { tipo: "conferma" };

export type EsitoChiusura =
  | { tipo: "chiusa" }
  | { tipo: "nonChiudibile"; messaggio: string; rimuovi: boolean }
  | { tipo: "sessioneScaduta" }
  | { tipo: "errore"; messaggio: string };

const MOTIVI: Readonly<Record<string, { testo: string; tono: Tono; simbolo: string }>> = {
  SOSTA_ASSENTE: { testo: "Sosta assente", tono: "rosso", simbolo: "!" },
  SOSTA_SCADUTA: { testo: "Sosta scaduta", tono: "arancione", simbolo: "⏱" },
  TARGA_NON_CORRISPONDENTE: { testo: "Targa non corrispondente", tono: "viola", simbolo: "≠" },
};

/** Motivo in testo, tono e simbolo: il colore non è mai l'unica informazione (NRF_USA_1). */
export function descriviMotivo(motivo: string | null): {
  testo: string;
  tono: Tono;
  simbolo: string;
} {
  if (motivo === null) {
    return { testo: "Motivo non indicato", tono: "grigio", simbolo: "?" };
  }
  return Object.hasOwn(MOTIVI, motivo)
    ? { ...MOTIVI[motivo] }
    : { testo: "Motivo non riconosciuto", tono: "grigio", simbolo: "?" };
}

const SIMBOLO_STATO: Readonly<Record<string, string>> = {
  APERTA: "○",
  PRESA_IN_CARICO: "◐",
};

export const GRUPPO_SEGNALAZIONI = "Segnalazioni aperte e prese in carico";

/** Elemento della mappa: colore e simbolo del motivo, simbolo dello stato, etichetta accessibile. */
export function elementoDellaSegnalazione(segnalazione: SegnalazioneDellaMappa): ElementoMappa {
  const motivo = descriviMotivo(segnalazione.motivo);
  const stato = descriviStato("segnalazione", segnalazione.stato);
  const targa =
    segnalazione.targaRilevata === null ? "targa non letta" : `targa ${segnalazione.targaRilevata}`;
  return {
    id: segnalazione.id,
    latitudine: segnalazione.latitudine,
    longitudine: segnalazione.longitudine,
    tono: motivo.tono,
    simbolo: motivo.simbolo,
    simboloStato: Object.hasOwn(SIMBOLO_STATO, segnalazione.stato)
      ? SIMBOLO_STATO[segnalazione.stato]
      : "?",
    etichetta: `Possibile sosta irregolare, stallo n. ${segnalazione.numeroStallo}, ${motivo.testo}, ${targa}, ${stato.testo}`,
    gruppo: GRUPPO_SEGNALAZIONI,
  };
}

/** Legenda della mappa delle segnalazioni: motivi (colore e simbolo) e stati (simbolo). */
export const LEGENDA_SEGNALAZIONI = [
  { tono: "rosso", simbolo: "!", testo: "Sosta assente" },
  { tono: "arancione", simbolo: "⏱", testo: "Sosta scaduta" },
  { tono: "viola", simbolo: "≠", testo: "Targa non corrispondente" },
  { tono: "grigio", simbolo: "?", testo: "Motivo non indicato o non riconosciuto" },
  { simbolo: "○", testo: "Aperta" },
  { simbolo: "◐", testo: "Presa in carico" },
] as const satisfies readonly { tono?: Tono; simbolo: string; testo: string }[];

/** Esiti della chiusura (UC_OP_4 passo 3). */
export const ESITI: Readonly<Record<Esito, string>> = {
  SOSTA_IRREGOLARE_ACCERTATA: "Sosta irregolare accertata",
  NON_CONFERMATA: "Non confermata",
};

function confrontaDallaPiuRecente(a: SegnalazioneDellaMappa, b: SegnalazioneDellaMappa): number {
  const la = a.dataEOraDellaLettura === null ? null : Date.parse(a.dataEOraDellaLettura);
  const lb = b.dataEOraDellaLettura === null ? null : Date.parse(b.dataEOraDellaLettura);
  if (la !== lb) {
    if (la === null) {
      return 1;
    }
    if (lb === null) {
      return -1;
    }
    return lb - la;
  }
  return b.id - a.id;
}

/** Dalla lettura più recente; letture assenti in fondo; a parità dall'id più alto. Array nuovo. */
export function ordinaDallaPiuRecente(
  segnalazioni: readonly SegnalazioneDellaMappa[],
): readonly SegnalazioneDellaMappa[] {
  return [...segnalazioni].sort(confrontaDallaPiuRecente);
}

function segnalazioniUguali(a: SegnalazioneDellaMappa, b: SegnalazioneDellaMappa): boolean {
  return (
    a.id === b.id &&
    a.stalloId === b.stalloId &&
    a.numeroStallo === b.numeroStallo &&
    a.latitudine === b.latitudine &&
    a.longitudine === b.longitudine &&
    a.stato === b.stato &&
    a.motivo === b.motivo &&
    a.targaRilevata === b.targaRilevata &&
    a.dataEOraDellaLettura === b.dataEOraDellaLettura &&
    a.ausiliarioId === b.ausiliarioId &&
    a.ultimaModifica === b.ultimaModifica
  );
}

/**
 * Variazioni ricevute dal polling: una riga non CHIUSA sostituisce o aggiunge per id, una riga
 * CHIUSA rimuove (da chiunque sia stata chiusa). Non confronta ultimaModifica. Stesso array se il
 * contenuto non cambia; altrimenti ordinato dalla più recente.
 */
export function applicaModificheSegnalazioni(
  attuali: readonly SegnalazioneDellaMappa[],
  righe: readonly SegnalazioneDellaMappa[],
): readonly SegnalazioneDellaMappa[] {
  if (righe.length === 0) {
    return attuali;
  }
  const perId = new Map(attuali.map((s) => [s.id, s]));
  let cambiato = false;
  for (const riga of righe) {
    const presente = perId.get(riga.id);
    if (riga.stato === "CHIUSA") {
      if (presente) {
        perId.delete(riga.id);
        cambiato = true;
      }
    } else if (!presente || !segnalazioniUguali(presente, riga)) {
      perId.set(riga.id, riga);
      cambiato = true;
    }
  }
  return cambiato ? ordinaDallaPiuRecente([...perId.values()]) : attuali;
}

/**
 * Le segnalazioni chiuse da questa interfaccia non ricompaiono finché non arriva la loro riga
 * CHIUSA: le altre righe di quegli id si scartano; con la riga CHIUSA l'id esce dall'insieme.
 */
export function scartaChiuseLocalmente(
  righe: readonly SegnalazioneDellaMappa[],
  chiuse: ReadonlySet<number>,
): { righe: readonly SegnalazioneDellaMappa[]; chiuse: ReadonlySet<number> } {
  if (chiuse.size === 0) {
    return { righe, chiuse };
  }
  const tenute: SegnalazioneDellaMappa[] = [];
  let nuove: Set<number> | null = null;
  for (const riga of righe) {
    if (!chiuse.has(riga.id)) {
      tenute.push(riga);
    } else if (riga.stato === "CHIUSA") {
      tenute.push(riga);
      nuove ??= new Set(chiuse);
      nuove.delete(riga.id);
    }
  }
  return {
    righe: tenute.length === righe.length ? righe : tenute,
    chiuse: nuove ?? chiuse,
  };
}

/** Passi della chiusura (SD_OP_4): indicaEsito → conferma (registraEsito) oppure annulla (3.a1). */
export function passoChiusura(
  segnalazione: number,
  stato: StatoChiusura,
  evento: EventoChiusura,
): { stato: StatoChiusura; richiesta: { url: string; corpo: { esito: Esito } } | null } {
  switch (evento.tipo) {
    case "indicaEsito":
      return stato.fase === "inInvio"
        ? { stato, richiesta: null }
        : { stato: { fase: "daConfermare", esito: evento.esito }, richiesta: null };
    case "annulla":
      return stato.fase === "daConfermare"
        ? { stato: { fase: "inattiva" }, richiesta: null }
        : { stato, richiesta: null };
    case "conferma":
      return stato.fase === "daConfermare"
        ? {
            stato: { fase: "inInvio", esito: stato.esito },
            richiesta: {
              url: `/api/segnalazioni/${segnalazione}/chiusura`,
              corpo: { esito: stato.esito },
            },
          }
        : { stato, richiesta: null };
  }
}

/** Codici della chiusura → campo, per interpretaRisposta / chiamaApi. */
export const CAMPI_CHIUSURA: Readonly<Record<string, string>> = {
  SEGNALAZIONE_GIA_CHIUSA: "giaChiusa",
  SEGNALAZIONE_PRESA_DA_ALTRI: "presaDaAltri",
};

/** Risposta di POST /api/segnalazioni/<id>/chiusura (confermaChiusura, segnalaNonChiudibile). */
export function rispostaAllaChiusura(esito: EsitoRisposta): EsitoChiusura {
  switch (esito.esito) {
    case "successo":
      return { tipo: "chiusa" };
    case "sessioneScaduta":
      return { tipo: "sessioneScaduta" };
    case "errore":
      if (esito.campo === "giaChiusa") {
        return { tipo: "nonChiudibile", messaggio: esito.messaggio, rimuovi: true };
      }
      if (esito.campo === "presaDaAltri") {
        return { tipo: "nonChiudibile", messaggio: esito.messaggio, rimuovi: false };
      }
      return { tipo: "errore", messaggio: esito.messaggio };
  }
}

const DATA_ORA = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Rome",
});

/** Istante ISO 8601 → «20/11/2026 09:00» nel fuso Europe/Rome; null → «Non disponibile». */
export function formattaDataOra(istante: string | null): string {
  if (istante === null) {
    return "Non disponibile";
  }
  const parti = Object.fromEntries(
    DATA_ORA.formatToParts(new Date(istante)).map((parte) => [parte.type, parte.value]),
  );
  return `${parti.day}/${parti.month}/${parti.year} ${parti.hour}:${parti.minute}`;
}

export type Chiudibilita = { chiudibile: true } | { chiudibile: false; messaggio: string };

/**
 * statoEAssegnatario prima dell'esito (UC_OP_4 passo 2 e 2.a1): non chiudibile solo se è presa in
 * carico da un altro Ausiliario noto. Senza dati certi decide il server (409 al POST).
 */
export function chiudibilitaPer(
  segnalazione: SegnalazioneDellaMappa,
  utente: number | null,
): Chiudibilita {
  if (
    segnalazione.stato === "PRESA_IN_CARICO" &&
    utente !== null &&
    segnalazione.ausiliarioId !== null &&
    segnalazione.ausiliarioId !== utente
  ) {
    return { chiudibile: false, messaggio: "Presa in carico da un altro Ausiliario." };
  }
  return { chiudibile: true };
}

export type Messaggio = { tipo: "successo" | "errore"; testo: string };

export type AzioneDopoLaChiusura = {
  rimuovi: boolean;
  tornaAllaMappa: boolean;
  accesso: boolean;
  messaggioMappa: Messaggio | null;
  messaggioScheda: string | null;
};

/** Cosa fa la mappa dopo la risposta alla chiusura (UC_OP_4 passo 4 e 2.a1, np_02). */
export function azioneDopoLaChiusura(
  esito: EsitoChiusura,
  numeroStallo: number,
): AzioneDopoLaChiusura {
  const nessuna = {
    rimuovi: false,
    tornaAllaMappa: false,
    accesso: false,
    messaggioMappa: null,
    messaggioScheda: null,
  };
  switch (esito.tipo) {
    case "chiusa":
      return {
        ...nessuna,
        rimuovi: true,
        tornaAllaMappa: true,
        messaggioMappa: {
          tipo: "successo",
          testo: `Segnalazione dello stallo n. ${numeroStallo} chiusa: esito registrato.`,
        },
      };
    case "nonChiudibile":
      return {
        ...nessuna,
        rimuovi: esito.rimuovi,
        tornaAllaMappa: true,
        messaggioMappa: { tipo: "errore", testo: esito.messaggio },
      };
    case "sessioneScaduta":
      return { ...nessuna, accesso: true };
    case "errore":
      return { ...nessuna, messaggioScheda: esito.messaggio };
  }
}

/** Id dell'utente dal corpo di GET /api/auth/io; forma non valida → null (utente non noto). */
export function utenteDaRisposta(dati: unknown): number | null {
  if (typeof dati !== "object" || dati === null) {
    return null;
  }
  const utente = (dati as { utente?: unknown }).utente;
  if (typeof utente !== "object" || utente === null) {
    return null;
  }
  const id = (utente as { id?: unknown }).id;
  return typeof id === "number" && Number.isInteger(id) ? id : null;
}
