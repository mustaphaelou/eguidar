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
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function GalerieTest({
  initialImages,
  onChange,
}: {
  initialImages: EntreeImageProduit[]
  onChange(images: EntreeImageProduit[]): void
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

  it("retire une entrée persistée sans appeler la route de suppression R2", () => {
    const onChange = vi.fn()
    const persisted: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/existing.png",
    }
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    render(<ImageGalleryUpload images={[persisted]} onChange={onChange} />)
    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.click())

    expect(onChange).toHaveBeenCalledWith([])
    expect(fetchMock).not.toHaveBeenCalled()
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
