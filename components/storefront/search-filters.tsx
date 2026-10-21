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
import {
  choisirValeur,
  nombreDeFiltres,
  retirerValeur,
  valeursRetenues,
  type FiltreActif,
  type OptionDeFiltre,
  type OptionsDeFiltre,
} from "@/lib/filtre-de-recherche"
import {
  buildSearchHref,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"

const OPTIONS_VISIBLES = 8

const FILTER_GROUP_DEFAULT_OPEN = ["marque", "categorie", "prix"]

type SearchFacets = OptionsDeFiltre

interface SearchNavigationValue {
  filters: SearchFilters
  isPending: boolean
  navigate: (filters: SearchFilters) => void
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
    (next: SearchFilters) => {
      startTransition(() => {
        setOptimisticFilters(next)
        router.push(
          buildSearchHref(query, next, {}, { sort, page: 1 }, hrefBase)
        )
      })
    },
    [query, sort, hrefBase, router, setOptimisticFilters]
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
      <div className="sticky top-14 [scrollbar-width:thin] scrollbar-gutter-stable overflow-y-auto overscroll-contain max-block-[calc(100svh-4.5rem)]">
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
  const activeCount = nombreDeFiltres(filters)

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
      <DrawerContent className="rounded-none border-0 bg-background data-[swipe-axis=y]:max-h-dvh data-[swipe-axis=y]:[--drawer-content-height:100dvh] data-[swipe-axis=y]:[--drawer-inset:0px]">
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

export function ActiveFilters({
  filtresActifs,
}: {
  filtresActifs: readonly FiltreActif[]
}) {
  const { filters, navigate } = useSearchNavigation()

  if (nombreDeFiltres(filters) === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {filtresActifs.map((filtre) => (
        <Badge
          key={`${filtre.cle}-${filtre.valeur}`}
          variant="secondary"
          render={
            <button
              type="button"
              aria-label={filtre.ariaLabel}
              onClick={() =>
                navigate(retirerValeur(filters, filtre.cle, filtre.valeur))
              }
            />
          }
          className="cursor-pointer active:opacity-70"
        >
          {filtre.label}
          <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-end" />
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="px-0 text-link hover:bg-transparent"
        onClick={() => navigate({})}
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
      <span className="min-w-0 truncate">{option.label}</span>
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

interface GroupeAOptions {
  valeur: string
  intitule: string
  legende?: string
  options: OptionDeFiltre[]
  controle: (option: OptionDeFiltre) => React.ReactNode
}

interface GroupeDeFiltres extends GroupeAOptions {
  radio?: false
}

interface GroupeRadio extends GroupeAOptions {
  radio: true
  filtreActif: string | null
  onChoisir: (valeur: string) => void
}

interface GroupeDepliable extends GroupeAOptions {
  voirPlus?: {
    cachees: number
    deplie: boolean
    onBasculer: () => void
  }
}

type Groupe = (GroupeDeFiltres | GroupeRadio) & GroupeDepliable

function optionsVisibles(
  options: OptionDeFiltre[],
  plafond: number,
  deplie: boolean
): { visibles: OptionDeFiltre[]; cachees: number } {
  const retenues = options.filter(
    (option) => option.count > 0 || option.selected
  )
  if (deplie) return { visibles: retenues, cachees: 0 }
  const visibles = retenues.filter(
    (option, index) => index < plafond || option.selected
  )
  return { visibles, cachees: retenues.length - visibles.length }
}

function FilterGroups({ facets }: { facets: SearchFacets }) {
  const { filters, navigate } = useSearchNavigation()
  const [marquesDepliees, setMarquesDepliees] = useState(false)
  const [categoriesDepliees, setCategoriesDepliees] = useState(false)
  const idPrefix = useId()

  const activeBrands = valeursRetenues(filters, "marque")

  const brandOptions = optionsVisibles(
    facets.marque,
    OPTIONS_VISIBLES,
    marquesDepliees
  )
  const visibleBrands = brandOptions.visibles
  const hiddenBrandCount = brandOptions.cachees

  const categoryOptions = optionsVisibles(
    facets.categorie,
    OPTIONS_VISIBLES,
    categoriesDepliees
  )
  const visibleCategories = categoryOptions.visibles
  const hiddenCategoryCount = categoryOptions.cachees

  const priceOptions = facets.prix.filter(
    (option) => option.count > 0 || option.selected
  )

  const groupes: Groupe[] = [
    {
      valeur: "marque",
      intitule: "Marque",
      options: visibleBrands,
      controle: (option: OptionDeFiltre) => (
        <Checkbox
          className="sr-only"
          checked={activeBrands.includes(option.value)}
          onCheckedChange={(cochee) =>
            navigate(
              cochee
                ? choisirValeur(filters, "marque", option.value)
                : retirerValeur(filters, "marque", option.value)
            )
          }
        />
      ),
      voirPlus: {
        cachees: hiddenBrandCount,
        deplie: marquesDepliees,
        onBasculer: () => setMarquesDepliees((deplie) => !deplie),
      },
    },
    {
      valeur: "categorie",
      intitule: "Catégorie",
      options: visibleCategories,
      radio: true,
      filtreActif: valeursRetenues(filters, "categorie")[0] ?? null,
      onChoisir: (valeur: string) =>
        navigate(choisirValeur(filters, "categorie", valeur)),
      controle: (option: OptionDeFiltre) => (
        <RadioGroupItem
          value={option.value}
          id={`${idPrefix}-categorie-${option.value}`}
          className="sr-only"
        />
      ),
      voirPlus: {
        cachees: hiddenCategoryCount,
        deplie: categoriesDepliees,
        onBasculer: () => setCategoriesDepliees((deplie) => !deplie),
      },
    },
    {
      valeur: "prix",
      intitule: "Prix",
      legende: "Tranche de prix",
      options: priceOptions,
      radio: true,
      filtreActif: valeursRetenues(filters, "prix")[0] ?? null,
      onChoisir: (valeur: string) =>
        navigate(choisirValeur(filters, "prix", valeur)),
      controle: (option: OptionDeFiltre) => (
        <RadioGroupItem
          value={option.value}
          id={`${idPrefix}-prix-${option.value}`}
          className="sr-only"
        />
      ),
    },
  ].filter((groupe: Groupe): boolean => groupe.options.length > 0)

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
                <FieldLegend className="sr-only">
                  {groupe.legende ?? groupe.intitule}
                </FieldLegend>
                {groupe.radio ? (
                  <RadioGroup
                    value={groupe.filtreActif}
                    onValueChange={(valeur) => groupe.onChoisir(String(valeur))}
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
                {groupe.voirPlus ? (
                  <BoutonVoirPlus
                    cachees={groupe.voirPlus.cachees}
                    deplie={groupe.voirPlus.deplie}
                    onBasculer={groupe.voirPlus.onBasculer}
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
