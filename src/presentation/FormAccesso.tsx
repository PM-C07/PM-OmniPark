"use client";
// Form di accesso (UC_AUTH_4, MU_1): controllo lato client, invio a POST /api/auth/accesso e
// schermata iniziale del ruolo (o la pagina di ?da=, se è dell'area del ruolo).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { Campo } from "./Campo.tsx";
import { destinazioneDopoAccesso } from "./logica/navigazione.ts";
import { CAMPI_ACCESSO, chiamaApi } from "./logica/risposteApi.ts";
import { validaAccesso } from "./logica/validazione.ts";

type Errori = Partial<Record<"email" | "password" | "generale", string>>;

export function FormAccesso() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errori, setErrori] = useState<Errori>({});
  const [inCorso, setInCorso] = useState(false);

  async function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const erroriCampi = validaAccesso({ email, password });
    if (Object.keys(erroriCampi).length > 0) {
      setErrori(erroriCampi);
      document.getElementById(erroriCampi.email ? "accesso-email" : "accesso-password")?.focus();
      return;
    }
    setErrori({});
    setInCorso(true);
    const esito = await chiamaApi(
      "/api/auth/accesso",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      CAMPI_ACCESSO,
    );
    if (esito.esito === "successo") {
      const { ruolo } = (esito.dati as { utente: { ruolo: string } }).utente;
      const da = new URLSearchParams(window.location.search).get("da");
      router.replace(destinazioneDopoAccesso(ruolo, da));
      return;
    }
    setInCorso(false);
    setErrori(
      esito.esito === "errore"
        ? { [esito.campo]: esito.messaggio }
        : { generale: "La sessione non è valida. Accedi di nuovo." },
    );
  }

  return (
    <form onSubmit={invia} noValidate className="flex flex-col gap-4">
      {errori.generale ? <Avviso tipo="errore">{errori.generale}</Avviso> : null}
      <Campo
        id="accesso-email"
        etichetta="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        errore={errori.email}
      />
      <Campo
        id="accesso-password"
        etichetta="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        errore={errori.password}
      />
      <Bottone type="submit" inCorso={inCorso} testoInCorso="Accesso in corso…">
        Accedi
      </Bottone>
      <p className="text-base text-zinc-800">
        Non hai un account?{" "}
        <Link href="/registrazione" className="font-semibold text-emerald-900 underline">
          Registrati
        </Link>
      </p>
    </form>
  );
}
