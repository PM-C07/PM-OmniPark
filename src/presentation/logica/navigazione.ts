// Navigazione per ruolo (OMP-57, docs/test/cp_navigazioneRuoli.md).
// Usato anche da src/proxy.ts: deve restare puro, senza import di React né di codice client.

export type Ruolo = "AUTOMOBILISTA" | "AUSILIARIO_DEL_TRAFFICO" | "AMMINISTRATORE";

const SCHERMATA_INIZIALE: Readonly<Record<Ruolo, string>> = {
  AUTOMOBILISTA: "/mappa",
  AUSILIARIO_DEL_TRAFFICO: "/ausiliario",
  AMMINISTRATORE: "/admin",
};

/** Percorso dell'area → ruolo che la può aprire. */
const AREE: readonly (readonly [string, Ruolo])[] = [
  ["/mappa", "AUTOMOBILISTA"],
  ["/profilo", "AUTOMOBILISTA"],
  ["/ausiliario", "AUSILIARIO_DEL_TRAFFICO"],
  ["/admin", "AMMINISTRATORE"],
];

const MENU: Readonly<Record<Ruolo, readonly { etichetta: string; percorso: string }[]>> = {
  AUTOMOBILISTA: [
    { etichetta: "Mappa", percorso: "/mappa" },
    { etichetta: "Profilo", percorso: "/profilo" },
  ],
  AUSILIARIO_DEL_TRAFFICO: [{ etichetta: "Segnalazioni", percorso: "/ausiliario" }],
  AMMINISTRATORE: [
    { etichetta: "Panoramica enti", percorso: "/admin" },
    { etichetta: "Gestione Ausiliari", percorso: "/admin/ausiliari" },
  ],
};

// Solo percorsi interni con caratteri sicuri: niente schema, host, query o punti.
const PERCORSO_INTERNO = /^\/(?![/\\])[A-Za-z0-9/_-]*$/;

function eRuolo(ruolo: string): ruolo is Ruolo {
  return Object.hasOwn(SCHERMATA_INIZIALE, ruolo);
}

/** Schermata iniziale del ruolo (UC_AUTH_4 passo 3); /accesso per un ruolo sconosciuto. */
export function schermataIniziale(ruolo: string): string {
  return eRuolo(ruolo) ? SCHERMATA_INIZIALE[ruolo] : "/accesso";
}

/** Ruolo dell'area a cui appartiene il percorso, null se il percorso non è di un'area. */
export function ruoloDellArea(percorso: string): Ruolo | null {
  for (const [area, ruolo] of AREE) {
    if (percorso === area || percorso.startsWith(`${area}/`)) {
      return ruolo;
    }
  }
  return null;
}

/** ?da= solo se è un percorso interno di un'area del ruolo; altrimenti la schermata iniziale. */
export function destinazioneDopoAccesso(ruolo: string, da: string | null): string {
  if (da && PERCORSO_INTERNO.test(da) && ruoloDellArea(da) === ruolo) {
    return da;
  }
  return schermataIniziale(ruolo);
}

export function vociDiMenu(ruolo: string): { etichetta: string; percorso: string }[] {
  return eRuolo(ruolo) ? MENU[ruolo].map((voce) => ({ ...voce })) : [];
}

export function etichettaRuolo(ruolo: string, ente: number | null): string {
  switch (ruolo) {
    case "AUTOMOBILISTA":
      return "Automobilista";
    case "AUSILIARIO_DEL_TRAFFICO":
      return ente === null ? "Ausiliario del Traffico" : `Ausiliario del Traffico · ente ${ente}`;
    case "AMMINISTRATORE":
      return "Amministratore";
    default:
      return "Utente";
  }
}

/** Pagina di accesso con il ritorno alla pagina corrente dopo l'accesso. */
export function indirizzoDiAccesso(percorsoCorrente: string): string {
  return `/accesso?da=${encodeURIComponent(percorsoCorrente)}`;
}
