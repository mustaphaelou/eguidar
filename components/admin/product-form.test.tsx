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
import type { FaitsFormulaireProduit } from "@/lib/formulaire-produit"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

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
  it("omet une suppression persistée en attente des faits soumis sans appeler le stockage", () => {
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

    const images = container.querySelector<HTMLInputElement>(
      'input[name="images"]'
    )!
    expect(JSON.parse(images.value)).toEqual([secondImage])
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
        formData: FormData
      ): Promise<ProductFormState> => {
        expect(JSON.parse(String(formData.get("images")))).toEqual([])
        return { error: "Refus de validation" }
      }
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
    expect(
      JSON.parse(
        container.querySelector<HTMLInputElement>('input[name="images"]')!.value
      )
    ).toEqual([])

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
    // Le transport ne fabrique plus d'identité : une soumission sans elle est
    // refusée par le refus que le cycle de vie des Images produit définit
    // déjà. Le formulaire de l'Administration est donc tenu de la rendre, et de
    // la garder d'un essai à l'autre — c'est ce qui fait d'un second essai la
    // même tentative, et d'un Brouillon téléversé un Brouillon revendicable.
    const soumissions: { tentativeId: string; images: unknown }[] = []
    const action = vi.fn(
      async (
        _previous: ProductFormState,
        formData: FormData
      ): Promise<ProductFormState> => {
        soumissions.push({
          tentativeId: String(formData.get("tentativeId")),
          images: JSON.parse(String(formData.get("images"))),
        })
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

    // Un refus suivi d'un nouvel essai : c'est le cas où l'identité pourrait
    // être refabriquée si elle était tirée à chaque rendu.
    expect(action).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("Refus de validation")
    expect(soumissions).toEqual([
      { tentativeId: identite, images: initialProduct().images },
      { tentativeId: identite, images: initialProduct().images },
    ])
    expect(
      container.querySelector<HTMLInputElement>('input[name="tentativeId"]')!
        .value
    ).toBe(identite)
  })
})
