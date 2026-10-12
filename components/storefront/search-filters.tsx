"use client"

import {
  createContext,
  Fragment,
  use,
  useCallback,
  useId,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"

import {
  Cancel01Icon,
  FilterIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import type { OptionDeFiltre, OptionsDeFiltre } from "@/lib/options-de-filtre"
import {
  buildSearchHref,
  toggleBrand,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"

const OPTIONS_VISIBLES = 8

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
      <div className="max-block-size-[calc(100svh-5rem)] sticky top-16 [scrollbar-width:thin] scrollbar-gutter-stable overflow-y-auto overscroll-contain">
        <FilterGroups facets={facets} />
      </div>
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
      <DrawerContent className="rounded-none border-0 bg-background [--drawer-content-height:100dvh] [--drawer-content-max-height:100dvh] [--drawer-inset:0px]">
        <DrawerHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4">
            <FilterGroups facets={facets} />
          </div>
        </div>
        <DrawerFooter className="mt-0 border-t border-border bg-background p-4">
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
          className="cursor-pointer active:opacity-70"
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
          className="cursor-pointer active:opacity-70"
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
          className="cursor-pointer active:opacity-70"
        >
          {priceBucket.label}
          <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-end" />
        </Badge>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="px-0 text-link hover:bg-transparent"
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

interface LigneOptionProps {
  option: OptionDeFiltre
  controle: React.ReactNode
}

function LigneOption({ option, controle }: LigneOptionProps) {
  return (
    <label className="group/option -mx-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground active:opacity-70 has-data-checked:font-semibold has-data-checked:text-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring">
      {controle}
      <HugeiconsIcon
        icon={Tick02Icon}
        strokeWidth={2}
        className="hidden size-3.5 shrink-0 text-foreground group-has-data-checked/option:block"
      />
      <span className="truncate">{option.label}</span>
      <span className="ms-auto ps-2 text-xs text-muted-foreground tabular-nums">
        {option.count}
      </span>
    </label>
  )
}

function BoutonVoirPlus({
  cachees,
  deplie,
  onBasculer,
}: {
  cachees: number
  deplie: boolean
  onBasculer: () => void
}) {
  if (cachees === 0 && !deplie) return null
  return (
    <Button
      variant="link"
      size="sm"
      className="mt-1 h-auto px-0 text-link"
      aria-expanded={deplie}
      onClick={onBasculer}
    >
      {deplie ? "Voir moins" : `Voir plus (${cachees})`}
    </Button>
  )
}

interface GroupeDeFiltres {
  valeur: string
  intitule: string
  legende: string
  options: OptionDeFiltre[]
  rendu: boolean
  radio: boolean
  controle: (option: OptionDeFiltre) => React.ReactNode
}

function FilterGroups({ facets }: { facets: SearchFacets }) {
  const { filters, navigate } = useSearchNavigation()
  const [marquesDepliees, setMarquesDepliees] = useState(false)
  const [categoriesDepliees, setCategoriesDepliees] = useState(false)
  const idPrefix = useId()

  const activeBrands = filters.brand ?? []

  const brandOptions = facets.brands.filter(
    (option) => option.count > 0 || option.selected
  )
  const visibleBrands = marquesDepliees
    ? brandOptions
    : brandOptions.filter(
        (option, index) => index < OPTIONS_VISIBLES || option.selected
      )
  const hiddenBrandCount = brandOptions.length - visibleBrands.length

  const categoryOptions = facets.categories.filter(
    (option) => option.count > 0 || option.selected
  )
  const visibleCategories = categoriesDepliees
    ? categoryOptions
    : categoryOptions.filter(
        (option, index) => index < OPTIONS_VISIBLES || option.selected
      )
  const hiddenCategoryCount = categoryOptions.length - visibleCategories.length

  const priceOptions = facets.priceBuckets.filter(
    (option) => option.count > 0 || option.selected
  )

  const groupes: GroupeDeFiltres[] = [
    {
      valeur: "brand",
      intitule: "Marque",
      legende: "Marque",
      options: visibleBrands,
      rendu: brandOptions.length > 0,
      radio: false,
      controle: (option: OptionDeFiltre) => (
        <Checkbox
          className="sr-only"
          checked={activeBrands.includes(option.value)}
          onCheckedChange={() =>
            navigate({ brand: toggleBrand(activeBrands, option.value) })
          }
        />
      ),
    },
    {
      valeur: "category",
      intitule: "Catégorie",
      legende: "Catégorie",
      options: visibleCategories,
      rendu: categoryOptions.length > 0,
      radio: true,
      controle: (option: OptionDeFiltre) => (
        <RadioGroupItem
          value={option.value}
          id={`${idPrefix}-categorie-${option.value}`}
          className="sr-only"
        />
      ),
    },
    {
      valeur: "price",
      intitule: "Prix",
      legende: "Tranche de prix",
      options: priceOptions,
      rendu: priceOptions.length > 0,
      radio: true,
      controle: (option: OptionDeFiltre) => (
        <RadioGroupItem
          value={option.value}
          id={`${idPrefix}-prix-${option.value}`}
          className="sr-only"
        />
      ),
    },
  ].filter((groupe: GroupeDeFiltres): boolean => groupe.rendu)

  return (
    <Accordion
      multiple
      defaultValue={FILTER_GROUP_DEFAULT_OPEN}
      className="rounded-none border-0"
    >
      {groupes.map((groupe, index) => (
        <Fragment key={groupe.valeur}>
          {index > 0 ? <Separator /> : null}
          <AccordionItem
            value={groupe.valeur}
            className="not-last:border-b-0 data-open:bg-transparent"
          >
            <AccordionTrigger className="px-4 py-2 text-xs font-semibold">
              {groupe.intitule}
            </AccordionTrigger>
            <AccordionContent>
              <FieldSet>
                <FieldLegend className="sr-only">{groupe.legende}</FieldLegend>
                {groupe.radio ? (
                  <RadioGroup
                    value={
                      groupe.valeur === "category"
                        ? (filters.categorySlug ?? null)
                        : (filters.priceBucketId ?? null)
                    }
                    onValueChange={(value) =>
                      navigate(
                        groupe.valeur === "category"
                          ? { categorySlug: String(value) }
                          : { priceBucketId: String(value) }
                      )
                    }
                    className="gap-0"
                  >
                    {groupe.options.map((option) => (
                      <LigneOption
                        key={option.value}
                        option={option}
                        controle={groupe.controle(option)}
                      />
                    ))}
                  </RadioGroup>
                ) : (
                  <div className="flex flex-col">
                    {groupe.options.map((option) => (
                      <LigneOption
                        key={option.value}
                        option={option}
                        controle={groupe.controle(option)}
                      />
                    ))}
                  </div>
                )}
                {groupe.valeur === "category" ? (
                  <BoutonVoirPlus
                    cachees={hiddenCategoryCount}
                    deplie={categoriesDepliees}
                    onBasculer={() =>
                      setCategoriesDepliees((deplie) => !deplie)
                    }
                  />
                ) : null}
                {groupe.valeur === "brand" ? (
                  <BoutonVoirPlus
                    cachees={hiddenBrandCount}
                    deplie={marquesDepliees}
                    onBasculer={() => setMarquesDepliees((deplie) => !deplie)}
                  />
                ) : null}
              </FieldSet>
            </AccordionContent>
          </AccordionItem>
        </Fragment>
      ))}
    </Accordion>
  )
}
