import Link from "next/link"
import { Suspense } from "react"

import { Invoice01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { RequireAuth } from "@/components/auth/require-auth"
import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/money"
import { pageMetadata } from "@/lib/metadata"
import { getSessionUser } from "@/lib/use-cases/get-session"
import { listUserOrders } from "@/lib/use-cases/orders"
import { shortOrderId } from "@/lib/order-status"

export const metadata = pageMetadata({
  title: "Mes commandes",
  description:
    "Suivez vos commandes eguidar.com : statut en attente, confirmée, expédiée ou livrée, et détails de chaque achat.",
  path: "/commandes",
  noindex: true,
})

export default function OrderHistoryPage() {
  return (
    <Suspense fallback={<OrderHistorySkeleton />}>
      <OrderHistoryContent />
    </Suspense>
  )
}

async function OrderHistoryContent() {
  const user = await getSessionUser()
  if (!user) return <RequireAuth />

  const orders = await listUserOrders(user.id)

  if (orders.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-24 text-center">
        <HugeiconsIcon icon={Invoice01Icon} strokeWidth={2} className="size-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Aucune commande pour le moment</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Vos commandes apparaîtront ici dès que vous aurez passé votre premier achat.
        </p>
        <Button render={<Link href="/" />} className="mt-2">
          Découvrir les produits
        </Button>
      </div>
    )
  }

  const dateFormatter = new Intl.DateTimeFormat("fr-MA", { dateStyle: "long" })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">Mes commandes</h1>
      <ul className="flex flex-col gap-4">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/commande/confirmation/${order.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border p-5 transition-colors hover:border-ring"
            >
              <div>
                <p className="font-semibold">Commande {shortOrderId(order.id)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dateFormatter.format(order.createdAt)} — {order.itemCount} article
                  {order.itemCount > 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <OrderStatusBadge status={order.status} />
                <p className="text-sm font-bold">{formatPrice(order.total + order.shippingFee)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OrderHistorySkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
    </div>
  )
}
