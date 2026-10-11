import Link from "next/link"
import { Suspense } from "react"

import { ShoppingBag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ListeArticlesDuPanier } from "@/components/storefront/liste-articles-du-panier"
import { CityPicker } from "@/components/storefront/city-picker"
import { RecapitulatifPaiement } from "@/components/storefront/recapitulatif-paiement"
import { Button } from "@/components/ui/button"
import { pageMetadata } from "@/lib/metadata"
import { getProfile } from "@/lib/use-cases/account"
import { lireDevis } from "@/lib/use-cases/devis"
import { lireSession } from "@/lib/use-cases/session-courante"
import { villeVersParam } from "@/lib/use-cases/ville-url"
import { lirePanier } from "@/lib/panier"

export const metadata = pageMetadata({
  title: "Panier",
  description:
    "Votre panier eguidar.com : vérifiez vos articles, les frais de livraison selon votre ville et le total TVA incluse avant de passer commande.",
  path: "/panier",
  noindex: true,
})

export default function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ ville?: string }>
}) {
  return (
    <Suspense fallback={<CartSkeleton />}>
      <CartContent searchParams={searchParams} />
    </Suspense>
  )
}

async function CartContent({
  searchParams,
}: {
  searchParams: Promise<{ ville?: string }>
}) {
  const { ville } = await searchParams
  const [panier, user] = await Promise.all([lirePanier(), lireSession()])
  const profile = user ? await getProfile(user.id) : null
  const { projeté } = await lireDevis(panier, {
    villeParam: ville,
    profileVilleId: profile?.cityId,
  })

  if (panier.lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-24 text-center">
        <HugeiconsIcon
          icon={ShoppingBag01Icon}
          strokeWidth={2}
          className="size-12 text-muted-foreground"
        />
        <h1 className="text-2xl font-bold">Votre panier est vide</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Parcourez le catalogue et ajoutez vos premiers produits.
        </p>
        <Button render={<Link href="/" />} className="mt-2">
          Découvrir les produits
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Mon panier</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ListeArticlesDuPanier articles={panier.lines} />

        <aside className="h-fit rounded-2xl border p-5">
          <h2 className="mb-4 text-lg font-semibold">Récapitulatif</h2>
          <RecapitulatifPaiement rows={projeté.rows} />

          <div className="mt-5 flex flex-col gap-4">
            <CityPicker
              cities={projeté.villes}
              selectedId={projeté.villeId}
              path="/panier"
            />
            <Button
              render={
                <Link
                  href={
                    projeté.selection.cas === "validée"
                      ? `/checkout${villeVersParam(projeté.selection.ville)}`
                      : "/checkout"
                  }
                />
              }
              className="w-full"
            >
              Passer commande
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Paiement à la livraison partout au Maroc.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function CartSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 h-8 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-96 animate-pulse rounded-2xl bg-muted" />
    </div>
  )
}
