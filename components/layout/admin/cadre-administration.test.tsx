// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import path from "node:path"

import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarProvider } from "@/components/ui/sidebar"

import { navSections } from "./data/sidebar-data"
import { NavGroup } from "./nav-group"
import { SiteHeader } from "./site-header"

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/layout/admin/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}))

vi.mock("@/components/ui/use-mobile", () => ({
  useIsMobile: () => false,
}))

function source(chemin: string): string {
  return readFileSync(path.join(process.cwd(), chemin), "utf8")
}

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const avertissementAct =
  "An update to Root inside a test was not wrapped in act"
const erreurConsole = console.error.bind(console)

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation((...arguments_) => {
    if (!arguments_.join(" ").includes(avertissementAct)) {
      erreurConsole(...arguments_)
    }
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  Object.defineProperty(window, "scrollY", {
    value: 0,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

async function render(element: ReactElement): Promise<void> {
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<SidebarProvider>{element}</SidebarProvider>)
  })
}

function defiler(hauteur: number): void {
  act(() => {
    window.scrollY = hauteur
    window.dispatchEvent(new Event("scroll"))
  })
}

function bandeau(): HTMLElement {
  return container.querySelector<HTMLElement>("[data-slot='admin-header']")!
}

describe("le Cadre de l'Administration", () => {
  it("ne donne le Voile dépoli au bandeau qu'au-delà de dix pixels", async () => {
    await render(
      <SiteHeader userName="Ada Lovelace" userEmail="ada@example.com" />
    )

    const auRepos = bandeau().className
    expect(auRepos).toContain("bg-background")
    expect(auRepos).not.toContain("voile-depoli")
    expect(auRepos).not.toContain("border-b")

    defiler(9)
    expect(bandeau().className).toBe(auRepos)

    defiler(11)
    const enMatiere = bandeau().className
    expect(enMatiere).toContain("voile-depoli")
    expect(enMatiere).toContain("filet-bas")
    expect(enMatiere).not.toContain("bg-background/80")
    expect(enMatiere).not.toContain("backdrop-blur-md")
    expect(enMatiere).not.toContain("shadow-sm")
    expect(enMatiere).not.toContain("border-b")
  })

  it("donne aux libellés de groupe leur type et aux cibles leur hauteur", async () => {
    const section = navSections[0]!
    await render(<NavGroup section={section} />)

    const libelle = [...container.querySelectorAll<HTMLElement>("div")].find(
      (element) => element.textContent?.trim() === section.title
    )!
    expect(libelle.className).toContain("text-[13px]")
    expect(libelle.className).toContain("font-medium")
    expect(libelle.className).toContain("text-muted-foreground")
    expect(libelle.className).toContain("mbs-2")
    expect(libelle.className).not.toContain("text-[11px]")
    expect(libelle.className).not.toContain("uppercase")
    expect(libelle.className).not.toContain("tracking-wide")

    const boutons = container.querySelectorAll<HTMLElement>(
      "[data-slot='sidebar-menu-button']"
    )
    expect(boutons).toHaveLength(section.items.length)
    for (const bouton of boutons) {
      expect(bouton.className).toContain("h-10")
      expect(bouton.className).not.toContain("h-9")
    }

    const icones = container.querySelectorAll<SVGElement>("svg")
    expect(icones.length).toBeGreaterThan(0)
    for (const icone of icones) {
      expect(icone.getAttribute("stroke-width")).toBe("2")
    }
  })

  it("ne met aucun matériau sur la barre latérale et garde le montant à son clamp", () => {
    for (const chemin of [
      "components/layout/admin/app-sidebar.tsx",
      "components/layout/admin/nav-group.tsx",
    ]) {
      expect(source(chemin)).not.toContain("voile-depoli")
      expect(source(chemin)).not.toContain("backdrop-blur")
    }

    expect(source("components/admin/carte-stat.tsx")).toContain(
      "clamp(1.5rem,10.5cqi,3.5rem)"
    )
  })
})
