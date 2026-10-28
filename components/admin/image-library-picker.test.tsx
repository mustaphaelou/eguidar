// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({
    src,
    width,
    height,
    sizes,
  }: {
    src: string
    width?: number
    height?: number
    sizes?: string
  }) => (
    <span
      data-image-src={src}
      data-image-width={width}
      data-image-height={height}
      data-image-sizes={sizes}
    />
  ),
}))

import { monterFormulaire } from "@/test/rendu-formulaire"
import { ImageLibraryPicker } from "@/components/admin/image-library-picker"

const rendu = monterFormulaire()

const BIBLIOTHEQUE = [
  {
    publicUrl: "https://cdn.example.test/products/a.webp",
    alt: "Face avant",
  },
  {
    publicUrl: "https://cdn.example.test/products/b.jpg",
    alt: null,
  },
]

async function ouvrir() {
  const declencheur = [...rendu.container.querySelectorAll("button")].find(
    (bouton) => bouton.textContent?.includes("Choisir dans la bibliothèque")
  )!
  await act(async () => {
    declencheur.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function cliquer(element: HTMLElement) {
  await act(async () => {
    element.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("ImageLibraryPicker", () => {
  it("liste les Images produit absentes de la Galerie et les choisit sans envoi", async () => {
    const onChoisir = vi.fn()
    rendu.render(
      <ImageLibraryPicker
        bibliotheque={BIBLIOTHEQUE}
        dejaPresentes={new Set([BIBLIOTHEQUE[0]!.publicUrl])}
        onChoisir={onChoisir}
      />
    )

    await ouvrir()

    const contenu = document.querySelector<HTMLElement>(
      '[data-slot="dialog-content"]'
    )
    expect(contenu).not.toBeNull()
    const vignettes = [
      ...contenu!.querySelectorAll<HTMLElement>("[data-image-src]"),
    ]
    expect(vignettes).toHaveLength(1)
    expect(vignettes[0]!.getAttribute("data-image-src")).toBe(
      BIBLIOTHEQUE[1]!.publicUrl
    )
    expect(vignettes[0]!.getAttribute("data-image-width")).toBe("96")
    expect(vignettes[0]!.getAttribute("data-image-height")).toBe("96")
    expect(vignettes[0]!.getAttribute("data-image-sizes")).toBe("96px")

    await cliquer(
      contenu!.querySelector<HTMLElement>(
        '[aria-label="Choisir l\'Image produit https://cdn.example.test/products/b.jpg"]'
      )!
    )

    expect(onChoisir).toHaveBeenCalledWith({
      url: BIBLIOTHEQUE[1]!.publicUrl,
      alt: null,
    })
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
  })

  it("filtre la bibliothèque par Texte alternatif ou adresse", async () => {
    rendu.render(
      <ImageLibraryPicker
        bibliotheque={BIBLIOTHEQUE}
        dejaPresentes={new Set()}
        onChoisir={vi.fn()}
      />
    )
    await ouvrir()

    const champ = document.querySelector<HTMLInputElement>("#picker-medias-q")!
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    act(() => {
      setter?.call(champ, "face avant")
      champ.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const vignettes = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="dialog-content"] [data-image-src]'
      ),
    ]
    expect(vignettes).toHaveLength(1)
    expect(vignettes[0]!.getAttribute("data-image-src")).toBe(
      BIBLIOTHEQUE[0]!.publicUrl
    )
  })

  it("désactive le déclencheur quand la Galerie est pleine", () => {
    rendu.render(
      <ImageLibraryPicker
        bibliotheque={BIBLIOTHEQUE}
        dejaPresentes={new Set()}
        desactivee
        onChoisir={vi.fn()}
      />
    )

    const declencheur = [...rendu.container.querySelectorAll("button")].find(
      (bouton) => bouton.textContent?.includes("Choisir dans la bibliothèque")
    )!
    expect(declencheur.disabled).toBe(true)
  })
})
