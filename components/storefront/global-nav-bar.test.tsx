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
import { MonCompteDansLApercu } from "./mon-compte-dans-l-apercu"

const { openLoginMock } = vi.hoisted(() => ({ openLoginMock: vi.fn() }))

vi.mock("@/components/auth/auth-dialogs", () => ({
  useAuthDialogs: () => ({ openLogin: openLoginMock }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/client", () => ({ signOut: vi.fn() }))

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
  openLoginMock.mockReset()
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

function bandeau() {
  return container.querySelector<HTMLElement>("header")!
}

function boutonMenu() {
  return container.querySelector<HTMLButtonElement>("button[aria-label='Menu']")
}

function boutonFermer() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-label='Fermer']"
  )
}

function menuMobile() {
  return container.querySelector<HTMLElement>("nav[aria-label='Menu mobile']")
}

function champRecherche() {
  return container.querySelector<HTMLInputElement>("input[name='q']")
}

function voileSombre() {
  return container.querySelector<HTMLElement>("[data-slot='voile-sombre']")!
}

function entree(label: string) {
  return [...container.querySelectorAll<HTMLElement>("a, button")].find(
    (element) => element.textContent?.trim() === label
  )!
}

function poserEcran(large: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) =>
      ({
        matches: requete.includes("min-width: 1024px") ? large : false,
        media: requete,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  )
}

function simulerEcranMobile() {
  poserEcran(false)
}

function simulerEcranBureau() {
  poserEcran(true)
}

const fermetures = [
  [
    "Escape",
    () => {
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
      })
    },
  ],
  [
    "le clic sur le Voile sombre",
    () => {
      act(() => voileSombre().click())
    },
  ],
  [
    "le défilement de la page",
    () => {
      act(() => window.dispatchEvent(new Event("scroll")))
    },
  ],
] as const

