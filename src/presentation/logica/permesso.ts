// Logica del passaggio del permesso negli stalli riservati (OMP-61, docs/test/cp_avvioInterfaccia.md,
// RF_SOSTA_5, UC_SOSTA_5): quali stalli lo chiedono, testo della dichiarazione, controllo anticipato
// della foto e dimensioni della foto ridotta nel browser (decisione D5). Il server resta l'autorità:
// riconosce il formato dai primi byte e rifiuta le foto oltre 2 MB.

/** Limite della foto, uguale a quello di Gestione soste (2 MB). */
export const FOTO_MASSIMA = 2 * 1024 * 1024;

/** Lato maggiore della foto ridotta nel browser, in pixel (decisione D5). */
export const LATO_MASSIMO = 1600;

const DICHIARAZIONE: Readonly<Record<string, string>> = {
  DISABILI: "Dichiaro di esporre sul veicolo il contrassegno per persone con disabilità.",
  ROSA: "Dichiaro di esporre sul veicolo il permesso rosa.",
};

const FORMATI_AMMESSI: readonly string[] = ["image/jpeg", "image/png"];

/** Gli stalli riservati a permesso esposto (VD_8) chiedono dichiarazione e foto. */
export function richiedePermesso(tipoDiStallo: string): boolean {
  return Object.hasOwn(DICHIARAZIONE, tipoDiStallo);
}

/** Dichiarazione del permesso previsto per il tipo di stallo (RF_SOSTA_5), oppure null. */
export function testoDichiarazione(tipoDiStallo: string): string | null {
  return Object.hasOwn(DICHIARAZIONE, tipoDiStallo) ? DICHIARAZIONE[tipoDiStallo] : null;
}

/** Controllo anticipato della foto già ridotta: il messaggio d'errore, oppure null. */
export function verificaFotoPermesso(foto: { tipo: string; dimensione: number }): string | null {
  if (foto.dimensione === 0) {
    return "Scatta o scegli la foto del permesso esposto.";
  }
  if (!FORMATI_AMMESSI.includes(foto.tipo)) {
    return "La foto deve essere un'immagine JPEG o PNG.";
  }
  if (foto.dimensione > FOTO_MASSIMA) {
    return "La foto supera 2 MB: scegline una più leggera.";
  }
  return null;
}

/** Dimensioni con il lato maggiore al massimo LATO_MASSIMO, nelle stesse proporzioni; mai ingrandite. */
export function dimensioniRidotte(
  larghezza: number,
  altezza: number,
): { larghezza: number; altezza: number } {
  const lato = Math.max(larghezza, altezza);
  if (lato <= LATO_MASSIMO) {
    return { larghezza, altezza };
  }
  const fattore = LATO_MASSIMO / lato;
  return { larghezza: Math.round(larghezza * fattore), altezza: Math.round(altezza * fattore) };
}
