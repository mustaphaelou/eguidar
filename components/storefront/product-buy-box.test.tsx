// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { formatPrice } from "@/lib/money"
import type { ProductVariantDto } from "@/lib/use-cases/storefront"
import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

import { ProductBuyBox } from "./product-buy-box"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const variantes: ProductVariantDto[] = [
  {
    id: "variante-a",
    name: "Standard",
    sku: "PBB-A",
    prix: 100000,
    stock: 4,
  },
]

const variantesMultiples: ProductVariantDto[] = [
  {
    id: "variante-a",
    name: "Standard",
    sku: "PBB-A",
    prix: 100000,
    stock: 4,
  },
  {
    id: "variante-b",
    name: "Premium",
    sku: "PBB-B",
    prix: 125000,
    stock: 2,
  },
]

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
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function buyBox(
  port: ReturnType<typeof creerPortPanierEnMemoire>,
  variants: ProductVariantDto[] = variantes
) {
  return (
    <ProductBuyBox
      minPrice={100000}
      variants={variants}
      freeShipping={false}
      port={port}
    />
  )
}

function boutonAjouter() {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Ajouter au panier")
  )!
}

async function cliquerAjouter() {
  act(() => {
    boutonAjouter().dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
  })
  await act(async () => {})
  await act(async () => {})
}

describe("ProductBuyBox", () => {
  it("n'appelle pas le port quand la variante sélectionnée est en rupture de stock", async () => {
    const port = creerPortPanierEnMemoire()

    render(
      buyBox(port, [
        {
          id: "variante-rupture",
          name: "Standard",
          sku: "PBB-R",
          prix: 100000,
          stock: 0,
        },
      ])
    )

    expect(boutonAjouter().disabled).toBe(true)

    await cliquerAjouter()

    expect(port.appels).toEqual([])
    expect(container.textContent).not.toContain("Ajouté au panier")
  })

  it("rend la Barre d'achat initialement masquée tant que le bouton est visible", () => {
    render(buyBox(creerPortPanierEnMemoire()))

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.getAttribute("aria-hidden")).toBe("true")
  })

  it("rend la Barre d'achat avec le prix de la variante sélectionnée", () => {
    render(buyBox(creerPortPanierEnMemoire()))

    const barreEl = container.querySelector<HTMLElement>(
      "[data-slot='barre-d-achat']"
    )
    expect(barreEl).not.toBeNull()
    expect(barreEl!.textContent).toContain(formatPrice(100000))
    expect(barreEl!.textContent).toContain("Ajouter au panier")
  })

  it("met à jour le prix affiché dans la barre quand la variante sélectionnée change", () => {
    render(buyBox(creerPortPanierEnMemoire(), variantesMultiples))

    const puce = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Premium")
    )!
    act(() => {
      puce.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.textContent).toContain(formatPrice(125000))
    expect(barreEl.textContent).not.toContain(formatPrice(100000))
  })

  it("ajoute la variante sélectionnée au panier depuis le bouton de la barre", async () => {
    const port = creerPortPanierEnMemoire()

    render(buyBox(port, variantesMultiples))

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

    expect(port.appels).toEqual([
      { operation: "ajouter", variantId: "variante-b", quantity: 1 },
    ])
  })

  it("ne rend aucune barre pour un produit sans variante et affiche son prix minimal", () => {
    render(buyBox(creerPortPanierEnMemoire(), []))

    expect(container.querySelector("[data-slot='barre-d-achat']")).toBeNull()
    expect(container.textContent).toContain(formatPrice(100000))
  })

  it("affiche le prix calculé dans les options du sélecteur quand les variantes dépassent six", () => {
    const septVariantes: ProductVariantDto[] = Array.from(
      { length: 7 },
      (_, i) => ({
        id: `v-${i}`,
        name: `Option ${i + 1}`,
        sku: `SKU-${i}`,
        prix: 100000 + i * 10000,
        stock: 5,
      })
    )

    render(buyBox(creerPortPanierEnMemoire(), septVariantes))

    const trigger =
      container.querySelector<HTMLButtonElement>("[id='variant']")!
    act(() => {
      trigger.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })

    expect(document.body.textContent).toContain(
      `Option 2 — ${formatPrice(110000)}`
    )
    expect(document.body.textContent).toContain(
      `Option 7 — ${formatPrice(160000)}`
    )
  })
})
