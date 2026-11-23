// Errori di dominio del sottosistema Wallet, con i codici delle specifiche
// docs/test/cp_saldo.md, cp_ricarica.md e cp_addebito.md.

export type CodiceErroreWallet =
  | "WALLET_NON_TROVATO"
  | "IMPORTO_NON_PREVISTO"
  | "PAGAMENTO_RIFIUTATO"
  | "CREDITO_INSUFFICIENTE"
  | "IMPORTO_NON_VALIDO"
  | "SOSTA_NON_ADDEBITABILE";

const MESSAGGI: Readonly<Record<CodiceErroreWallet, string>> = {
  WALLET_NON_TROVATO: "Il wallet non è stato trovato.",
  IMPORTO_NON_PREVISTO: "Puoi ricaricare solo 5, 10 o 20 €.",
  PAGAMENTO_RIFIUTATO: "Il pagamento è stato rifiutato. Il saldo non è cambiato.",
  CREDITO_INSUFFICIENTE: "Il credito del wallet non è sufficiente.",
  IMPORTO_NON_VALIDO: "L'importo non è valido.",
  SOSTA_NON_ADDEBITABILE: "Questa sosta non può essere addebitata sul wallet.",
};

export class ErroreWallet extends Error {
  readonly codice: CodiceErroreWallet;

  constructor(codice: CodiceErroreWallet, opzioni?: { cause?: unknown }) {
    super(MESSAGGI[codice], opzioni);
    this.name = "ErroreWallet";
    this.codice = codice;
  }
}
