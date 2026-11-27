// Formato di importi e orari nell'interfaccia (OMP-58, docs/test/cp_formatoImporti.md): gli importi
// arrivano dalle API in centesimi interi e si mostrano in euro con Intl it-IT (decisione D4); gli
// orari si mostrano nel fuso di Roma, qualunque sia quello del dispositivo. formattaDataOra arriva
// dalla mappa delle segnalazioni (OMP-59) con la OMP-65, che la usa anche nella cronologia del wallet.

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
