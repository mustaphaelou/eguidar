import { Suspense } from "react"
import type { Metadata } from "next"
import { connection } from "next/server"

import { PrototypeVariantSwitcher } from "@/components/prototype-variant-switcher"
import {
  HomeVariantA,
  HomeVariantB,
  HomeVariantC,
} from "@/components/storefront/home-prototype"
import { parsePrototypeVariant } from "@/lib/prototype-variant"
import { getHomeData } from "@/lib/use-cases/storefront"

export const metadata: Metadata = {
  title: "Électronique au meilleur prix au Maroc",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison partout au Maroc.",
}

type SearchParams = Record<string, string | string[] | undefined>

// PROTOTYPE — homepage variants, switchable via ?variant= (dev only).
// The winning variant gets folded in here; the rest goes to a throwaway branch.
export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParamsPromise={searchParams} />
    </Suspense>
  )
}

async function HomeContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<SearchParams>
}) {
  await connection()
  const data = await getHomeData()
  const raw = (await searchParamsPromise).variant
  const variant = parsePrototypeVariant(typeof raw === "string" ? raw : undefined)

  return (
    <>
      {variant === "A" ? (
        <HomeVariantA data={data} />
      ) : variant === "B" ? (
        <HomeVariantB data={data} />
      ) : (
        <HomeVariantC data={data} />
      )}
      {process.env.NODE_ENV !== "production" ? <PrototypeVariantSwitcher /> : null}
    </>
  )
}

function HomeSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-6">
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
