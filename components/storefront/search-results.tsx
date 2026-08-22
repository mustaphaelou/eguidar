import Link from "next/link"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ProductCardItem } from "@/components/storefront/product-card"
import { SearchSort } from "@/components/storefront/search-sort"
import { Button } from "@/components/ui/button"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
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
  const hasFilters = Boolean(filters.brand || filters.categorySlug || filters.priceBucketId)
  const resetHref = buildSearchHref(query, {}, {}, { sort: data.sort, page: 1 }, hrefBase)
  const heading = query ? `Résultats pour « ${query} »` : "Catalogue"

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
      <aside className="flex flex-col gap-6">
        {hasFilters ? (
          <Button variant="ghost" render={<Link href={resetHref} />} className="justify-start">
            Réinitialiser les filtres
          </Button>
        ) : null}

        <FacetGroup
          title="Marque"
          options={data.facets.brands.map((facet) => ({
            href: buildSearchHref(
              query,
              filters,
              { brand: filters.brand === facet.value ? undefined : facet.value },
              { sort: data.sort, page: 1 },
              hrefBase
            ),
            label: facet.value,
            count: facet.count,
            active: filters.brand === facet.value,
          }))}
        />

        <FacetGroup
          title="Catégorie"
          options={data.facets.categories.map((facet) => ({
            href: buildSearchHref(
              query,
              filters,
              { categorySlug: filters.categorySlug === facet.value ? undefined : facet.value },
              { sort: data.sort, page: 1 },
              hrefBase
            ),
            label: facet.name,
            count: facet.count,
            active: filters.categorySlug === facet.value,
          }))}
        />

        <FacetGroup
          title="Prix"
          options={PRICE_BUCKETS.map((bucket) => {
            const active = filters.priceBucketId === bucket.id
            return {
              href: buildSearchHref(
                query,
                filters,
                { priceBucketId: active ? undefined : bucket.id },
                { sort: data.sort, page: 1 },
                hrefBase
              ),
              label: bucket.label,
              count: data.facets.priceBuckets.find((facet) => facet.id === bucket.id)?.count,
              active,
            }
          })}
        />
      </aside>

      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{heading}</h1>
            <p className="text-sm text-muted-foreground">
              {data.totalHits} produit{data.totalHits > 1 ? "s" : ""}
            </p>
          </div>
          <SearchSort sort={data.sort} query={query} filters={filters} hrefBase={hrefBase} />
        </div>

        {data.products.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
          </>
        ) : (
          <EmptyResults query={query} hasFilters={hasFilters} resetHref={resetHref} />
        )}
      </section>
    </div>
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
    <div className="rounded-2xl border border-dashed p-10 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
      </div>
      {query ? (
        <>
          <p className="text-sm font-medium">Aucun résultat pour « {query} »</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vérifiez l&apos;orthographe ou essayez un autre terme.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Aucun produit</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Aucun produit ne correspond à ces filtres.
          </p>
        </>
      )}
      {hasFilters ? (
        <Button variant="outline" render={<Link href={resetHref} />} className="mt-4">
          Réinitialiser les filtres
        </Button>
      ) : (
        <Button render={<Link href="/" />} className="mt-4">
          Découvrir les produits
        </Button>
      )}
    </div>
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
              className="flex size-9 items-center justify-center rounded-lg text-sm transition-colors hover:bg-muted"
            >
              ‹
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="flex size-9 items-center justify-center rounded-lg text-sm text-muted-foreground"
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
                    ? "flex size-9 items-center justify-center rounded-lg bg-muted text-sm font-semibold"
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
              className="flex size-9 items-center justify-center rounded-lg text-sm transition-colors hover:bg-muted"
            >
              ›
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="flex size-9 items-center justify-center rounded-lg text-sm text-muted-foreground"
            >
              ›
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}

function paginationWindow(currentPage: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const wanted = new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])
  const sorted = [...wanted].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b)
  const window: (number | null)[] = []
  let previous = 0
  for (const page of sorted) {
    if (page - previous > 1) window.push(null)
    window.push(page)
    previous = page
  }
  return window
}

function FacetGroup({
  title,
  options,
}: {
  title: string
  options: { href: string; label: string; count?: number; active: boolean }[]
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col gap-1">
        {options.length > 0 ? (
          options.map((option) => (
            <FacetLink
              key={option.label}
              href={option.href}
              label={option.label}
              count={option.count}
              active={option.active}
            />
          ))
        ) : (
          <FacetEmpty />
        )}
      </ul>
    </div>
  )
}

function FacetLink({
  href,
  label,
  count,
  active,
}: {
  href: string
  label: string
  count: number | undefined
  active: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-muted ${
          active ? "font-semibold text-foreground" : "text-muted-foreground"
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        {count !== undefined ? (
          <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
        ) : null}
      </Link>
    </li>
  )
}

function FacetEmpty() {
  return <li className="px-2 py-1 text-sm text-muted-foreground">Aucun filtre disponible</li>
}

export function SearchSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div>
        <div className="mb-6 h-8 w-64 animate-pulse rounded-full bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
