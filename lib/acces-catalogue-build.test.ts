import { randomUUID } from "node:crypto"

import { afterEach, describe, expect, it } from "vitest"

import {
  estCatalogueVide,
  lireLesFaitsDuCatalogue,
  messageDesFaitsCatalogue,
  type FaitsCatalogue,
} from "./acces-catalogue-build"
import { prisma } from "./db"

const URL_DE_TEST = process.env.TEST_DATABASE_URL

const CATEGORIE_CREEE = `categorie-${randomUUID()}`

async function supprimerLaCategorieCreee(): Promise<void> {
  await prisma.category.deleteMany({ where: { slug: CATEGORIE_CREEE } })
}

afterEach(supprimerLaCategorieCreee)

describe("les faits du catalogue au moment du build", () => {
  it("nomme le catalogue quand la base est joignable et vide", () => {
    const faits: FaitsCatalogue = { produits: 0, categories: 0, articles: 0 }

    expect(estCatalogueVide(faits)).toBe(true)

    const message = messageDesFaitsCatalogue(faits)

    expect(message).toContain("catalogue")
    expect(message).toMatch(/vide/i)
    expect(message).toMatch(/build continue/i)
  })

  it("compte les produits, catégories et articles quand le catalogue est plein", () => {
    const faits: FaitsCatalogue = { produits: 12, categories: 6, articles: 1 }

    expect(estCatalogueVide(faits)).toBe(false)

    const message = messageDesFaitsCatalogue(faits)

    expect(message).toContain("catalogue")
    expect(message).toContain("12 produits")
    expect(message).toContain("6 catégories")
    expect(message).toContain("1 article")
    expect(message).not.toMatch(/vide/i)
  })

  it("refuse un build sans URL de catalogue, en nommant la variable et le catalogue", async () => {
    await expect(lireLesFaitsDuCatalogue({ url: undefined })).rejects.toThrow(
      /DATABASE_URL.*catalogue/
    )
  })

  it("échoue promptement quand le catalogue est injoignable", async () => {
    await expect(
      lireLesFaitsDuCatalogue({
        url: "postgresql://eguidar:eguidar@127.0.0.1:1/eguidar_test",
        delaiMs: 500,
      })
    ).rejects.toThrow()
  })

  it("lit les faits réels de la base que le build prérendra", async () => {
    if (URL_DE_TEST === undefined) {
      throw new Error(
        "TEST_DATABASE_URL est absente : le test ne peut pas lire."
      )
    }

    const avant = await lireLesFaitsDuCatalogue({ url: URL_DE_TEST })

    await prisma.category.create({
      data: { name: "Catégorie de test du build", slug: CATEGORIE_CREEE },
    })

    const apres = await lireLesFaitsDuCatalogue({ url: URL_DE_TEST })

    expect(apres.categories).toBe(avant.categories + 1)
    expect(apres.produits).toBe(avant.produits)
  })
})
