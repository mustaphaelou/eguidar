import { redirect } from "next/navigation"
import { Suspense } from "react"

import { RequireAuth } from "@/components/auth/require-auth"
import { CheckoutForm } from "@/components/storefront/checkout-form"
import { pageMetadata } from "@/lib/metadata"
import { getProfile } from "@/lib/use-cases/account"
import { chargerDevis } from "@/lib/use-cases/devis"
import { lirePanier } from "@/lib/panier"
import { lireSession } from "@/lib/use-cases/session-courante"
import { formatPrice } from "@/lib/money"

export const metadata = pageMetadata({
  title: "Commander",
  description:
    "Finalisez votre commande eguidar.com : confirmez votre adresse et votre téléphone, et réglez en espèces à la livraison.",
  path: "/checkout",
  noindex: true,
})

export default function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ ville?: string }>
}) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutContent searchParams={searchParams} />
    </Suspense>
  )
}

async function CheckoutContent({
  searchParams,
}: {
  searchParams: Promise<{ ville?: string }>
}) {
  const user = await lireSession()
  if (!user) return <RequireAuth />

  const { ville } = await searchParams
  const [panier, profile] = await Promise.all([
    lirePanier(),
    getProfile(user.id),
  ])
  if (panier.lines.length === 0) redirect("/panier")

  const devis = await chargerDevis(panier, {
    villeParam: ville,
    profileVilleId: profile.cityId,
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">Commander</h1>

      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="mb-4 text-lg font-semibold">Adresse de livraison</h2>
          <CheckoutForm
            devis={devis}
            initialAddress={profile.address ?? ""}
            initialPhone={profile.phone ?? ""}
          />
        </section>

        <aside className="h-fit rounded-2xl border p-5">
          <h2 className="mb-4 text-lg font-semibold">Votre panier</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {panier.lines.map((line) => (
              <li
                key={line.variantId}
                className="flex justify-between gap-3"
              >
                <span className="text-muted-foreground">
                  {line.productName} {line.variantName} × {line.quantity}
                </span>
                <span className="shrink-0 font-medium">
                  {formatPrice(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
