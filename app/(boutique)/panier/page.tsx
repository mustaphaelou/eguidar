import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DeliveryTruck02Icon, ShoppingBag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { RequireAuth } from "@/components/auth/require-auth"
import { CartLineRow } from "@/components/storefront/cart-line"
import { CityPicker } from "@/components/storefront/city-picker"
import { Button } from "@/components/ui/button"
import { getCart } from "@/lib/use-cases/cart"
import { quotePanier } from "@/lib/use-cases/livraison"
import { formatPrice, formatShippingFee } from "@/lib/money"
import { getSessionUser } from "@/lib/use-cases/get-session"

export const metadata: Metadata = {
  title: "Panier",
  description:
    "Votre panier eguidar.com : vérifiez vos articles, les frais de livraison selon votre ville et le total TVA incluse avant de passer commande.",
}

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
  const user = await getSessionUser()
  if (!user) return <RequireAuth />

  const { ville } = await searchParams
  const cart = await getCart(user.id)
  const { cities, threshold, selected } = await quotePanier(cart, ville)
  const quote = selected

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-24 text-center">
        <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} className="size-12 text-muted-foreground" />
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
        <ul>
          {cart.lines.map((line) => (
            <CartLineRow key={line.cartItemId} line={line} />
          ))}
        </ul>

        <aside className="h-fit rounded-2xl border p-5">
          <h2 className="mb-4 text-lg font-semibold">Récapitulatif</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total (TVA incluse)</dt>
              <dd className="font-semibold">{formatPrice(cart.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Livraison</dt>
              <dd className="font-semibold">
                {quote ? formatShippingFee(quote.shippingFee) : <span className="text-muted-foreground">À choisir</span>}
              </dd>
            </div>
            {quote ? (
              <div className="flex justify-between border-t pt-2 text-base">
                <dt className="font-bold">Total</dt>
                <dd className="font-bold">{formatPrice(quote.total)}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5 flex flex-col gap-4">
            <CityPicker
              cities={cities}
              selectedId={quote && ville ? ville : null}
              path="/panier"
            />
            {quote && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HugeiconsIcon icon={DeliveryTruck02Icon} strokeWidth={2} className="size-4" />
                Livraison offerte dès {formatPrice(threshold)}
              </p>
            )}
            <Button
              render={<Link href={`/checkout${ville ? `?ville=${encodeURIComponent(ville)}` : ""}`} />}
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
