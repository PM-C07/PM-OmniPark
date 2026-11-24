// "/" (OMP-57): il proxy porta alla schermata iniziale del ruolo o su /accesso. Questa pagina è
// solo il ripiego se il proxy non interviene.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/accesso");
}
