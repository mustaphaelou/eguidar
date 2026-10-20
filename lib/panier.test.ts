import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
import { prixVariante } from "@/lib/product-metrics"
import { resetCookieStoreMock } from "@/test/cookie-store"
import { sessionCouranteMock } from "@/test/navigation-mocks"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/session-courante", async () => {
  const h = await import("@/test/navigation-mocks")
  return { lireSession: h.sessionCouranteMock }
})

import {
  ajouterArticleAuPanier,
  compterArticlesDuPanier,
  lirePanier,
  lirePanierClient,
  modifierQuantiteArticlePanier,
  retirerArticleDuPanier,
} from "./panier"
import { chargerDevis, projeterDevis } from "@/lib/use-cases/devis"
import { placeOrder } from "@/lib/use-cases/orders"

const runId = randomUUID().slice(0, 8)
const emailPrefix = `panier-interface-${runId}-`

const ADRESSE = "12 Avenue Hassan II, Appt 5"
const TELEPHONE = "+212 600 123 456"

let userIdA: string
let userIdB: string
let variantStandard: string
let variantPremium: string
let variantesCap: string[]
let cityId: string

function commeClient(id: string) {
  sessionCouranteMock.mockResolvedValue({
    id,
    name: "Client Test",
    email: "client@example.ma",
    role: "user",
  })
}

function commeVisiteur() {
  sessionCouranteMock.mockResolvedValue(null)
}

async function viderPanierCourant(): Promise<void> {
  const panier = await lirePanier()
  for (const ligne of panier.lines) {
    await retirerArticleDuPanier(ligne.variantId)
  }
}

/** Le total affiché vient des mêmes faits que ceux que le serveur chiffre. */
async function totalAfficheDuClient(clientId: string): Promise<number> {
  const projet = projeterDevis(
    await chargerDevis(await lirePanierClient(clientId)),
    cityId
  )
  return projet.selection.cas === "validée" ? projet.selection.devis.total : 0
}

beforeAll(async () => {
  const userA = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${emailPrefix}a@test.ma`,
      name: "Utilisateur A",
    },
  })
  userIdA = userA.id
  userIdB = (
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `${emailPrefix}b@test.ma`,
        name: "Utilisateur B",
      },
    })
  ).id

  const category = await prisma.category.create({
    data: {
      name: `Catégorie ${runId}`,
      slug: `panier-interface-cat-${runId}`,
    },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Panier Interface",
      slug: `panier-interface-prod-${runId}`,
      description: "Description A",
      brand: "Marque A",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: ["https://example.com/pd-1.jpg"],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `PDI-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `PDI-${runId}-A2`,
            priceDelta: 50000,
            stock: 3,
          },
        ],
      },
    },
    include: { variants: true },
  })
  variantStandard = product.variants.find((v) => v.name === "Standard")!.id
  variantPremium = product.variants.find((v) => v.name === "Premium")!.id

  const productCap = await prisma.product.create({
    data: {
      name: "Produit Panier Cap",
      slug: `panier-interface-cap-${runId}`,
      description: "Description Cap",
      brand: "Marque Cap",
      categoryId: category.id,
      price: 10000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: Array.from({ length: 21 }, (_, i) => ({
          name: `Cap ${i + 1}`,
          sku: `PDI-CAP-${runId}-${i + 1}`,
          priceDelta: 0,
          stock: 50,
        })),
      },
    },
    include: { variants: true },
  })
  variantesCap = productCap.variants
    .map((v) => v.id)
    .sort((a, b) => a.localeCompare(b))

  cityId = (
    await prisma.deliveryCity.create({
      data: { name: `Ville ${runId}`, slug: `ville-${runId}`, fee: 3500 },
    })
  ).id
})

beforeEach(async () => {
  resetCookieStoreMock()
  sessionCouranteMock.mockReset()
  commeClient(userIdA)
  await viderPanierCourant()
  commeClient(userIdB)
  await viderPanierCourant()
  sessionCouranteMock.mockReset()
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email: { startsWith: emailPrefix } } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: emailPrefix } } },
  })
  await prisma.productVariant.updateMany({
    where: { sku: { startsWith: `PDI-${runId}-` } },
    data: { stock: 50 },
  })
})

afterAll(async () => {
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email: { startsWith: emailPrefix } } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: emailPrefix } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: emailPrefix } },
  })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: "panier-interface-" } },
  })
  await prisma.category.deleteMany({
    where: { slug: `panier-interface-cat-${runId}` },
  })
  await prisma.deliveryCity.deleteMany({ where: { name: `Ville ${runId}` } })
  await prisma.$disconnect()
})

