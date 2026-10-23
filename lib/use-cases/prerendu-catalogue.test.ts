import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { SLUG_DE_REPLI } from "@/lib/parametre-de-repli"
import { fetchArticleSlugs, parametresDesArticles } from "@/lib/use-cases/blog"
import {
  fetchCategorySlugs,
  fetchProductSlugs,
  parametresDesCategories,
  parametresDesProduits,
} from "@/lib/use-cases/storefront"

// Ce fichier vide le catalogue avant de le semer : il doit tourner seul, ce
// que garantit `fileParallelism: false` dans vitest.config.ts. Les autres
// fichiers de test sèment leurs propres fixtures à leur entrée et ne dépendent
// d'aucune ligne laissée par celui-ci.
async function viderLeCatalogue(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ArticleBlogProduit", "ArticleBlog", "Product", "Category" CASCADE'
  )
}

const runId = randomUUID().slice(0, 8)
const PREFIXE = `prerendu-${runId}-`
const cSlug = (suffixe: string) => `${PREFIXE}c-${suffixe}`
const pSlug = (suffixe: string) => `${PREFIXE}p-${suffixe}`
const aSlug = (suffixe: string) => `${PREFIXE}a-${suffixe}`

let racineId: string

async function semerLesFixtures(): Promise<void> {
  const racine = await prisma.category.create({
    data: { name: "Racine de prérendu", slug: cSlug("racine") },
  })
  racineId = racine.id
  await prisma.category.create({
    data: {
      name: "Enfant de prérendu",
      slug: cSlug("enfant"),
      parentId: racine.id,
    },
  })

  // Semés dans l'ordre inverse du slug pour prouver que le listing trie.
  for (const suffixe of ["zeta", "alpha"]) {
    await prisma.product.create({
      data: {
        name: `Produit de prérendu ${suffixe}`,
        slug: pSlug(suffixe),
        description: "Description de test",
        brand: "Marque",
        price: 100000,
        specs: {},
        images: [],
        categoryId: racine.id,
      },
    })
  }

  const theme = await prisma.theme.create({
    data: { slug: `theme-${runId}`, nom: `Thème ${runId}` },
  })

  for (const [suffixe, statut] of [
    ["publie", "publie"],
    ["archive", "archive"],
    ["brouillon", "brouillon"],
  ] as const) {
    await prisma.articleBlog.create({
      data: {
        titre: `Article de prérendu ${suffixe}`,
        slug: aSlug(suffixe),
        extrait: "Un extrait de test",
        contenu: "Un contenu de test",
        statut,
        publishedAt: statut === "brouillon" ? null : new Date(),
        themeId: theme.id,
      },
    })
  }
}

async function nettoyerLesFixtures(): Promise<void> {
  await prisma.articleBlog.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
  await prisma.theme.deleteMany({ where: { slug: `theme-${runId}` } })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
  await prisma.category.deleteMany({
    where: { slug: cSlug("enfant") },
  })
  await prisma.category.deleteMany({
    where: { id: racineId },
  })
  await prisma.$disconnect()
}

describe("le prérendu du catalogue", () => {
  describe("quand le catalogue est vide", () => {
    beforeAll(viderLeCatalogue)

    it("ne rend aucun slug à prérendre pour aucune des trois routes", async () => {
      await expect(fetchProductSlugs()).resolves.toEqual([])
      await expect(fetchCategorySlugs()).resolves.toEqual([])
      await expect(fetchArticleSlugs()).resolves.toEqual([])
    })

    it("rend le paramètre de repli, pour que le build puisse continuer", async () => {
      await expect(parametresDesProduits()).resolves.toEqual([
        { slug: SLUG_DE_REPLI },
      ])
      await expect(parametresDesCategories()).resolves.toEqual([
        { slug: SLUG_DE_REPLI },
      ])
      await expect(parametresDesArticles()).resolves.toEqual([
        { slug: SLUG_DE_REPLI },
      ])
    })
  })

  describe("quand le catalogue porte des fiches", () => {
    beforeAll(semerLesFixtures)
    afterAll(nettoyerLesFixtures)

    it("rend les slugs des Produits, triés, sans en oublier ni en inventer", async () => {
      await expect(fetchProductSlugs()).resolves.toEqual([
        pSlug("alpha"),
        pSlug("zeta"),
      ])
    })

    it("rend les slugs des Structures, parentes comme enfants", async () => {
      await expect(fetchCategorySlugs()).resolves.toEqual([
        cSlug("enfant"),
        cSlug("racine"),
      ])
    })

    it("rend les slugs des Articles dont l'URL résout encore, brouillons exclus", async () => {
      await expect(fetchArticleSlugs()).resolves.toEqual([
        aSlug("archive"),
        aSlug("publie"),
      ])
    })

    it("donne aux trois routes leurs slugs réels, sans repli", async () => {
      await expect(parametresDesProduits()).resolves.toEqual([
        { slug: pSlug("alpha") },
        { slug: pSlug("zeta") },
      ])
      await expect(parametresDesCategories()).resolves.toEqual([
        { slug: cSlug("enfant") },
        { slug: cSlug("racine") },
      ])
      await expect(parametresDesArticles()).resolves.toEqual([
        { slug: aSlug("archive") },
        { slug: aSlug("publie") },
      ])
    })
  })
})
