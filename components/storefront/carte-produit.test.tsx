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

import {
  urlProduit,
  type CarteProduit as CarteProduitDonnees,
} from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"

import { CarteProduit } from "./carte-produit"

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

function carte(
  overrides: Partial<CarteProduitDonnees> = {}
): CarteProduitDonnees {
  return {
    id: "carte-produit",
    name: "Théière traditionnelle",
    slug: "theiere-traditionnelle",
    brand: "Atelier",
    image: "/theiere.jpg",
    minPrice: 100000,
    totalStock: 4,
    freeShipping: false,
    ...overrides,
  }
}

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function lien() {
  return container.querySelector("a")!
}

function imageProduit() {
  return container.querySelector("[data-testid='image-produit']")
}

describe("CarteProduit", () => {
  it("affiche la marque, le nom, la première image et le Prix courant", () => {
    render(<CarteProduit product={carte()} />)

    expect(container.textContent).toContain("Atelier")
    expect(container.textContent).toContain("Théière traditionnelle")
    expect(container.textContent).toContain(formatPrice(100000))
    expect(imageProduit()?.getAttribute("data-src")).toBe("/theiere.jpg")
    expect(imageProduit()?.getAttribute("data-alt")).toBe(
      "Théière traditionnelle"
    )
  })

  it("montre le nom du Produit à la place de l'image absente", () => {
    render(<CarteProduit product={carte({ image: null })} />)

    expect(imageProduit()).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("Théière traditionnelle")
  })

  it("écrit l'URL du Produit par urlProduit", () => {
    render(<CarteProduit product={carte()} />)

    expect(lien().getAttribute("href")).toBe(
      urlProduit("theiere-traditionnelle")
    )
  })

  it("annonce « En stock » suivi de la Livraison offerte accordée", () => {
    render(
      <CarteProduit product={carte({ totalStock: 4, freeShipping: true })} />
    )

    expect(container.textContent).toContain("En stock · Livraison offerte")
  })

  it("n'annonce pas la Livraison offerte quand elle n'est pas accordée", () => {
    render(
      <CarteProduit product={carte({ totalStock: 4, freeShipping: false })} />
    )

    expect(container.textContent).toContain("En stock")
    expect(container.textContent).not.toContain("Livraison offerte")
  })

  it("annonce la rupture même quand la Livraison est offerte", () => {
    render(
      <CarteProduit product={carte({ totalStock: 0, freeShipping: true })} />
    )

    expect(container.textContent).toContain("Rupture de stock")
    expect(container.textContent).not.toContain("Livraison offerte")
  })

  it("laisse le lien en racine quand aucune action n'est fournie", () => {
    render(<CarteProduit product={carte()} />)

    expect(container.children.length).toBe(1)
    expect(container.firstElementChild?.tagName).toBe("A")
  })

  it("rend l'action reçue après le lien, dans l'enveloppe du Produit lié", () => {
    render(
      <CarteProduit
        product={carte()}
        action={<button>Ajouter au panier</button>}
      />
    )

    expect(container.children.length).toBe(1)
    const racine = container.firstElementChild!
    expect(racine.tagName).toBe("DIV")
    expect(racine.className).toBe("flex flex-col gap-2")
    expect([...racine.children].map((enfant) => enfant.tagName)).toEqual([
      "A",
      "BUTTON",
    ])
  })
})
