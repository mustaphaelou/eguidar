// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
    sizes,
    className,
  }: {
    src: string
    alt: string
    width?: number
    height?: number
    sizes?: string
    className?: string
  }) => (
    <span
      data-image-src={src}
      data-image-alt={alt}
      data-image-width={width}
      data-image-height={height}
      data-image-sizes={sizes}
      data-image-class={className}
    />
  ),
}))

import {
  MediasBibliotheque,
  formatTaille,
} from "@/components/admin/medias-bibliotheque"
import type { PageImagesProduit } from "@/lib/use-cases/images-produit"
import type { MediasListingParams } from "@/lib/medias-listing"
import { actionQuiCapture, monterFormulaire } from "@/test/rendu-formulaire"

const rendu = monterFormulaire()

const UTILISEE = "https://cdn.example.test/products/registre-utilisee.webp"
const INUTILISEE = "https://cdn.example.test/products/registre-inutilisee.jpg"

const PAGE: PageImagesProduit = {
  totalCount: 2,
  inutiliseesCount: 1,
  sansAltCount: 1,
  images: [
    {
      publicUrl: UTILISEE,
      mimeType: "image/webp",
      byteSize: 2048,
      width: 1200,
      height: 800,
      alt: "Écran du Produit Alpha",
      createdBy: "admin-1",
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
      usageCount: 1,
      produits: [{ id: "produit-a", name: "Produit Alpha" }],
    },
    {
      publicUrl: INUTILISEE,
      mimeType: "image/jpeg",
      byteSize: 0,
      width: 0,
      height: 0,
      alt: null,
      createdBy: null,
      createdAt: new Date("2026-07-02T10:00:00.000Z"),
      usageCount: 0,
      produits: [],
    },
  ],
}

function afficher(
  options: {
    params?: MediasListingParams
    page?: PageImagesProduit
    supprimerImages?: ReturnType<typeof actionQuiCapture>["action"]
    mettreAJourAlt?: ReturnType<typeof actionQuiCapture>["action"]
  } = {}
) {
  const suppression = actionQuiCapture<{ error?: string }>()
  const alt = actionQuiCapture<{ error?: string }>()
  const reconciliation = actionQuiCapture<{ error?: string }>()
  rendu.render(
    <MediasBibliotheque
      params={options.params ?? {}}
      page={options.page ?? PAGE}
      supprimerImages={options.supprimerImages ?? suppression.action}
      mettreAJourAlt={options.mettreAJourAlt ?? alt.action}
      reconcilier={reconciliation.action}
    />
  )
  return { suppression, alt, reconciliation }
}

