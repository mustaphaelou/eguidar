import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { buildProductDonneesStructurees } from "@/lib/donnees-structurees"
import { toIndexableProduct } from "@/lib/index-projection"
import { formatPrice } from "@/lib/money"
import { priceBucketIdFor } from "@/lib/price-buckets"
import {
  fetchCategoryPageData,
  fetchHomeData,
  fetchProductPageData,
} from "@/lib/use-cases/storefront"

const runId = randomUUID().slice(0, 8)
const PREFIXE = `prix-${runId}-`
const SLUG_DU_PRODUIT = `prix-${runId}-iphone-18-pro-max`
const PRIX_DE_BASE = 1_799_990
const ECART_DE_CHAQUE_VARIANTE = 1_888_800
const PRIX_DES_VARIANTES = PRIX_DE_BASE + ECART_DE_CHAQUE_VARIANTE
const PRIX_DE_BASE_AFFICHE = "17.999,90\u00a0MAD"
const PRIX_DES_VARIANTES_AFFICHE = "36.887,90\u00a0MAD"

let idCategorie = ""

describe("le prix d'un Produit dont le prix de base est sous ses Variantes", () => {
  beforeAll(async () => {
    const categorie = await prisma.category.create({
      data: { name: `Smartphones ${runId}`, slug: `${PREFIXE}smartphones` },
    })
    idCategorie = categorie.id

    await prisma.product.create({
      data: {
        name: "iPhone 18 Pro Max",
        slug: SLUG_DU_PRODUIT,
        description: "Le Produit de la sonde de prix.",
        brand: "Apple",
        categoryId: categorie.id,
        price: PRIX_DE_BASE,
        specs: { Écran: "6,9 pouces" },
        images: [],
        isFeatured: true,
        featuredOrder: 0,
        freeShipping: true,
        variants: {
          create: [
            {
              name: "256 Go",
              sku: `SKU-${runId}-256`,
              priceDelta: ECART_DE_CHAQUE_VARIANTE,
              stock: 0,
            },
            {
              name: "512 Go",
              sku: `SKU-${runId}-512`,
              priceDelta: ECART_DE_CHAQUE_VARIANTE,
              stock: 1,
            },
          ],
        },
      },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { slug: SLUG_DU_PRODUIT } })
    await prisma.category.deleteMany({ where: { id: idCategorie } })
    await prisma.$disconnect()
  })

  it("la Mise en avant de l'accueil annonce le prix des Variantes", async () => {
    const accueil = await fetchHomeData()
    const carte = accueil.featured.find(
      (produit) => produit.slug === SLUG_DU_PRODUIT
    )

    expect(carte?.minPrice).toBe(PRIX_DES_VARIANTES)
    expect(carte?.minPrice).not.toBe(PRIX_DE_BASE)
  })

  it("la page de catégorie annonce le même prix que l'accueil", async () => {
    const page = await fetchCategoryPageData(`${PREFIXE}smartphones`)
    const carte = page?.products.find(
      (produit) => produit.slug === SLUG_DU_PRODUIT
    )

    expect(carte?.minPrice).toBe(PRIX_DES_VARIANTES)
  })

  it("la fiche Produit cuit le prix de chaque Variante", async () => {
    const fiche = await fetchProductPageData(SLUG_DU_PRODUIT)

    expect(fiche?.minPrice).toBe(PRIX_DES_VARIANTES)
    expect(fiche?.variants.map((variante) => variante.prix)).toEqual([
      PRIX_DES_VARIANTES,
      PRIX_DES_VARIANTES,
    ])
    expect(fiche?.variants.map((variante) => variante.stock)).toEqual([0, 1])
  })

  it("la métadonnée de la fiche annonce le prix des Variantes, jamais le prix de base", async () => {
    const fiche = await fetchProductPageData(SLUG_DU_PRODUIT)
    const description = `${fiche?.brand} ${fiche?.name}. Prix ${formatPrice(fiche?.minPrice ?? 0)} (TVA 20% incluse), paiement à la livraison.`

    expect(description).toContain(PRIX_DES_VARIANTES_AFFICHE)
    expect(description).not.toContain(PRIX_DE_BASE_AFFICHE)
  })

  it("les Données structurées n'offrent que le prix des Variantes", async () => {
    const fiche = await fetchProductPageData(SLUG_DU_PRODUIT)
    const donnees = buildProductDonneesStructurees({
      name: fiche?.name ?? "",
      description: fiche?.description,
      images: [],
      brand: fiche?.brand ?? "",
      slug: SLUG_DU_PRODUIT,
      minPrice: fiche?.minPrice ?? 0,
      variants: fiche?.variants,
    })

    expect(donnees.offers.map((offre) => offre.price)).toEqual([
      PRIX_DES_VARIANTES / 100,
      PRIX_DES_VARIANTES / 100,
    ])
  })

  it("le Document d'index projette le prix des Variantes, pas le prix de base", async () => {
    const produit = await prisma.product.findUniqueOrThrow({
      where: { slug: SLUG_DU_PRODUIT },
      include: { variants: true, category: true },
    })
    const document = toIndexableProduct(produit)

    expect(document.price).toBe(PRIX_DE_BASE)
    expect(document.minPrice).toBe(PRIX_DES_VARIANTES)
    expect(document.priceBucket).toBe(priceBucketIdFor(PRIX_DES_VARIANTES))
  })
})
