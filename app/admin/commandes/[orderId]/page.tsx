import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Call02Icon, MapPinIcon, UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { OrderStatusActions } from "@/components/admin/order-status-actions"
import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPrice, formatShippingFee } from "@/lib/money"
import { ORDER_TRANSITIONS } from "@/lib/order-status"
import { getAdminOrder } from "@/lib/use-cases/admin-orders"
import { OrderNotFoundError } from "@/lib/use-cases/orders"
import { shortOrderId } from "@/lib/utils"
import { updateOrderStatusAction } from "@/app/admin/commandes/actions"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderId: string }>
}): Promise<Metadata> {
  const { orderId } = await params
  return { title: `Commande ${shortOrderId(orderId)}` }
}

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ transition?: string }>
}) {
  const { orderId } = await params
  const { transition } = await searchParams

  let order
  try {
    order = await getAdminOrder(orderId)
  } catch (error) {
    if (error instanceof OrderNotFoundError) notFound()
    throw error
  }

  const orderDate = new Intl.DateTimeFormat("fr-MA", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(order.createdAt)

  return (
    <div className="flex flex-col gap-6">
      {transition === "refusee" ? (
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Transition de statut refusée : la commande n&apos;est plus dans
          l&apos;état attendu.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Commande {shortOrderId(order.id)}
          </h1>
          <p className="text-sm text-muted-foreground">{orderDate}</p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          <Button
            render={<Link href="/admin/commandes" />}
            variant="outline"
            size="sm"
          >
            Toutes les commandes
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Changer le statut</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusActions
            orderId={order.id}
            nextStatuses={ORDER_TRANSITIONS[order.status]}
            action={updateOrderStatusAction}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={UserIcon}
                strokeWidth={2}
                className="size-4"
              />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{order.customerName}</p>
            <p className="text-muted-foreground">{order.customerEmail}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={MapPinIcon}
                strokeWidth={2}
                className="size-4"
              />
              Livraison
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-muted-foreground">
              {order.address}, {order.cityName}
            </p>
            <p className="mt-1 flex items-center gap-2 text-muted-foreground">
              <HugeiconsIcon
                icon={Call02Icon}
                strokeWidth={2}
                className="size-4"
              />
              {order.phone}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Articles</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Variante</TableHead>
                <TableHead className="text-end">Quantité</TableHead>
                <TableHead className="text-end">Prix unitaire</TableHead>
                <TableHead className="text-end">Sous-total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.variantName}
                  </TableCell>
                  <TableCell className="text-end">{item.quantity}</TableCell>
                  <TableCell className="text-end">
                    {formatPrice(item.price)}
                  </TableCell>
                  <TableCell className="text-end">
                    {formatPrice(item.price * item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Sous-total (TVA incluse)
              </dt>
              <dd className="font-semibold">{formatPrice(order.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Livraison ({order.cityName})
              </dt>
              <dd className="font-semibold">
                {formatShippingFee(order.shippingFee)}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base">
              <dt className="font-bold">Total à payer à la livraison</dt>
              <dd className="font-bold">{formatPrice(order.totalPayable)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