describe("GlobalNavBar", () => {
  it("rend le logo et les liens", () => {
    const errors = renderCapturingErrors(<GlobalNavBar links={links} />)

    const home = container.querySelector<HTMLAnchorElement>("a[href='/']")!
    expect(home.getAttribute("aria-label")).toBe("eguidar.com — Accueil")
    const logo = home.querySelector<HTMLImageElement>("img")!
    expect(logo.getAttribute("src")).toBe("/brand/eguidar-logo.svg")
    expect(logo.getAttribute("width")).toBe("1352")
    expect(logo.getAttribute("height")).toBe("442.5")
    expect(logo.getAttribute("alt")).toBe("eguidar.com")

    expect(container.textContent).toContain("À propos")
    expect(container.textContent).toContain("Contact")
    expect(errors).toEqual([])
  })

  it("ne porte ni Connexion, ni profil, ni Déconnexion", () => {
    renderCapturingErrors(<GlobalNavBar links={links} />)

    expect(container.textContent).not.toContain("Connexion")
    expect(container.textContent).not.toContain("Déconnexion")
    expect(container.querySelector("a[href='/profil']")).toBeNull()
    expect(container.querySelector("button[aria-label='Connexion']")).toBeNull()
    expect(
      container.querySelector("button[aria-label='Déconnexion']")
    ).toBeNull()
  })

  it("ouvre la Recherche avec son déclencheur et la referme sur Escape", () => {
    renderCapturingErrors(<GlobalNavBar links={links} />)

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
    renderCapturingErrors(<GlobalNavBar links={links} />)

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

  it("le panier est un bouton dépliant qui ne monte le corps qu'une fois ouvert", () => {
    const errors = renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
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
    expect(surface.getAttribute("data-slot")).toBe("apercu-du-panier")
    expect(surface.getAttribute("aria-labelledby")).toBe(
      ID_TITRE_APERCU_DU_PANIER
    )
    expect(surface.querySelector("[data-testid='corps']")).not.toBeNull()
    expect(errors).toEqual([])
  })

  it("garde le Bandeau au-dessus de la Barre d'achat tant que l'Aperçu est ouvert", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
    )

    const header = bandeau()
    expect(header.classList.contains("z-40")).toBe(true)
    expect(header.classList.contains("z-50")).toBe(false)

    act(() => declencheurDuPanier().click())

    expect(header.classList.contains("z-50")).toBe(true)
    expect(header.classList.contains("z-40")).toBe(false)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(header.classList.contains("z-40")).toBe(true)
    expect(header.classList.contains("z-50")).toBe(false)
  })

  it("ferme l'Aperçu sur Escape sans en laisser de trace, et rend le focus au déclencheur", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        apercuCorps={
          <div>
            <h2 id={ID_TITRE_APERCU_DU_PANIER}>Mon panier</h2>
            <p>Une ligne du panier</p>
          </div>
        }
      />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())

    const surface = dialogue()!
    expect(surface.contains(document.activeElement)).toBe(true)
    expect(document.body.textContent).toContain("Une ligne du panier")

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(document.querySelector("[role='dialog']")).toBeNull()
    expect(document.querySelector("[data-slot='apercu-du-panier']")).toBeNull()
    expect(document.querySelector("[data-slot='voile-sombre']")).toBeNull()
    expect(document.body.textContent).not.toContain("Une ligne du panier")
    expect(document.activeElement).toBe(panier)
    expect(panier.getAttribute("aria-expanded")).toBe("false")
  })

  it("ferme l'Aperçu quand on clique le Voile sombre", () => {
    const errors = renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
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

  it("referme l'Aperçu au second clic sur le panier", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())
    expect(dialogue()).not.toBeNull()

    act(() => panier.click())

    expect(dialogue()).toBeNull()
    expect(panier.getAttribute("aria-expanded")).toBe("false")
  })

  it("ferme l'Aperçu quand la page défile, pas quand sa propre liste défile", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
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

  it("la Recherche et l'Aperçu s'excluent : ouvrir l'un ferme l'autre", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
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

  it("garde le focus dans l'Aperçu tant qu'il est ouvert", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
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

  it("ferme l'Aperçu quand un lien du corps est activé, avant de naviguer", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
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

  it("referme l'Aperçu et son Voile sombre avant d'ouvrir la Connexion", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        apercuCorps={
          <div>
            <h2 id={ID_TITRE_APERCU_DU_PANIER}>Mon panier</h2>
            <MonCompteDansLApercu connecte={false} />
          </div>
        }
      />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())
    expect(dialogue()).not.toBeNull()
    expect(container.querySelector("[data-slot='voile-sombre']")).not.toBeNull()

    act(() => entree("Connexion").click())

    expect(openLoginMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector("[role='dialog']")).toBeNull()
    expect(container.querySelector("[data-slot='voile-sombre']")).toBeNull()
    expect(document.activeElement).not.toBe(panier)
  })

  it("fait répondre l'icône du Panier à chaque bascule", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
    )

    const icone = () =>
      declencheurDuPanier().querySelector<HTMLElement>(
        "[data-slot='icone-du-panier']"
      )!

    expect(icone().hasAttribute("data-mouvement")).toBe(false)

    act(() => declencheurDuPanier().click())
    expect(icone().getAttribute("data-mouvement")).toBe("ouverture")

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    expect(icone().getAttribute("data-mouvement")).toBe("fermeture")

    act(() => declencheurDuPanier().click())
    expect(icone().getAttribute("data-mouvement")).toBe("ouverture")

    act(() => declencheurDuPanier().click())
    expect(icone().getAttribute("data-mouvement")).toBe("fermeture")
  })

  it("rend le badge du panier dans le déclencheur", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        panierBadge={<span data-testid="badge">3</span>}
      />
    )

    const badge = declencheurDuPanier().querySelector<HTMLElement>(
      "[data-testid='badge']"
    )!
    expect(badge.textContent).toBe("3")
  })
})

