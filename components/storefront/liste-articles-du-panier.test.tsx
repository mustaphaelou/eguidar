// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => (
    <div data-testid="image-produit" data-alt={alt} />
  ),
}))

import type { ArticleDuPanier as ArticleDuPanierDonnees } from "@/lib/panier"
import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

import { ListeArticlesDuPanier } from "./liste-articles-du-panier"

const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.useRealTimers()
})

function article(
  overrides: Partial<ArticleDuPanierDonnees> = {}
): ArticleDuPanierDonnees {
  return {
    variantId: "variante-x",
    variantName: "Standard",
    productId: "produit-1",
    productName: "Théière traditionnelle",
    productSlug: "theiere-traditionnelle",
    image: null,
    unitPrice: 100000,
    quantity: 2,
    lineTotal: 200000,
    stock: 9,
    freeShipping: false,
    ...overrides,
  }
}

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

async function rejouerTransition() {
  await act(async () => {})
  await act(async () => {})
}

function boutons(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.getAttribute("aria-label") === label
  )
}

function bouton(label: string, rang = 0) {
  return boutons(label)[rang]!
}

function cliquer(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
  })
}

function annonce() {
  return container.querySelector<HTMLElement>('[role="status"]')!
}

function annonceVisible() {
  return !annonce().hasAttribute("inert")
}

describe("ListeArticlesDuPanier", () => {
  it("renders every Article du panier of the Panier, in order", () => {
    render(
      <ListeArticlesDuPanier
        articles={[
          article(),
          article({
            variantId: "variante-y",
            productName: "Plateau en cuivre",
            quantity: 1,
            lineTotal: 50000,
          }),
        ]}
      />
    )

    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(container.textContent).toContain("Théière traditionnelle")
    expect(container.textContent).toContain("Plateau en cuivre")
    expect(boutons("Retirer du panier")).toHaveLength(2)
  })

  it("announces a removal and offers Annuler", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ListeArticlesDuPanier articles={[article()]} port={port} />)

    expect(annonceVisible()).toBe(false)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "retirer", variantId: "variante-x" },
    ])
    expect(annonceVisible()).toBe(true)
    expect(annonce().textContent).toContain("Retiré du panier")
    expect(bouton("Annuler le retrait de Théière traditionnelle")).toBeDefined()
  })

  it("re-adds the Article with its quantity on Annuler, then withdraws", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ListeArticlesDuPanier articles={[article()]} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()
    cliquer(bouton("Annuler le retrait de Théière traditionnelle"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "retirer", variantId: "variante-x" },
      { operation: "ajouter", variantId: "variante-x", quantity: 2 },
    ])
    expect(annonceVisible()).toBe(false)
  })

  it("fades the announcement on its own after the undo window", async () => {
    vi.useFakeTimers()
    const port = creerPortPanierEnMemoire()
    render(<ListeArticlesDuPanier articles={[article()]} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()
    expect(annonceVisible()).toBe(true)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(annonceVisible()).toBe(false)
  })

  it("withdraws the announcement when the removal is refused", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }))
    render(<ListeArticlesDuPanier articles={[article()]} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()

    expect(annonceVisible()).toBe(false)
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_ARTICLE_INCONNU
    )
  })

  it("keeps the announcement and relays the refusal when Annuler is refused", async () => {
    const port = creerPortPanierEnMemoire((appel) =>
      appel.operation === "ajouter"
        ? {
            ok: false,
            motif: "variante-inconnue",
            message: "Cet article n'est plus disponible.",
          }
        : { ok: true }
    )
    render(<ListeArticlesDuPanier articles={[article()]} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()
    cliquer(bouton("Annuler le retrait de Théière traditionnelle"))
    await rejouerTransition()

    expect(annonceVisible()).toBe(true)
    expect(annonce().textContent).toContain(
      "Cet article n'est plus disponible."
    )
    expect(
      bouton("Annuler le retrait de Théière traditionnelle").disabled
    ).toBe(false)
  })

  it("announces the newest removal when a second Article leaves", async () => {
    const port = creerPortPanierEnMemoire()
    render(
      <ListeArticlesDuPanier
        articles={[
          article(),
          article({
            variantId: "variante-y",
            productName: "Plateau en cuivre",
            quantity: 1,
            lineTotal: 50000,
          }),
        ]}
        port={port}
      />
    )

    cliquer(bouton("Retirer du panier", 0))
    await rejouerTransition()
    cliquer(bouton("Retirer du panier", 1))
    await rejouerTransition()

    expect(bouton("Annuler le retrait de Plateau en cuivre")).toBeDefined()
  })
})
