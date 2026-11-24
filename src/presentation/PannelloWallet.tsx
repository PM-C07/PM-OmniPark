"use client";
// Wallet del profilo (MU_3, UC_WALLET_3 per il saldo, UC_WALLET_1 per la ricarica): saldo in
// evidenza da GET /api/wallet e ricarica con i tagli previsti. La cronologia arriva con COD-23.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avviso } from "./Avviso.tsx";
import { formattaEuro } from "./logica/importi.ts";
import { indirizzoDiAccesso } from "./logica/navigazione.ts";
import { chiamaApi } from "./logica/risposteApi.ts";
import { Ricarica } from "./Ricarica.tsx";

export function PannelloWallet() {
  const router = useRouter();
  const [saldo, setSaldo] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    // richiediWallet() di SD_WALLET_3: solo il saldo.
    void chiamaApi("/api/wallet", { method: "GET" }, {}).then((esito) => {
      if (!attivo) {
        return;
      }
      if (esito.esito === "sessioneScaduta") {
        router.replace(indirizzoDiAccesso("/profilo"));
      } else if (esito.esito === "successo") {
        setSaldo((esito.dati as { saldo: number }).saldo);
      } else {
        setErrore("I dati del wallet non sono disponibili. Riprova più tardi.");
      }
    });
    return () => {
      attivo = false;
    };
  }, [router]);

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
        onRicaricata={setSaldo}
        onSessioneScaduta={() => router.replace(indirizzoDiAccesso("/profilo"))}
      />
    </div>
  );
}
