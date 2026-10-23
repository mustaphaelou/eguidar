import { Suspense } from "react"

import { ApercuPanier } from "@/components/storefront/apercu-panier"
import { ApercuDuPanierProvider } from "@/components/storefront/apercu-du-panier-provider"
import { GlobalNavBar } from "@/components/storefront/global-nav-bar"
import { PanierBadge } from "@/components/storefront/panier-badge"
import { staticPages } from "@/lib/site"

function ApercuSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="h-6 w-40 rounded-full bg-muted" />
      <div className="h-16 w-full rounded-xl bg-muted" />
      <div className="h-16 w-full rounded-xl bg-muted" />
    </div>
  )
}

export function StorefrontHeader() {
  return (
    <ApercuDuPanierProvider>
      <GlobalNavBar
        links={[...staticPages]}
        apercuCorps={
          <Suspense fallback={<ApercuSkeleton />}>
            <ApercuPanier />
          </Suspense>
        }
        panierBadge={
          <Suspense fallback={null}>
            <PanierBadge />
          </Suspense>
        }
      />
    </ApercuDuPanierProvider>
  )
}
