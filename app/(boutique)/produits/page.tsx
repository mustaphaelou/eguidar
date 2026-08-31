import { Suspense } from "react"

import {
  SearchResults,
  SearchSkeleton,
} from "@/components/storefront/search-results"
import { pageMetadata } from "@/lib/metadata"
import { parseSearchParams, searchProducts } from "@/lib/use-cases/search"

export const metadata = pageMetadata({
  title: "Catalogue",
  description:
    "Tous nos produits : smartphones, ordinateurs, TV, gaming et accessoires. Prix en MAD, TVA 20% incluse, paiement à la livraison partout au Maroc.",
  path: "/produits",
})

type SearchParams = Record<string, string | string[] | undefined>

export default function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Suspense fallback={<SearchSkeleton />}>
        <CatalogueContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  )
}

async function CatalogueContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<SearchParams>
}) {
  const { filters, sort, page } = parseSearchParams(
    await searchParamsPromise,
    "nouveautes"
  )

  const data = await searchProducts("", filters, { sort, page })

  return (
    <SearchResults
      data={data}
      query=""
      filters={filters}
      hrefBase="/produits"
    />
  )
}
