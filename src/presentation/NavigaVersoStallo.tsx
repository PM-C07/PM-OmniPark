// Comando «Naviga» della scheda dello stallo (RF_NAV_1, UC_NAV_1, SD_NAV_1, OMP-67): apre l'app di
// mappe del dispositivo con lo stallo come destinazione, per qualsiasi stato dello stallo.
import { classiBottone } from "./Bottone.tsx";
import { linkDiNavigazione, type StalloDellaMappa } from "./logica/mappaStalli.ts";

export function NavigaVersoStallo({ stallo }: { stallo: StalloDellaMappa }) {
  return (
    <a
      href={linkDiNavigazione(stallo.latitudine, stallo.longitudine)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Naviga verso lo stallo n. ${stallo.numero}, ${stallo.areaDiSosta.nome} (si apre in una nuova scheda)`}
      className={`inline-flex items-center justify-center self-start ${classiBottone("secondario")}`}
    >
      Naviga
    </a>
  );
}
