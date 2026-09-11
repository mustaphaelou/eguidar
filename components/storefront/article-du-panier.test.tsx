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

import { ArticleDuPanier } from "./article-du-panier"

const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function article(overrides: Partial<ArticleDuPanierDonnees> = {}): ArticleDuPanierDonnees {
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

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function bouton(label: string) {
  return [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.getAttribute("aria-label") === label)!
}

async function rejouerTransition() {
  await act(async () => {})
  await act(async () => {})
}

function cliquer(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

describe("ArticleDuPanier", () => {
  it("hands the Variante identity of the displayed Article to the quantity edit", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-x", quantity: 3 },
    ])
  })

  it("hands the Variante identity to the removal write", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "retirer", variantId: "variante-x" },
    ])
  })

  it("asks for quantity - 1 on decrease", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Diminuer la quantité"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-x", quantity: 1 },
    ])
  })

  it("locks the decrease at quantity 1 and writes nothing below it", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article({ quantity: 1 })} port={port} />)

    const diminuer = bouton("Diminuer la quantité")
    expect(diminuer.disabled).toBe(true)
    cliquer(diminuer)
    await rejouerTransition()

    expect(port.appels).toEqual([])
  })

  it("surfaces the article-inconnu refusal inline in the alert", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }))
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_ARTICLE_INCONNU
    )
  })

  it("surfaces the variante-inconnue refusal inline in the alert", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    }))
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_VARIANTE_INCONNUE
    )
  })

  it("clears the refusal on the next operation on the same Article du panier", async () => {
    let refuser = true
    const port = creerPortPanierEnMemoire(() =>
      refuser
        ? {
            ok: false,
            motif: "article-inconnu",
            message: MESSAGE_ARTICLE_INCONNU,
          }
        : { ok: true }
    )
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_ARTICLE_INCONNU
    )

    refuser = false
    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()

    expect(container.querySelector("[role='alert']")).toBeNull()
    expect(port.appels).toHaveLength(2)
  })
})
