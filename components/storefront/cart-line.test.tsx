// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { modifierQuantiteMock, retirerMock } = vi.hoisted(() => ({
  modifierQuantiteMock: vi.fn(),
  retirerMock: vi.fn(),
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

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => (
    <div data-testid="image-produit" data-alt={alt} />
  ),
}))

vi.mock("@/app/(boutique)/actions", () => ({
  modifierQuantiteArticlePanierAction: modifierQuantiteMock,
  retirerArticleDuPanierAction: retirerMock,
}))

import type { ArticleDuPanier } from "@/lib/panier"
import { LigneArticlePanier } from "./cart-line"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function ligne(overrides: Partial<ArticleDuPanier> = {}): ArticleDuPanier {
  return {
    articlePanierId: "article-panier-1",
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
  modifierQuantiteMock.mockReset()
  retirerMock.mockReset()
  modifierQuantiteMock.mockResolvedValue({ ok: true })
  retirerMock.mockResolvedValue({ ok: true })
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

describe("LigneArticlePanier", () => {
  it("hands the Variante identity of the displayed Article to the quantity edit", async () => {
    render(<LigneArticlePanier line={ligne()} />)

    act(() => {
      bouton("Augmenter la quantité").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })
    await rejouerTransition()

    expect(modifierQuantiteMock).toHaveBeenCalledTimes(1)
    expect(modifierQuantiteMock).toHaveBeenCalledWith("variante-x", 3)
    expect(modifierQuantiteMock).not.toHaveBeenCalledWith("article-panier-1", 3)
  })

  it("hands the Variante identity to the removal write", async () => {
    render(<LigneArticlePanier line={ligne()} />)

    act(() => {
      bouton("Retirer du panier").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })
    await rejouerTransition()

    expect(retirerMock).toHaveBeenCalledTimes(1)
    expect(retirerMock).toHaveBeenCalledWith("variante-x")
    expect(retirerMock).not.toHaveBeenCalledWith("article-panier-1")
  })

  it("asks for quantity - 1 on decrease", async () => {
    render(<LigneArticlePanier line={ligne()} />)

    act(() => {
      bouton("Diminuer la quantité").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })
    await rejouerTransition()

    expect(modifierQuantiteMock).toHaveBeenCalledWith("variante-x", 1)
  })

  it("locks the decrease at quantity 1 and writes nothing below it", async () => {
    render(<LigneArticlePanier line={ligne({ quantity: 1 })} />)

    const diminuer = bouton("Diminuer la quantité")
    expect(diminuer.disabled).toBe(true)
    act(() => {
      diminuer.click()
    })
    await rejouerTransition()

    expect(modifierQuantiteMock).not.toHaveBeenCalled()
  })
})
