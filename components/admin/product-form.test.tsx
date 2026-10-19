// @vitest-environment happy-dom

import { act } from "react"
import type { ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

import {
  ProductForm,
  type ProductFormState,
} from "@/components/admin/product-form"
import {
  CHAMPS_FORMULAIRE_PRODUIT,
  type FaitsFormulaireProduit,
} from "@/lib/formulaire-produit"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

const CHAMPS_LUS_PAR_LE_TRANSPORT = Object.values(
  CHAMPS_FORMULAIRE_PRODUIT
).filter((nom) => nom !== CHAMPS_FORMULAIRE_PRODUIT.produit)

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
  return root
}

function unmount(root: ReturnType<typeof createRoot>) {
  act(() => root.unmount())
  const index = roots.indexOf(root)
  if (index >= 0) roots.splice(index, 1)
}

function initialProduct(): FaitsFormulaireProduit {
  return {
    id: "produit-1",
    name: "Produit",
    slug: "produit",
    brand: "Marque",
    categoryId: "categorie-1",
    description: "Description",
    price: 1000,
    isFeatured: false,
    featuredOrder: 0,
    freeShipping: false,
    specs: {},
    images: [
      {
        kind: "persistee",
        url: "https://cdn.example.test/products/existing.png",
      },
    ],
    variants: [
      {
        name: "Standard",
        sku: "SKU-1",
        priceDelta: 0,
        stock: 1,
      },
    ],
  }
}

function nomsRendus(): string[] {
  return [...container.querySelectorAll("input, select, textarea, button")]
    .map((controle) => controle.getAttribute("name"))
    .filter((nom): nom is string => nom !== null)
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ProductForm", () => {
  it("signale la suppression en attente sans appeler le stockage", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const action = vi.fn(
      async (
        _previous: ProductFormState,
        _formData: FormData
      ): Promise<ProductFormState> => ({})
    )
    const product = initialProduct()
    const secondImage = {
      kind: "persistee" as const,
      url: "https://cdn.example.test/products/second.png",
    }
    product.images.push(secondImage)
    const root = render(
      <ProductForm product={product} categories={[]} action={action} />
    )

    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.click())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-image-state="suppression-en-attente"]')
    ).not.toBeNull()

    unmount(root)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("conserve la suppression en attente après un refus et permet un nouvel essai", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const action = vi.fn(
      async (
        _previous: ProductFormState,
        _formData: FormData
      ): Promise<ProductFormState> => ({ error: "Refus de validation" })
    )
    render(
      <ProductForm product={initialProduct()} categories={[]} action={action} />
    )

    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.click())
    const form = container.querySelector<HTMLFormElement>("form")!
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(action).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("Refus de validation")
    expect(
      container.querySelector('[data-image-state="suppression-en-attente"]')
    ).not.toBeNull()

    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(action).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("porte la même identité de tentative d'une soumission à l'autre", async () => {
    const identites: string[] = []
    const action = vi.fn(
      async (
        _previous: ProductFormState,
        formData: FormData
      ): Promise<ProductFormState> => {
        identites.push(String(formData.get("tentativeId")))
        return { error: "Refus de validation" }
      }
    )
    render(
      <ProductForm product={initialProduct()} categories={[]} action={action} />
    )

    const champ = container.querySelector<HTMLInputElement>(
      'input[name="tentativeId"]'
    )!
    const identite = champ.value
    expect(identite).not.toBe("")

    const form = container.querySelector<HTMLFormElement>("form")!
    for (let essai = 0; essai < 2; essai += 1) {
      await act(async () => {
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    expect(action).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("Refus de validation")
    expect(identites).toEqual([identite, identite])
    expect(
      container.querySelector<HTMLInputElement>('input[name="tentativeId"]')!
        .value
    ).toBe(identite)
  })
})

describe("les noms de champs rendus", () => {
  it("rend exactement les champs du vocabulaire, ni plus ni moins", () => {
    render(
      <ProductForm
        product={initialProduct()}
        categories={[]}
        action={async () => ({})}
      />
    )

    expect(nomsRendus().sort()).toEqual(
      [...Object.values(CHAMPS_FORMULAIRE_PRODUIT)].sort()
    )
  })

  it("rend tous les champs que le transport lit", () => {
    render(
      <ProductForm
        product={initialProduct()}
        categories={[]}
        action={async () => ({})}
      />
    )

    const rendus = new Set(nomsRendus())

    expect(
      CHAMPS_LUS_PAR_LE_TRANSPORT.filter((nom) => !rendus.has(nom))
    ).toEqual([])
  })
})
