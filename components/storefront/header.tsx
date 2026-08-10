import { Suspense } from "react"
import Link from "next/link"

import { Search01Icon, ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SignInStatus } from "@/components/storefront/sign-in-status"

function SignInSkeleton() {
  return <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />
}

export function StorefrontHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <Link href="/" className="shrink-0 text-xl font-black tracking-tight">
          eguidar<span className="text-primary">.ma</span>
        </Link>

        <form method="GET" action="/recherche" className="flex min-w-0 flex-1 gap-2">
          <Input
            name="q"
            placeholder="Rechercher un produit, une marque…"
            className="rounded-full"
            aria-label="Rechercher un produit"
          />
          <Button type="submit" variant="secondary" size="icon" aria-label="Rechercher">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </Button>
        </form>

        <nav className="flex shrink-0 items-center gap-1.5">
          <Suspense fallback={<SignInSkeleton />}>
            <SignInStatus />
          </Suspense>
          <Button render={<Link href="/panier" />} variant="ghost" size="lg" className="gap-1.5">
            <HugeiconsIcon icon={ShoppingCart01Icon} strokeWidth={2} />
            <span>Panier</span>
          </Button>
        </nav>
      </div>
    </header>
  )
}