describe("lirePanier — lecture du Panier via l'interface", () => {
  it("lit le Panier du Client après un ajout via l'interface", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)
    await ajouterArticleAuPanier(variantPremium, 1)

    const panier = await lirePanier()

    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      variantName: "Standard",
      productName: "Produit Panier Interface",
      image: "https://example.com/pd-1.jpg",
      unitPrice: 100000,
      quantity: 2,
      lineTotal: 200000,
    })
    expect(panier.lines[1]).toMatchObject({
      variantId: variantPremium,
      unitPrice: 150000,
      quantity: 1,
      lineTotal: 150000,
    })
    expect(panier.subtotal).toBe(200000 + 150000)
    expect(panier.itemCount).toBe(3)
  })

  it("lit le Panier du Visiteur après un ajout via l'interface", async () => {
    commeVisiteur()
    await ajouterArticleAuPanier(variantStandard, 2)
    await ajouterArticleAuPanier(variantPremium, 1)

    const panier = await lirePanier()

    expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
      variantStandard,
      variantPremium,
    ])
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      variantName: "Standard",
      productName: "Produit Panier Interface",
      unitPrice: 100000,
      quantity: 2,
      lineTotal: 200000,
    })
    expect(panier.subtotal).toBe(200000 + 150000)
    expect(panier.itemCount).toBe(3)
  })

  it("expose la forme des données seule — sans écho du Propriétaire", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 1)

    const panier = await lirePanier()

    expect(Object.keys(panier).sort()).toEqual([
      "itemCount",
      "lines",
      "subtotal",
    ])
  })

  it("rend un Panier vide avec des totaux nuls quand rien n'a été ajouté", async () => {
    commeClient(userIdA)
    await expect(lirePanier()).resolves.toEqual({
      lines: [],
      subtotal: 0,
      itemCount: 0,
    })

    commeVisiteur()
    await expect(lirePanier()).resolves.toEqual({
      lines: [],
      subtotal: 0,
      itemCount: 0,
    })
  })

  it("compose le Prix courant via la règle canonique pure sur une Variante avec écart", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantPremium, 1)

    const panier = await lirePanier()
    const article = panier.lines.find((a) => a.variantId === variantPremium)

    expect(article).toBeDefined()
    expect(article?.unitPrice).toBe(prixVariante(100000, 50000))
  })
})

describe("compterArticlesDuPanier — comptage via l'interface", () => {
  it("compte la somme des quantités du Client après des ajouts via l'interface", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)
    await ajouterArticleAuPanier(variantPremium, 3)

    const compte = await compterArticlesDuPanier()

    expect(compte).toBe(5)
    expect(compte).not.toBe(2)
  })

  it("compte la somme des quantités du Visiteur après des ajouts via l'interface", async () => {
    commeVisiteur()
    await ajouterArticleAuPanier(variantStandard, 3)
    await ajouterArticleAuPanier(variantPremium, 2)

    const compte = await compterArticlesDuPanier()

    expect(compte).toBe(5)
    expect(compte).not.toBe(2)
  })

  it("rend zéro quand le Panier est vide", async () => {
    commeClient(userIdA)
    await expect(compterArticlesDuPanier()).resolves.toBe(0)

    commeVisiteur()
    await expect(compterArticlesDuPanier()).resolves.toBe(0)
  })
})

