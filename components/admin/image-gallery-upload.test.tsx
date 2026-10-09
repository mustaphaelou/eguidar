// @vitest-environment happy-dom

import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

import { ImageGalleryUpload } from "@/components/admin/image-gallery-upload"
import type { EntreeImageProduitFormulaire } from "@/lib/formulaire-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"

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

function boutonAjouter(): HTMLButtonElement {
  const bouton = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.includes("Ajouter des images"))
  if (!bouton) throw new Error("bouton d'ajout d'images absent du rendu")
  return bouton
}

function GalerieTest({
  initialImages,
  onChange,
}: {
  initialImages: EntreeImageProduitFormulaire[]
  onChange(images: EntreeImageProduitFormulaire[]): void
}) {
  const [images, setImages] = useState(initialImages)
  return (
    <ImageGalleryUpload
      images={images}
      onChange={(suivantes) => {
        setImages(suivantes)
        onChange(suivantes)
      }}
    />
  )
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

describe("ImageGalleryUpload", () => {
  it("transforme un envoi en entrée Brouillon et ne supprime pas une Image persistée", async () => {
    const onChange = vi.fn()
    const persisted: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/existing.png",
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            draftId: "draft-1",
            uploadUrl: "https://upload.example.test/signed",
            previewUrl:
              "https://cdn.example.test/products/brouillons/draft-1.png",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    render(<ImageGalleryUpload images={[persisted]} onChange={onChange} />)
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(["image"], "photo.png", { type: "image/png" })
    Object.defineProperty(input, "files", { value: [file] })

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).toHaveBeenCalledWith([
      persisted,
      {
        kind: "brouillon",
        draftId: "draft-1",
        previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/delete"))
    ).toBe(false)
  })

  it("garde le bouton d'ajout actif à pleine capacité tant qu'une suppression est en attente", async () => {
    const onChange = vi.fn()
    const gallery: EntreeImageProduitFormulaire[] = Array.from(
      { length: 8 },
      (_, index) => ({
        kind: "persistee" as const,
        url: `https://cdn.example.test/products/existing-${index}.png`,
      })
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            draftId: "draft-remplacement",
            uploadUrl: "https://upload.example.test/signed",
            previewUrl:
              "https://cdn.example.test/products/brouillons/draft-remplacement.png",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const root = render(
      <GalerieTest initialImages={gallery} onChange={onChange} />
    )

    expect(boutonAjouter().disabled).toBe(true)
    expect(container.textContent).toContain("8/8 images")

    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.dispatchEvent(new Event("click", { bubbles: true })))

    expect(boutonAjouter().disabled).toBe(false)
    expect(container.textContent).toContain("7/8 images")
    act(() => boutonAjouter().click())

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(["image"], "photo.png", { type: "image/png" })
    Object.defineProperty(input, "files", { value: [file] })
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/uploads/presign")
    expect(onChange).toHaveBeenLastCalledWith([
      ...gallery.map((image, index) =>
        index === 0 ? { ...image, suppressionEnAttente: true } : image
      ),
      {
        kind: "brouillon",
        draftId: "draft-remplacement",
        previewUrl:
          "https://cdn.example.test/products/brouillons/draft-remplacement.png",
      },
    ])
    unmount(root)
  })

  it("marque une Image persistée pour suppression sans appeler la route de suppression R2", () => {
    const onChange = vi.fn()
    const persisted: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/existing.png",
    }
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    render(<GalerieTest initialImages={[persisted]} onChange={onChange} />)
    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.click())

    expect(onChange).toHaveBeenLastCalledWith([
      { ...persisted, suppressionEnAttente: true },
    ])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-image-state="suppression-en-attente"]')
    ).not.toBeNull()
    expect(container.textContent).toContain(
      "Suppressions en attente d'enregistrement"
    )

    const restore = container.querySelector<HTMLButtonElement>(
      '[aria-label="Annuler la suppression de l\'image"]'
    )!
    act(() => restore.click())

    expect(onChange).toHaveBeenLastCalledWith([
      { ...persisted, suppressionEnAttente: false },
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("conserve l'ordre soumis et rend la suppression persistée distincte d'une libération", () => {
    const onChange = vi.fn()
    const premiere: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/first.png",
    }
    const brouillon: EntreeImageProduit = {
      kind: "brouillon",
      draftId: "draft-1",
      previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
    }
    const derniere: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/last.png",
    }

    render(
      <GalerieTest
        initialImages={[premiere, brouillon, derniere]}
        onChange={onChange}
      />
    )
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Supprimer l\'image"]')!
        .click()
    )

    expect(onChange).toHaveBeenLastCalledWith([
      { ...premiere, suppressionEnAttente: true },
      brouillon,
      derniere,
    ])
    expect(
      Array.from(
        container.querySelectorAll(
          '[data-image-kind][data-image-state="active"], [data-image-kind][data-image-state="brouillon"]'
        )
      ).map((image) =>
        image.querySelector("[data-image-src]")?.getAttribute("data-image-src")
      )
    ).toEqual([brouillon.previewUrl, derniere.url])
    expect(
      container.querySelector('[data-image-state="suppression-en-attente"]')
    ).not.toBeNull()
  })

  it("libère un Brouillon d'Image produit par son identifiant puis conserve l'ordre des autres entrées", async () => {
    const onChange = vi.fn()
    const premiere: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/first.png",
    }
    const brouillon: EntreeImageProduit = {
      kind: "brouillon",
      draftId: "draft-1",
      previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
    }
    const derniere: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/last.png",
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ released: true, draftId: "draft-1" }), {
        status: 200,
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    render(
      <GalerieTest
        initialImages={[premiere, brouillon, derniere]}
        onChange={onChange}
      />
    )
    const release = container.querySelector<HTMLButtonElement>(
      '[aria-label="Libérer le Brouillon d\'Image produit"]'
    )!
    await act(async () => {
      release.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/uploads/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: "draft-1" }),
    })
    expect(onChange).toHaveBeenCalledWith([premiere, derniere])
    expect(container.querySelectorAll("[data-image-src]")).toHaveLength(2)
  })

  it("affiche un refus de stockage et garde le Brouillon d'Image produit dans les faits du formulaire", async () => {
    const onChange = vi.fn()
    const message =
      "Le Brouillon d'Image produit a été libéré, mais son objet n'a pas pu être supprimé du stockage pour le moment. Il sera récupéré automatiquement par la règle de cycle de vie R2."
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: message }), { status: 502 })
      )
    vi.stubGlobal("fetch", fetchMock)
    const brouillon: EntreeImageProduit = {
      kind: "brouillon",
      draftId: "draft-1",
      previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
    }

    render(<GalerieTest initialImages={[brouillon]} onChange={onChange} />)
    const release = container.querySelector<HTMLButtonElement>(
      '[aria-label="Libérer le Brouillon d\'Image produit"]'
    )!
    await act(async () => {
      release.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain(message)
    expect(
      container.querySelector(
        '[data-image-src="https://cdn.example.test/products/brouillons/draft-1.png"]'
      )
    ).not.toBeNull()
  })

  it("n'appelle aucune suppression lorsque le formulaire est abandonné", () => {
    const onChange = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const persisted: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/existing.png",
    }

    const root = render(
      <GalerieTest initialImages={[persisted]} onChange={onChange} />
    )
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Supprimer l\'image"]')!
        .click()
    )
    unmount(root)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("désactive la libération du Brouillon d'Image produit pendant son premier appel", async () => {
    const onChange = vi.fn()
    let resolveFetch!: (response: Response) => void
    const reponseEnAttente = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(reponseEnAttente)
    vi.stubGlobal("fetch", fetchMock)
    const brouillon: EntreeImageProduit = {
      kind: "brouillon",
      draftId: "draft-1",
      previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
    }

    render(<GalerieTest initialImages={[brouillon]} onChange={onChange} />)
    const release = container.querySelector<HTMLButtonElement>(
      '[aria-label="Libérer le Brouillon d\'Image produit"]'
    )!
    act(() => release.click())

    const pending = container.querySelector<HTMLButtonElement>(
      '[aria-label="Libération du Brouillon d\'Image produit en cours…"]'
    )!
    expect(pending.disabled).toBe(true)
    expect(pending.getAttribute("aria-busy")).toBe("true")
    act(() => pending.click())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ released: true, draftId: "draft-1" }), {
          status: 200,
        })
      )
      await reponseEnAttente
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).toHaveBeenCalledWith([])
  })
})
