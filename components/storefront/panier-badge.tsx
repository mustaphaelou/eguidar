import { lirePanier, resoudreProprietairePanier } from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function PanierBadge() {
  const user = await getSessionUser()
  const count = (await lirePanier(resoudreProprietairePanier(user))).itemCount

  if (count === 0) return null

  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground">
      {count}
    </span>
  )
}
