import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import type { Product } from "@/lib/generated/prisma/client"
import {
  PRODUIT_STRUCTURE_SANS,
  PRODUIT_STOCK_NON_NUL,
  PRODUIT_STOCK_ZERO,
} from "@/lib/produit-listing"
import { listAdminProducts } from "@/lib/use-cases/admin-catalog"
import { creerStructure, type StructureCreee } from "@/test/structure-fixtures"

const runId = randomUUID().slice(0, 8)
const prefixe = `liste-produits-${runId}-`

interface Recette {
  cle: string
  nom: string
  marque: string
  prix: number
  structure: string | null
  stocks: number[]
  misEnAvant?: boolean
  livraisonOfferte?: boolean
  creeLe: string
}

async function creerProduit(recette: Recette): Promise<Product> {
  return prisma.product.create({
    data: {
      name: recette.nom,
      slug: `${prefixe}${recette.cle}`,
      description: `Description ${recette.nom}`,
      brand: recette.marque,
      categoryId: recette.structure,
      price: recette.prix,
      specs: {},
      images: [`https://cdn.example.test/${recette.cle}.jpg`],
      isFeatured: recette.misEnAvant ?? false,
      freeShipping: recette.livraisonOfferte ?? false,
      createdAt: new Date(recette.creeLe),
      variants: {
        create: recette.stocks.map((stock, index) => ({
          name: `Variante ${index + 1}`,
          sku: `SKU-${prefixe}${recette.cle}-${index}`,
          priceDelta: 0,
          stock,
        })),
      },
    },
  })
}

let racine: StructureCreee
let enfant: StructureCreee
let petitEnfant: StructureCreee
let autre: StructureCreee

let alpha: Product
let beta: Product
let gamma: Product
let delta: Product
let sansStructure: Product

const idsDe = (produits: { id: string }[]) =>
  produits.map((produit) => produit.id)

beforeAll(async () => {
  racine = await creerStructure({
    name: `Racine liste ${runId}`,
    prefix: prefixe,
  })
  enfant = await creerStructure({
    name: `Enfant liste ${runId}`,
    parentId: racine.id,
    prefix: prefixe,
  })
  petitEnfant = await creerStructure({
    name: `Petit-enfant liste ${runId}`,
    parentId: enfant.id,
    prefix: prefixe,
  })
  autre = await creerStructure({
    name: `Autre liste ${runId}`,
    prefix: prefixe,
  })

  alpha = await creerProduit({
    cle: "alpha",
    nom: `Alpha Chaise ${runId}`,
    marque: `Marque Alpha ${runId}`,
    prix: 30000,
    structure: racine.id,
    stocks: [2, 3],
    misEnAvant: true,
    creeLe: "2026-01-01T10:00:00.000Z",
  })
  beta = await creerProduit({
    cle: "beta",
    nom: `Bêta Table ${runId}`,
    marque: `Marque Bêta ${runId}`,
    prix: 10000,
    structure: enfant.id,
    stocks: [0],
    creeLe: "2026-01-02T10:00:00.000Z",
  })
  gamma = await creerProduit({
    cle: "gamma",
    nom: `Gamma Lampe ${runId}`,
    marque: `Marque Gamma ${runId}`,
    prix: 20000,
    structure: petitEnfant.id,
    stocks: [0, 0],
    livraisonOfferte: true,
    creeLe: "2026-01-03T10:00:00.000Z",
  })
  delta = await creerProduit({
    cle: "delta",
    nom: `Delta Bureau ${runId}`,
    marque: `Marque Delta ${runId}`,
    prix: 40000,
    structure: autre.id,
    stocks: [7],
    creeLe: "2026-01-04T10:00:00.000Z",
  })
  sansStructure = await creerProduit({
    cle: "sans-structure",
    nom: `Sans Structure ${runId}`,
    marque: `Marque Sans ${runId}`,
    prix: 5000,
    structure: null,
    stocks: [0],
    creeLe: "2026-01-05T10:00:00.000Z",
  })
})

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: prefixe } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: prefixe } },
  })
  await prisma.$disconnect()
})

describe("la lecture paginée du Catalogue", () => {
  it("rend une page, le total et le nombre de pages, jamais tout le Catalogue", async () => {
    const page = await listAdminProducts({
      structure: racine.id,
      tri: "nom",
      sens: "asc",
    })

    expect(page.totalCount).toBe(3)
    expect(page.pageCount).toBe(1)
    expect(page.produits).toHaveLength(3)
    expect(idsDe(page.produits)).toEqual([alpha.id, beta.id, gamma.id])
  })

  it("porte les faits d'une ligne, avec le total des Variantes et la première image", async () => {
    const page = await listAdminProducts({ structure: racine.id, tri: "nom" })
    const fait = page.produits.find((produit) => produit.id === alpha.id)

    expect(fait).toEqual({
      id: alpha.id,
      name: `Alpha Chaise ${runId}`,
      brand: `Marque Alpha ${runId}`,
      categoryName: `Racine liste ${runId}`,
      price: 30000,
      isFeatured: true,
      freeShipping: false,
      image: "https://cdn.example.test/alpha.jpg",
      totalStock: 5,
    })
  })

  it("page avec la taille par défaut de cinquante, et la page demandée seule", async () => {
    const page = await listAdminProducts({ structure: racine.id, page: 1 })
    expect(page.produits.length).toBeLessThanOrEqual(50)
    expect(page.pageCount).toBe(1)
  })
})

