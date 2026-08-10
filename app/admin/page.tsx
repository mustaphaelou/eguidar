import { prisma } from "@/lib/db"

export default async function AdminDashboardPage() {
  const [products, orders, categories, pendingOrders] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.category.count(),
    prisma.order.count({ where: { status: "pending" } }),
  ])

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Tableau de bord</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Produits</p>
          <p className="text-3xl font-semibold">{products}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Catégories</p>
          <p className="text-3xl font-semibold">{categories}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Commandes</p>
          <p className="text-3xl font-semibold">{orders}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">En attente</p>
          <p className="text-3xl font-semibold">{pendingOrders}</p>
        </div>
      </div>
    </div>
  )
}
