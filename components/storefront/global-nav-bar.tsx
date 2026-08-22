"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import {
  Cancel01Icon,
  Menu01Icon,
  Search01Icon,
  ShoppingBag01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { SearchSuggestions } from "@/components/storefront/search-suggestions"
import { cn } from "@/lib/utils"

export type GlobalNavLink = { href: string; label: string }

export function GlobalNavBar({
  links,
  actions,
}: {
  links: GlobalNavLink[]
  actions: React.ReactNode
}) {
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
        scrolled && "globalnav-scrim"
      )}
    >
      <div className="mx-auto flex h-11 max-w-[1024px] items-center justify-between gap-4 px-4 sm:px-[22px]">
        <Link
          href="/"
          className="shrink-0 text-[17px] font-semibold tracking-[-0.022em]"
          aria-label="eguidar.ma — Accueil"
        >
          eguidar<span className="text-link">.ma</span>
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
          {actions}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rechercher"
            aria-expanded={searchOpen}
            className={cn(searchOpen && "text-link hover:text-link")}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <HugeiconsIcon
              icon={searchOpen ? Cancel01Icon : Search01Icon}
              strokeWidth={2}
            />
          </Button>
          <Button
            render={<Link href="/panier" />}
            variant="ghost"
            size="icon"
            aria-label="Panier"
          >
            <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <HugeiconsIcon
              icon={menuOpen ? Cancel01Icon : Menu01Icon}
              strokeWidth={2}
            />
          </Button>
        </div>
      </div>

      {searchOpen ? (
        <div className="globalnav-scrim border-t-0 px-4">
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
          className="globalnav-scrim border-t-0 lg:hidden"
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
    </header>
  )
}