describe("ajouterArticleAuPanier — aller-retour écriture-puis-lecture", () => {
  it("fusionne les ajouts répétés du Client sous une seule ligne", async () => {
    commeClient(userIdA)
    await expect(ajouterArticleAuPanier(variantStandard, 2)).resolves.toEqual({
      ok: true,
    })
    await expect(ajouterArticleAuPanier(variantStandard, 1)).resolves.toEqual({
      ok: true,
    })

    const panier = await lirePanier()
    expect(panier.lines).toHaveLength(1)
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 3,
      lineTotal: 300000,
    })
    expect(panier.itemCount).toBe(3)
    await expect(compterArticlesDuPanier()).resolves.toBe(3)
  })

  it("fusionne les ajouts répétés du Visiteur sous une seule ligne", async () => {
    commeVisiteur()
    await ajouterArticleAuPanier(variantStandard, 2)
    await ajouterArticleAuPanier(variantStandard, 1)

    const panier = await lirePanier()
    expect(panier.lines).toHaveLength(1)
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 3,
      lineTotal: 300000,
    })
    expect(panier.itemCount).toBe(3)
  })

  it("plafonne le Visiteur à 20 articles distincts puis fusionne au-delà du plafond", async () => {
    commeVisiteur()
    for (const variantId of variantesCap.slice(0, 20)) {
      await expect(ajouterArticleAuPanier(variantId, 1)).resolves.toEqual({
        ok: true,
      })
    }

    await expect(ajouterArticleAuPanier(variantesCap[20], 1)).resolves.toEqual({
      ok: false,
      motif: "cap-atteinte",
      message: "Votre panier est plein : 20 articles maximum.",
    })

    const panier = await lirePanier()
    expect(panier.lines).toHaveLength(20)
    await expect(compterArticlesDuPanier()).resolves.toBe(20)

    await expect(ajouterArticleAuPanier(variantesCap[0], 4)).resolves.toEqual({
      ok: true,
    })
    const panierFusionne = await lirePanier()
    expect(panierFusionne.lines).toHaveLength(20)
    expect(
      panierFusionne.lines.find((ligne) => ligne.variantId === variantesCap[0])
    ).toMatchObject({ quantity: 5 })
    await expect(compterArticlesDuPanier()).resolves.toBe(24)
  })

  it("isole chaque Compte : un Client ne lit ni n'écrit celui d'un autre", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)

    commeClient(userIdB)
    await expect(lirePanier()).resolves.toEqual({
      lines: [],
      subtotal: 0,
      itemCount: 0,
    })
    await expect(
      modifierQuantiteArticlePanier(variantStandard, 2)
    ).resolves.toMatchObject({ ok: false, motif: "article-inconnu" })
    await expect(
      retirerArticleDuPanier(variantStandard)
    ).resolves.toMatchObject({ ok: false, motif: "article-inconnu" })

    commeClient(userIdA)
    const panier = await lirePanier()
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 2,
    })
  })
})

describe("modifierQuantiteArticlePanier — aller-retour écriture-puis-lecture", () => {
  it("modifie la quantité du Client identifiée par la Variante", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)

    await expect(
      modifierQuantiteArticlePanier(variantStandard, 5)
    ).resolves.toEqual({ ok: true })

    const panier = await lirePanier()
    expect(panier.lines).toHaveLength(1)
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 5,
      lineTotal: 500000,
    })
  })

  it("modifie la quantité du Visiteur identifiée par la Variante", async () => {
    commeVisiteur()
    await ajouterArticleAuPanier(variantStandard, 2)

    await expect(
      modifierQuantiteArticlePanier(variantStandard, 4)
    ).resolves.toEqual({ ok: true })

    const panier = await lirePanier()
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 4,
      lineTotal: 400000,
    })
  })
})

describe("retirerArticleDuPanier — aller-retour écriture-puis-lecture", () => {
  it("retire la Variante du Client puis la lecture ne la montre plus", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)
    await ajouterArticleAuPanier(variantPremium, 1)

    await expect(retirerArticleDuPanier(variantStandard)).resolves.toEqual({
      ok: true,
    })

    const panier = await lirePanier()
    expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
      variantPremium,
    ])
    expect(panier.itemCount).toBe(1)
  })

  it("retire la Variante du Visiteur puis la lecture ne la montre plus", async () => {
    commeVisiteur()
    await ajouterArticleAuPanier(variantStandard, 2)
    await ajouterArticleAuPanier(variantPremium, 1)

    await expect(retirerArticleDuPanier(variantStandard)).resolves.toEqual({
      ok: true,
    })

    const panier = await lirePanier()
    expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
      variantPremium,
    ])
  })
})

