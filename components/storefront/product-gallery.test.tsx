// @vitest-environment happy-dom

import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    sizes,
    preload,
    className,
  }: {
    src: string
    alt: string
    sizes?: string
    preload?: boolean
    className?: string
  }) => (
    <span
      data-image-src={src}
      data-image-alt={alt}
      data-image-sizes={sizes}
      data-image-preload={String(preload ?? false)}
      data-image-class={className}
    />
  ),
}))

import { ProductGallery } from "@/components/storefront/product-gallery"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
  return root
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
})

const IMAGES = [
  { url: "https://cdn.example.test/products/a.webp", alt: "Face avant" },
  { url: "https://cdn.example.test/products/b.webp", alt: null },
]

describe("ProductGallery", () => {
  it("précharge l'image principale et rend l'alt de l'asset quand il existe", () => {
    render(<ProductGallery images={IMAGES} name="Produit Témoin" />)

    const principale = container.querySelector<HTMLElement>(
      ".relative.aspect-square [data-image-src]"
    )
    expect(principale?.getAttribute("data-image-src")).toBe(IMAGES[0].url)
    expect(principale?.getAttribute("data-image-alt")).toBe("Face avant")
    expect(principale?.getAttribute("data-image-preload")).toBe("true")
    expect(principale?.getAttribute("data-image-sizes")).toBe(
      "(min-width: 1024px) 50vw, 100vw"
    )
  })

  it("replie sur le nom du Produit quand l'Image produit n'a pas d'alt, et ne précharge que la première", () => {
    render(<ProductGallery images={IMAGES} name="Produit Témoin" />)

    const secondeVignette = container.querySelector<HTMLButtonElement>(
      '[aria-label="Afficher l\'image 2 sur 2"]'
    )!
    act(() => secondeVignette.click())

    const principale = container.querySelector<HTMLElement>(
      ".relative.aspect-square [data-image-src]"
    )
    expect(principale?.getAttribute("data-image-src")).toBe(IMAGES[1].url)
    expect(principale?.getAttribute("data-image-alt")).toBe("Produit Témoin")
    expect(principale?.getAttribute("data-image-preload")).toBe("false")
    expect(secondeVignette.getAttribute("aria-pressed")).toBe("true")
  })

  it("donne un sizes à chaque vignette et un repli sans image", () => {
    render(<ProductGallery images={IMAGES} name="Produit Témoin" />)

    const vignettes = container.querySelectorAll<HTMLElement>(
      '[role="group"][aria-label="Images du produit"] [data-image-sizes]'
    )
    expect(vignettes).toHaveLength(2)
    for (const vignette of vignettes) {
      expect(vignette.getAttribute("data-image-sizes")).toBe(
        "(min-width: 1024px) 72px, 16vw"
      )
      expect(vignette.getAttribute("data-image-alt")).toBe("")
    }

    act(() =>
      roots[0]!.render(<ProductGallery images={[]} name="Sans image" />)
    )
    expect(container.textContent).toContain("Aucune image")
  })

  it("montre l'image entière et un compteur, pas un recadrage", () => {
    render(<ProductGallery images={IMAGES} name="Produit Témoin" />)

    const principale = container.querySelector<HTMLElement>(
      ".relative.aspect-square [data-image-src]"
    )
    expect(principale?.getAttribute("data-image-class")).toContain(
      "object-contain"
    )
    expect(container.textContent).toContain("1 / 2")

    const secondes = container.querySelectorAll<HTMLElement>(
      '[role="group"] [data-image-class]'
    )
    for (const vignette of secondes) {
      expect(vignette.getAttribute("data-image-class")).toContain(
        "object-contain"
      )
    }
  })

  it("nomme chaque vignette avec sa position, le total et son texte alternatif", () => {
    render(<ProductGallery images={IMAGES} name="Produit Témoin" />)

    expect(
      container.querySelector(
        `[aria-label="Afficher l'image 1 sur 2 — Face avant"]`
      )
    ).not.toBeNull()
    expect(
      container.querySelector(`[aria-label="Afficher l'image 2 sur 2"]`)
    ).not.toBeNull()
  })
})
