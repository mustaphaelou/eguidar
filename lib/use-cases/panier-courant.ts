import {
  lirePanier,
  resoudreProprietairePanier,
  type DonneesPanier,
} from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function lirePanierCourant(): Promise<DonneesPanier> {
  const user = await getSessionUser()
  return lirePanier(resoudreProprietairePanier(user))
}
