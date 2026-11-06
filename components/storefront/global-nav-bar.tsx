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
import { SearchSuggestions } from "@/components/storefront/search-suggestions"
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { buildSearchHref } from "@/lib/search-params"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"
import { ID_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { useApercuDuPanier } from "./apercu-du-panier-provider"
import { ApercuDuPanierSurface } from "./apercu-du-panier-surface"

export function GlobalNavBar({
  categories = [],
  panierBadge,
  apercuCorps,
}: {
  categories?: readonly { name: string; slug: string }[]
  panierBadge?: React.ReactNode
  apercuCorps?: React.ReactNode
}) {
  const { ouvert, basculer, fermer } = useApercuDuPanier()
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mouvementDuPanier, setMouvementDuPanier] = useState<{
    sens: "ouverture" | "fermeture"
    cle: number
  } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panierRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)

  const aUneNavigation = categories.length > 0

  const fermerLApercu = useCallback(() => {
    setMouvementDuPanier((precedent) => ({
      sens: "fermeture",
      cle: (precedent?.cle ?? 0) + 1,
    }))
    fermer()
    panierRef.current?.focus({ preventScroll: true })
  }, [fermer])

  function basculerLApercu() {
    setSearchOpen(false)
    setMenuOpen(false)
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
    if (!menuOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setMenuOpen(false)
      menuButtonRef.current?.focus({ preventScroll: true })
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [menuOpen])

  return (
    <header
      className={cn(
        "sticky top-0 transition-colors duration-300",
        ouvert ? "z-50" : "z-40",
        scrolled &&
          !ouvert &&
          "voile-depoli filet-bas [--voile-depoli-opacite:80%]"
      )}
    >
      <div
        className={cn(
          CONTENEUR_BOUTIQUE,
          "relative z-20 flex h-11 items-center justify-between gap-4"
        )}
      >
        <Link
          href="/"
          className="shrink-0"
          aria-label={`${site.name} — Accueil`}
        >
          <Logo />
        </Link>

        {aUneNavigation ? (
          <nav
            aria-label="Catégories"
            className="hidden min-w-0 flex-1 items-center justify-center lg:flex"
          >
            <ul className="flex items-center gap-6">
              {categories.map((categorie) => (
                <li key={categorie.slug}>
                  <Link
                    href={`/categorie/${categorie.slug}`}
                    className="text-[12px] leading-[1.3334] tracking-[-0.01em] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {categorie.name}
                  </Link>
                </li>
              ))}
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
                if (!menuOpen) {
                  setSearchOpen(false)
                  fermer()
                }
                setMenuOpen(!menuOpen)
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
            variant="ghost"
            size="icon"
            aria-label="Rechercher"
            aria-expanded={searchOpen}
            className={cn(searchOpen && "text-link hover:text-link")}
            onClick={() => {
              if (!searchOpen) {
                fermer()
                setMenuOpen(false)
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
            {/* Le badge reste hors du span : `scale` en fait le bloc conteneur du badge absolu. */}
            <span
              key={mouvementDuPanier?.cle ?? 0}
              data-slot="icone-du-panier"
              data-mouvement={mouvementDuPanier?.sens}
              className="flex items-center justify-center group-active/button:duration-[100ms] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out motion-safe:group-active/button:scale-90"
            >
              <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} />
            </span>
            {/* Le nom accessible vient du contenu : « Panier » masqué puis la
                pastille visible, au lieu d'une étiquette qui écrasait le
                nombre. */}
            <span className="sr-only">Panier</span>
            {panierBadge}
          </Button>
        </div>
      </div>

      {aUneNavigation ? (
        <div
          ref={menuPanelRef}
          id="menu-categories"
          hidden={!menuOpen}
          className="voile-depoli border-b border-hairline [--voile-depoli-opacite:80%] lg:hidden"
        >
          <nav
            aria-label="Catégories"
            className={cn(CONTENEUR_BOUTIQUE, "py-1")}
          >
            <ul className="flex flex-col">
              {categories.map((categorie) => (
                <li key={categorie.slug}>
                  <Link
                    href={`/categorie/${categorie.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 items-center text-[15px] leading-[1.3334] tracking-[-0.01em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {categorie.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="voile-depoli border-b border-hairline [--voile-depoli-opacite:80%]">
          {/* Le panneau de Suggestions se positionne sur la rangée entière,
              champ et bouton : la boîte relative est donc le formulaire. */}
          <div className={cn(CONTENEUR_BOUTIQUE, "py-2")}>
            <form
              method="GET"
              action="/recherche"
              className="relative flex items-center gap-2"
              onSubmit={(event) => {
                // Le formulaire reste un formulaire : sans JS, action et method
                // mènent à la page de résultats. Avec JS, la soumission est
                // interceptée avant que la rangée ne se referme, et la
                // navigation appartient à la Grammaire d'URL de la Recherche.
                event.preventDefault()
                const query = String(
                  new FormData(event.currentTarget).get("q") ?? ""
                ).trim()
                setSearchOpen(false)
                router.push(buildSearchHref(query, {}, {}, {}, "/recherche"))
              }}
            >
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <SearchSuggestions
                inputRef={searchInputRef}
                onEscape={() => setSearchOpen(false)}
                onNavigate={() => setSearchOpen(false)}
              />
              <Button type="submit" size="sm" className="rounded-full">
                Rechercher
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      {ouvert ? (
        <ApercuDuPanierSurface onClose={fermerLApercu}>
          {apercuCorps}
        </ApercuDuPanierSurface>
      ) : null}
    </header>
  )
}
