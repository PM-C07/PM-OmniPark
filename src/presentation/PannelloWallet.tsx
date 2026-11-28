"use client";
// Wallet del profilo (MU_3, UC_WALLET_3 per saldo e cronologia, UC_WALLET_1 per la ricarica): saldo
// in evidenza da GET /api/wallet, ricarica con i tagli previsti e, dalla OMP-65 (COD-24), la sezione
// «Movimenti», aggiornata dopo ogni ricarica approvata.
import { useEffect, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { formattaEuro } from "./logica/importi.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import { MovimentiWallet } from "./MovimentiWallet.tsx";
import { idTaglioRicarica, Ricarica } from "./Ricarica.tsx";
import { vaiAllAccesso } from "./vaiAllAccesso.ts";

export function PannelloWallet() {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  // Cresce a ogni ricarica approvata: la sezione «Movimenti» rilegge la cronologia.
  const [versioneMovimenti, setVersioneMovimenti] = useState(0);

  useEffect(() => {
    let attivo = true;
    // richiediWallet() di SD_WALLET_3, saldo; i movimenti li legge MovimentiWallet.
    void chiamaApi("/api/wallet", { method: "GET" }, {}).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        vaiAllAccesso("/profilo");
      } else if (esito.esito === "successo") {
        setSaldo((esito.dati as { saldo: number }).saldo);
      } else {
        setErrore("I dati del wallet non sono disponibili. Riprova più tardi.");
      }
    });
    return () => {
      attivo = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {errore ? <Avviso tipo="errore">{errore}</Avviso> : null}
      <div>
        <p className="text-sm text-zinc-800">Saldo disponibile</p>
        <p className="text-3xl font-bold text-zinc-900" aria-live="polite">
          {saldo === null ? (errore ? "—" : "Caricamento…") : formattaEuro(saldo)}
        </p>
      </div>
      <Ricarica
        idTitolo="titolo-ricarica-profilo"
        onRicaricata={(nuovoSaldo, importo) => {
          setSaldo(nuovoSaldo);
          setVersioneMovimenti((v) => v + 1);
          // «Conferma la ricarica» esce dalla pagina: il focus va sul taglio ricaricato (OMP-68,
          // WCAG 2.4.3); il messaggio con il nuovo saldo resta sopra i tagli.
          requestAnimationFrame(() =>
            document.getElementById(idTaglioRicarica("titolo-ricarica-profilo", importo))?.focus(),
          );
        }}
        onSessioneScaduta={() => vaiAllAccesso("/profilo")}
      />
      <MovimentiWallet versione={versioneMovimenti} />
    </div>
  );
}
