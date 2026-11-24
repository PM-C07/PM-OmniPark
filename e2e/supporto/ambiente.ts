// Ambiente dei test di sistema (OMP-60, docs/test/test_di_sistema.md §2): indirizzo di destinazione
// con la guardia contro la produzione e variabili d'ambiente. Nessun valore è scritto nel repository
// e il file .env non viene letto.

/** Dominio di produzione: i test non devono mai partire contro di esso. */
export const DOMINIO_PRODUZIONE = "omnipark-two.vercel.app";

/**
 * Parti fisse degli alias di branch delle anteprime Vercel:
 * `<progetto>-git-<branch>-<scope>.vercel.app`. Vercel accorcia il branch (e aggiunge un hash) se
 * l'etichetta supererebbe 63 caratteri: la parte centrale può quindi non essere il nome completo.
 */
export const ALIAS_DI_BRANCH = { progetto: "omnipark", scope: "lruocco22s-projects" } as const;

const DOMINIO_VERCEL = ".vercel.app";
const LUNGHEZZA_MASSIMA_ETICHETTA = 63;
const HOST_LOCALI = new Set(["localhost", "127.0.0.1"]);
const SEGMENTO_BRANCH = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const URL_PREDEFINITO = "http://localhost:3000";
export const ANTICIPO_PREDEFINITO_MS = 1000;

export type Verifica =
  | { consentita: true; origine: string; tipo: "locale" | "anteprima" }
  | { consentita: false; motivo: string };

function rifiuta(motivo: string): Verifica {
  return { consentita: false, motivo };
}

/** Controlla l'indirizzo dei test: solo locale o alias di branch di un'anteprima (mai `main`). */
export function verificaDestinazione(
  indirizzo: string,
  alias: { progetto: string; scope: string } = ALIAS_DI_BRANCH,
): Verifica {
  let url: URL;
  try {
    url = new URL(indirizzo);
  } catch {
    return rifiuta("l'indirizzo non è un URL valido.");
  }
  if (url.username || url.password) {
    return rifiuta("l'indirizzo non deve contenere credenziali.");
  }
  const host = url.hostname;
  if (host === DOMINIO_PRODUZIONE) {
    return rifiuta(`${DOMINIO_PRODUZIONE} è la produzione: i test si eseguono sull'anteprima.`);
  }
  if (HOST_LOCALI.has(host)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return rifiuta("protocollo non ammesso.");
    }
    return { consentita: true, origine: url.origin, tipo: "locale" };
  }
  if (!host.endsWith(DOMINIO_VERCEL)) {
    return rifiuta(`host ${host} non ammesso: usa l'alias di branch dell'anteprima o localhost.`);
  }
  if (url.protocol !== "https:") {
    return rifiuta("le anteprime si raggiungono solo in https.");
  }
  const etichetta = host.slice(0, -DOMINIO_VERCEL.length);
  if (etichetta.includes(".") || etichetta.length > LUNGHEZZA_MASSIMA_ETICHETTA) {
    return rifiuta(`host ${host} non è un alias di branch.`);
  }
  if (etichetta.includes("-git-main-")) {
    return rifiuta("l'alias del branch main punta alla produzione.");
  }
  const prefisso = `${alias.progetto}-git-`;
  const suffisso = `-${alias.scope}`;
  const branch =
    etichetta.startsWith(prefisso) && etichetta.endsWith(suffisso)
      ? etichetta.slice(prefisso.length, etichetta.length - suffisso.length)
      : "";
  if (!SEGMENTO_BRANCH.test(branch) || branch === "main") {
    return rifiuta(
      `host ${host} non è un alias di branch di un'anteprima (${prefisso}<branch>${suffisso}${DOMINIO_VERCEL}): i link unici dei deploy non si distinguono da quelli di produzione.`,
    );
  }
  return { consentita: true, origine: url.origin, tipo: "anteprima" };
}

type Ambiente = Readonly<Record<string, string | undefined>>;

/** Indirizzo dei test: OMNIPARK_E2E_URL, altrimenti l'app locale. */
export function urlDiDestinazione(ambiente: Ambiente): string {
  return ambiente.OMNIPARK_E2E_URL?.trim() || URL_PREDEFINITO;
}

/** Valore di una variabile obbligatoria; il messaggio non mostra mai valori. */
export function variabileObbligatoria(ambiente: Ambiente, nome: string): string {
  const valore = ambiente[nome];
  if (!valore) {
    throw new Error(
      `Variabile d'ambiente ${nome} non impostata: vedi docs/test/test_di_sistema.md §2.`,
    );
  }
  return valore;
}

/** Millisecondi sottratti al dataOra inviato dai simulatori (orologio del PC in anticipo). */
export function anticipoMs(ambiente: Ambiente): number {
  const testo = ambiente.OMNIPARK_E2E_ANTICIPO_MS;
  if (testo === undefined || testo === "") {
    return ANTICIPO_PREDEFINITO_MS;
  }
  const valore = Number(testo);
  if (!Number.isSafeInteger(valore) || valore < 0) {
    throw new Error("OMNIPARK_E2E_ANTICIPO_MS deve essere un intero non negativo.");
  }
  return valore;
}
