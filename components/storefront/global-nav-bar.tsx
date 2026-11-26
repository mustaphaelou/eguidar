"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  Cancel01Icon,
  Menu01Icon,
  Search01Icon,
  ShoppingBag01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/storefront/logo"
import { PanneauNavigation } from "@/components/storefront/panneau-navigation"
import { SearchSuggestions } from "@/components/storefront/search-suggestions"
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { buildSearchHref } from "@/lib/search-params"
import { site } from "@/lib/site"
import type { NavCategory } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"
import { ID_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { useApercuDuPanier } from "./apercu-du-panier-provider"
import { ApercuDuPanierSurface } from "./apercu-du-panier-surface"

const DELAI_OUVERTURE_MS = 80
const DELAI_FERMETURE_MS = 140

export function GlobalNavBar({
  categories = [],
  panierBadge,
  apercuCorps,
}: {
  categories?: readonly NavCategory[]
  panierBadge?: React.ReactNode
  apercuCorps?: React.ReactNode
}) {
  const { ouvert, basculer, fermer } = useApercuDuPanier()
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categorieMobileOuverte, setCategorieMobileOuverte] = useState<
    string | null
  >(null)
  const [categorieOuverteSlug, setCategorieOuverteSlug] = useState<
    string | null
  >(null)
  const [mouvementDuPanier, setMouvementDuPanier] = useState<{
    sens: "ouverture" | "fermeture"
    cle: number
  } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const panierRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)
  const navPanelRef = useRef<HTMLDivElement>(null)
  const categorieRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())
  const ouvertureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fermetureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focaliserPanneauAuProchainRendu = useRef(false)

  const aUneNavigation = categories.length > 0
  const categorieActive =
    categorieOuverteSlug === null
      ? null
      : (categories.find(
          (categorie) => categorie.slug === categorieOuverteSlug
        ) ?? null)
  const unPanneauEstOuvert =
    ouvert || searchOpen || menuOpen || categorieActive !== null

  const annulerDelais = useCallback(() => {
    if (ouvertureTimerRef.current !== null) {
      clearTimeout(ouvertureTimerRef.current)
      ouvertureTimerRef.current = null
    }
    if (fermetureTimerRef.current !== null) {
      clearTimeout(fermetureTimerRef.current)
      fermetureTimerRef.current = null
    }
  }, [])

  const fermerPanneauCategorie = useCallback(
    (rendreLeFocus = false) => {
      annulerDelais()
      const slugCourant = categorieOuverteSlug
      setCategorieOuverteSlug(null)
      if (rendreLeFocus && slugCourant !== null) {
        categorieRefs.current.get(slugCourant)?.focus({ preventScroll: true })
      }
    },
    [annulerDelais, categorieOuverteSlug]
  )

  const fermerRecherche = useCallback((rendreLeFocus = false) => {
    setSearchOpen(false)
    if (rendreLeFocus) {
      searchButtonRef.current?.focus({ preventScroll: true })
    }
  }, [])

  const fermerMenuMobile = useCallback((rendreLeFocus = false) => {
    setMenuOpen(false)
    setCategorieMobileOuverte(null)
    if (rendreLeFocus) {
      menuButtonRef.current?.focus({ preventScroll: true })
    }
  }, [])

  const fermerLApercu = useCallback(() => {
    setMouvementDuPanier((precedent) => ({
      sens: "fermeture",
      cle: (precedent?.cle ?? 0) + 1,
    }))
    fermer()
    panierRef.current?.focus({ preventScroll: true })
  }, [fermer])

  function basculerLApercu() {
    annulerDelais()
    setCategorieOuverteSlug(null)
    setSearchOpen(false)
    setMenuOpen(false)
    setCategorieMobileOuverte(null)
    if (ouvert) {
      fermerLApercu()
      return
    }
    setMouvementDuPanier((precedent) => ({
      sens: "ouverture",
      cle: (precedent?.cle ?? 0) + 1,
    }))
    basculer()
  }

  function survolCategorie(slug: string, pointerType: string) {
    if (pointerType !== "mouse") return
    annulerDelais()
    if (ouvert || searchOpen || menuOpen) return
    if (categorieOuverteSlug !== null) {
      setCategorieOuverteSlug(slug)
      return
    }
    ouvertureTimerRef.current = setTimeout(() => {
      ouvertureTimerRef.current = null
      setCategorieOuverteSlug(slug)
    }, DELAI_OUVERTURE_MS)
  }

  function quitterBandeau(pointerType: string) {
    if (pointerType !== "mouse") return
    annulerDelais()
    if (categorieOuverteSlug === null) return
    fermetureTimerRef.current = setTimeout(() => {
      fermetureTimerRef.current = null
      setCategorieOuverteSlug(null)
    }, DELAI_FERMETURE_MS)
  }

  useEffect(() => {
    return () => annulerDelais()
  }, [annulerDelais])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!menuOpen) return
    menuPanelRef.current
      ?.querySelector<HTMLAnchorElement>("a")
      ?.focus({ preventScroll: true })
  }, [menuOpen])

  useEffect(() => {
    if (!categorieActive || !focaliserPanneauAuProchainRendu.current) return
    focaliserPanneauAuProchainRendu.current = false
    navPanelRef.current
      ?.querySelector<HTMLAnchorElement>("a")
      ?.focus({ preventScroll: true })
  }, [categorieActive])

  useEffect(() => {
    if (!menuOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      fermerMenuMobile(true)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [menuOpen, fermerMenuMobile])

  useEffect(() => {
    if (!categorieActive) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      fermerPanneauCategorie(true)
    }

    function onScroll() {
      fermerPanneauCategorie(false)
    }

    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onScroll)
    }
  }, [categorieActive, fermerPanneauCategorie])

  useEffect(() => {
    if (!searchOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      fermerRecherche(true)
    }

    function onScroll() {
      fermerRecherche(false)
    }

    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onScroll)
    }
  }, [searchOpen, fermerRecherche])

  const liensRapidesRecherche = aUneNavigation
    ? [
        ...categories.slice(0, 5).map((categorie) => ({
          label: categorie.name,
          href: `/categorie/${categorie.slug}`,
        })),
        { label: "Tout le catalogue", href: "/produits" },
      ]
    : []

  return (
    <header
      onPointerEnter={annulerDelais}
      onPointerLeave={(event) => quitterBandeau(event.pointerType)}
      className={cn(
        "sticky inset-bs-0 pbs-[env(safe-area-inset-top,0px)] transition-[background-color,box-shadow] duration-200 ease-out",
        unPanneauEstOuvert ? "z-50 bg-background" : "z-40",
        scrolled &&
          !unPanneauEstOuvert &&
          "voile-depoli filet-bas [--voile-depoli-opacite:80%]"
      )}
    >
      <div
        onPointerEnter={annulerDelais}
        className={cn(
          CONTENEUR_BOUTIQUE,
          "relative z-20 flex h-11 items-center justify-between gap-4"
        )}
      >
        <Link
          href="/"
          className="shrink-0 transition-opacity duration-150 ease-out active:opacity-70"
          aria-label={`${site.name} — Accueil`}
          onClick={() => {
            fermerPanneauCategorie(false)
            fermerRecherche(false)
            fermerMenuMobile(false)
          }}
        >
          <Logo />
        </Link>

        {aUneNavigation ? (
          <nav
            aria-label="Catégories"
            className="hidden min-w-0 flex-1 items-center justify-center lg:flex"
          >
            <ul className="flex items-center gap-6">
              {categories.map((categorie) => {
                const estActive = categorieActive?.slug === categorie.slug
                return (
                  <li key={categorie.slug}>
                    <Link
                      ref={(node) => {
                        if (node) {
                          categorieRefs.current.set(categorie.slug, node)
                        } else {
                          categorieRefs.current.delete(categorie.slug)
                        }
                      }}
                      href={`/categorie/${categorie.slug}`}
                      aria-expanded={estActive}
                      aria-controls={
                        estActive
                          ? `panneau-categorie-${categorie.slug}`
                          : undefined
                      }
                      onPointerEnter={(event) =>
                        survolCategorie(categorie.slug, event.pointerType)
                      }
                      onClick={() => fermerPanneauCategorie(false)}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowDown") return
                        event.preventDefault()
                        annulerDelais()
                        fermer()
                        setSearchOpen(false)
                        setMenuOpen(false)
                        focaliserPanneauAuProchainRendu.current = true
                        setCategorieOuverteSlug(categorie.slug)
                      }}
                      className={cn(
                        "inline-flex items-center text-[12px] leading-[1.3334] tracking-[-0.01em] whitespace-nowrap transition-[color,opacity] duration-150 ease-out min-block-11 active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
                        estActive ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {categorie.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        ) : null}

        <div className="flex shrink-0 items-center gap-0.5">
          {aUneNavigation ? (
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="icon"
              aria-label={
                menuOpen ? "Fermer les catégories" : "Ouvrir les catégories"
              }
              aria-expanded={menuOpen}
              aria-controls="menu-categories"
              className="lg:hidden"
              onClick={() => {
                annulerDelais()
                setCategorieOuverteSlug(null)
                if (!menuOpen) {
                  setSearchOpen(false)
                  fermer()
                }
                setMenuOpen(!menuOpen)
                setCategorieMobileOuverte(null)
              }}
            >
              <span className="flex items-center justify-center group-active/button:duration-[100ms] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out motion-safe:group-active/button:scale-90">
                <HugeiconsIcon
                  icon={menuOpen ? Cancel01Icon : Menu01Icon}
                  strokeWidth={2}
                />
              </span>
            </Button>
          ) : null}
          <Button
            ref={searchButtonRef}
            variant="ghost"
            size="icon"
            aria-label="Rechercher"
            aria-expanded={searchOpen}
            className={cn(
              searchOpen &&
                "text-link [@media(hover:hover)_and_(pointer:fine)]:hover:text-link"
            )}
            onClick={() => {
              annulerDelais()
              setCategorieOuverteSlug(null)
              if (!searchOpen) {
                fermer()
                setMenuOpen(false)
                setCategorieMobileOuverte(null)
              }
              setSearchOpen(!searchOpen)
            }}
          >
            <span className="flex items-center justify-center group-active/button:duration-[100ms] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out motion-safe:group-active/button:scale-90">
              <HugeiconsIcon
                icon={searchOpen ? Cancel01Icon : Search01Icon}
                strokeWidth={2}
              />
            </span>
          </Button>
          <Button
            ref={panierRef}
            variant="ghost"
            size="icon"
            aria-expanded={ouvert}
            aria-controls={ID_APERCU_DU_PANIER}
            className="relative"
            onClick={basculerLApercu}
          >
            <span
              key={mouvementDuPanier?.cle ?? 0}
              data-slot="icone-du-panier"
              data-mouvement={mouvementDuPanier?.sens}
              className="flex items-center justify-center group-active/button:duration-[100ms] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out motion-safe:group-active/button:scale-90"
            >
              <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} />
            </span>
            <span className="sr-only">Panier</span>
            {panierBadge}
          </Button>
        </div>
      </div>

      {categorieActive ? (
        <PanneauNavigation
          categorie={categorieActive}
          panelRef={navPanelRef}
          onClose={() => fermerPanneauCategorie(false)}
          onNavigate={() => fermerPanneauCategorie(false)}
          onBackdropPointerEnter={quitterBandeau}
          onPanelPointerEnter={annulerDelais}
        />
      ) : null}

      {aUneNavigation ? (
        <div
          ref={menuPanelRef}
          id="menu-categories"
          hidden={!menuOpen}
          data-slot={menuOpen ? "panneau-navigation" : undefined}
          className="absolute inset-x-0 inset-bs-11 z-10 h-[calc(100dvh-2.75rem)] overflow-y-auto bg-background lg:hidden"
        >
          <nav
            aria-label="Catégories"
            className={cn(CONTENEUR_BOUTIQUE, "pbs-6 pbe-12")}
          >
            <ul className="flex flex-col gap-1">
              {categories.map((categorie, index) => {
                const enfants = categorie.children ?? []
                const marques = categorie.brands ?? []
                const aDesDetails = enfants.length > 0 || marques.length > 0
                const estDepliee = categorieMobileOuverte === categorie.slug
                return (
                  <li
                    key={categorie.slug}
                    data-slot={menuOpen ? "element-navigation" : undefined}
                    style={{ "--rang-element": index } as CSSProperties}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/categorie/${categorie.slug}`}
                        onClick={() => fermerMenuMobile(false)}
                        className="flex flex-1 items-center text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-encre-menu transition-[color,opacity] duration-150 ease-out min-block-11 active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                      >
                        {categorie.name}
                      </Link>
                      {aDesDetails ? (
                        <button
                          type="button"
                          aria-label={
                            estDepliee
                              ? `Réduire ${categorie.name}`
                              : `Déplier ${categorie.name}`
                          }
                          aria-expanded={estDepliee}
                          onClick={() =>
                            setCategorieMobileOuverte(
                              estDepliee ? null : categorie.slug
                            )
                          }
                          className="zone-tactile inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 16 16"
                            className={cn(
                              "size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
                              estDepliee && "rotate-180"
                            )}
                            fill="none"
                          >
                            <path
                              d="m4 6 4 4 4-4"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>

                    {aDesDetails && estDepliee ? (
                      <div className="border-is pis-4 mbs-1 mbe-3 flex flex-col gap-3 border-hairline">
                        {enfants.length > 0 ? (
                          <ul className="flex flex-col gap-0.5">
                            {enfants.map((enfant) => (
                              <li key={enfant.slug}>
                                <Link
                                  href={`/categorie/${enfant.slug}`}
                                  onClick={() => fermerMenuMobile(false)}
                                  className="flex items-center text-[15px] leading-[1.35] font-medium text-encre-menu transition-[color,opacity] duration-150 ease-out min-block-9 active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                                >
                                  {enfant.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {marques.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <p className="text-[12px] leading-[1.3334] tracking-[-0.01em] text-muted-foreground">
                              Par marque
                            </p>
                            <ul className="flex flex-wrap gap-1.5">
                              {marques.map((marque) => (
                                <li key={marque}>
                                  <Link
                                    href={buildSearchHref(
                                      "",
                                      {
                                        categorySlug: categorie.slug,
                                        brand: [marque],
                                      },
                                      {},
                                      {},
                                      "/produits"
                                    )}
                                    onClick={() => fermerMenuMobile(false)}
                                    className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-[12px] leading-[1.3334] font-medium text-encre-menu transition-[background-color,color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                                  >
                                    {marque}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      ) : null}

      {searchOpen ? (
        <>
          <div
            data-slot="voile-navigation"
            aria-hidden="true"
            className="voile-floute fixed inset-0 z-0 bg-voile-navigation"
            onClick={() => fermerRecherche(true)}
          />
          <div
            data-slot="panneau-navigation"
            className="absolute inset-x-0 inset-bs-0 z-10 bg-background pbs-11 shadow-[0_24px_48px_-32px_oklch(0.2_0_none/0.22)]"
          >
            <div className={cn(CONTENEUR_BOUTIQUE, "pbs-6 pbe-10")}>
              <form
                method="GET"
                action="/recherche"
                className="relative flex flex-col"
                onSubmit={(event) => {
                  event.preventDefault()
                  const query = String(
                    new FormData(event.currentTarget).get("q") ?? ""
                  ).trim()
                  setSearchOpen(false)
                  router.push(buildSearchHref(query, {}, {}, {}, "/recherche"))
                }}
              >
                <SearchSuggestions
                  inputRef={searchInputRef}
                  variant="rideau"
                  quickLinks={liensRapidesRecherche}
                  onEscape={() => fermerRecherche(true)}
                  onNavigate={() => setSearchOpen(false)}
                  leading={
                    <HugeiconsIcon
                      icon={Search01Icon}
                      strokeWidth={2}
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                  }
                  trailing={
                    <Button
                      type="submit"
                      size="sm"
                      className="shrink-0 rounded-full motion-safe:active:scale-[0.97]"
                    >
                      Rechercher
                    </Button>
                  }
                />
              </form>
            </div>
          </div>
        </>
      ) : null}

      {ouvert ? (
        <ApercuDuPanierSurface onClose={fermerLApercu}>
          {apercuCorps}
        </ApercuDuPanierSurface>
      ) : null}
    </header>
  )
}
