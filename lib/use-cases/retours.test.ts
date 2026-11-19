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
import type { ReturnReason } from "@/lib/generated/prisma/client"
import type { EffetsStock } from "@/lib/use-cases/commande"
import {
  InvalidOrderTransitionError,
  type OrderEffects,
} from "@/lib/use-cases/orders"
import {
  CommandeDuRetourIntrouvableError,
  declarerRetour,
  DemandeDeRetourOuverteError,
  DepassementDeLaQuantiteDeclareeError,
  PlafondDuRetourDepasseError,
  ReceptionDeRetourImpossibleError,
  recevoirRetour,
  RefusDeRetourImpossibleError,
  refuserRetour,
  RetourIntrouvableError,
  RetourValidationError,
} from "@/lib/use-cases/retours"

const runId = randomUUID().slice(0, 8)
const email = `retours-${runId}@test.ma`
const categorieSlug = `retours-cat-${runId}`
const VARIANT_SKU = `RET-${runId}-A1`

let userId: string
let acteurId: string
let produitId: string
let variantId: string
let categorieId: string

interface CommandeFixture {
  id: string
  items: {
    id: string
    productName: string
    variantName: string
    quantity: number
  }[]
}

async function creerCommande(
  {
    quantites,
    status = "delivered",
    deliveredAt = new Date("2026-11-10T10:00:00.000Z"),
  }: {
    quantites: number[]
    status?:
      | "pending"
      | "confirmed"
      | "shipped"
      | "delivered"
      | "cancelled"
      | "returned"
    deliveredAt?: Date | null
  } = { quantites: [3] }
): Promise<CommandeFixture> {
  const commande = await prisma.order.create({
    data: {
      userId,
      cityName: "Ville Retour",
      address: "12 Avenue Hassan II",
      phone: "+212 600 123 456",
      total: 30000,
      shippingFee: 0,
      totalPayable: 30000,
      status,
      deliveredAt,
      items: {
        create: quantites.map((quantity, index) => ({
          variantId,
          productName: "Article Retour",
          variantName: index === 0 ? "Standard" : `Variante ${index + 1}`,
          price: 10000,
          quantity,
        })),
      },
    },
    include: { items: true },
  })
  return {
    id: commande.id,
    items: commande.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
    })),
  }
}

