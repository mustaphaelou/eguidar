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

import type { ProduitLie } from "@/lib/use-cases/blog"
import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

import { ProduitLieCarte } from "./produit-lie-carte"

const MESSAGE_CAP_ATTEINTE = "Votre panier est plein : 20 articles maximum."

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

function produitLie(overrides: Partial<ProduitLie> = {}): ProduitLie {
  return {
    id: "produit-lie",
    name: "Théière traditionnelle",
    slug: "theiere-traditionnelle",
    brand: "Atelier",
    image: "/theiere.jpg",
    minPrice: 100000,
    totalStock: 4,
    freeShipping: false,
    varianteId: "variante-lie",
    ...overrides,
  }
}

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
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

describe("ProduitLieCarte", () => {
  it("transmet la Variante et la quantité 1 puis accuse la réception", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ProduitLieCarte product={produitLie()} port={port} />)

    await cliquerAjouter()

    expect(port.appels).toEqual([
      { operation: "ajouter", variantId: "variante-lie", quantity: 1 },
    ])
    expect(container.textContent).toContain("Ajouté au panier")
    expect(container.querySelector("[role='alert']")).toBeNull()
  })

  it("affiche le Refus du panier en alerte, sans accusé", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "cap-atteinte",
      message: MESSAGE_CAP_ATTEINTE,
    }))
    render(<ProduitLieCarte product={produitLie()} port={port} />)

    await cliquerAjouter()

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_CAP_ATTEINTE
    )
    expect(container.textContent).not.toContain("Ajouté au panier")
  })

  it("n'appelle pas le port quand aucune Variante n'est disponible", async () => {
    const port = creerPortPanierEnMemoire()
    render(
      <ProduitLieCarte product={produitLie({ varianteId: null })} port={port} />
    )

    expect(boutonAjouter().disabled).toBe(true)

    await cliquerAjouter()

    expect(port.appels).toEqual([])
    expect(container.textContent).not.toContain("Ajouté au panier")
  })
})
