// @vitest-environment happy-dom

import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
    sizes,
  }: {
    src: string
    alt: string
    width?: number
    height?: number
    sizes?: string
  }) => (
    <span
      data-image-src={src}
      data-image-width={width}
      data-image-height={height}
      data-image-sizes={sizes}
      aria-label={alt}
    />
  ),
}))

import { ImageGalleryUpload } from "@/components/admin/image-gallery-upload"
import type {
  FaitsAjoutBrouillons,
  ResultatEnvoi,
  TeleversementBrouillons,
} from "@/components/admin/televersement-brouillons"
import type { EntreeImageProduitFormulaire } from "@/lib/formulaire-produit"
import type {
  EntreeBrouillonImage,
  EntreeImageProduit,
} from "@/lib/galerie-image-produit"

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

async function envoyerFichiers(files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, "files", { value: files })
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function brouillon(draftId: string): EntreeBrouillonImage {
  return {
    kind: "brouillon",
    draftId,
    previewUrl: `https://cdn.example.test/products/brouillons/${draftId}.png`,
  }
}

interface TeleversementFactice extends TeleversementBrouillons {
  appelsAjout: { fichiers: File[]; places: number }[]
  appelsRelache: string[]
}

function creerTeleversementFactice(
  options: {
    ajouter?: (
      fichiers: File[],
      places: number
    ) => FaitsAjoutBrouillons | Promise<FaitsAjoutBrouillons>
    relacher?: (draftId: string) => ResultatEnvoi | Promise<ResultatEnvoi>
  } = {}
): TeleversementFactice {
  const appelsAjout: { fichiers: File[]; places: number }[] = []
  const appelsRelache: string[] = []

  return {
    appelsAjout,
    appelsRelache,
    async ajouter(fichiers, places) {
      appelsAjout.push({ fichiers: [...fichiers], places })
      return options.ajouter
        ? options.ajouter([...fichiers], places)
        : { ajoutees: [] }
    },
    async relacher(draftId) {
      appelsRelache.push(draftId)
      return options.relacher ? options.relacher(draftId) : { ok: true }
    },
  }
}

function GalerieTest({
  initialImages,
  onChange,
  televersement,
}: {
  initialImages: EntreeImageProduitFormulaire[]
  onChange(images: EntreeImageProduitFormulaire[]): void
  televersement?: TeleversementBrouillons
}) {
  const [images, setImages] = useState(initialImages)
  return (
    <ImageGalleryUpload
      images={images}
      onChange={(suivantes) => {
        setImages(suivantes)
        onChange(suivantes)
      }}
      televersement={televersement}
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
})