describe("GlobalNavBar sur mobile", () => {
  beforeEach(simulerEcranMobile)

  it("cache le panier et fait du menu le seul « Fermer » de l'Aperçu", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    const menu = boutonMenu()!
    expect(menu.getAttribute("aria-expanded")).toBe("false")

    act(() => panier.click())

    expect(dialogue()).not.toBeNull()
    expect(menuMobile()).toBeNull()
    expect(container.querySelector("button[aria-label='Panier']")).toBeNull()
    expect(boutonFermer()).toBe(menu)
    expect(
      container.querySelectorAll("button[aria-label='Fermer']")
    ).toHaveLength(1)

    act(() => boutonFermer()!.click())

    expect(dialogue()).toBeNull()
    expect(menuMobile()).toBeNull()
    expect(declencheurDuPanier()).not.toBeNull()
    expect(boutonMenu()).toBe(menu)
    expect(menu.getAttribute("aria-expanded")).toBe("false")
  })

  it("rend le focus au menu quand son « Fermer » referme l'Aperçu", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    const menu = boutonMenu()!

    act(() => panier.click())
    act(() => boutonFermer()!.click())

    expect(dialogue()).toBeNull()
    expect(document.activeElement).toBe(menu)
  })

  it.each(fermetures)(
    "rend le focus au menu quand %s ferme l'Aperçu",
    (_, fermer) => {
      renderCapturingErrors(
        <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
      )

      const panier = declencheurDuPanier()
      const menu = boutonMenu()!

      act(() => panier.click())
      expect(dialogue()).not.toBeNull()

      fermer()

      expect(dialogue()).toBeNull()
      expect(document.activeElement).toBe(menu)
    }
  )

  it("la Recherche, le menu et l'Aperçu ne s'ouvrent jamais ensemble", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
    )

    const menu = boutonMenu()!
    const recherche = boutonRecherche()

    act(() => menu.click())
    expect(menuMobile()).not.toBeNull()
    expect(champRecherche()).toBeNull()
    expect(dialogue()).toBeNull()

    act(() => recherche.click())
    expect(champRecherche()).not.toBeNull()
    expect(menuMobile()).toBeNull()
    expect(dialogue()).toBeNull()

    act(() => menu.click())
    expect(menuMobile()).not.toBeNull()
    expect(champRecherche()).toBeNull()
    expect(dialogue()).toBeNull()

    const panier = declencheurDuPanier()
    act(() => panier.click())
    expect(dialogue()).not.toBeNull()
    expect(menuMobile()).toBeNull()
    expect(champRecherche()).toBeNull()

    act(() => boutonFermer()!.click())
    expect(dialogue()).toBeNull()

    act(() => recherche.click())
    expect(champRecherche()).not.toBeNull()
    expect(dialogue()).toBeNull()

    const panierRouvert = declencheurDuPanier()
    act(() => panierRouvert.click())
    expect(dialogue()).not.toBeNull()
    expect(champRecherche()).toBeNull()
    expect(menuMobile()).toBeNull()
  })
})

describe("GlobalNavBar sur bureau", () => {
  beforeEach(simulerEcranBureau)

  it("garde le panier et le menu « Menu » quand l'Aperçu est ouvert", () => {
    renderCapturingErrors(
      <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
    )

    const panier = declencheurDuPanier()
    act(() => panier.click())

    expect(dialogue()).not.toBeNull()
    expect(declencheurDuPanier()).toBe(panier)
    expect(boutonMenu()).not.toBeNull()
    expect(boutonFermer()).toBeNull()

    act(() => panier.click())

    expect(dialogue()).toBeNull()
    expect(document.activeElement).toBe(panier)
  })

  it.each(fermetures)(
    "rend le focus au panier quand %s ferme l'Aperçu",
    (_, fermer) => {
      renderCapturingErrors(
        <GlobalNavBar links={links} apercuCorps={corpsDeTest()} />
      )

      const panier = declencheurDuPanier()
      act(() => panier.click())
      expect(dialogue()).not.toBeNull()

      fermer()

      expect(dialogue()).toBeNull()
      expect(document.activeElement).toBe(panier)
    }
  )
})
