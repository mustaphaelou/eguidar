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
      <SelectTrigger size="sm">
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
