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
  default: ({ src, alt }: { src: string; alt: string }) => (
    <div data-testid="image-produit" data-src={src} data-alt={alt} />
  ),
}))

import { urlProduit, type CarteProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"

import { ProductCardItem } from "./product-card"

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
})

function produit(overrides: Partial<CarteProduit> = {}): CarteProduit {
  return {
    id: "product-card",
    name: "Casque sans fil",
    slug: "casque-sans-fil",
    brand: "Acme",
    image: "/casque.jpg",
    minPrice: 45000,
    totalStock: 3,
    freeShipping: false,
    ...overrides,
  }
}

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

describe("ProductCardItem", () => {
  it("affiche la marque, le nom, l'image et le prix minimum", () => {
    render(<ProductCardItem product={produit()} />)

    expect(container.textContent).toContain("Acme")
    expect(container.textContent).toContain("Casque sans fil")
    expect(container.textContent).toContain(formatPrice(45000))
    expect(
      container
        .querySelector("[data-testid='image-produit']")
        ?.getAttribute("data-src")
    ).toBe("/casque.jpg")
  })

  it("pointe vers l'URL du Produit", () => {
    render(<ProductCardItem product={produit()} />)

    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      urlProduit("casque-sans-fil")
    )
  })

  it("affiche « Livraison offerte » quand elle est accordée", () => {
    render(<ProductCardItem product={produit({ freeShipping: true })} />)

    expect(container.textContent).toContain("Livraison offerte")
  })

  it("n'affiche pas « Livraison offerte » quand elle n'est pas accordée", () => {
    render(<ProductCardItem product={produit({ freeShipping: false })} />)

    expect(container.textContent).not.toContain("Livraison offerte")
  })

  it("annonce la rupture de stock", () => {
    render(<ProductCardItem product={produit({ totalStock: 0 })} />)

    expect(container.textContent).toContain("Rupture de stock")
  })

  it("montre « Aucune image » quand l'image manque", () => {
    render(<ProductCardItem product={produit({ image: null })} />)

    expect(container.textContent).toContain("Aucune image")
  })
})
