import { Suspense } from "react"

import { ApercuPanier } from "@/components/storefront/apercu-panier"
import { ApercuDuPanierProvider } from "@/components/storefront/apercu-du-panier-provider"
import { SqueletteDeLApercu } from "@/components/storefront/apercu-du-panier-squelette"
import { GlobalNavBar } from "@/components/storefront/global-nav-bar"
import { PanierBadge } from "@/components/storefront/panier-badge"
import { getNavCategories } from "@/lib/use-cases/storefront"

export async function StorefrontHeader() {
  const categories = await getNavCategories()

  return (
    <ApercuDuPanierProvider>
      <GlobalNavBar
        categories={categories}
        apercuCorps={
          <Suspense fallback={<SqueletteDeLApercu />}>
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
