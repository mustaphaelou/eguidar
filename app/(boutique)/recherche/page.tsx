import { headers } from "next/headers"
import { Suspense } from "react"

import {
  SearchResults,
  SearchSkeleton,
} from "@/components/storefront/search-results"
import { autoriserRecherche } from "@/lib/acces-recherche"
import { MESSAGE_TROP_DE_RECHERCHES } from "@/lib/limiteur-recherche"
import { pageMetadata } from "@/lib/metadata"
import { parseSearchParams } from "@/lib/search-params"
import { searchProducts } from "@/lib/use-cases/search"

type SearchParams = Record<string, string | string[] | undefined>

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { query } = parseSearchParams(await searchParams)
  return pageMetadata({
    title: query ? `Recherche : ${query}` : "Recherche",
    description: query
      ? `Résultats pour « ${query} » sur eguidar.com : filtres par marque, catégorie et prix, TVA incluse, paiement à la livraison.`
      : "Recherchez un produit, une marque dans le catalogue eguidar.com.",
    path: "/recherche",
    noindex: true,
  })
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Suspense fallback={<SearchSkeleton />}>
        <SearchContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  )
}

async function SearchContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<SearchParams>
}) {
  const { query, filters, sort, page } = parseSearchParams(
    await searchParamsPromise
  )

  if (!query) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Recherchez un produit, une marque… Nous trouvons même ce que vous épelez
        mal.
      </div>
    )
  }

  if (!(await autoriserRecherche(await headers()))) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground"
      >
        {MESSAGE_TROP_DE_RECHERCHES}
      </div>
    )
  }

  const data = await searchProducts(query, filters, { sort, page })

  return <SearchResults data={data} query={query} filters={filters} />
}
