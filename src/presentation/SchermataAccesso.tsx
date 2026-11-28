"use client";
// Boundary :SchermataAccesso (MU_1, SD_AUTH_1, SD_AUTH_4): accesso e registrazione
// dell'Automobilista (SC_UT_1: email, password, targa). Controllo lato client, chiamata alle API,
// poi schermata iniziale del ruolo (o la pagina di ?da=, se è dell'area del ruolo).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avviso } from "./Avviso.tsx";
import { Bottone } from "./Bottone.tsx";
import { Campo } from "./Campo.tsx";
import { destinazioneDopoAccesso, schermataIniziale } from "./logica/navigazione.ts";
import { CAMPI_ACCESSO, CAMPI_REGISTRAZIONE, chiamaApi } from "./logica/risposteApi.ts";
import { validaAccesso, validaRegistrazione } from "./logica/validazione.ts";

type Vista = "accesso" | "registrazione";
type NomeCampo = "email" | "password" | "targa";
type Errori = Partial<Record<NomeCampo | "generale", string>>;

const ORDINE_CAMPI: readonly NomeCampo[] = ["email", "password", "targa"];

function ruoloDellaRisposta(dati: unknown): string {
  return (dati as { utente: { ruolo: string } }).utente.ruolo;
}

export function SchermataAccesso({ vista }: { vista: Vista }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [targa, setTarga] = useState("");
  const [errori, setErrori] = useState<Errori>({});
  const [inCorso, setInCorso] = useState(false);

  /** Mostra gli errori del controllo lato client e porta il fuoco sul primo campo da correggere. */
  function segnalaCampi(erroriCampi: Partial<Record<NomeCampo, string>>): boolean {
    const primo = ORDINE_CAMPI.find((campo) => erroriCampi[campo]);
    if (!primo) {
      return false;
    }
    setErrori(erroriCampi);
    document.getElementById(`${vista}-${primo}`)?.focus();
    return true;
  }

  /** Chiama l'API; in caso di successo naviga verso la destinazione calcolata dal ruolo. */
  async function inoltraAllApi(
    url: string,
    corpo: Record<string, string>,
    campiPerCodice: Readonly<Record<string, string>>,
    destinazione: (ruolo: string) => string,
  ) {
    setErrori({});
    setInCorso(true);
    const esito = await chiamaApi(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      },
      campiPerCodice,
    );
    if (esito.esito === "successo") {
      router.replace(destinazione(ruoloDellaRisposta(esito.dati)));
      return;
    }
    setInCorso(false);
    setErrori(
      esito.esito === "errore"
        ? { [esito.campo]: esito.messaggio }
        : {
            generale:
              vista === "accesso"
                ? "La sessione non è valida. Accedi di nuovo."
                : "La sessione non è valida. Riprova.",
          },
    );
  }

  /** accedi(email, password) di SD_AUTH_4: POST /api/auth/accesso, poi schermata del ruolo. */
  async function accedi(email: string, password: string) {
    if (segnalaCampi(validaAccesso({ email, password }))) {
      return;
    }
    const da = new URLSearchParams(window.location.search).get("da");
    await inoltraAllApi("/api/auth/accesso", { email, password }, CAMPI_ACCESSO, (ruolo) =>
      destinazioneDopoAccesso(ruolo, da),
    );
  }

  /** registrati(email, password, targa) di SD_AUTH_1: POST /api/auth/registrazione, poi mappa. */
  async function registrati(email: string, password: string, targa: string) {
    if (segnalaCampi(validaRegistrazione({ email, password, targa }))) {
      return;
    }
    await inoltraAllApi(
      "/api/auth/registrazione",
      { email, password, targa },
      CAMPI_REGISTRAZIONE,
      schermataIniziale,
    );
  }

  const registrazione = vista === "registrazione";
  return (
    <form
      onSubmit={(evento: FormEvent<HTMLFormElement>) => {
        evento.preventDefault();
        void (registrazione ? registrati(email, password, targa) : accedi(email, password));
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      {errori.generale ? <Avviso tipo="errore">{errori.generale}</Avviso> : null}
      <Campo
        id={`${vista}-email`}
        etichetta="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        errore={errori.email}
      />
      <Campo
        id={`${vista}-password`}
        etichetta="Password"
        type="password"
        autoComplete={registrazione ? "new-password" : "current-password"}
        suggerimento={registrazione ? "Almeno 8 caratteri." : undefined}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        errore={errori.password}
      />
      {registrazione ? (
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
      ) : null}
      {registrazione ? (
        <Bottone type="submit" inCorso={inCorso} testoInCorso="Registrazione in corso…">
          Registrati
        </Bottone>
      ) : (
        <Bottone type="submit" inCorso={inCorso} testoInCorso="Accesso in corso…">
          Accedi
        </Bottone>
      )}
      {registrazione ? (
        <p className="text-base text-slate-700">
          {/* annulla() di SD_AUTH_1: si torna all'accesso senza registrare nulla. */}
          <Link
            href="/accesso"
            className="font-semibold text-marca-800 underline decoration-2 underline-offset-2 hover:text-marca-950"
          >
            Annulla e torna all&apos;accesso
          </Link>
        </p>
      ) : (
        <p className="text-base text-slate-700">
          Non hai un account?{" "}
          <Link
            href="/registrazione"
            className="font-semibold text-marca-800 underline decoration-2 underline-offset-2 hover:text-marca-950"
          >
            Registrati
          </Link>
        </p>
      )}
    </form>
  );
}
