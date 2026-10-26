"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

import {
  Cancel01Icon,
  Search01Icon,
  ShoppingBag01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/storefront/logo"
import { SearchSuggestions } from "@/components/storefront/search-suggestions"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"
import { ID_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { useApercuDuPanier } from "./apercu-du-panier-provider"
import { ApercuDuPanierSurface } from "./apercu-du-panier-surface"

export function GlobalNavBar({
  panierBadge,
  apercuCorps,
}: {
  panierBadge?: React.ReactNode
  apercuCorps?: React.ReactNode
}) {
  const { ouvert, basculer, fermer } = useApercuDuPanier()
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mouvementDuPanier, setMouvementDuPanier] = useState<{
    sens: "ouverture" | "fermeture"
    cle: number
  } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panierRef = useRef<HTMLButtonElement>(null)

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
      <div className="relative z-20 mx-auto flex h-11 max-w-[1024px] items-center justify-between gap-4 px-4 sm:px-[22px]">
        <Link
          href="/"
          className="shrink-0"
          aria-label={`${site.name} — Accueil`}
        >
          <Logo />
        </Link>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rechercher"
            aria-expanded={searchOpen}
            className={cn(searchOpen && "text-link hover:text-link")}
            onClick={() => {
              if (!searchOpen) fermer()
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
            aria-label="Panier"
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
            {panierBadge}
          </Button>
        </div>
      </div>

      {searchOpen ? (
        <div className="voile-depoli border-b border-hairline px-4 [--voile-depoli-opacite:80%]">
          <form
            method="GET"
            action="/recherche"
            className="mx-auto flex max-w-[1024px] items-center gap-2 py-2"
            onSubmit={() => setSearchOpen(false)}
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
      ) : null}

      {ouvert ? (
        <ApercuDuPanierSurface onClose={fermerLApercu}>
          {apercuCorps}
        </ApercuDuPanierSurface>
      ) : null}
    </header>
  )
}
