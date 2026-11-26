"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { urlProduit } from "@/lib/carte-produit"
import { SLUG_SANS_STRUCTURE } from "@/lib/index-projection"
import { formatPrice } from "@/lib/money"
import { buildSearchHref, SEARCH_QUERY_MIN_LENGTH } from "@/lib/search-params"
import type {
  SearchSuggestionCategory,
  SuggestionProduit,
} from "@/lib/use-cases/search"
import { cn } from "@/lib/utils"

import type { LienDeFeuille } from "./feuille-navigation"

export function hrefDeSuggestion(slug: string): string {
  return slug === SLUG_SANS_STRUCTURE
    ? buildSearchHref("", { categorySlug: slug }, {}, {}, "/produits")
    : `/categorie/${slug}`
}

const DEBOUNCE_MS = 300

export function SearchSuggestions({
  inputRef,
  onEscape,
  onNavigate,
  surface = "bandeau",
  quickLinks = [],
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onEscape: () => void
  onNavigate: () => void
  surface?: "bandeau" | "feuille"
  quickLinks?: readonly LienDeFeuille[]
}) {
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<{
    products: SuggestionProduit[]
    categories: SearchSuggestionCategory[]
  }>({ products: [], categories: [] })
  const [resultQuery, setResultQuery] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < SEARCH_QUERY_MIN_LENGTH) return
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
          categories: SearchSuggestionCategory[]
        }
        setResult(data)
        setResultQuery(trimmed)
        setOpen(true)
      } catch {}
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

  const estFeuille = surface === "feuille"
  const montrerLiensRapides =
    estFeuille && !showDropdown && quickLinks.length > 0

  return (
    <div ref={containerRef} className="w-full min-w-0 flex-1">
      <div className="flex items-center gap-2.5">
        {estFeuille ? (
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-5 shrink-0 text-muted-foreground"
          />
        ) : null}
        <Input
          ref={inputRef}
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Chercher"
          className={cn(
            "min-w-0 flex-1",
            estFeuille
              ? "h-10 border-0 bg-transparent px-0 text-[17px] font-semibold tracking-[-0.015em] shadow-none focus-visible:ring-0 sm:h-11 sm:text-[24px] sm:tracking-[-0.02em]"
              : "h-8 rounded-full"
          )}
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
        {estFeuille ? (
          <Button
            type="submit"
            size="sm"
            className="shrink-0 rounded-full motion-safe:active:scale-[0.97]"
          >
            Rechercher
          </Button>
        ) : null}
      </div>

      {showDropdown ? (
        <div
          className={cn(
            "overflow-clip rounded-2xl bg-popover text-popover-foreground ring-1 ring-hairline",
            estFeuille
              ? "mbs-4"
              : "absolute inset-x-0 inset-bs-full z-50 mbs-2 shadow-2xl"
          )}
        >
          {result.categories.length > 0 ? (
            <div className="border-be border-hairline px-2 py-2">
              <p className="px-2 py-1 text-[12px] leading-[1.3334] tracking-[-0.01em] text-muted-foreground">
                Catégories
              </p>
              <div className="flex flex-col">
                {result.categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={hrefDeSuggestion(category.slug)}
                    onClick={onNavigate}
                    className="rounded-lg px-2 py-1.5 text-sm font-medium text-encre-menu transition-[background-color,color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
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
                  className="flex items-center gap-3 rounded-lg p-1.5 transition-[background-color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted"
                >
                  {product.image ? (
                    <div className="relative size-10 shrink-0 overflow-clip rounded-lg bg-muted">
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
                    <p className="truncate text-sm font-medium text-foreground">
                      {product.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {product.brand}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                    {formatPrice(product.minPrice)}
                  </p>
                </Link>
              ))}
            </div>
          ) : null}
          <button
            type="submit"
            className="block w-full border-bs border-hairline px-4 py-2.5 text-start text-sm font-medium text-link transition-[background-color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted"
          >
            Voir tous les résultats
          </button>
        </div>
      ) : null}

      {montrerLiensRapides ? (
        <div
          data-slot="colonne-feuille"
          className="mbs-6 border-bs border-hairline pbs-5"
        >
          <p className="mbe-2.5 text-[12px] leading-[1.3334] font-normal tracking-[-0.01em] text-muted-foreground">
            Liens rapides
          </p>
          <ul className="flex flex-col gap-0.5">
            {quickLinks.map((lien) => (
              <li key={lien.href}>
                <Link
                  href={lien.href}
                  onClick={onNavigate}
                  className="group/rapide flex items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] leading-[1.35] font-medium text-encre-menu transition-[background-color,color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover/rapide:translate-x-0.5"
                    fill="none"
                  >
                    <path
                      d="M3.5 8h9m-3.5-3.5L12.5 8 9 11.5"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{lien.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
