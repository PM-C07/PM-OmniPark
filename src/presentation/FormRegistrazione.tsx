"use client";
// Form di registrazione dell'Automobilista (UC_AUTH_1, MU_1, SC_UT_1: email, password, targa):
// controllo lato client, invio a POST /api/auth/registrazione e mappa degli stalli già collegati.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { Campo } from "./Campo.tsx";
import { schermataIniziale } from "./logica/navigazione.ts";
import { CAMPI_REGISTRAZIONE, chiamaApi } from "./logica/risposteApi.ts";
import { validaRegistrazione } from "./logica/validazione.ts";

type Errori = Partial<Record<"email" | "password" | "targa" | "generale", string>>;

const ORDINE_CAMPI = ["email", "password", "targa"] as const;

export function FormRegistrazione() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [targa, setTarga] = useState("");
  const [errori, setErrori] = useState<Errori>({});
  const [inCorso, setInCorso] = useState(false);

  async function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const erroriCampi = validaRegistrazione({ email, password, targa });
    const primo = ORDINE_CAMPI.find((campo) => erroriCampi[campo]);
    if (primo) {
      setErrori(erroriCampi);
      document.getElementById(`registrazione-${primo}`)?.focus();
      return;
    }
    setErrori({});
    setInCorso(true);
    const esito = await chiamaApi(
      "/api/auth/registrazione",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, targa }),
      },
      CAMPI_REGISTRAZIONE,
    );
    if (esito.esito === "successo") {
      const { ruolo } = (esito.dati as { utente: { ruolo: string } }).utente;
      router.replace(schermataIniziale(ruolo));
      return;
    }
    setInCorso(false);
    setErrori(
      esito.esito === "errore"
        ? { [esito.campo]: esito.messaggio }
        : { generale: "La sessione non è valida. Riprova." },
    );
  }

  return (
    <form onSubmit={invia} noValidate className="flex flex-col gap-4">
      {errori.generale ? <Avviso tipo="errore">{errori.generale}</Avviso> : null}
      <Campo
        id="registrazione-email"
        etichetta="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        errore={errori.email}
      />
      <Campo
        id="registrazione-password"
        etichetta="Password"
        type="password"
        autoComplete="new-password"
        suggerimento="Almeno 8 caratteri."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        errore={errori.password}
      />
      <Campo
        id="registrazione-targa"
        etichetta="Targa del tuo veicolo"
        autoComplete="off"
        autoCapitalize="characters"
        suggerimento="Formato AB123CD."
        value={targa}
        onChange={(e) => setTarga(e.target.value)}
        errore={errori.targa}
      />
      <Bottone type="submit" inCorso={inCorso} testoInCorso="Registrazione in corso…">
        Registrati
      </Bottone>
      <p className="text-base text-zinc-800">
        <Link href="/accesso" className="font-semibold text-emerald-900 underline">
          Annulla e torna all&apos;accesso
        </Link>
      </p>
    </form>
  );
}