async function cliquer(element: HTMLElement) {
  await act(async () => {
    element.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("MediasBibliotheque", () => {
  it("affiche les comptes du registre, les filtres actifs et les vignettes de 96 px", () => {
    afficher({
      params: { q: "écran", inutilisees: true, sansAlt: true },
    })

    expect(rendu.container.textContent).toContain(
      "2 Image(s) produit affichée(s) sur 2 au registre"
    )
    expect(rendu.container.textContent).toContain("1 inutilisée(s)")
    expect(rendu.container.textContent).toContain("1 sans texte alternatif")
    expect(
      rendu.container.querySelector<HTMLInputElement>("#medias-q")?.value
    ).toBe("écran")
    expect(
      rendu.container.querySelectorAll(
        'input[type="hidden"][name="inutilisees"]'
      )
    ).toHaveLength(1)
    expect(
      rendu.container.querySelectorAll('input[type="hidden"][name="sans-alt"]')
    ).toHaveLength(1)

    const vignettes = [
      ...rendu.container.querySelectorAll<HTMLElement>("[data-image-src]"),
    ].filter((vignette) => !vignette.closest('[data-slot="drawer-popup"]'))
    expect(vignettes).toHaveLength(2)
    for (const vignette of vignettes) {
      expect(vignette.getAttribute("data-image-width")).toBe("96")
      expect(vignette.getAttribute("data-image-height")).toBe("96")
      expect(vignette.getAttribute("data-image-sizes")).toBe("96px")
    }
  })

  it("sélectionne une Image produit et envoie les URL sélectionnées à la suppression", async () => {
    const suppression = actionQuiCapture<{ error?: string }>()
    rendu.render(
      <MediasBibliotheque
        params={{}}
        page={PAGE}
        supprimerImages={suppression.action}
        mettreAJourAlt={actionQuiCapture<{ error?: string }>().action}
        reconcilier={actionQuiCapture<{ error?: string }>().action}
      />
    )

    const cases = rendu.container.querySelectorAll<HTMLElement>(
      '[data-slot="checkbox"]'
    )
    expect(cases).toHaveLength(2)
    await cliquer(cases[1]!)

    expect(rendu.container.textContent).toContain("1 sélectionnée(s)")
    const formulaire = [...rendu.container.querySelectorAll("form")].find(
      (candidat) => candidat.querySelector('input[name="publicUrl"]')
    )
    expect(formulaire).toBeDefined()
    await rendu.soumettre(formulaire!)

    expect(suppression.soumissions).toHaveLength(1)
    expect(suppression.soumissions[0]!.getAll("publicUrl")).toEqual([
      INUTILISEE,
    ])
  })

  it("montre dans le tiroir les dimensions, la taille, le type, les usages et l'alt", async () => {
    afficher()

    await cliquer(
      rendu.container.querySelector<HTMLElement>(
        '[aria-label="Ouvrir le détail de l\'Image produit"]'
      )!
    )

    const tiroir = document.querySelector<HTMLElement>(
      '[data-slot="drawer-popup"]'
    )
    expect(tiroir).not.toBeNull()
    expect(tiroir!.textContent).toContain("1200 × 800 px")
    expect(tiroir!.textContent).toContain("2,0 Ko")
    expect(tiroir!.textContent).toContain("image/webp")
    expect(tiroir!.textContent).toContain("Produit Alpha")
    expect(tiroir!.querySelector<HTMLInputElement>("#alt-detail")?.value).toBe(
      "Écran du Produit Alpha"
    )

    const apercu = tiroir!.querySelector<HTMLElement>(
      '[data-image-sizes="320px"]'
    )
    expect(apercu).not.toBeNull()
  })

  it("enregistre le Texte alternatif depuis le tiroir", async () => {
    const alt = actionQuiCapture<{ error?: string }>()
    rendu.render(
      <MediasBibliotheque
        params={{}}
        page={PAGE}
        supprimerImages={actionQuiCapture<{ error?: string }>().action}
        mettreAJourAlt={alt.action}
        reconcilier={actionQuiCapture<{ error?: string }>().action}
      />
    )

    await cliquer(
      rendu.container.querySelector<HTMLElement>(
        '[aria-label="Ouvrir le détail de l\'Image produit"]'
      )!
    )
    const tiroir = document.querySelector<HTMLElement>(
      '[data-slot="drawer-popup"]'
    )!
    const champ = tiroir.querySelector<HTMLInputElement>("#alt-detail")!
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    act(() => {
      setter?.call(champ, "  Nouveau texte  ")
      champ.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const formulaire = [...tiroir.querySelectorAll("form")].find((candidat) =>
      candidat.querySelector('input[name="alt"]')
    )!
    await rendu.soumettre(formulaire)

    expect(alt.soumissions).toHaveLength(1)
    expect(alt.soumissions[0]!.get("publicUrl")).toBe(UTILISEE)
    expect(alt.soumissions[0]!.get("alt")).toBe("  Nouveau texte  ")
  })

  it("copie l'adresse publique et annonce la copie", async () => {
    const ecrire = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: ecrire },
      configurable: true,
    })
    afficher()

    await cliquer(
      rendu.container.querySelector<HTMLElement>(
        '[aria-label="Ouvrir le détail de l\'Image produit"]'
      )!
    )
    const tiroir = document.querySelector<HTMLElement>(
      '[data-slot="drawer-popup"]'
    )!
    const copier = [
      ...tiroir.querySelectorAll<HTMLButtonElement>("button"),
    ].find((bouton) => bouton.textContent?.includes("Copier l'adresse"))!
    await cliquer(copier)

    expect(ecrire).toHaveBeenCalledWith(UTILISEE)
    expect(tiroir.textContent).toContain("Adresse copiée")
  })

  it("affiche le refus de suppression qui nomme les Produits", async () => {
    const supprimerImages = vi.fn(async () => ({
      error:
        "Refus de suppression : Image produit utilisée par « Produit Alpha »",
    }))
    rendu.render(
      <MediasBibliotheque
        params={{}}
        page={PAGE}
        supprimerImages={supprimerImages}
        mettreAJourAlt={actionQuiCapture<{ error?: string }>().action}
        reconcilier={actionQuiCapture<{ error?: string }>().action}
      />
    )

    await cliquer(
      rendu.container.querySelector<HTMLElement>(
        '[aria-label="Ouvrir le détail de l\'Image produit"]'
      )!
    )
    const tiroir = document.querySelector<HTMLElement>(
      '[data-slot="drawer-popup"]'
    )!
    const formulaire = [...tiroir.querySelectorAll("form")].find((candidat) =>
      [...candidat.querySelectorAll("button")].some((bouton) =>
        bouton.textContent?.includes("Supprimer cette Image produit")
      )
    )!
    await rendu.soumettre(formulaire)

    expect(tiroir.textContent).toContain(
      "Refus de suppression : Image produit utilisée par « Produit Alpha »"
    )
  })

  it("bascule en liste et formate les tailles en français", async () => {
    expect(formatTaille(0)).toBe("Taille inconnue")
    expect(formatTaille(512)).toBe("512 o")
    expect(formatTaille(2048)).toBe("2,0 Ko")
    expect(formatTaille(3 * 1024 * 1024)).toBe("3,0 Mo")

    afficher()
    const boutonListe = [
      ...rendu.container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((bouton) => bouton.textContent?.includes("Liste"))!
    await cliquer(boutonListe)

    expect(rendu.container.querySelector("table")).not.toBeNull()
    expect(rendu.container.textContent).toContain("Sans texte alternatif")
  })

  it("envoie une réconciliation du registre", async () => {
    const { reconciliation } = afficher()

    const bouton = [
      ...rendu.container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((candidat) => candidat.textContent === "Réconcilier le registre")!
    expect(bouton).toBeDefined()
    await rendu.soumettre(bouton.closest("form")!)

    expect(reconciliation.soumissions).toHaveLength(1)
  })
})
