"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Clock01Icon,
  Image01Icon,
  Notification01Icon,
  PackageOutOfStockIcon,
  Robot01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

import { UserMenu } from "@/components/layout/admin/user-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"

const SECTION_LABELS: Record<string, string> = {
  produits: "Produits",
  categories: "Catégories",
  commandes: "Commandes",
  villes: "Villes",
  livraison: "Livraison",
  annonce: "Annonce",
  medias: "Médias",
  automatisations: "Automatisations",
  nouveau: "Nouveau",
  executions: "Exécutions",
}

const RACCOURCIS_NOTIFICATIONS = [
  {
    href: "/admin/commandes?statut=pending",
    label: "Commandes en attente",
    description: "Consulter les commandes à traiter",
    icon: Clock01Icon,
  },
  {
    href: "/admin/produits?stock=zero",
    label: "Produits en rupture",
    description: "Vérifier les variantes à stock nul",
    icon: PackageOutOfStockIcon,
  },
  {
    href: "/admin/automatisations/executions?statut=echoue",
    label: "Automatisations en échec",
    description: "Exécutions à réessayer",
    icon: Robot01Icon,
  },
  {
    href: "/admin/medias?sans-alt=1",
    label: "Médias sans texte alternatif",
    description: "Compléter la bibliothèque des médias",
    icon: Image01Icon,
  },
] as const

function humanizeSegment(segment: string): string {
  if (SECTION_LABELS[segment]) return SECTION_LABELS[segment]

  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {}

  if (/^[\da-f-]{24,}$/i.test(decoded)) return "Détail"

  return decoded
    .replace(/[-_]+/g, " ")
    .replace(/^\p{L}/u, (char) => char.toUpperCase())
}

type Crumb = { label: string; href?: string }

function useCrumbs(pathname: string): Crumb[] {
  return React.useMemo(() => {
    if (pathname === "/admin") {
      return [
        { label: "Administration", href: "/admin" },
        { label: "Tableau de bord" },
      ]
    }

    const segments = pathname
      .replace(/^\/admin/, "")
      .split("/")
      .filter(Boolean)

    const crumbs: Crumb[] = [{ label: "Administration", href: "/admin" }]
    let accumulated = ""
    for (const segment of segments) {
      accumulated += `/${segment}`
      crumbs.push({
        label: humanizeSegment(segment),
        href: `/admin${accumulated}`,
      })
    }
    crumbs[crumbs.length - 1] = {
      label: crumbs[crumbs.length - 1]?.label ?? "Administration",
    }

    return crumbs
  }, [pathname])
}

export function SiteHeader({
  userName,
  userEmail,
}: {
  userName: string
  userEmail: string
}) {
  const pathname = usePathname()
  const { isMobile } = useSidebar()
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const crumbs = useCrumbs(pathname)

  return (
    <header
      data-slot="admin-header"
      style={{ "--header-height": "4rem" } as React.CSSProperties}
      className={cn(
        "sticky inset-bs-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 px-4 transition-[background-color,box-shadow] duration-200 ease-linear",
        scrolled
          ? "voile-depoli filet-bas [--voile-depoli-opacite:80%]"
          : "bg-background"
      )}
    >
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4!" />
      {isMobile ? (
        <span className="truncate text-sm font-medium">
          {crumbs[crumbs.length - 1]?.label}
        </span>
      ) : (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.label}-${index}`}>
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {index < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="ms-auto flex items-center gap-2">
        <form
          action="/admin/produits"
          method="get"
          role="search"
          className="hidden w-56 md:block lg:w-64"
        >
          <InputGroup className="h-8 bg-muted/40">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              name="q"
              type="search"
              placeholder="Rechercher un produit…"
              aria-label="Rechercher un produit"
              className="text-sm"
            />
          </InputGroup>
        </form>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Notifications"
              />
            }
          >
            <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex flex-col gap-0.5 px-4 py-3">
              <PopoverTitle className="text-sm">Notifications</PopoverTitle>
              <PopoverDescription className="text-xs">
                Accès rapide aux points d&apos;attention de la boutique.
              </PopoverDescription>
            </div>
            <Separator />
            <ul className="flex flex-col p-1.5">
              {RACCOURCIS_NOTIFICATIONS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors active:bg-muted/70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/50"
                  >
                    <span className="mbs-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <HugeiconsIcon
                        icon={item.icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <UserMenu userName={userName} userEmail={userEmail} variant="compact" />
      </div>
    </header>
  )
}