describe("refus — résultat auto-descriptif sans toucher le Panier", () => {
  it("refuse les quantités invalides à l'ajout sans toucher le Panier lu", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)

    await expect(ajouterArticleAuPanier(variantStandard, 0)).resolves.toEqual({
      ok: false,
      motif: "quantite-invalide",
      message:
        "Quantité invalide : la quantité doit être un entier d'au moins 1.",
    })
    await expect(ajouterArticleAuPanier(variantStandard, -1)).resolves.toEqual({
      ok: false,
      motif: "quantite-invalide",
      message:
        "Quantité invalide : la quantité doit être un entier d'au moins 1.",
    })
    await expect(ajouterArticleAuPanier(variantStandard, 1.5)).resolves.toEqual(
      {
        ok: false,
        motif: "quantite-invalide",
        message:
          "Quantité invalide : la quantité doit être un entier d'au moins 1.",
      }
    )

    commeVisiteur()
    await ajouterArticleAuPanier(variantStandard, 2)
    await expect(ajouterArticleAuPanier(variantStandard, 0)).resolves.toEqual({
      ok: false,
      motif: "quantite-invalide",
      message:
        "Quantité invalide : la quantité doit être un entier d'au moins 1.",
    })

    const panierVisiteur = await lirePanier()
    expect(panierVisiteur.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 2,
    })

    commeClient(userIdA)
    const panier = await lirePanier()
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 2,
    })
  })

  it("refuse la Variante inconnue à l'ajout sans toucher le Panier lu", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)

    await expect(
      ajouterArticleAuPanier("variante-fantome", 1)
    ).resolves.toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: "Cet article n'est plus disponible.",
    })

    const panier = await lirePanier()
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 2,
    })
    expect(panier.itemCount).toBe(2)
  })

  it("refuse l'article inconnu à la modification et au retrait sans toucher le Panier lu", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)

    await expect(
      modifierQuantiteArticlePanier("article-fantome", 1)
    ).resolves.toEqual({
      ok: false,
      motif: "article-inconnu",
      message: "Cet article est introuvable dans votre panier.",
    })
    await expect(retirerArticleDuPanier("article-fantome")).resolves.toEqual({
      ok: false,
      motif: "article-inconnu",
      message: "Cet article est introuvable dans votre panier.",
    })

    commeVisiteur()
    await ajouterArticleAuPanier(variantStandard, 2)
    await expect(
      modifierQuantiteArticlePanier("variante-fantome", 1)
    ).resolves.toEqual({
      ok: false,
      motif: "article-inconnu",
      message: "Cet article est introuvable dans votre panier.",
    })
    await expect(retirerArticleDuPanier("variante-fantome")).resolves.toEqual({
      ok: false,
      motif: "article-inconnu",
      message: "Cet article est introuvable dans votre panier.",
    })

    const panierVisiteur = await lirePanier()
    expect(panierVisiteur.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 2,
    })

    commeClient(userIdA)
    const panier = await lirePanier()
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 2,
    })
  })

  it("refuse la quantité invalide à la modification sans toucher le Panier lu", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 2)

    await expect(
      modifierQuantiteArticlePanier(variantStandard, 0)
    ).resolves.toEqual({
      ok: false,
      motif: "quantite-invalide",
      message:
        "Quantité invalide : la quantité doit être un entier d'au moins 1.",
    })

    const panier = await lirePanier()
    expect(panier.lines[0]).toMatchObject({
      variantId: variantStandard,
      quantity: 2,
    })
  })
})

describe("Commande — l'intake vide les bonnes lignes", () => {
  it("passer une Commande vide le Panier persistant du bon Compte, et seulement celui-là", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantStandard, 1)
    await ajouterArticleAuPanier(variantPremium, 1)
    commeClient(userIdB)
    await ajouterArticleAuPanier(variantStandard, 1)

    await placeOrder(userIdA, {
      cityId,
      address: ADRESSE,
      phone: TELEPHONE,
      totalAffiche: await totalAfficheDuClient(userIdA),
    })

    commeClient(userIdA)
    await expect(lirePanier()).resolves.toEqual({
      lines: [],
      subtotal: 0,
      itemCount: 0,
    })

    commeClient(userIdB)
    const panierB = await lirePanier()
    expect(panierB.lines.map((ligne) => ligne.variantId)).toEqual([
      variantStandard,
    ])
    expect(panierB.lines[0]).toMatchObject({ quantity: 1 })
    expect(panierB.itemCount).toBe(1)
  })
})

describe("Commande — un Produit sans Structure se vend normalement", () => {
  it("entre dans le Panier, s'y compte et se commande", async () => {
    const sansStructure = await prisma.product.create({
      data: {
        name: "Produit sans Structure",
        slug: `panier-interface-orphelin-${runId}`,
        description: "Description sans Structure",
        brand: "Marque A",
        categoryId: null,
        price: 100000,
        specs: {},
        images: [],
        freeShipping: false,
        variants: {
          create: [
            {
              name: "Standard",
              sku: `PDI-ORPH-${runId}-A1`,
              priceDelta: 0,
              stock: 10,
            },
          ],
        },
      },
      include: { variants: true },
    })
    const variantSansStructure = sansStructure.variants[0]!.id

    commeClient(userIdA)
    await expect(
      ajouterArticleAuPanier(variantSansStructure, 2)
    ).resolves.toMatchObject({ ok: true })

    const panier = await lirePanier()
    expect(panier.lines[0]).toMatchObject({
      variantId: variantSansStructure,
      productName: "Produit sans Structure",
      quantity: 2,
      lineTotal: 200000,
    })
    expect(panier.itemCount).toBe(2)

    await placeOrder(userIdA, {
      cityId,
      address: ADRESSE,
      phone: TELEPHONE,
      totalAffiche: await totalAfficheDuClient(userIdA),
    })

    const commande = await prisma.order.findFirstOrThrow({
      where: { user: { email: { startsWith: emailPrefix } } },
      include: { items: true },
    })
    expect(commande.items).toHaveLength(1)
    expect(commande.items[0]).toMatchObject({
      productName: "Produit sans Structure",
      quantity: 2,
    })
  })
})
