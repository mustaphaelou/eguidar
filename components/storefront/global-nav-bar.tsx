"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

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
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"
import { ID_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { useApercuDuPanier } from "./apercu-du-panier-provider"
import { ApercuDuPanierSurface } from "./apercu-du-panier-surface"
import { useEstBureau } from "./use-est-bureau"

export type GlobalNavLink = { href: string; label: string }

export function GlobalNavBar({
  links,
  panierBadge,
  apercuCorps,
}: {
  links: GlobalNavLink[]
  panierBadge?: React.ReactNode
  apercuCorps?: React.ReactNode
}) {
  const { ouvert, basculer, fermer } = useApercuDuPanier()
  const estBureau = useEstBureau()
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panierRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const apercuMobileOuvert = ouvert && !estBureau

  const fermerLApercu = useCallback(() => {
    fermer()
    const retour = estBureau ? panierRef.current : menuRef.current
    retour?.focus({ preventScroll: true })
  }, [fermer, estBureau])

  function basculerLeMenu() {
    if (apercuMobileOuvert) {
      fermerLApercu()
      return
    }
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    setMenuOpen(true)
    setSearchOpen(false)
    if (ouvert) fermer()
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
        "sticky top-0 z-40 transition-colors duration-300",
        scrolled &&
          !ouvert &&
          "voile-depoli border-b border-hairline [--voile-depoli-opacite:80%]"
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

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Navigation principale"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-0.5">
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
            <HugeiconsIcon
              icon={searchOpen ? Cancel01Icon : Search01Icon}
              strokeWidth={2}
            />
          </Button>
          {apercuMobileOuvert ? null : (
            <Button
              ref={panierRef}
              variant="ghost"
              size="icon"
              aria-label="Panier"
              aria-expanded={ouvert}
              aria-controls={ID_APERCU_DU_PANIER}
              className="relative"
              onClick={(event) => {
                setSearchOpen(false)
                setMenuOpen(false)
                basculer(event.currentTarget)
              }}
            >
              <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} />
              {panierBadge}
            </Button>
          )}
          <Button
            ref={menuRef}
            variant="ghost"
            size="icon"
            aria-label={apercuMobileOuvert ? "Fermer" : "Menu"}
            aria-expanded={menuOpen}
            className="lg:hidden"
            onClick={basculerLeMenu}
          >
            <HugeiconsIcon
              icon={menuOpen ? Cancel01Icon : Menu01Icon}
              strokeWidth={2}
            />
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

      {menuOpen ? (
        <nav
          className="voile-depoli border-b border-hairline [--voile-depoli-opacite:80%] lg:hidden"
          aria-label="Menu mobile"
        >
          <div className="mx-auto flex max-w-[1024px] flex-col gap-1 px-4 py-4 sm:px-[22px]">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-2 py-1.5 text-[28px] font-semibold tracking-[0.007em] text-foreground/80 hover:bg-muted/60 hover:text-foreground"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      {ouvert ? (
        <ApercuDuPanierSurface onClose={fermerLApercu}>
          {apercuCorps}
        </ApercuDuPanierSurface>
      ) : null}
    </header>
  )
}
