// Formato di importi e orari nell'interfaccia (OMP-58, docs/test/cp_formatoImporti.md): gli importi
// arrivano dalle API in centesimi interi e si mostrano in euro con Intl it-IT (decisione D4); gli
// orari si mostrano nel fuso di Roma, qualunque sia quello del dispositivo.

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const ORA = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/** Centesimi → «3,00 €» (spazio indivisibile prima di €). */
export function formattaEuro(centesimi: number): string {
  return EURO.format(centesimi / 100);
}

/** Istante ISO 8601 o Date → «10:42» nel fuso Europe/Rome. */
export function formattaOra(istante: string | Date): string {
  return ORA.format(typeof istante === "string" ? new Date(istante) : istante);
}
