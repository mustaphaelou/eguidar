import type { Metadata } from "next"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { categorieMock } = vi.hoisted(() => ({ categorieMock: vi.fn() }))

vi.mock("@/lib/use-cases/storefront", async () => {
  const actuel = await vi.importActual<
    typeof import("@/lib/use-cases/storefront")
  >("@/lib/use-cases/storefront")
  return { ...actuel, getCategoryPageData: categorieMock }
})

import { generateMetadata as metadonneeCategorie } from "./categorie/[slug]/page"
import { metadata as metadonneeAccueil } from "./page"
import { metadata as metadonneePanier } from "./panier/page"
import { generateMetadata as metadonneeRecherche } from "./recherche/page"
import { metadata as metadonneeProduits } from "./produits/page"

function expectSansPromesse(metadonnee: Metadata): void {
  const texte = `${String(metadonnee.description ?? "")} ${String(metadonnee.openGraph?.description ?? "")}`

  expect(texte.trim().length).toBeGreaterThan(0)
  expect(texte).not.toMatch(/TVA/i)
  expect(texte).not.toMatch(/paiement/i)
  expect(texte).not.toMatch(/prix/i)
  expect(texte).not.toMatch(/MAD/i)
}

describe("les métadonnées des pages de la boutique", () => {
  beforeEach(() => {
    categorieMock.mockReset()
    categorieMock.mockResolvedValue({ category: { name: "Smartphones" } })
  })

  it("décrit l'accueil sans promesse commerciale", () => {
    expectSansPromesse(metadonneeAccueil)
  })

  it("décrit le catalogue sans promesse commerciale", () => {
    expectSansPromesse(metadonneeProduits)
  })

  it("décrit une catégorie sans promesse commerciale", async () => {
    const metadonnee = await metadonneeCategorie({
      params: Promise.resolve({ slug: "smartphones" }),
    })

    expectSansPromesse(metadonnee)
    expect(String(metadonnee.description)).toContain("Smartphones")
  })

  it("décrit la recherche sans promesse commerciale", async () => {
    const avecRequete = await metadonneeRecherche({
      searchParams: Promise.resolve({ q: "iphone" }),
    })
    const sansRequete = await metadonneeRecherche({
      searchParams: Promise.resolve({}),
    })

    expectSansPromesse(avecRequete)
    expectSansPromesse(sansRequete)
  })

  it("décrit le panier sans promesse commerciale", () => {
    expectSansPromesse(metadonneePanier)
  })
})
