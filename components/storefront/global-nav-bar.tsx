"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { buildSearchHref } from "@/lib/search-params"
import { site } from "@/lib/site"
import type { NavCategory } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"
import { ID_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { useApercuDuPanier } from "./apercu-du-panier-provider"
import { ApercuDuPanierSurface } from "./apercu-du-panier-surface"
import {
  estPointeurFin,
  FeuilleRecherche,
  FeuilleStructure,
  MenuMobileStructures,
  type LienDeFeuille,
} from "./feuille-navigation"

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
  const feuilleRef = useRef<HTMLDivElement>(null)
  const categorieRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())
  const ouvertureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fermetureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focaliserFeuilleAuProchainRendu = useRef(false)

  const aUneNavigation = categories.length > 0
  const categorieActive =
    categorieOuverteSlug === null
      ? null
      : (categories.find(
          (categorie) => categorie.slug === categorieOuverteSlug
        ) ?? null)
  const uneFeuilleEstOuverte =
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

  const fermerFeuilleCategorie = useCallback(
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

  function survolCategorie(slug: string) {
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

  const programmerFermetureCategorie = useCallback(() => {
    annulerDelais()
    if (categorieOuverteSlug === null) return
    fermetureTimerRef.current = setTimeout(() => {
      fermetureTimerRef.current = null
      setCategorieOuverteSlug(null)
    }, DELAI_FERMETURE_MS)
  }, [annulerDelais, categorieOuverteSlug])

  useEffect(() => annulerDelais, [annulerDelais])

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
    if (!categorieActive || !focaliserFeuilleAuProchainRendu.current) return
    focaliserFeuilleAuProchainRendu.current = false
    feuilleRef.current
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
    if (!categorieActive && !searchOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      if (categorieActive) {
        fermerFeuilleCategorie(true)
      } else {
        fermerRecherche(true)
      }
    }

    function onScroll() {
      if (categorieActive) {
        fermerFeuilleCategorie(false)
      } else {
        fermerRecherche(false)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onScroll)
    }
  }, [categorieActive, searchOpen, fermerFeuilleCategorie, fermerRecherche])

  const liensRapidesRecherche: readonly LienDeFeuille[] = aUneNavigation
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
      onPointerLeave={(event) => {
        if (estPointeurFin(event)) programmerFermetureCategorie()
      }}
      className={cn(
        "sticky inset-bs-0 pbs-[env(safe-area-inset-top,0px)] transition-[background-color,box-shadow] duration-200 ease-out",
        uneFeuilleEstOuverte ? "z-50" : "z-40",
        scrolled &&
          !uneFeuilleEstOuverte &&
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
            fermerFeuilleCategorie(false)
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
                          ? `feuille-categorie-${categorie.slug}`
                          : undefined
                      }
                      onPointerEnter={(event) => {
                        if (estPointeurFin(event)) {
                          survolCategorie(categorie.slug)
                        }
                      }}
                      onClick={() => fermerFeuilleCategorie(false)}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowDown") return
                        event.preventDefault()
                        annulerDelais()
                        fermer()
                        setSearchOpen(false)
                        setMenuOpen(false)
                        focaliserFeuilleAuProchainRendu.current = true
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
        <FeuilleStructure
          categorie={categorieActive}
          panelRef={feuilleRef}
          onClose={() => fermerFeuilleCategorie(false)}
          onNavigate={() => fermerFeuilleCategorie(false)}
          onBackdropFinePointerEnter={programmerFermetureCategorie}
          onPanelPointerEnter={annulerDelais}
        />
      ) : null}

      {aUneNavigation ? (
        <MenuMobileStructures
          categories={categories}
          ouvert={menuOpen}
          categorieDepliee={categorieMobileOuverte}
          menuPanelRef={menuPanelRef}
          onBasculerCategorie={(slug) =>
            setCategorieMobileOuverte((precedente) =>
              precedente === slug ? null : slug
            )
          }
          onNavigate={() => fermerMenuMobile(false)}
        />
      ) : null}

      {searchOpen ? (
        <FeuilleRecherche
          inputRef={searchInputRef}
          liensRapides={liensRapidesRecherche}
          onClose={() => fermerRecherche(true)}
          onNavigate={() => setSearchOpen(false)}
          onSubmitQuery={(query) => {
            setSearchOpen(false)
            router.push(buildSearchHref(query, {}, {}, {}, "/recherche"))
          }}
        />
      ) : null}

      {ouvert ? (
        <ApercuDuPanierSurface onClose={fermerLApercu}>
          {apercuCorps}
        </ApercuDuPanierSurface>
      ) : null}
    </header>
  )
}
