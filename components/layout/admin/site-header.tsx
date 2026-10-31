"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

import { UserMenu } from "@/components/layout/admin/user-menu"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const SECTION_LABELS: Record<string, string> = {
  produits: "Produits",
  categories: "Catégories",
  commandes: "Commandes",
  villes: "Villes",
  livraison: "Livraison",
  medias: "Médias",
  automatisations: "Automatisations",
  nouveau: "Nouveau",
  executions: "Exécutions",
}

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
        "sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 transition-[background-color,box-shadow] duration-200 ease-linear",
        scrolled
          ? "bg-background/80 shadow-sm backdrop-blur-md"
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
        <UserMenu userName={userName} userEmail={userEmail} variant="compact" />
      </div>
    </header>
  )
}
