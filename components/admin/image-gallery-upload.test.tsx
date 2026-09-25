// @vitest-environment happy-dom

import { act } from "react"
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

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
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
})
