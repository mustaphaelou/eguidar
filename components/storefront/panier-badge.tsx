import { lirePanier } from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function PanierBadge() {
  const user = await getSessionUser()
  const count = (
    await lirePanier(
      user ? { role: "client", compteId: user.id } : { role: "visiteur" }
    )
  ).itemCount

  if (count === 0) return null

  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
      {count}
    </span>
  )
}
