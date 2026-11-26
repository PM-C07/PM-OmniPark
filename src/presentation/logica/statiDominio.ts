// Testo e tono degli stati per BadgeStato (OMP-57, docs/test/cp_statiDominio.md): il badge mostra
// sempre un testo, mai solo un colore (NRF_USA_1). Stati da SCD_1, SCD_2 e SCD_3; stati dell'account
// dell'Ausiliario da StatoAccount del class diagram (OMP-62).

export type TipoStato = "stallo" | "sosta" | "segnalazione" | "account";
// viola (OMP-59): solo per il motivo «targa non corrispondente», distinto dal blu di «Presa in carico».
export type Tono = "verde" | "rosso" | "arancione" | "grigio" | "blu" | "viola";

const STATI: Readonly<Record<TipoStato, Readonly<Record<string, { testo: string; tono: Tono }>>>> =
  {
    stallo: {
      LIBERO: { testo: "Libero", tono: "verde" },
      OCCUPATO: { testo: "Occupato", tono: "rosso" },
      NON_DISPONIBILE: { testo: "Non disponibile", tono: "arancione" },
      SCONOSCIUTO: { testo: "Sconosciuto", tono: "grigio" },
    },
    sosta: {
      ATTIVA: { testo: "Attiva", tono: "verde" },
      SCADUTA: { testo: "Scaduta", tono: "arancione" },
      TERMINATA: { testo: "Terminata", tono: "grigio" },
    },
    segnalazione: {
      APERTA: { testo: "Aperta", tono: "rosso" },
      PRESA_IN_CARICO: { testo: "Presa in carico", tono: "blu" },
      CHIUSA: { testo: "Chiusa", tono: "grigio" },
    },
    account: {
      ATTIVO: { testo: "Attivo", tono: "verde" },
      DISATTIVATO: { testo: "Disattivato", tono: "grigio" },
    },
  };

export function descriviStato(tipo: TipoStato, stato: string): { testo: string; tono: Tono } {
  const stati = STATI[tipo];
  return stati && Object.hasOwn(stati, stato)
    ? { ...stati[stato] }
    : { testo: "Stato non riconosciuto", tono: "grigio" };
}