describe("la recherche, dans Postgres, sans replier les accents", () => {
  it("trouve par nom, marque, slug et SKU de Variante, sans tenir compte de la casse", async () => {
    const parNom = await listAdminProducts({ q: `alpha chaise ${runId}` })
    expect(idsDe(parNom.produits)).toContain(alpha.id)

    const parMarque = await listAdminProducts({ q: `MARQUE ALPHA ${runId}` })
    expect(idsDe(parMarque.produits)).toContain(alpha.id)

    const parSlug = await listAdminProducts({
      q: `${prefixe}alpha`.toUpperCase(),
    })
    expect(idsDe(parSlug.produits)).toContain(alpha.id)

    const parSku = await listAdminProducts({
      q: `sku-${prefixe}alpha-1`.toUpperCase(),
    })
    expect(idsDe(parSku.produits)).toContain(alpha.id)
  })

  it("ne replie pas les accents", async () => {
    const sansAccent = await listAdminProducts({ q: `beta table ${runId}` })
    expect(idsDe(sansAccent.produits)).not.toContain(beta.id)

    const avecAccent = await listAdminProducts({ q: `Bêta Table ${runId}` })
    expect(idsDe(avecAccent.produits)).toEqual([beta.id])
  })

  it("rend zéro résultat et pageCount nul quand rien ne correspond", async () => {
    const page = await listAdminProducts({ q: `introuvable-${runId}` })

    expect(page.produits).toEqual([])
    expect(page.totalCount).toBe(0)
    expect(page.pageCount).toBe(0)
  })
})

describe("les filtres du Catalogue", () => {
  it("filtre par Structure en incluant ses descendantes", async () => {
    const page = await listAdminProducts({
      structure: racine.id,
      tri: "nom",
      sens: "asc",
    })

    expect(idsDe(page.produits)).toEqual([alpha.id, beta.id, gamma.id])
    expect(idsDe(page.produits)).not.toContain(delta.id)
  })

  it("filtre la branche d'une Structure intermédiaire sans remonter à sa parente", async () => {
    const page = await listAdminProducts({
      structure: enfant.id,
      tri: "nom",
      sens: "asc",
    })

    expect(idsDe(page.produits)).toEqual([beta.id, gamma.id])
  })

  it("sélectionne exactement les Produits sans Structure avec le jeton réservé", async () => {
    const page = await listAdminProducts({
      structure: PRODUIT_STRUCTURE_SANS,
      q: runId,
    })

    expect(idsDe(page.produits)).toEqual([sansStructure.id])
    expect(page.produits[0]?.categoryName).toBe("Sans Structure")
  })

  it("ignore une Structure inconnue plutôt que de rendre une page vide", async () => {
    const page = await listAdminProducts({
      structure: randomUUID(),
      q: runId,
    })

    expect(page.totalCount).toBe(5)
  })

  it("sépare le stock nul du stock non nul, même avec plusieurs Variantes", async () => {
    const zero = await listAdminProducts({
      structure: racine.id,
      stock: PRODUIT_STOCK_ZERO,
      tri: "nom",
      sens: "asc",
    })
    expect(idsDe(zero.produits)).toEqual([beta.id, gamma.id])

    const nonNul = await listAdminProducts({
      structure: racine.id,
      stock: PRODUIT_STOCK_NON_NUL,
      tri: "nom",
      sens: "asc",
    })
    expect(idsDe(nonNul.produits)).toEqual([alpha.id])
  })

  it("filtre les Produits mis en avant et à livraison offerte", async () => {
    const misEnAvant = await listAdminProducts({
      structure: racine.id,
      misEnAvant: true,
    })
    expect(idsDe(misEnAvant.produits)).toEqual([alpha.id])

    const livraisonOfferte = await listAdminProducts({
      structure: racine.id,
      livraisonOfferte: true,
    })
    expect(idsDe(livraisonOfferte.produits)).toEqual([gamma.id])
  })

  it("combine les filtres dans une seule lecture", async () => {
    const page = await listAdminProducts({
      structure: racine.id,
      stock: PRODUIT_STOCK_ZERO,
      q: runId,
      tri: "nom",
      sens: "asc",
    })

    expect(idsDe(page.produits)).toEqual([beta.id, gamma.id])
  })
})

