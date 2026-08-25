import { Suspense } from "react"

import { GlobalNavBar } from "@/components/storefront/global-nav-bar"
import { PanierBadge } from "@/components/storefront/panier-badge"
import { SignInStatus } from "@/components/storefront/sign-in-status"
import { staticPages } from "@/lib/site"

function SignInSkeleton() {
  return <div className="size-9 animate-pulse rounded-full bg-muted" />
}

export function StorefrontHeader() {
  return (
    <GlobalNavBar
      links={[...staticPages]}
      actions={
        <Suspense fallback={<SignInSkeleton />}>
          <SignInStatus />
        </Suspense>
      }
      panierBadge={
        <Suspense fallback={null}>
          <PanierBadge />
        </Suspense>
      }
    />
  )
}
