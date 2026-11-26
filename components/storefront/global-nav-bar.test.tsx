// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import Link from "next/link"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildSearchHref } from "@/lib/search-params"

import { ID_TITRE_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { LienQuiFermeLApercu } from "./lien-qui-ferme-l-apercu"
import { ApercuDuPanierProvider } from "./apercu-du-panier-provider"
import { GlobalNavBar } from "./global-nav-bar"
import { MonCompteDansLApercu } from "./mon-compte-dans-l-apercu"

const { openLoginMock, pushMock } = vi.hoisted(() => ({
  openLoginMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock("@/components/auth/auth-dialogs", () => ({
  useAuthDialogs: () => ({ openLogin: openLoginMock }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
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
  pushMock.mockReset()
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

function corpsDeTest() {
  return (
    <div data-testid="corps">
      <h2 id={ID_TITRE_APERCU_DU_PANIER}>Mon panier</h2>
    </div>
  )
}

function declencheurDuPanier() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-controls='apercu-du-panier']"
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

function voileSombre() {
  return container.querySelector<HTMLElement>("[data-slot='voile-sombre']")!
}

function entree(label: string) {
  return [...container.querySelectorAll<HTMLElement>("a, button")].find(
    (element) => element.textContent?.trim() === label
  )!
}

function formulaireDeRecherche() {
  return container.querySelector<HTMLFormElement>("form[action='/recherche']")!
}

function soumettreLaRecherche(): Event {
  const evenement = new Event("submit", { bubbles: true, cancelable: true })
  act(() => {
    formulaireDeRecherche().dispatchEvent(evenement)
  })
  return evenement
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
  it("rend le logo, et aucune entrée de page", () => {
    const errors = renderCapturingErrors(<GlobalNavBar />)

    const home = container.querySelector<HTMLAnchorElement>("a[href='/']")!
    expect(home.getAttribute("aria-label")).toBe("eguidar.com — Accueil")
    const logo = home.querySelector<HTMLImageElement>("img")!
    expect(logo.getAttribute("src")).toBe("/brand/eguidar-logo.svg")
    expect(logo.getAttribute("width")).toBe("1352")
    expect(logo.getAttribute("height")).toBe("442.5")
    expect(logo.getAttribute("alt")).toBe("eguidar.com")

    expect(container.querySelectorAll("a")).toHaveLength(1)
    expect(container.textContent).not.toContain("À propos")
    expect(container.textContent).not.toContain("Conditions & livraison")
    expect(errors).toEqual([])
  })

  it("rend les catégories dans la barre et les déplie sur mobile", () => {
    const categories = [
      { name: "Smartphones", slug: "smartphones", children: [], brands: [] },
      {
        name: "Ordinateurs & Tablettes",
        slug: "ordinateurs-tablettes",
        children: [],
        brands: [],
      },
    ]
    const errors = renderCapturingErrors(
      <GlobalNavBar categories={categories} />
    )

    expect(
      container.querySelector("nav[aria-label='Catégories']")
    ).not.toBeNull()
    expect(
      container.querySelector("a[href='/categorie/smartphones']")
    ).not.toBeNull()

    const menu = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Ouvrir les catégories']"
    )!
    expect(menu.getAttribute("aria-expanded")).toBe("false")
    expect(menu.getAttribute("aria-controls")).toBe("menu-categories")
    expect(
      container.querySelector("#menu-categories")?.hasAttribute("hidden")
    ).toBe(true)

    act(() => menu.click())

    expect(menu.getAttribute("aria-expanded")).toBe("true")
    expect(menu.getAttribute("aria-label")).toBe("Fermer les catégories")
    expect(
      container.querySelector("#menu-categories")?.hasAttribute("hidden")
    ).toBe(false)
    expect(document.activeElement).toBe(
      container.querySelector(
        "#menu-categories a[href='/categorie/smartphones']"
      )
    )

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(menu.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(menu)
    expect(errors).toEqual([])
  })

  it("ne porte ni Connexion, ni profil, ni Déconnexion", () => {
    renderCapturingErrors(<GlobalNavBar />)

    expect(container.textContent).not.toContain("Connexion")
    expect(container.textContent).not.toContain("Déconnexion")
    expect(container.querySelector("a[href='/profil']")).toBeNull()
    expect(container.querySelector("button[aria-label='Connexion']")).toBeNull()
    expect(
      container.querySelector("button[aria-label='Déconnexion']")
    ).toBeNull()
  })

  it("ouvre la Recherche avec son déclencheur et la referme sur Escape", () => {
    renderCapturingErrors(<GlobalNavBar />)

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

  it("soumet la Recherche par la Grammaire d'URL et referme la rangée", () => {
    const errors = renderCapturingErrors(<GlobalNavBar />)
    act(() => boutonRecherche().click())

    container.querySelector<HTMLInputElement>("input[name='q']")!.value =
      "iphone"

    const evenement = soumettreLaRecherche()

    expect(evenement.defaultPrevented).toBe(true)
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith(
      buildSearchHref("iphone", {}, {}, {}, "/recherche")
    )
    expect(container.querySelector("input[name='q']")).toBeNull()
    expect(errors).toEqual([])
  })

  it("soumet une Recherche vide vers /recherche sans q", () => {
    renderCapturingErrors(<GlobalNavBar />)
    act(() => boutonRecherche().click())

    const evenement = soumettreLaRecherche()

    expect(evenement.defaultPrevented).toBe(true)
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith(
      buildSearchHref("", {}, {}, {}, "/recherche")
    )
    expect(container.querySelector("input[name='q']")).toBeNull()
  })

  it("le panier est un bouton dépliant qui ne monte le corps qu'une fois ouvert", () => {
    const errors = renderCapturingErrors(
      <GlobalNavBar apercuCorps={corpsDeTest()} />
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
    renderCapturingErrors(<GlobalNavBar apercuCorps={corpsDeTest()} />)

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
      <GlobalNavBar apercuCorps={corpsDeTest()} />
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
    renderCapturingErrors(<GlobalNavBar apercuCorps={corpsDeTest()} />)

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
    renderCapturingErrors(<GlobalNavBar apercuCorps={corpsDeTest()} />)

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
    renderCapturingErrors(<GlobalNavBar apercuCorps={corpsDeTest()} />)

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

  it("rend le badge du panier dans le déclencheur, sans étiquette qui écrase le contenu", () => {
    renderCapturingErrors(
      <GlobalNavBar panierBadge={<span data-testid="badge">3</span>} />
    )

    const panier = declencheurDuPanier()
    expect(panier.getAttribute("aria-label")).toBeNull()
    expect(panier.querySelector(".sr-only")?.textContent).toBe("Panier")

    const badge = panier.querySelector<HTMLElement>("[data-testid='badge']")!
    expect(badge.textContent).toBe("3")
  })
})

describe("GlobalNavBar sans navigation de pages", () => {
  it("ne rend ni nav, ni menu, ni « Fermer », ni lien de page", () => {
    renderCapturingErrors(<GlobalNavBar apercuCorps={corpsDeTest()} />)

    expect(container.querySelector("nav")).toBeNull()
    expect(container.querySelector("button[aria-label='Menu']")).toBeNull()
    expect(container.querySelector("button[aria-label='Fermer']")).toBeNull()
    expect(
      container.querySelector(
        "a[href='/a-propos'], a[href='/contact'], a[href='/faq'], a[href='/blog'], a[href='/conditions']"
      )
    ).toBeNull()
  })

  it("garde le déclencheur du Panier monté, et son aria-expanded franc", () => {
    renderCapturingErrors(<GlobalNavBar apercuCorps={corpsDeTest()} />)

    const panier = declencheurDuPanier()
    expect(panier.getAttribute("aria-expanded")).toBe("false")

    act(() => panier.click())

    expect(dialogue()).not.toBeNull()
    expect(declencheurDuPanier()).toBe(panier)
    expect(panier.getAttribute("aria-expanded")).toBe("true")

    act(() => panier.click())

    expect(dialogue()).toBeNull()
    expect(document.activeElement).toBe(panier)
    expect(panier.getAttribute("aria-expanded")).toBe("false")
  })

  it.each(fermetures)(
    "rend le focus au panier quand %s ferme l'Aperçu",
    (_, fermer) => {
      renderCapturingErrors(<GlobalNavBar apercuCorps={corpsDeTest()} />)

      const panier = declencheurDuPanier()
      act(() => panier.click())
      expect(dialogue()).not.toBeNull()

      fermer()

      expect(dialogue()).toBeNull()
      expect(document.activeElement).toBe(panier)
    }
  )
})

describe("GlobalNavBar — Feuille de navigation et Recherche", () => {
  const categories = [
    {
      name: "Smartphones",
      slug: "smartphones",
      children: [{ name: "iPhone", slug: "iphone" }],
      brands: ["Apple", "Samsung"],
    },
    {
      name: "Accessoires",
      slug: "accessoires",
      children: [],
      brands: ["Anker"],
    },
  ]

  function feuilleNavigation() {
    return container.querySelector<HTMLElement>(
      "[data-slot='feuille-navigation']"
    )
  }

  it("ouvre la Feuille de navigation au survol fin, bascule sans délai et ferme au départ sur le Voile sombre", () => {
    vi.useFakeTimers()
    try {
      const errors = renderCapturingErrors(
        <GlobalNavBar categories={categories} />
      )

      const lienSmartphones = container.querySelector<HTMLAnchorElement>(
        "nav[aria-label='Catégories'] a[href='/categorie/smartphones']"
      )!
      const lienAccessoires = container.querySelector<HTMLAnchorElement>(
        "nav[aria-label='Catégories'] a[href='/categorie/accessoires']"
      )!

      act(() => {
        lienSmartphones.dispatchEvent(
          new PointerEvent("pointerover", {
            bubbles: true,
            pointerType: "touch",
          })
        )
        vi.advanceTimersByTime(100)
      })
      expect(feuilleNavigation()).toBeNull()

      act(() => {
        lienSmartphones.dispatchEvent(
          new PointerEvent("pointerover", {
            bubbles: true,
            pointerType: "mouse",
          })
        )
      })
      expect(feuilleNavigation()).toBeNull()

      act(() => {
        vi.advanceTimersByTime(80)
      })

      const feuille = feuilleNavigation()!
      expect(feuille.getAttribute("aria-label")).toBe("Smartphones")
      expect(feuille.textContent).toContain("Explorer Smartphones")
      expect(feuille.textContent).toContain("iPhone")
      expect(feuille.textContent).toContain("Par marque")
      expect(feuille.textContent).toContain("Apple")
      expect(voileSombre()).not.toBeNull()
      expect(bandeau().classList.contains("z-50")).toBe(true)

      act(() => {
        lienAccessoires.dispatchEvent(
          new PointerEvent("pointerover", {
            bubbles: true,
            pointerType: "mouse",
          })
        )
      })
      expect(feuilleNavigation()!.getAttribute("aria-label")).toBe(
        "Accessoires"
      )
      expect(feuilleNavigation()!.textContent).toContain("Anker")

      act(() => {
        voileSombre().dispatchEvent(
          new PointerEvent("pointerover", {
            bubbles: true,
            pointerType: "mouse",
          })
        )
        vi.advanceTimersByTime(140)
      })
      expect(feuilleNavigation()).toBeNull()
      expect(container.querySelector("[data-slot='voile-sombre']")).toBeNull()
      expect(errors).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it("ouvre la Feuille de navigation au clavier avec Flèche bas et rend le focus sur Escape", () => {
    renderCapturingErrors(<GlobalNavBar categories={categories} />)

    const lienSmartphones = container.querySelector<HTMLAnchorElement>(
      "nav[aria-label='Catégories'] a[href='/categorie/smartphones']"
    )!
    lienSmartphones.focus()

    act(() => {
      lienSmartphones.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      )
    })

    const feuille = feuilleNavigation()!
    expect(feuille).not.toBeNull()
    expect(feuille.contains(document.activeElement)).toBe(true)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(feuilleNavigation()).toBeNull()
    expect(document.activeElement).toBe(lienSmartphones)
  })

  it("affiche les Liens rapides et le Voile sombre dans la Feuille de Recherche", () => {
    renderCapturingErrors(<GlobalNavBar categories={categories} />)

    const recherche = boutonRecherche()
    act(() => recherche.click())

    expect(voileSombre()).not.toBeNull()
    expect(container.textContent).toContain("Liens rapides")
    expect(container.textContent).toContain("Tout le catalogue")

    act(() => voileSombre().click())

    expect(container.querySelector("input[name='q']")).toBeNull()
    expect(container.querySelector("[data-slot='voile-sombre']")).toBeNull()
    expect(document.activeElement).toBe(recherche)
  })

  it("déplie les sous-catégories et marques dans le menu mobile", () => {
    renderCapturingErrors(<GlobalNavBar categories={categories} />)

    const menu = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Ouvrir les catégories']"
    )!
    act(() => menu.click())

    const deplier = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Déplier Smartphones']"
    )!
    expect(deplier.getAttribute("aria-expanded")).toBe("false")

    act(() => deplier.click())

    expect(deplier.getAttribute("aria-expanded")).toBe("true")
    expect(container.querySelector("#menu-categories")?.textContent).toContain(
      "iPhone"
    )
    expect(container.querySelector("#menu-categories")?.textContent).toContain(
      "Samsung"
    )
  })
})