function declaration(
  commande: CommandeFixture,
  lignes: { orderItemId: string; declaredQuantity: number }[],
  options: {
    reason?: ReturnReason
    requestedAt?: Date
  } = {}
) {
  return {
    orderId: commande.id,
    reason: options.reason ?? ("withdrawal" as const),
    requestedAt: options.requestedAt ?? new Date("2026-11-11T10:00:00.000Z"),
    lines: lignes,
  }
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retenirLeVerrouDeLaCommande(orderId: string) {
  let liberer = () => {}
  const liberation = new Promise<void>((resolve) => {
    liberer = resolve
  })
  let verrouAcquis = () => {}
  const acquisition = new Promise<void>((resolve) => {
    verrouAcquis = resolve
  })
  const transaction = prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT id FROM "Order" WHERE id = $1 FOR UPDATE`,
        orderId
      )
      verrouAcquis()
      await liberation
    },
    { timeout: 30_000 }
  )
  transaction.catch(() => {})
  await acquisition
  return { transaction, liberer }
}

async function attendreLesDeclarationsBloquees(nombre: number): Promise<void> {
  const limites = Date.now() + 10_000
  while (Date.now() < limites) {
    const lignes = await prisma.$queryRawUnsafe<{ attendu: bigint }[]>(
      `SELECT count(*) AS attendu
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query LIKE '%FROM "Order" WHERE id = $1 FOR UPDATE%'`
    )
    if (Number(lignes[0]?.attendu ?? 0) >= nombre) return
    await attendre(10)
  }
  throw new Error("les déclarations n'ont pas attendu le verrou de la Commande")
}

function reception(
  retour: { id: string },
  lignes: {
    orderItemId: string
    receivedQuantity: number
    condition?: "resellable" | "damaged" | null
  }[],
  acteur = acteurId
) {
  return {
    returnId: retour.id,
    lines: lignes.map((ligne) => ({ condition: null, ...ligne })),
    actorId: acteur,
  }
}

async function attendreLesReceptionsBloquees(nombre: number): Promise<void> {
  const limites = Date.now() + 10_000
  while (Date.now() < limites) {
    const lignes = await prisma.$queryRawUnsafe<{ attendu: bigint }[]>(
      `SELECT count(*) AS attendu
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query LIKE '%FROM "Order" WHERE id = $1 FOR UPDATE%'`
    )
    if (Number(lignes[0]?.attendu ?? 0) >= nombre) return
    await attendre(10)
  }
  throw new Error("les réceptions n'ont pas attendu le verrou de la Commande")
}

async function stockerLaCommande(commande: CommandeFixture) {
  return prisma.order.findUniqueOrThrow({ where: { id: commande.id } })
}

beforeAll(async () => {
  const utilisateur = await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      name: "Client Retours",
    },
  })
  userId = utilisateur.id

  const acteur = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `retours-acteur-${runId}@test.ma`,
      name: "Administrateur Retours",
      role: "admin",
    },
  })
  acteurId = acteur.id

  const categorie = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: categorieSlug },
  })
  categorieId = categorie.id

  const produit = await prisma.product.create({
    data: {
      name: "Article Retour",
      slug: `retours-produit-${runId}`,
      description: "Article des Retours",
      brand: "Marque Retours",
      categoryId: categorie.id,
      price: 10000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: VARIANT_SKU,
            priceDelta: 0,
            stock: 10,
          },
        ],
      },
    },
    include: { variants: true },
  })
  produitId = produit.id
  variantId = produit.variants[0].id
})

beforeEach(async () => {
  await prisma.returnLine.deleteMany({
    where: { return: { order: { user: { email } } } },
  })
  await prisma.return.deleteMany({ where: { order: { user: { email } } } })
  await prisma.orderItem.deleteMany({ where: { order: { user: { email } } } })
  await prisma.order.deleteMany({ where: { user: { email } } })
  await prisma.automationEvent.deleteMany({
    where: { type: "variante.stock.changee", entityId: produitId },
  })
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock: 10 },
  })
})

afterAll(async () => {
  await prisma.returnLine.deleteMany({
    where: { return: { order: { user: { email } } } },
  })
  await prisma.return.deleteMany({ where: { order: { user: { email } } } })
  await prisma.orderItem.deleteMany({ where: { order: { user: { email } } } })
  await prisma.order.deleteMany({ where: { user: { email } } })
  await prisma.automationEvent.deleteMany({ where: { entityId: produitId } })
  await prisma.user.delete({ where: { id: acteurId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.product.deleteMany({ where: { categoryId: categorieId } })
  await prisma.category.delete({ where: { id: categorieId } })
  await prisma.$disconnect()
})

describe("déclarer un Retour", () => {
  it("crée la demande avec son motif et ses quantités déclarées, sans toucher au stock ni au Statut", async () => {
    const commande = await creerCommande({ quantites: [3] })
    const article = commande.items[0]

    const retour = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 2 }])
    )

    expect(retour).toMatchObject({
      orderId: commande.id,
      status: "requested",
      reason: "withdrawal",
    })
    expect(retour.lines).toEqual([
      { orderItemId: article.id, declaredQuantity: 2 },
    ])

    const enregistre = await prisma.return.findUniqueOrThrow({
      where: { id: retour.id },
      include: { lines: true },
    })
    expect(enregistre.requestedAt.toISOString()).toBe(
      "2026-11-11T10:00:00.000Z"
    )
    expect(enregistre.refusalCode).toBeNull()
    expect(enregistre.refusalNote).toBeNull()

    const commandeRelue = await stockerLaCommande(commande)
    expect(commandeRelue.status).toBe("delivered")
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(10)
  })

  it("déclare une rétractation demandée dans la fenêtre de sept jours", async () => {
    const commande = await creerCommande({
      quantites: [2],
      deliveredAt: new Date("2026-11-01T10:00:00.000Z"),
    })
    const article = commande.items[0]

    const retour = await declarerRetour(
      declaration(
        commande,
        [{ orderItemId: article.id, declaredQuantity: 2 }],
        {
          reason: "withdrawal",
          requestedAt: new Date("2026-11-08T10:00:00.000Z"),
        }
      )
    )

    expect(retour.reason).toBe("withdrawal")
  })

  it("enregistre une rétractation au-delà de sept jours en geste commercial", async () => {
    const commande = await creerCommande({
      quantites: [2],
      deliveredAt: new Date("2026-11-01T10:00:00.000Z"),
    })
    const article = commande.items[0]

    const retour = await declarerRetour(
      declaration(
        commande,
        [{ orderItemId: article.id, declaredQuantity: 1 }],
        {
          reason: "withdrawal",
          requestedAt: new Date("2026-11-08T10:00:00.001Z"),
        }
      )
    )

    expect(retour.reason).toBe("goodwill")
  })

  it("garde le motif déclaré quand la demande n'est pas une rétractation", async () => {
    const commande = await creerCommande({
      quantites: [2],
      deliveredAt: new Date("2026-11-01T10:00:00.000Z"),
    })
    const article = commande.items[0]

    const retour = await declarerRetour(
      declaration(
        commande,
        [{ orderItemId: article.id, declaredQuantity: 1 }],
        {
          reason: "non_conformity",
          requestedAt: new Date("2027-01-01T10:00:00.000Z"),
        }
      )
    )

    expect(retour.reason).toBe("non_conformity")
  })

  it("garde la rétractation quand la Commande n'a pas de date de livraison", async () => {
    const commande = await creerCommande({
      quantites: [2],
      status: "shipped",
      deliveredAt: null,
    })
    const article = commande.items[0]

    const retour = await declarerRetour(
      declaration(
        commande,
        [{ orderItemId: article.id, declaredQuantity: 1 }],
        {
          reason: "withdrawal",
          requestedAt: new Date("2030-01-01T10:00:00.000Z"),
        }
      )
    )

    expect(retour.reason).toBe("withdrawal")
  })

  it("plafonne le cumul des quantités déclarées, tous Retours non refusés confondus", async () => {
    const commande = await creerCommande({ quantites: [3] })
    const article = commande.items[0]

    await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 2 }])
    )

    await expect(
      declarerRetour(
        declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 2 },
        ])
      )
    ).rejects.toBeInstanceOf(PlafondDuRetourDepasseError)

    await expect(
      prisma.return.count({ where: { orderId: commande.id } })
    ).resolves.toBe(1)
  })

  it("compte aussi les Retours reçus dans le cumul", async () => {
    const commande = await creerCommande({ quantites: [3] })
    const article = commande.items[0]

    const premier = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 2 }])
    )
    await prisma.return.update({
      where: { id: premier.id },
      data: { status: "received" },
    })

    await expect(
      declarerRetour(
        declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 2 },
        ])
      )
    ).rejects.toBeInstanceOf(PlafondDuRetourDepasseError)
  })

  it("exclut les Retours refusés du cumul", async () => {
    const commande = await creerCommande({ quantites: [3] })
    const article = commande.items[0]

    const premier = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 2 }])
    )
    await refuserRetour({
      returnId: premier.id,
      code: "condition_mismatch",
      note: "Article revenu endommagé",
    })

    const ensuite = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 3 }])
    )
    expect(
      ensuite.lines.reduce((total, ligne) => total + ligne.declaredQuantity, 0)
    ).toBe(3)
  })

  it("déclare des lignes partielles sur plusieurs Articles du panier", async () => {
    const commande = await creerCommande({ quantites: [2, 1] })

    const retour = await declarerRetour(
      declaration(commande, [
        { orderItemId: commande.items[0].id, declaredQuantity: 1 },
        { orderItemId: commande.items[1].id, declaredQuantity: 1 },
      ])
    )

    expect(retour.lines).toHaveLength(2)
    expect(
      new Map(retour.lines.map((ligne) => [ligne.orderItemId, ligne]))
    ).toEqual(
      new Map([
        [
          commande.items[0].id,
          { orderItemId: commande.items[0].id, declaredQuantity: 1 },
        ],
        [
          commande.items[1].id,
          { orderItemId: commande.items[1].id, declaredQuantity: 1 },
        ],
      ])
    )
  })

  it("refuse une ligne inconnue de la Commande, sans rien écrire", async () => {
    const commande = await creerCommande({ quantites: [2] })
    const autre = await creerCommande({ quantites: [1] })

    await expect(
      declarerRetour(
        declaration(commande, [
          { orderItemId: autre.items[0].id, declaredQuantity: 1 },
        ])
      )
    ).rejects.toBeInstanceOf(RetourValidationError)

    await expect(
      prisma.return.count({ where: { orderId: commande.id } })
    ).resolves.toBe(0)
  })

  it("refuse une Commande inconnue", async () => {
    const commande = await creerCommande({ quantites: [1] })

    await expect(
      declarerRetour({
        ...declaration(commande, [
          { orderItemId: commande.items[0].id, declaredQuantity: 1 },
        ]),
        orderId: "commande-inconnue",
      })
    ).rejects.toBeInstanceOf(CommandeDuRetourIntrouvableError)
  })

  it("refuse une quantité nulle, négative ou non entière, sans rien écrire", async () => {
    const commande = await creerCommande({ quantites: [2] })
    const article = commande.items[0]

    for (const declaredQuantity of [0, -1, 1.5]) {
      await expect(
        declarerRetour(
          declaration(commande, [{ orderItemId: article.id, declaredQuantity }])
        )
      ).rejects.toBeInstanceOf(RetourValidationError)
    }

    await expect(
      prisma.return.count({ where: { orderId: commande.id } })
    ).resolves.toBe(0)
  })

  it("refuse une demande sans ligne et un Article répété", async () => {
    const commande = await creerCommande({ quantites: [2] })
    const article = commande.items[0]

    await expect(
      declarerRetour(declaration(commande, []))
    ).rejects.toBeInstanceOf(RetourValidationError)

    await expect(
      declarerRetour(
        declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 1 },
          { orderItemId: article.id, declaredQuantity: 1 },
        ])
      )
    ).rejects.toBeInstanceOf(RetourValidationError)
  })

  it("refuse un motif inconnu et une date de demande invalide", async () => {
    const commande = await creerCommande({ quantites: [1] })
    const article = commande.items[0]

    await expect(
      declarerRetour({
        ...declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 1 },
        ]),
        reason: "exchange" as never,
      })
    ).rejects.toBeInstanceOf(RetourValidationError)

    await expect(
      declarerRetour({
        ...declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 1 },
        ]),
        requestedAt: new Date("pas une date"),
      })
    ).rejects.toBeInstanceOf(RetourValidationError)

    await expect(
      prisma.return.count({ where: { orderId: commande.id } })
    ).resolves.toBe(0)
  })

  it("refuse une seconde demande ouverte, même sans concurrence", async () => {
    const commande = await creerCommande({ quantites: [2, 1] })
    await declarerRetour(
      declaration(commande, [
        { orderItemId: commande.items[0].id, declaredQuantity: 1 },
      ])
    )

    await expect(
      declarerRetour(
        declaration(commande, [
          { orderItemId: commande.items[1].id, declaredQuantity: 1 },
        ])
      )
    ).rejects.toBeInstanceOf(DemandeDeRetourOuverteError)

    await expect(
      prisma.return.count({ where: { orderId: commande.id } })
    ).resolves.toBe(1)
  })

  it(
    "garantit au plus une demande ouverte par Commande, par l'index partiel",
    { timeout: 15_000 },
    async () => {
      const commande = await creerCommande({ quantites: [2, 2] })

      const { transaction, liberer } = await retenirLeVerrouDeLaCommande(
        commande.id
      )
      const premiere = declarerRetour(
        declaration(commande, [
          { orderItemId: commande.items[0].id, declaredQuantity: 1 },
        ])
      )
      const seconde = declarerRetour(
        declaration(commande, [
          { orderItemId: commande.items[1].id, declaredQuantity: 1 },
        ])
      )
      try {
        await attendreLesDeclarationsBloquees(2)
      } finally {
        liberer()
      }
      await transaction

      const resultats = await Promise.allSettled([premiere, seconde])
      const reussites = resultats.filter(
        (resultat) => resultat.status === "fulfilled"
      )
      const echecs = resultats.filter(
        (resultat): resultat is PromiseRejectedResult =>
          resultat.status === "rejected"
      )

      expect(reussites).toHaveLength(1)
      expect(echecs).toHaveLength(1)
      expect(echecs[0].reason).toBeInstanceOf(DemandeDeRetourOuverteError)
      await expect(
        prisma.return.count({
          where: { orderId: commande.id, status: "requested" },
        })
      ).resolves.toBe(1)
    }
  )

  it(
    "deux déclarations concurrentes ne peuvent pas dépasser la quantité commandée",
    { timeout: 15_000 },
    async () => {
      const commande = await creerCommande({ quantites: [3] })
      const article = commande.items[0]

      const { transaction, liberer } = await retenirLeVerrouDeLaCommande(
        commande.id
      )
      const premiere = declarerRetour(
        declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 2 },
        ])
      )
      const seconde = declarerRetour(
        declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 2 },
        ])
      )
      try {
        await attendreLesDeclarationsBloquees(2)
      } finally {
        liberer()
      }
      await transaction

      const resultats = await Promise.allSettled([premiere, seconde])
      const reussites = resultats.filter(
        (resultat) => resultat.status === "fulfilled"
      )
      const echecs = resultats.filter(
        (resultat): resultat is PromiseRejectedResult =>
          resultat.status === "rejected"
      )

      expect(reussites).toHaveLength(1)
      expect(echecs).toHaveLength(1)
      expect(echecs[0].reason).toBeInstanceOf(PlafondDuRetourDepasseError)

      const lignes = await prisma.returnLine.findMany({
        where: { return: { orderId: commande.id } },
      })
      expect(
        lignes.reduce((total, ligne) => total + ligne.declaredQuantity, 0)
      ).toBe(2)
    }
  )

  it("ouvre une seconde demande dès que la première est reçue", async () => {
    const commande = await creerCommande({ quantites: [2, 1] })
    const premier = await declarerRetour(
      declaration(commande, [
        { orderItemId: commande.items[0].id, declaredQuantity: 2 },
      ])
    )
    await prisma.return.update({
      where: { id: premier.id },
      data: { status: "received" },
    })

    const second = await declarerRetour(
      declaration(commande, [
        { orderItemId: commande.items[1].id, declaredQuantity: 1 },
      ])
    )

    expect(second.status).toBe("requested")
    await expect(
      prisma.return.count({ where: { orderId: commande.id } })
    ).resolves.toBe(2)
  })
})

describe("refuser un Retour", () => {
  it("refuse une demande ouverte avec un code légal, sans supprimer ses lignes ni toucher au stock ou au Statut", async () => {
    const commande = await creerCommande({ quantites: [2] })
    const article = commande.items[0]
    const retour = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 1 }])
    )
    const lignesAvant = await prisma.returnLine.findMany({
      where: { returnId: retour.id },
    })

    const refuse = await refuserRetour({
      returnId: retour.id,
      code: "excluded_by_law",
      note: "Article exclu par la loi 31-08",
    })

    expect(refuse.status).toBe("refused")
    expect(refuse.refusalCode).toBe("excluded_by_law")
    expect(refuse.refusalNote).toBe("Article exclu par la loi 31-08")
    expect(refuse.lines).toEqual([
      { orderItemId: article.id, declaredQuantity: 1 },
    ])

    const lignesApres = await prisma.returnLine.findMany({
      where: { returnId: retour.id },
    })
    expect(lignesApres.map((ligne) => ligne.id).sort()).toEqual(
      lignesAvant.map((ligne) => ligne.id).sort()
    )

    const commandeRelue = await stockerLaCommande(commande)
    expect(commandeRelue.status).toBe("delivered")
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(10)
  })

  it("accepte les cinq codes de refus et une note absente", async () => {
    const codes = [
      "out_of_window",
      "excluded_by_law",
      "not_received",
      "condition_mismatch",
      "other",
    ] as const

    for (const code of codes) {
      const commande = await creerCommande({ quantites: [1] })
      const retour = await declarerRetour(
        declaration(commande, [
          { orderItemId: commande.items[0].id, declaredQuantity: 1 },
        ])
      )
      const refuse = await refuserRetour({ returnId: retour.id, code })
      expect(refuse.refusalCode).toBe(code)
      expect(refuse.refusalNote).toBeNull()
    }
  })

  it("refuse un code inconnu", async () => {
    const commande = await creerCommande({ quantites: [1] })
    const retour = await declarerRetour(
      declaration(commande, [
        { orderItemId: commande.items[0].id, declaredQuantity: 1 },
      ])
    )

    await expect(
      refuserRetour({ returnId: retour.id, code: "bogus" as never })
    ).rejects.toBeInstanceOf(RetourValidationError)
  })

  it("refuse un Retour inconnu et un Retour déjà reçu", async () => {
    await expect(
      refuserRetour({ returnId: "retour-inconnu", code: "other" })
    ).rejects.toBeInstanceOf(RetourIntrouvableError)

    const commande = await creerCommande({ quantites: [1] })
    const retour = await declarerRetour(
      declaration(commande, [
        { orderItemId: commande.items[0].id, declaredQuantity: 1 },
      ])
    )
    await prisma.return.update({
      where: { id: retour.id },
      data: { status: "received" },
    })

    await expect(
      refuserRetour({ returnId: retour.id, code: "not_received" })
    ).rejects.toBeInstanceOf(RefusDeRetourImpossibleError)
  })
})

describe("recevoir un Retour", () => {
  it("fixe la quantité reçue et l'état de chaque ligne, et ne réapprovisionne que le revendable", async () => {
    const commande = await creerCommande({ quantites: [3, 2, 2] })
    const [premier, second, troisieme] = commande.items
    const retour = await declarerRetour(
      declaration(commande, [
        { orderItemId: premier.id, declaredQuantity: 2 },
        { orderItemId: second.id, declaredQuantity: 2 },
        { orderItemId: troisieme.id, declaredQuantity: 2 },
      ])
    )

    const recu = await recevoirRetour(
      reception(retour, [
        {
          orderItemId: premier.id,
          receivedQuantity: 2,
          condition: "resellable",
        },
        {
          orderItemId: second.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
        {
          orderItemId: troisieme.id,
          receivedQuantity: 1,
          condition: "damaged",
        },
      ])
    )

    expect(recu).toMatchObject({
      orderId: commande.id,
      status: "received",
      commandeClose: false,
    })
    expect(recu.receivedAt).toBeInstanceOf(Date)
    expect(recu.lines).toEqual([
      {
        orderItemId: premier.id,
        declaredQuantity: 2,
        receivedQuantity: 2,
        condition: "resellable",
      },
      {
        orderItemId: second.id,
        declaredQuantity: 2,
        receivedQuantity: 1,
        condition: "resellable",
      },
      {
        orderItemId: troisieme.id,
        declaredQuantity: 2,
        receivedQuantity: 1,
        condition: "damaged",
      },
    ])

    const enregistre = await prisma.return.findUniqueOrThrow({
      where: { id: retour.id },
      include: { lines: true },
    })
    expect(enregistre.status).toBe("received")
    expect(enregistre.receivedAt).toBeInstanceOf(Date)
    const lignesEnregistrees = new Map(
      enregistre.lines.map((ligne) => [ligne.orderItemId, ligne])
    )
    expect(lignesEnregistrees.get(premier.id)).toMatchObject({
      receivedQuantity: 2,
      condition: "resellable",
    })
    expect(lignesEnregistrees.get(second.id)).toMatchObject({
      receivedQuantity: 1,
      condition: "resellable",
    })
    expect(lignesEnregistrees.get(troisieme.id)).toMatchObject({
      receivedQuantity: 1,
      condition: "damaged",
    })

    const commandeRelue = await stockerLaCommande(commande)
    expect(commandeRelue.status).toBe("delivered")
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(13)
    expect(
      await prisma.orderStatusChange.count({ where: { orderId: commande.id } })
    ).toBe(0)
  })

  it("refuse une quantité reçue au-delà de la déclarée, sans rien écrire", async () => {
    const commande = await creerCommande({ quantites: [3, 2] })
    const [premier, second] = commande.items
    const retour = await declarerRetour(
      declaration(commande, [
        { orderItemId: premier.id, declaredQuantity: 2 },
        { orderItemId: second.id, declaredQuantity: 1 },
      ])
    )

    await expect(
      recevoirRetour(
        reception(retour, [
          {
            orderItemId: premier.id,
            receivedQuantity: 2,
            condition: "resellable",
          },
          {
            orderItemId: second.id,
            receivedQuantity: 2,
            condition: "resellable",
          },
        ])
      )
    ).rejects.toBeInstanceOf(DepassementDeLaQuantiteDeclareeError)

    const enregistre = await prisma.return.findUniqueOrThrow({
      where: { id: retour.id },
      include: { lines: true },
    })
    expect(enregistre.status).toBe("requested")
    expect(
      enregistre.lines.every((ligne) => ligne.receivedQuantity === null)
    ).toBe(true)
    expect((await stockerLaCommande(commande)).status).toBe("delivered")
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(10)
  })

  it("refuse une réception incomplète, dupliquée ou mal formée, sans rien écrire", async () => {
    const commande = await creerCommande({ quantites: [2, 1] })
    const [premier, second] = commande.items
    const retour = await declarerRetour(
      declaration(commande, [
        { orderItemId: premier.id, declaredQuantity: 2 },
        { orderItemId: second.id, declaredQuantity: 1 },
      ])
    )
    const autre = await creerCommande({ quantites: [1] })

    const invalides = [
      reception(retour, [
        {
          orderItemId: premier.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ]),
      reception(retour, [
        {
          orderItemId: premier.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
        {
          orderItemId: premier.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ]),
      reception(retour, [
        {
          orderItemId: premier.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
        {
          orderItemId: autre.items[0].id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ]),
      reception(retour, [
        { orderItemId: premier.id, receivedQuantity: 1 },
        {
          orderItemId: second.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ]),
      reception(retour, [
        {
          orderItemId: premier.id,
          receivedQuantity: 0,
          condition: "resellable",
        },
        {
          orderItemId: second.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ]),
      reception(retour, [
        {
          orderItemId: premier.id,
          receivedQuantity: -1,
          condition: "resellable",
        },
        {
          orderItemId: second.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ]),
    ]

    for (const invalid of invalides) {
      await expect(recevoirRetour(invalid)).rejects.toBeInstanceOf(
        RetourValidationError
      )
    }

    const enregistre = await prisma.return.findUniqueOrThrow({
      where: { id: retour.id },
    })
    expect(enregistre.status).toBe("requested")
    expect(
      await prisma.returnLine.count({
        where: { returnId: retour.id, receivedQuantity: { not: null } },
      })
    ).toBe(0)
    expect((await stockerLaCommande(commande)).status).toBe("delivered")
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(10)
  })

  it("refuse de recevoir un Retour refusé", async () => {
    const commande = await creerCommande({ quantites: [1] })
    const article = commande.items[0]
    const retour = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 1 }])
    )
    await refuserRetour({ returnId: retour.id, code: "not_received" })

    await expect(
      recevoirRetour(
        reception(retour, [
          {
            orderItemId: article.id,
            receivedQuantity: 1,
            condition: "resellable",
          },
        ])
      )
    ).rejects.toBeInstanceOf(ReceptionDeRetourImpossibleError)

    expect(
      (await prisma.return.findUniqueOrThrow({ where: { id: retour.id } }))
        .status
    ).toBe("refused")
    expect((await stockerLaCommande(commande)).status).toBe("delivered")
    expect(
      await prisma.orderStatusChange.count({ where: { orderId: commande.id } })
    ).toBe(0)
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(10)
  })

  it("ne reçoit qu'une fois un Retour déjà reçu", async () => {
    const commande = await creerCommande({ quantites: [1] })
    const article = commande.items[0]
    const retour = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 1 }])
    )
    const ligne = {
      orderItemId: article.id,
      receivedQuantity: 1,
      condition: "resellable" as const,
    }

    await recevoirRetour(reception(retour, [ligne]))
    await expect(
      recevoirRetour(reception(retour, [ligne]))
    ).rejects.toBeInstanceOf(ReceptionDeRetourImpossibleError)

    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(11)
    expect((await stockerLaCommande(commande)).status).toBe("returned")
    expect(
      await prisma.orderStatusChange.count({ where: { orderId: commande.id } })
    ).toBe(1)
  })

  it("clôt la Commande à Retournée quand toutes les unités sont revenues, avec son Changement de statut et sans second réapprovisionnement", async () => {
    const commande = await creerCommande({ quantites: [2, 2] })
    const [premier, second] = commande.items
    const retour = await declarerRetour(
      declaration(commande, [
        { orderItemId: premier.id, declaredQuantity: 2 },
        { orderItemId: second.id, declaredQuantity: 2 },
      ])
    )

    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const invalidateCommande = vi.fn<OrderEffects["invalidateCommande"]>()
    const invalidateProduits = vi.fn<OrderEffects["invalidateProduits"]>(
      async () => {}
    )

    const recu = await recevoirRetour(
      reception(retour, [
        {
          orderItemId: premier.id,
          receivedQuantity: 2,
          condition: "resellable",
        },
        {
          orderItemId: second.id,
          receivedQuantity: 2,
          condition: "damaged",
        },
      ]),
      {
        sendOrderPlacedEmail,
        sendOrderStatusEmail,
        invalidateCommande,
        invalidateProduits,
      }
    )

    expect(recu.commandeClose).toBe(true)
    expect((await stockerLaCommande(commande)).status).toBe("returned")
    const changements = await prisma.orderStatusChange.findMany({
      where: { orderId: commande.id },
    })
    expect(changements).toHaveLength(1)
    expect(changements[0]).toMatchObject({
      fromStatus: "delivered",
      toStatus: "returned",
      actorId: acteurId,
    })
    expect(changements[0].changedAt.getTime()).toBe(recu.receivedAt.getTime())
    expect(
      await prisma.automationEvent.findMany({
        where: { type: "commande.statut.changee", entityId: commande.id },
      })
    ).toHaveLength(1)
    expect(sendOrderPlacedEmail).not.toHaveBeenCalled()
    expect(sendOrderStatusEmail).toHaveBeenCalledOnce()
    expect(sendOrderStatusEmail.mock.calls[0][0].orderId).toBe(commande.id)
    expect(sendOrderStatusEmail.mock.calls[0][1]).toBe("returned")
    expect(invalidateCommande).toHaveBeenCalledOnce()
    expect(invalidateCommande).toHaveBeenCalledWith(commande.id)
    expect(invalidateProduits).toHaveBeenCalledOnce()
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(12)
  })

  it("déclare et exécute le stock d'une réception partielle sans Événement de Commande", async () => {
    const commande = await creerCommande({ quantites: [2] })
    const article = commande.items[0]
    const retour = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 1 }])
    )
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const invalidateCommande = vi.fn<OrderEffects["invalidateCommande"]>()
    const invalidateProduits = vi.fn<OrderEffects["invalidateProduits"]>(
      async () => {}
    )
    const reindexProducts = vi.fn<EffetsStock["reindexProducts"]>(
      async () => {}
    )
    const revalidateCatalog = vi.fn<EffetsStock["revalidateCatalog"]>()
    const purgeCatalogue = vi.fn<EffetsStock["purgeCatalogue"]>()

    const recu = await recevoirRetour(
      reception(retour, [
        {
          orderItemId: article.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ]),
      {
        sendOrderPlacedEmail,
        sendOrderStatusEmail,
        invalidateCommande,
        invalidateProduits,
        reindexProducts,
        revalidateCatalog,
        purgeCatalogue,
      }
    )

    expect(recu.commandeClose).toBe(false)
    expect(sendOrderPlacedEmail).not.toHaveBeenCalled()
    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
    expect(invalidateCommande).not.toHaveBeenCalled()
    expect(invalidateProduits).not.toHaveBeenCalled()
    expect(
      await prisma.automationEvent.count({
        where: { type: "commande.statut.changee", entityId: commande.id },
      })
    ).toBe(0)

    const faits = await prisma.automationEvent.findMany({
      where: { type: "variante.stock.changee", entityId: produitId },
    })
    expect(faits).toHaveLength(1)
    expect(faits[0]!.payload).toEqual({
      produitId,
      slug: `retours-produit-${runId}`,
      categoryId: categorieId,
    })
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({ id: produitId, totalStock: 11 }),
    ])
    expect(revalidateCatalog).toHaveBeenCalledOnce()
    expect(purgeCatalogue).toHaveBeenCalledOnce()
    expect((await stockerLaCommande(commande)).status).toBe("delivered")
  })

  it("laisse la Commande Livrée pour une réception partielle, et un second colis est un second Retour", async () => {
    const commande = await creerCommande({ quantites: [3] })
    const article = commande.items[0]

    const premier = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 1 }])
    )
    const premiereReception = await recevoirRetour(
      reception(premier, [
        {
          orderItemId: article.id,
          receivedQuantity: 1,
          condition: "resellable",
        },
      ])
    )

    expect(premiereReception.commandeClose).toBe(false)
    expect((await stockerLaCommande(commande)).status).toBe("delivered")
    expect(
      await prisma.orderStatusChange.count({ where: { orderId: commande.id } })
    ).toBe(0)
    let variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(11)

    const second = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 2 }])
    )
    const secondeReception = await recevoirRetour(
      reception(second, [
        {
          orderItemId: article.id,
          receivedQuantity: 2,
          condition: "resellable",
        },
      ])
    )

    expect(secondeReception.commandeClose).toBe(true)
    expect((await stockerLaCommande(commande)).status).toBe("returned")
    expect(
      await prisma.orderStatusChange.count({ where: { orderId: commande.id } })
    ).toBe(1)
    variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(13)
  })

  it("refuse de clore une Commande qui ne peut pas passer à Retournée", async () => {
    const commande = await creerCommande({
      quantites: [1],
      status: "pending",
      deliveredAt: null,
    })
    const article = commande.items[0]
    const retour = await declarerRetour(
      declaration(commande, [{ orderItemId: article.id, declaredQuantity: 1 }])
    )

    await expect(
      recevoirRetour(
        reception(retour, [
          {
            orderItemId: article.id,
            receivedQuantity: 1,
            condition: "resellable",
          },
        ])
      )
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError)

    expect(
      (await prisma.return.findUniqueOrThrow({ where: { id: retour.id } }))
        .status
    ).toBe("requested")
    expect((await stockerLaCommande(commande)).status).toBe("pending")
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    })
    expect(variante.stock).toBe(10)
  })

  it(
    "ne réapprovisionne qu'une fois pour deux réceptions concurrentes de la même ligne",
    { timeout: 15_000 },
    async () => {
      const commande = await creerCommande({ quantites: [1] })
      const article = commande.items[0]
      const retour = await declarerRetour(
        declaration(commande, [
          { orderItemId: article.id, declaredQuantity: 1 },
        ])
      )
      const ligne = {
        orderItemId: article.id,
        receivedQuantity: 1,
        condition: "resellable" as const,
      }

      const { transaction, liberer } = await retenirLeVerrouDeLaCommande(
        commande.id
      )
      const premiere = recevoirRetour(reception(retour, [ligne]))
      const seconde = recevoirRetour(reception(retour, [ligne]))
      try {
        await attendreLesReceptionsBloquees(2)
      } finally {
        liberer()
      }
      await transaction

      const resultats = await Promise.allSettled([premiere, seconde])
      const reussites = resultats.filter(
        (resultat) => resultat.status === "fulfilled"
      )
      const echecs = resultats.filter(
        (resultat): resultat is PromiseRejectedResult =>
          resultat.status === "rejected"
      )

      expect(reussites).toHaveLength(1)
      expect(echecs).toHaveLength(1)
      expect(echecs[0].reason).toBeInstanceOf(ReceptionDeRetourImpossibleError)

      const variante = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      })
      expect(variante.stock).toBe(11)
      expect(
        (await prisma.return.findUniqueOrThrow({ where: { id: retour.id } }))
          .status
      ).toBe("received")
      expect((await stockerLaCommande(commande)).status).toBe("returned")
      expect(
        await prisma.orderStatusChange.count({
          where: { orderId: commande.id },
        })
      ).toBe(1)
    }
  )
})
