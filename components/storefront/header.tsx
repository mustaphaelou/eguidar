import { Suspense } from "react"

import { ApercuPanier } from "@/components/storefront/apercu-panier"
import { ApercuDuPanierProvider } from "@/components/storefront/apercu-du-panier-provider"
import { GlobalNavBar } from "@/components/storefront/global-nav-bar"
import { PanierBadge } from "@/components/storefront/panier-badge"
import { SignInStatus } from "@/components/storefront/sign-in-status"
import { staticPages } from "@/lib/site"

function SignInSkeleton() {
  return <div className="size-9 animate-pulse rounded-full bg-muted" />
}

function ApercuSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
      <div className="h-16 w-full animate-pulse rounded-xl bg-muted" />
      <div className="h-16 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  )
}

export function StorefrontHeader() {
  return (
    <ApercuDuPanierProvider>
      <GlobalNavBar
        links={[...staticPages]}
        actions={
          <Suspense fallback={<SignInSkeleton />}>
            <SignInStatus />
          </Suspense>
        }
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
