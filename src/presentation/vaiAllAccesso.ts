// Ritorno alla pagina di accesso con sessione scaduta o uscita (OMP-59). Caricamento completo e non
// router.replace: con cacheComponents Next conserva le pagine visitate con <Activity> e il loro
// stato (node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md); dopo l'uscita o la
// scadenza non deve restare nulla dell'utente precedente. replace: «Indietro» non riporta alla
// pagina protetta.
import { indirizzoDiAccesso } from "./logica/navigazione.ts";

/** Con `ritorno` torna lì dopo il nuovo accesso (?da=); senza, /accesso semplice. */
export function vaiAllAccesso(ritorno?: string): void {
  window.location.replace(ritorno === undefined ? "/accesso" : indirizzoDiAccesso(ritorno));
}
