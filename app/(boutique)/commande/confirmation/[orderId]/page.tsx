import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { Call02Icon, CheckmarkCircle01Icon, MapPinIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { RequireAuth } from "@/components/auth/require-auth"
import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { Button } from "@/components/ui/button"
import { formatPrice, formatShippingFee } from "@/lib/money"
import { pageMetadata } from "@/lib/metadata"
import { getSessionUser } from "@/lib/use-cases/get-session"
import { getOrder } from "@/lib/use-cases/orders"
import { shortOrderId } from "@/lib/order-status"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  return pageMetadata({
    title: `Commande ${shortOrderId(orderId)}`,
    description:
      "Confirmation de votre commande eguidar.com : récapitulatif des articles, montant total et détails de livraison.",
    path: `/commande/confirmation/${orderId}`,
    noindex: true,
  })
}

export default function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  return (
    <Suspense fallback={<OrderConfirmationSkeleton />}>
      <OrderConfirmationContent params={params} />
    </Suspense>
  )
}

async function OrderConfirmationContent({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const user = await getSessionUser()
  if (!user) return <RequireAuth />

  const { orderId } = await params
  const order = await getOrder(user.id, orderId)
  if (!order) notFound()

  const orderDate = new Intl.DateTimeFormat("fr-MA", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(order.createdAt)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} className="size-14 text-emerald-600" />
        <h1 className="text-2xl font-bold">Merci pour votre commande</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Commande {shortOrderId(order.id)} du {orderDate} — un e-mail de confirmation vous sera
          envoyé.
        </p>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border">
        <ul>
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex justify-between gap-3 border-b px-5 py-3 text-sm last:border-b-0"
            >
              <span>
                {item.productName} <span className="text-muted-foreground">{item.variantName}</span>
                <span className="ml-2 text-muted-foreground">× {item.quantity}</span>
              </span>
              <span className="font-medium">{formatPrice(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2 bg-muted/40 px-5 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Sous-total (TVA incluse)</dt>
            <dd className="font-semibold">{formatPrice(order.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Livraison ({order.cityName})</dt>
            <dd className="font-semibold">{formatShippingFee(order.shippingFee)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base">
            <dt className="font-bold">Total à payer à la livraison</dt>
            <dd className="font-bold">{formatPrice(order.total + order.shippingFee)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-2xl border p-5 text-sm">
        <h2 className="mb-3 font-semibold">Livraison</h2>
        <p className="flex items-start gap-2 text-muted-foreground">
          <HugeiconsIcon icon={MapPinIcon} strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
          {order.address}, {order.cityName}
        </p>
        <p className="mt-2 flex items-start gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
          {order.phone}
        </p>
        <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
          Préparez le montant total en espèces : notre livreur le collectera à la remise de votre
          colis. Vous pouvez suivre le statut de vos commandes dans votre espace.
        </p>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Button render={<Link href="/commandes" />} variant="outline">
          Mes commandes
        </Button>
        <Button render={<Link href="/" />}>
          Continuer mes achats
        </Button>
      </div>
    </div>
  )
}

function OrderConfirmationSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mx-auto h-24 w-24 animate-pulse rounded-full bg-muted" />
      <div className="mx-auto mt-4 h-8 w-72 animate-pulse rounded-full bg-muted" />
      <div className="mt-8 h-64 animate-pulse rounded-2xl bg-muted" />
    </div>
  )
}
