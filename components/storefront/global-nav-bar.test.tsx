// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import Link from "next/link"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ID_TITRE_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { LienQuiFermeLApercu } from "./lien-qui-ferme-l-apercu"
import { ApercuDuPanierProvider } from "./apercu-du-panier-provider"
import { GlobalNavBar } from "./global-nav-bar"

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

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
const actWarnings = [
  "An update to Root inside a test was not wrapped in act(...)",
]

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(<ApercuDuPanierProvider>{element}</ApercuDuPanierProvider>)
  )
}

function renderCapturingErrors(element: ReactElement) {
  const errors: string[] = []
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.join(" "))
  })
  render(element)
  return errors.filter(
    (error) => !actWarnings.some((warning) => error.includes(warning))
  )
}

const links = [
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
]

function corpsDeTest() {
  return (
    <div data-testid="corps">
      <h2 id={ID_TITRE_APERCU_DU_PANIER}>Mon panier</h2>
    </div>
  )
}

function declencheurDuPanier() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-label='Panier']"
  )!
}

function boutonRecherche() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-label='Rechercher']"
  )!
}

function dialogue() {
  return container.querySelector<HTMLElement>("[role='dialog']")
}

describe("GlobalNavBar", () => {
  it("rend le logo, les liens et les actions rendues par le serveur", () => {
    const errors = renderCapturingErrors(
      <GlobalNavBar links={links} actions={<span>actions</span>} />
    )

    const home = container.querySelector<HTMLAnchorElement>("a[href='/']")!
    expect(home.getAttribute("aria-label")).toBe("eguidar.com — Accueil")
    const logo = home.querySelector<HTMLImageElement>("img")!
    expect(logo.getAttribute("src")).toBe("/brand/eguidar-logo.svg")
    expect(logo.getAttribute("width")).toBe("1352")
    expect(logo.getAttribute("height")).toBe("442.5")
    expect(logo.getAttribute("alt")).toBe("eguidar.com")

    expect(container.textContent).toContain("À propos")
    expect(container.textContent).toContain("Contact")
    expect(container.textContent).toContain("actions")
    expect(errors).toEqual([])
  })

  it("ouvre la Recherche avec son déclencheur et la referme sur Escape", () => {
    renderCapturingErrors(<GlobalNavBar links={links} actions={null} />)

    const toggle = boutonRecherche()
    act(() => toggle.click())

    const input = container.querySelector<HTMLInputElement>("input[name='q']")
    expect(input).not.toBeNull()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    expect(container.querySelector("input[name='q']")).toBeNull()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("ouvre et referme le menu mobile", () => {
    renderCapturingErrors(<GlobalNavBar links={links} actions={null} />)

    const menu = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Menu']"
    )!
    act(() => menu.click())
    expect(
      container.querySelector("nav[aria-label='Menu mobile']")
    ).not.toBeNull()

    act(() => menu.click())
    expect(container.querySelector("nav[aria-label='Menu mobile']")).toBeNull()
  })

  it("le panier est un bouton dépliant qui ne monte le corps qu’une fois ouvert", () => {
    const errors = renderCapturingErrors(
      <GlobalNavBar links={links} actions={null} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    expect(panier.tagName).toBe("BUTTON")
    expect(panier.getAttribute("aria-expanded")).toBe("false")
    expect(panier.getAttribute("aria-controls")).toBe("apercu-du-panier")
    expect(container.querySelector("[data-testid='corps']")).toBeNull()

    act(() => panier.click())

    expect(panier.getAttribute("aria-expanded")).toBe("true")
    const surface = dialogue()!
    expect(surface.getAttribute("aria-modal")).toBe("true")
    expect(surface.getAttribute("id")).toBe("apercu-du-panier")
    expect(surface.getAttribute("aria-labelledby")).toBe(
      ID_TITRE_APERCU_DU_PANIER
    )
    expect(surface.querySelector("[data-testid='corps']")).not.toBeNull()
    expect(errors).toEqual([])
  })

  it("ferme l’Aperçu sur Escape et rend le focus au déclencheur", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} actions={null} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())

    const surface = dialogue()!
    expect(surface.contains(document.activeElement)).toBe(true)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(dialogue()).toBeNull()
    expect(document.activeElement).toBe(panier)
    expect(panier.getAttribute("aria-expanded")).toBe("false")
  })

  it("ferme l’Aperçu quand on clique le Voile sombre", () => {
    const errors = renderCapturingErrors(
      <GlobalNavBar links={links} actions={null} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())

    const voile = container.querySelector<HTMLElement>(
      "[data-slot='voile-sombre']"
    )!
    act(() => voile.click())

    expect(dialogue()).toBeNull()
    expect(panier.getAttribute("aria-expanded")).toBe("false")
    expect(errors).toEqual([])
  })

  it("referme l’Aperçu au second clic sur le panier", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} actions={null} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())
    expect(dialogue()).not.toBeNull()

    act(() => panier.click())

    expect(dialogue()).toBeNull()
    expect(panier.getAttribute("aria-expanded")).toBe("false")
  })

  it("ferme l’Aperçu quand la page défile, pas quand sa propre liste défile", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        actions={null}
        apercuCorps={
          <div data-testid="corps">
            <h2 id={ID_TITRE_APERCU_DU_PANIER}>Mon panier</h2>
            <ul
              data-testid="liste"
              style={{ overflowY: "auto", maxHeight: 10 }}
            >
              <li>Article</li>
            </ul>
          </div>
        }
      />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())

    const liste = container.querySelector<HTMLElement>("[data-testid='liste']")!
    act(() => {
      liste.dispatchEvent(new Event("scroll"))
    })
    expect(dialogue()).not.toBeNull()

    act(() => {
      window.dispatchEvent(new Event("scroll"))
    })
    expect(dialogue()).toBeNull()
  })

  it("la Recherche et l’Aperçu s’excluent : ouvrir l’un ferme l’autre", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} actions={null} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    const recherche = boutonRecherche()

    act(() => panier.click())
    expect(dialogue()).not.toBeNull()

    act(() => recherche.click())
    expect(dialogue()).toBeNull()
    expect(container.querySelector("input[name='q']")).not.toBeNull()

    act(() => recherche.click())
    expect(container.querySelector("input[name='q']")).toBeNull()

    act(() => panier.click())
    expect(dialogue()).not.toBeNull()
    expect(container.querySelector("input[name='q']")).toBeNull()
  })

  it("garde le focus dans l’Aperçu tant qu’il est ouvert", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        actions={null}
        apercuCorps={
          <div data-testid="corps">
            <h2 id={ID_TITRE_APERCU_DU_PANIER}>Mon panier</h2>
            <Link href="/produit/a">Produit A</Link>
            <Link href="/panier">Voir le panier</Link>
          </div>
        }
      />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())

    const surface = dialogue()!
    const liens = [...surface.querySelectorAll<HTMLAnchorElement>("a[href]")]
    expect(document.activeElement).toBe(surface)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    expect(document.activeElement).toBe(liens[1])

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      )
    })
    expect(document.activeElement).toBe(liens[0])
  })

  it("ferme l’Aperçu quand un lien du corps est activé, avant de naviguer", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        actions={null}
        apercuCorps={
          <div data-testid="corps">
            <h2 id={ID_TITRE_APERCU_DU_PANIER}>Mon panier</h2>
            <LienQuiFermeLApercu href="/panier">
              Voir le panier
            </LienQuiFermeLApercu>
          </div>
        }
      />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())

    const lien =
      dialogue()!.querySelector<HTMLAnchorElement>("a[href='/panier']")!
    act(() => lien.click())

    expect(dialogue()).toBeNull()
  })

  it("rend le badge du panier, servi par le serveur, dans le déclencheur", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        actions={null}
        panierBadge={<span data-testid="badge">3</span>}
      />
    )

    const badge = declencheurDuPanier().querySelector<HTMLElement>(
      "[data-testid='badge']"
    )!
    expect(badge.textContent).toBe("3")
  })
})
