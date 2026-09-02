import {
  lirePanier,
  resoudreProprietairePanier,
  type DonneesPanier,
} from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function lirePanierCourant(): Promise<DonneesPanier> {
  const user = await getSessionUser()
  const { lines, subtotal, itemCount } = await lirePanier(
    resoudreProprietairePanier(user)
  )
  return { lines, subtotal, itemCount }
}
