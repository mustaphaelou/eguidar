"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { urlProduit } from "@/lib/carte-produit"
import { SLUG_SANS_STRUCTURE } from "@/lib/index-projection"
import { formatPrice } from "@/lib/money"
import { buildSearchHref } from "@/lib/search-params"
import type { SuggestionProduit } from "@/lib/use-cases/search"

interface SuggestionCategory {
  slug: string
  name: string
}

/**
 * Où mène une suggestion de catégorie.
 *
 * Une Structure réelle mène à sa page. **La valeur réservée d'un Produit sans
 * Structure (ADR-0029) n'a pas de page** : `/categorie/_sans-structure` rendrait
 * un `notFound()`, parce qu'aucune Structure ne porte ce slug — c'est
 * précisément ce que garantit son caractère réservé. Elle mène donc au
 * Catalogue filtré sur elle, que `buildSearchHref` écrit et que la page
 * « Tous nos produits » sait lire : la destination existe, et elle montre
 * exactement les Produits que la promesse nomme.
 *
 * L'écart est mesuré, pas supposé : `/categorie/<slug>` passe par
 * `fetchCategoryPageData`, qui rend `null` pour un slug absent.
 */
export function hrefDeSuggestion(slug: string): string {
  return slug === SLUG_SANS_STRUCTURE
    ? buildSearchHref("", { categorySlug: slug }, {}, {}, "/produits")
    : `/categorie/${slug}`
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

export function SearchSuggestions({
  inputRef,
  onEscape,
  onNavigate,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onEscape: () => void
  onNavigate: () => void
}) {
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<{
    products: SuggestionProduit[]
    categories: SuggestionCategory[]
  }>({ products: [], categories: [] })
  const [resultQuery, setResultQuery] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/recherche/suggestions?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        )
        if (!response.ok || controller.signal.aborted) return
        const data = (await response.json()) as {
          products: SuggestionProduit[]
          categories: SuggestionCategory[]
        }
        setResult(data)
        setResultQuery(trimmed)
        setOpen(true)
      } catch {
        // ignore network errors; no dropdown is better than a broken one
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const showDropdown =
    open &&
    resultQuery === query.trim() &&
    (result.products.length > 0 || result.categories.length > 0)

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <Input
        ref={inputRef}
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un produit, une marque…"
        className="h-8 rounded-full"
        aria-label="Rechercher un produit"
        aria-expanded={showDropdown}
        autoComplete="off"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            onEscape()
          }
        }}
      />
      {showDropdown ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5">
          {result.categories.length > 0 ? (
            <div className="border-b border-border/50 px-2 py-2">
              <p className="px-2 py-1 text-xs text-muted-foreground">
                Catégories
              </p>
              <div className="flex flex-col">
                {result.categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={hrefDeSuggestion(category.slug)}
                    onClick={onNavigate}
                    className="rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {result.products.length > 0 ? (
            <div className="flex flex-col p-2">
              {result.products.map((product) => (
                <Link
                  key={product.id}
                  href={urlProduit(product.slug)}
                  onClick={onNavigate}
                  className="flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted"
                >
                  {product.image ? (
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {product.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {product.brand}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {formatPrice(product.minPrice)}
                  </p>
                </Link>
              ))}
            </div>
          ) : null}
          <button
            type="submit"
            className="block w-full border-t border-border/50 px-4 py-2.5 text-left text-sm font-medium text-link transition-colors hover:bg-muted"
          >
            Voir tous les résultats
          </button>
        </div>
      ) : null}
    </div>
  )
}