describe("les tris, stables par leur second critère", () => {
  it("trie par nom dans les deux sens", async () => {
    const asc = await listAdminProducts({
      structure: racine.id,
      tri: "nom",
      sens: "asc",
    })
    expect(idsDe(asc.produits)).toEqual([alpha.id, beta.id, gamma.id])

    const desc = await listAdminProducts({
      structure: racine.id,
      tri: "nom",
      sens: "desc",
    })
    expect(idsDe(desc.produits)).toEqual([gamma.id, beta.id, alpha.id])
  })

  it("trie par prix dans les deux sens", async () => {
    const asc = await listAdminProducts({
      structure: racine.id,
      tri: "prix",
      sens: "asc",
    })
    expect(idsDe(asc.produits)).toEqual([beta.id, gamma.id, alpha.id])

    const desc = await listAdminProducts({
      structure: racine.id,
      tri: "prix",
      sens: "desc",
    })
    expect(idsDe(desc.produits)).toEqual([alpha.id, gamma.id, beta.id])
  })

  it("trie par stock total, en égalité par identifiant", async () => {
    const page = await listAdminProducts({
      structure: racine.id,
      tri: "stock",
      sens: "asc",
    })

    const attendu = [beta, gamma].sort((a, b) => a.id.localeCompare(b.id))
    expect(idsDe(page.produits)).toEqual([
      ...attendu.map((produit) => produit.id),
      alpha.id,
    ])
  })

  it("trie par date de création, la plus récente d'abord par défaut", async () => {
    const defaut = await listAdminProducts({ structure: racine.id })
    expect(idsDe(defaut.produits)).toEqual([gamma.id, beta.id, alpha.id])

    const asc = await listAdminProducts({
      structure: racine.id,
      tri: "date",
      sens: "asc",
    })
    expect(idsDe(asc.produits)).toEqual([alpha.id, beta.id, gamma.id])
  })

  it("rompt l'égalité de date par identifiant, dans le sens du tri", async () => {
    const egalDate = await creerProduit({
      cle: "egal-date",
      nom: `Égal date ${runId}`,
      marque: `Marque Égal ${runId}`,
      prix: 1000,
      structure: racine.id,
      stocks: [1],
      creeLe: "2026-01-03T10:00:00.000Z",
    })

    try {
      const desc = await listAdminProducts({
        structure: racine.id,
        tri: "date",
        sens: "desc",
      })
      const attendu = [gamma, egalDate].sort((a, b) => b.id.localeCompare(a.id))
      expect(idsDe(desc.produits).slice(0, 2)).toEqual(idsDe(attendu))
    } finally {
      await prisma.product.delete({ where: { id: egalDate.id } })
    }
  })
})

describe("la pagination d'une liste filtrée", () => {
  let structurePaginee: StructureCreee
  const idsPaginees: string[] = []

  beforeAll(async () => {
    structurePaginee = await creerStructure({
      name: `Pagination ${runId}`,
      prefix: prefixe,
    })
    for (let index = 0; index < 11; index += 1) {
      const produit = await creerProduit({
        cle: `page-${String(index).padStart(2, "0")}`,
        nom: `Produit paginé ${index} ${runId}`,
        marque: `Marque Paginée ${runId}`,
        prix: 1000 + index,
        structure: structurePaginee.id,
        stocks: [index],
        creeLe: `2026-02-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      })
      idsPaginees.push(produit.id)
    }
  })

  it("rend la deuxième page et le compte total de la vue", async () => {
    const premiere = await listAdminProducts({
      structure: structurePaginee.id,
      pageSize: 10,
      page: 1,
      tri: "date",
      sens: "asc",
    })
    const seconde = await listAdminProducts({
      structure: structurePaginee.id,
      pageSize: 10,
      page: 2,
      tri: "date",
      sens: "asc",
    })

    expect(premiere.totalCount).toBe(11)
    expect(premiere.pageCount).toBe(2)
    expect(premiere.produits).toHaveLength(10)
    expect(seconde.produits).toHaveLength(1)
    expect(idsDe(premiere.produits)).toEqual(idsPaginees.slice(0, 10))
    expect(idsDe(seconde.produits)).toEqual(idsPaginees.slice(10))
  })

  it("rend une page vide hors bornes, avec le vrai total et le vrai nombre de pages", async () => {
    const page = await listAdminProducts({
      structure: structurePaginee.id,
      pageSize: 10,
      page: 9,
    })

    expect(page.produits).toEqual([])
    expect(page.totalCount).toBe(11)
    expect(page.pageCount).toBe(2)
  })

  it("respecte les tailles de page fermées et leur défaut", async () => {
    const vingt = await listAdminProducts({
      structure: structurePaginee.id,
      pageSize: 20,
    })
    expect(vingt.pageCount).toBe(1)
    expect(vingt.produits).toHaveLength(11)
  })
})