describe("ImageGalleryUpload", () => {
  it("envoie la place restante au téléversement et fusionne les entrées Brouillon", async () => {
    const onChange = vi.fn()
    const persisted: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/existing.png",
    }
    const televersement = creerTeleversementFactice({
      ajouter: () => ({ ajoutees: [brouillon("draft-1")] }),
    })
    const file = new File(["image"], "photo.png", { type: "image/png" })

    render(
      <ImageGalleryUpload
        images={[persisted]}
        onChange={onChange}
        televersement={televersement}
      />
    )
    await envoyerFichiers([file])

    expect(televersement.appelsAjout).toEqual([{ fichiers: [file], places: 7 }])
    expect(televersement.appelsRelache).toEqual([])
    expect(onChange).toHaveBeenCalledWith([persisted, brouillon("draft-1")])
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
    const televersement = creerTeleversementFactice({
      ajouter: () => ({ ajoutees: [brouillon("draft-remplacement")] }),
    })

    const root = render(
      <GalerieTest
        initialImages={gallery}
        onChange={onChange}
        televersement={televersement}
      />
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

    const file = new File(["image"], "photo.png", { type: "image/png" })
    await envoyerFichiers([file])

    expect(televersement.appelsAjout).toEqual([{ fichiers: [file], places: 1 }])
    expect(onChange).toHaveBeenLastCalledWith([
      ...gallery.map((image, index) =>
        index === 0 ? { ...image, suppressionEnAttente: true } : image
      ),
      brouillon("draft-remplacement"),
    ])
    unmount(root)
  })

  it("marque une Image persistée pour suppression sans appeler le téléversement", () => {
    const onChange = vi.fn()
    const persisted: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/existing.png",
    }
    const televersement = creerTeleversementFactice()

    render(
      <GalerieTest
        initialImages={[persisted]}
        onChange={onChange}
        televersement={televersement}
      />
    )
    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.click())

    expect(onChange).toHaveBeenLastCalledWith([
      { ...persisted, suppressionEnAttente: true },
    ])
    expect(televersement.appelsAjout).toEqual([])
    expect(televersement.appelsRelache).toEqual([])
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
    expect(televersement.appelsRelache).toEqual([])
  })

  it("conserve l'ordre soumis et rend la suppression persistée distincte d'une libération", () => {
    const onChange = vi.fn()
    const premiere: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/first.png",
    }
    const brouillonActuel = brouillon("draft-1")
    const derniere: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/last.png",
    }

    render(
      <GalerieTest
        initialImages={[premiere, brouillonActuel, derniere]}
        onChange={onChange}
        televersement={creerTeleversementFactice()}
      />
    )
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Supprimer l\'image"]')!
        .click()
    )

    expect(onChange).toHaveBeenLastCalledWith([
      { ...premiere, suppressionEnAttente: true },
      brouillonActuel,
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
    ).toEqual([brouillonActuel.previewUrl, derniere.url])
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
    const derniere: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/last.png",
    }
    const televersement = creerTeleversementFactice()

    render(
      <GalerieTest
        initialImages={[premiere, brouillon("draft-1"), derniere]}
        onChange={onChange}
        televersement={televersement}
      />
    )
    const release = container.querySelector<HTMLButtonElement>(
      '[aria-label="Libérer le Brouillon d\'Image produit"]'
    )!
    await act(async () => {
      release.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(televersement.appelsRelache).toEqual(["draft-1"])
    expect(onChange).toHaveBeenCalledWith([premiere, derniere])
    expect(container.querySelectorAll("[data-image-src]")).toHaveLength(2)
  })

  it("affiche un refus de libération et garde le Brouillon d'Image produit dans les faits du formulaire", async () => {
    const onChange = vi.fn()
    const message =
      "Le Brouillon d'Image produit a été libéré, mais son objet n'a pas pu être supprimé du stockage pour le moment. Il sera récupéré automatiquement par la règle de cycle de vie R2."
    const televersement = creerTeleversementFactice({
      relacher: () => ({ ok: false, message }),
    })

    render(
      <GalerieTest
        initialImages={[brouillon("draft-1")]}
        onChange={onChange}
        televersement={televersement}
      />
    )
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

  it("affiche le message d'un téléversement refusé sans ajouter d'entrée", async () => {
    const onChange = vi.fn()
    const televersement = creerTeleversementFactice({
      ajouter: () => ({
        ajoutees: [],
        message: "Échec de l'envoi vers le stockage",
      }),
    })

    render(
      <GalerieTest
        initialImages={[]}
        onChange={onChange}
        televersement={televersement}
      />
    )
    await envoyerFichiers([
      new File(["image"], "photo.png", { type: "image/png" }),
    ])

    expect(container.textContent).toContain("Échec de l'envoi vers le stockage")
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelectorAll("[data-image-src]")).toHaveLength(0)
  })

  it("n'appelle aucune libération lorsque le formulaire est abandonné", () => {
    const onChange = vi.fn()
    const televersement = creerTeleversementFactice()
    const persisted: EntreeImageProduit = {
      kind: "persistee",
      url: "https://cdn.example.test/products/existing.png",
    }

    const root = render(
      <GalerieTest
        initialImages={[persisted]}
        onChange={onChange}
        televersement={televersement}
      />
    )
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Supprimer l\'image"]')!
        .click()
    )
    unmount(root)

    expect(televersement.appelsAjout).toEqual([])
    expect(televersement.appelsRelache).toEqual([])
  })

  it("désactive la libération du Brouillon d'Image produit pendant son premier appel", async () => {
    const onChange = vi.fn()
    let resoudre!: (resultat: ResultatEnvoi) => void
    const enAttente = new Promise<ResultatEnvoi>((resolve) => {
      resoudre = resolve
    })
    const televersement = creerTeleversementFactice({
      relacher: () => enAttente,
    })

    render(
      <GalerieTest
        initialImages={[brouillon("draft-1")]}
        onChange={onChange}
        televersement={televersement}
      />
    )
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

    expect(televersement.appelsRelache).toEqual(["draft-1"])
    await act(async () => {
      resoudre({ ok: true })
      await enAttente
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).toHaveBeenCalledWith([])
  })

  it("préremplit le Texte alternatif d'une Image produit et le rend éditable sans changer l'ordre", () => {
    const onChange = vi.fn()
    const premiere: EntreeImageProduitFormulaire = {
      kind: "persistee",
      url: "https://cdn.example.test/products/first.png",
      alt: "Premier visuel",
    }
    const seconde: EntreeImageProduitFormulaire = {
      kind: "persistee",
      url: "https://cdn.example.test/products/second.png",
    }

    render(
      <GalerieTest
        initialImages={[premiere, seconde]}
        onChange={onChange}
        televersement={creerTeleversementFactice()}
      />
    )

    const champ = container.querySelector<HTMLInputElement>("#alt-image-0")!
    expect(champ.value).toBe("Premier visuel")

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    act(() => {
      setter?.call(champ, "Écran principal")
      champ.dispatchEvent(new Event("input", { bubbles: true }))
    })

    expect(onChange).toHaveBeenLastCalledWith([
      { ...premiere, alt: "Écran principal" },
      seconde,
    ])
  })

  it("donne à chaque vignette des dimensions et un sizes de 96 px", () => {
    render(
      <GalerieTest
        initialImages={[
          { kind: "persistee", url: "https://cdn.example.test/products/a.png" },
          {
            kind: "brouillon",
            draftId: "draft-1",
            previewUrl: "https://cdn.example.test/products/brouillons/1.png",
          },
        ]}
        onChange={vi.fn()}
        televersement={creerTeleversementFactice()}
      />
    )

    const vignettes = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-image-kind][data-image-state="active"], [data-image-kind][data-image-state="brouillon"]'
      )
    ).map((entree) => entree.querySelector("[data-image-src]"))

    expect(vignettes).toHaveLength(2)
    for (const vignette of vignettes) {
      expect(vignette?.getAttribute("data-image-width")).toBe("96")
      expect(vignette?.getAttribute("data-image-height")).toBe("96")
      expect(vignette?.getAttribute("data-image-sizes")).toBe("96px")
    }
  })
})
