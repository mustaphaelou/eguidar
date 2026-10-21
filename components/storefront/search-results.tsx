import Link from "next/link"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ProductCardItem } from "@/components/storefront/product-card"
import {
  ActiveFilters,
  FilterSidebar,
  MobileFilterDrawer,
  SearchNavigationProvider,
  SearchResultsPending,
} from "@/components/storefront/search-filters"
import { SearchSort } from "@/components/storefront/search-sort"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { nombreDeFiltres } from "@/lib/filtre-de-recherche"
import {
  buildSearchHref,
  type SearchFilters,
  type SearchPageData,
} from "@/lib/use-cases/search"

export function SearchResults({
  data,
  query,
  filters,
  hrefBase = "/recherche",
}: {
  data: SearchPageData
  query: string
  filters: SearchFilters
  hrefBase?: string
}) {
  const hasFilters = nombreDeFiltres(filters) > 0
  const resetHref = buildSearchHref(
    query,
    {},
    {},
    { sort: data.sort, page: 1 },
    hrefBase
  )
  const heading = query ? `Résultats pour « ${query} »` : "Catalogue"

  return (
    <SearchNavigationProvider
      query={query}
      filters={filters}
      sort={data.sort}
      hrefBase={hrefBase}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        <FilterSidebar facets={data.facets} />

        <section>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-titre-catalogue leading-[1.1]">{heading}</h1>
              <p className="text-sm text-muted-foreground">
                {data.totalHits} produit{data.totalHits > 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <MobileFilterDrawer
                facets={data.facets}
                totalHits={data.totalHits}
              />
              <SearchSort
                sort={data.sort}
                query={query}
                filters={filters}
                hrefBase={hrefBase}
              />
            </div>
          </div>

          <ActiveFilters filtresActifs={data.filtresActifs} />

          {data.products.length > 0 ? (
            <SearchResultsPending>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-5">
                {data.products.map((product) => (
                  <ProductCardItem key={product.id} product={product} />
                ))}
              </div>
              <Pagination
                data={data}
                query={query}
                filters={filters}
                hrefBase={hrefBase}
              />
            </SearchResultsPending>
          ) : (
            <EmptyResults
              query={query}
              hasFilters={hasFilters}
              resetHref={resetHref}
            />
          )}
        </section>
      </div>
    </SearchNavigationProvider>
  )
}

function EmptyResults({
  query,
  hasFilters,
  resetHref,
}: {
  query: string
  hasFilters: boolean
  resetHref: string
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>
          {query ? `Aucun résultat pour « ${query} »` : "Aucun produit"}
        </EmptyTitle>
        <EmptyDescription>
          {query
            ? "Vérifiez l'orthographe ou essayez un autre terme."
            : "Aucun produit ne correspond à ces filtres."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        {hasFilters ? (
          <Button variant="outline" render={<Link href={resetHref} />}>
            Réinitialiser les filtres
          </Button>
        ) : (
          <Button render={<Link href="/" />}>Découvrir les produits</Button>
        )}
      </EmptyContent>
    </Empty>
  )
}

function Pagination({
  data,
  query,
  filters,
  hrefBase,
}: {
  data: SearchPageData
  query: string
  filters: SearchFilters
  hrefBase: string
}) {
  const { totalPages, currentPage } = data

  if (totalPages <= 1) return null

  const pageHref = (page: number) =>
    buildSearchHref(query, filters, {}, { sort: data.sort, page }, hrefBase)

  return (
    <nav className="mt-8 flex justify-center" aria-label="Pagination">
      <ul className="flex items-center gap-1">
        <li>
          {currentPage > 1 ? (
            <Link
              href={pageHref(currentPage - 1)}
              aria-label="Page précédente"
              className="flex size-9 items-center justify-center text-sm text-link hover:underline"
            >
              ‹
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="flex size-9 items-center justify-center text-sm text-muted-foreground"
            >
              ‹
            </span>
          )}
        </li>
        {paginationWindow(currentPage, totalPages).map((page, index) =>
          page === null ? (
            <li key={`gap-${index}`}>
              <span className="flex size-9 items-center justify-center text-sm text-muted-foreground">
                …
              </span>
            </li>
          ) : (
            <li key={page}>
              <Link
                href={pageHref(page)}
                aria-current={page === currentPage ? "page" : undefined}
                className={
                  page === currentPage
                    ? "flex size-9 items-center justify-center text-sm font-semibold"
                    : "flex size-9 items-center justify-center rounded-lg text-sm transition-colors hover:bg-muted"
                }
              >
                {page}
              </Link>
            </li>
          )
        )}
        <li>
          {currentPage < totalPages ? (
            <Link
              href={pageHref(currentPage + 1)}
              aria-label="Page suivante"
              className="flex size-9 items-center justify-center text-sm text-link hover:underline"
            >
              ›
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="flex size-9 items-center justify-center text-sm text-muted-foreground"
            >
              ›
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}

function paginationWindow(
  currentPage: number,
  totalPages: number
): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const wanted = new Set([
    1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    totalPages,
  ])
  const sorted = [...wanted]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)
  const window: (number | null)[] = []
  let previous = 0
  for (const page of sorted) {
    if (page - previous > 1) window.push(null)
    window.push(page)
    previous = page
  }
  return window
}

export function SearchSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
      <div className="hidden flex-col gap-4 md:flex">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div>
        <Skeleton className="mb-6 h-8 w-64 rounded-full" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-carte" />
          ))}
        </div>
      </div>
    </div>
  )
}
