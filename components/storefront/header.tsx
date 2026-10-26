import { Suspense } from "react"

import { ApercuPanier } from "@/components/storefront/apercu-panier"
import { ApercuDuPanierProvider } from "@/components/storefront/apercu-du-panier-provider"
import { SqueletteDeLApercu } from "@/components/storefront/apercu-du-panier-squelette"
import { GlobalNavBar } from "@/components/storefront/global-nav-bar"
import { PanierBadge } from "@/components/storefront/panier-badge"

export function StorefrontHeader() {
  return (
    <ApercuDuPanierProvider>
      <GlobalNavBar
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
