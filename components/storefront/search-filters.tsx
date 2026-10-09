"use client"

import {
  createContext,
  use,
  useCallback,
  useId,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"

import { Cancel01Icon, FilterIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { OptionsDeFiltre } from "@/lib/options-de-filtre"
import {
  buildSearchHref,
  toggleBrand,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"

const BRAND_VISIBLE_COUNT = 8

const FILTER_GROUP_DEFAULT_OPEN = ["brand", "category", "price"]

type SearchFacets = OptionsDeFiltre

interface SearchNavigationValue {
  filters: SearchFilters
  isPending: boolean
  navigate: (patch: Partial<SearchFilters>) => void
}

const SearchNavigationContext = createContext<SearchNavigationValue | null>(
  null
)

function useSearchNavigation(): SearchNavigationValue {
  const context = use(SearchNavigationContext)
  if (!context) {
    throw new Error(
      "useSearchNavigation must be used within a SearchNavigationProvider"
    )
  }
  return context
}

function countActiveFilters(filters: SearchFilters): number {
  return (
    (filters.brand?.length ?? 0) +
    (filters.categorySlug ? 1 : 0) +
    (filters.priceBucketId ? 1 : 0)
  )
}

export function SearchNavigationProvider({
  query,
  filters,
  sort,
  hrefBase,
  children,
}: {
  query: string
  filters: SearchFilters
  sort: SearchSort
  hrefBase: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticFilters, setOptimisticFilters] = useOptimistic(filters)

  const navigate = useCallback(
    (patch: Partial<SearchFilters>) => {
      const next = { ...optimisticFilters, ...patch }
      startTransition(() => {
        setOptimisticFilters(next)
        router.push(
          buildSearchHref(query, next, {}, { sort, page: 1 }, hrefBase)
        )
      })
    },
    [optimisticFilters, query, sort, hrefBase, router, setOptimisticFilters]
  )

  const value = useMemo(
    () => ({ filters: optimisticFilters, isPending, navigate }),
    [optimisticFilters, isPending, navigate]
  )

  return (
    <SearchNavigationContext value={value}>{children}</SearchNavigationContext>
  )
}

export function SearchResultsPending({
  children,
}: {
  children: React.ReactNode
}) {
  const { isPending } = useSearchNavigation()

  return (
    <div
      aria-busy={isPending}
      data-pending={isPending ? "" : undefined}
      className="transition-opacity duration-200 data-[pending]:opacity-60"
    >
      {children}
    </div>
  )
}

export function FilterSidebar({ facets }: { facets: SearchFacets }) {
  return (
    <aside className="hidden md:block">
      <Card className="sticky top-16 gap-0 py-0">
        <CardContent className="px-0">
          <FilterGroups facets={facets} />
        </CardContent>
      </Card>
    </aside>
  )
}

export function MobileFilterDrawer({
  facets,
  totalHits,
}: {
  facets: SearchFacets
  totalHits: number
}) {
  const { filters } = useSearchNavigation()
  const activeCount = countActiveFilters(filters)

  return (
    <Drawer showSwipeHandle>
      <DrawerTrigger
        render={<Button variant="outline" size="sm" className="md:hidden" />}
      >
        <HugeiconsIcon icon={FilterIcon} data-icon="inline-start" />
        Filtrer
        {activeCount > 0 ? (
          <Badge variant="secondary">{activeCount}</Badge>
        ) : null}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="flex-row items-center justify-between">
          <DrawerTitle>Filtrer</DrawerTitle>
          <DrawerClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Fermer les filtres"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </DrawerClose>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4">
            <FilterGroups facets={facets} />
          </div>
        </ScrollArea>
        <DrawerFooter>
          <DrawerClose render={<Button className="w-full" />}>
            Afficher les résultats ({totalHits})
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function ActiveFilters({ facets }: { facets: SearchFacets }) {
  const { filters, navigate } = useSearchNavigation()
  const activeBrands = filters.brand ?? []
  const categoryName = facets.categories.find(
    (category) => category.value === filters.categorySlug
  )?.label
  const priceBucket = facets.priceBuckets.find(
    (bucket) => bucket.value === filters.priceBucketId
  )

  if (countActiveFilters(filters) === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {activeBrands.map((brand) => (
        <Badge
          key={brand}
          variant="secondary"
          render={
            <button
              type="button"
              aria-label={`Retirer la marque ${brand}`}
              onClick={() =>
                navigate({ brand: toggleBrand(activeBrands, brand) })
              }
            />
          }
          className="cursor-pointer"
        >
          {brand}
          <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-end" />
        </Badge>
      ))}
      {filters.categorySlug ? (
        <Badge
          variant="secondary"
          render={
            <button
              type="button"
              aria-label={`Retirer la catégorie ${categoryName ?? filters.categorySlug}`}
              onClick={() => navigate({ categorySlug: undefined })}
            />
          }
          className="cursor-pointer"
        >
          {categoryName ?? filters.categorySlug}
          <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-end" />
        </Badge>
      ) : null}
      {priceBucket ? (
        <Badge
          variant="secondary"
          render={
            <button
              type="button"
              aria-label={`Retirer la tranche de prix ${priceBucket.label}`}
              onClick={() => navigate({ priceBucketId: undefined })}
            />
          }
          className="cursor-pointer"
        >
          {priceBucket.label}
          <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-end" />
        </Badge>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          navigate({
            brand: undefined,
            categorySlug: undefined,
            priceBucketId: undefined,
          })
        }
      >
        Tout effacer
      </Button>
    </div>
  )
}

function FilterGroups({ facets }: { facets: SearchFacets }) {
  const { filters, navigate } = useSearchNavigation()
  const [showAllBrands, setShowAllBrands] = useState(false)
  const idPrefix = useId()

  const activeBrands = filters.brand ?? []

  const brandOptions = facets.brands.filter(
    (option) => option.count > 0 || option.selected
  )
  const visibleBrands = showAllBrands
    ? brandOptions
    : brandOptions.filter(
        (option, index) => index < BRAND_VISIBLE_COUNT || option.selected
      )
  const hiddenBrandCount = brandOptions.length - visibleBrands.length

  const categoryOptions = facets.categories.filter(
    (option) => option.count > 0 || option.selected
  )

  const priceOptions = facets.priceBuckets.filter(
    (option) => option.count > 0 || option.selected
  )

  return (
    <Accordion
      multiple
      defaultValue={FILTER_GROUP_DEFAULT_OPEN}
      className="rounded-none border-0"
    >
      <AccordionItem
        value="brand"
        className="not-last:border-b-0 data-open:bg-transparent"
      >
        <AccordionTrigger>Marque</AccordionTrigger>
        <AccordionContent>
          <FieldSet>
            <FieldLegend className="sr-only">Marque</FieldLegend>
            <FieldGroup className="gap-3">
              {visibleBrands.map((option, index) => (
                <Field key={option.value} orientation="horizontal">
                  <Checkbox
                    id={`${idPrefix}-marque-${index}`}
                    checked={activeBrands.includes(option.value)}
                    onCheckedChange={() =>
                      navigate({
                        brand: toggleBrand(activeBrands, option.value),
                      })
                    }
                  />
                  <FieldLabel
                    htmlFor={`${idPrefix}-marque-${index}`}
                    className="min-w-0 font-normal"
                  >
                    <span className="truncate">{option.label}</span>
                    <span className="ms-auto ps-2 text-xs text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
          {hiddenBrandCount > 0 || showAllBrands ? (
            <Button
              variant="link"
              size="sm"
              className="mt-2 h-auto px-0"
              onClick={() => setShowAllBrands((expanded) => !expanded)}
            >
              {showAllBrands ? "Voir moins" : `Voir plus (${hiddenBrandCount})`}
            </Button>
          ) : null}
        </AccordionContent>
      </AccordionItem>

      <Separator />

      <AccordionItem
        value="category"
        className="not-last:border-b-0 data-open:bg-transparent"
      >
        <AccordionTrigger>Catégorie</AccordionTrigger>
        <AccordionContent>
          <FieldSet>
            <FieldLegend className="sr-only">Catégorie</FieldLegend>
            <RadioGroup
              value={filters.categorySlug ?? null}
              onValueChange={(value) =>
                navigate({ categorySlug: String(value) })
              }
            >
              {categoryOptions.map((option, index) => (
                <Field key={option.value} orientation="horizontal">
                  <RadioGroupItem
                    value={option.value}
                    id={`${idPrefix}-categorie-${index}`}
                  />
                  <FieldLabel
                    htmlFor={`${idPrefix}-categorie-${index}`}
                    className="min-w-0 font-normal"
                  >
                    <span className="truncate">{option.label}</span>
                    <span className="ms-auto ps-2 text-xs text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>
        </AccordionContent>
      </AccordionItem>

      <Separator />

      <AccordionItem
        value="price"
        className="not-last:border-b-0 data-open:bg-transparent"
      >
        <AccordionTrigger>Prix</AccordionTrigger>
        <AccordionContent>
          <FieldSet>
            <FieldLegend className="sr-only">Tranche de prix</FieldLegend>
            <RadioGroup
              value={filters.priceBucketId ?? null}
              onValueChange={(value) =>
                navigate({ priceBucketId: String(value) })
              }
            >
              {priceOptions.map((option, index) => (
                <Field key={option.value} orientation="horizontal">
                  <RadioGroupItem
                    value={option.value}
                    id={`${idPrefix}-prix-${index}`}
                  />
                  <FieldLabel
                    htmlFor={`${idPrefix}-prix-${index}`}
                    className="min-w-0 font-normal"
                  >
                    <span className="truncate">{option.label}</span>
                    <span className="ms-auto ps-2 text-xs text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
