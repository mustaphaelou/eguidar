import Link from "next/link"

import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatPrice } from "@/lib/money"
import { shortOrderId } from "@/lib/order-status"
import { listAdminOrders } from "@/lib/use-cases/admin-orders"

export default async function AdminOrdersPage() {
  const orders = await listAdminOrders()
  const dateFormatter = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium" })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Commandes</h1>
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">Aucune commande pour le moment.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Commande</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{shortOrderId(order.id)}</span>
                    <span className="text-sm text-muted-foreground">
                      {dateFormatter.format(order.createdAt)} — {order.itemCount} article
                      {order.itemCount > 1 ? "s" : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{order.customerName}</span>
                    <span className="text-sm text-muted-foreground">{order.customerEmail}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>{formatPrice(order.total + order.shippingFee)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      render={<Link href={`/admin/commandes/${order.id}`} />}
                      variant="outline"
                      size="sm"
                    >
                      Voir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
