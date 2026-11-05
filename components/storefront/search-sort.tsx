"use client"

import { useRouter } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  buildSearchHref,
  SEARCH_SORT_OPTIONS,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"

/**
 * `items` donne au Select le libellé de chaque valeur : sans lui, le bouton
 * affiche l'identifiant brut (« nouveautes ») plutôt que le libellé
 * (« Nouveautés »). Le nom accessible, lui, vient de l'`aria-label` du
 * déclencheur : un `role="combobox"` ne prend jamais son nom dans son contenu.
 */
const ITEMS = SEARCH_SORT_OPTIONS.map((option) => ({
  value: option.id,
  label: option.label,
}))

export function SearchSort({
  sort,
  query,
  filters,
  hrefBase = "/recherche",
}: {
  sort: SearchSort
  query: string
  filters: SearchFilters
  hrefBase?: string
}) {
  const router = useRouter()

  return (
    <Select
      items={ITEMS}
      value={sort}
      onValueChange={(next) => {
        router.push(
          buildSearchHref(
            query,
            filters,
            {},
            { sort: next as SearchSort, page: 1 },
            hrefBase
          )
        )
      }}
    >
      <SelectTrigger size="sm" aria-label="Trier les résultats">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SEARCH_SORT_OPTIONS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
