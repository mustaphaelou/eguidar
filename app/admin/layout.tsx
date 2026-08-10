import Link from "next/link"
import { redirect } from "next/navigation"

import { getAdminSession } from "@/lib/use-cases/get-admin-session"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin")

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="font-semibold">
            Eguidar — Administration
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              Tableau de bord
            </Link>
            <Link href="/admin/produits" className="text-muted-foreground hover:text-foreground">
              Produits
            </Link>
            <Link href="/admin/categories" className="text-muted-foreground hover:text-foreground">
              Catégories
            </Link>
            <Link href="/admin/villes" className="text-muted-foreground hover:text-foreground">
              Villes
            </Link>
            <Link href="/admin/livraison" className="text-muted-foreground hover:text-foreground">
              Livraison
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Boutique
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
