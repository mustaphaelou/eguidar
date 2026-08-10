import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ProductCardItem } from "@/components/storefront/product-card"
import { Button } from "@/components/ui/button"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import {
  buildSearchHref,
  parseSearchParams,
  searchProducts,
} from "@/lib/use-cases/search"

type SearchParams = Record<string, string | string[] | undefined>

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { query } = parseSearchParams(await searchParams)
  return {
    title: query ? `Recherche : ${query} — eguidar.ma` : "Recherche — eguidar.ma",
  }
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
  const { query, filters } = parseSearchParams(await searchParamsPromise)

  if (!query) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Recherchez un produit, une marque… Nous trouvons même ce que vous épelez mal.
      </div>
    )
  }

  const data = await searchProducts(query, filters)
  const hasFilters = Boolean(filters.brand || filters.categorySlug || filters.priceBucketId)
  const resetHref = buildSearchHref(query, {})

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
            href: buildSearchHref(query, filters, {
              brand: filters.brand === facet.value ? undefined : facet.value,
            }),
            label: facet.value,
            count: facet.count,
            active: filters.brand === facet.value,
          }))}
        />

        <FacetGroup
          title="Catégorie"
          options={data.facets.categories.map((facet) => ({
            href: buildSearchHref(query, filters, {
              categorySlug: filters.categorySlug === facet.value ? undefined : facet.value,
            }),
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
              href: buildSearchHref(query, filters, {
                priceBucketId: active ? undefined : bucket.id,
              }),
              label: bucket.label,
              count: data.facets.priceBuckets.find((facet) => facet.id === bucket.id)?.count,
              active,
            }
          })}
        />
      </aside>

      <section>
        <div className="mb-4 flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Résultats pour « {query} »</h1>
          <p className="text-sm text-muted-foreground">
            {data.totalHits} produit{data.totalHits > 1 ? "s" : ""}
          </p>
        </div>

        {data.products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.products.map((product) => (
              <ProductCardItem key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
            </div>
            <p className="text-sm font-medium">Aucun résultat pour « {query} »</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vérifiez l&apos;orthographe ou essayez un autre terme.
            </p>
            {hasFilters ? (
              <Button variant="outline" render={<Link href={resetHref} />} className="mt-4">
                Réinitialiser les filtres
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
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

function SearchSkeleton() {
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
