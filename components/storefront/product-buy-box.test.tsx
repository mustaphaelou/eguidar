// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { ajouterArticleAuPanierActionMock } = vi.hoisted(() => ({
  ajouterArticleAuPanierActionMock: vi.fn(),
}))

vi.mock("@/app/(boutique)/actions", () => ({
  ajouterArticleAuPanierAction: ajouterArticleAuPanierActionMock,
}))

import { MESSAGE_CAP_ATTEINTE } from "@/lib/panier-visiteur"
import { formatPrice } from "@/lib/money"
import { ProductBuyBox } from "./product-buy-box"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const variantes = [
  { id: "variante-a", name: "Standard", sku: "PBB-A", priceDelta: 0, stock: 4 },
]

const variantesMultiples = [
  { id: "variante-a", name: "Standard", sku: "PBB-A", priceDelta: 0, stock: 4 },
  { id: "variante-b", name: "Premium", sku: "PBB-B", priceDelta: 25000, stock: 2 },
]

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  ajouterArticleAuPanierActionMock.mockReset()
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

function buyBox() {
  return (
    <ProductBuyBox
      basePrice={100000}
      variants={variantes}
      freeShipping={false}
    />
  )
}

async function cliquerAjouter() {
  const bouton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Ajouter au panier")
  )!
  act(() => {
    bouton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
  await act(async () => {})
  await act(async () => {})
}

describe("ProductBuyBox", () => {
  it("confirms the addition when the action succeeds", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({ ok: true })

    render(buyBox())
    await cliquerAjouter()

    expect(container.textContent).toContain("Ajouté au panier")
    expect(container.textContent).not.toContain(MESSAGE_CAP_ATTEINTE)
  })

  it("shows the explicit cap message when the Visiteur's Panier is full", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({
      ok: false,
      motif: "cap-atteinte",
    })

    render(buyBox())
    await cliquerAjouter()

    expect(ajouterArticleAuPanierActionMock).toHaveBeenCalledTimes(1)
    expect(ajouterArticleAuPanierActionMock.mock.calls[0]).toHaveLength(2)
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_CAP_ATTEINTE
    )
    expect(container.textContent).toContain("20 articles maximum")
    expect(container.textContent).not.toContain("Ajouté au panier")
  })

  it("stays silent on any other refusal", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({
      ok: false,
      motif: "quantite-invalide",
    })

    render(buyBox())
    await cliquerAjouter()

    expect(container.textContent).not.toContain("Ajouté au panier")
    expect(container.textContent).not.toContain(MESSAGE_CAP_ATTEINTE)
  })

  it("rend la Barre d'achat avec le prix de la variante sélectionnée", () => {
    render(buyBox())

    const barreEl = container.querySelector<HTMLElement>(
      "[data-slot='barre-d-achat']"
    )
    expect(barreEl).not.toBeNull()
    expect(barreEl!.textContent).toContain(formatPrice(100000))
    expect(barreEl!.textContent).toContain("Ajouter au panier")
  })

  it("met à jour le prix affiché dans la barre quand la variante sélectionnée change", () => {
    render(
      <ProductBuyBox
        basePrice={100000}
        variants={variantesMultiples}
        freeShipping={false}
      />
    )

    const puce = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Premium")
    )!
    act(() => {
      puce.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.textContent).toContain(formatPrice(100000 + 25000))
    expect(barreEl.textContent).not.toContain(formatPrice(100000))
  })

  it("ajoute la variante sélectionnée au panier depuis le bouton de la barre", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({ ok: true })

    render(
      <ProductBuyBox
        basePrice={100000}
        variants={variantesMultiples}
        freeShipping={false}
      />
    )

    const puce = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Premium")
    )!
    act(() => {
      puce.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })

    const boutonBarre = container.querySelector(
      "[data-slot='barre-d-achat'] button"
    )!
    act(() => {
      boutonBarre.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })
    await act(async () => {})
    await act(async () => {})

    expect(ajouterArticleAuPanierActionMock).toHaveBeenCalledTimes(1)
    expect(ajouterArticleAuPanierActionMock).toHaveBeenCalledWith("variante-b", 1)
  })

  it("ne rend aucune barre pour un produit sans variante", () => {
    render(
      <ProductBuyBox basePrice={100000} variants={[]} freeShipping={false} />
    )

    expect(container.querySelector("[data-slot='barre-d-achat']")).toBeNull()
  })
})
