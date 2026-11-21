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
import { ajouterArticleAuPanier, lirePanierClient } from "@/lib/panier"
import { sessionCouranteMock } from "@/test/navigation-mocks"
import {
  verifierFrontiereBestEffort,
  verifierRefusValidation,
} from "@/test/mutation-squelette-recette"
import {
  chargerDevis,
  projeterDevis,
  selectionValidee,
} from "@/lib/use-cases/devis"
import { enregistrerRemboursement } from "@/lib/use-cases/remboursements"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison-prix"
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client"
import {
  CheckoutValidationError,
  DevisPériméError,
  EmptyCartError,
  getAdminOrder,
  getOrder,
  InvalidOrderTransitionError,
  listAdminOrders,
  listUserOrders,
  OrderNotFoundError,
  OutOfStockError,
  placeOrder,
  updateOrderStatus,
  type CheckoutInput,
  type OrderEffects,
} from "@/lib/use-cases/orders"

vi.mock("@/lib/use-cases/session-courante", async () => {
  const h = await import("@/test/navigation-mocks")
  return { lireSession: h.sessionCouranteMock }
})

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `orders-${runId}-${suffix}@test.ma`
const cityName = `Ville ${runId}`
const ADDRESS = "12 Avenue Hassan II, Appt 5"
const PHONE = "+212 600 123 456"

let userIdA: string
let userIdB: string
let userIdC: string
let acteurId: string
let variantP1: string
let variantP2: string
let variantP3: string
let variantP4: string
let cityId: string

async function createUser(suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: email(suffix),
      name: `Utilisateur ${suffix}`,
    },
  })
  return user.id
}

function commeClient(userId: string) {
  sessionCouranteMock.mockResolvedValue({
    id: userId,
    name: "Client Test",
    email: "client@example.ma",
    role: "user",
  })
}

beforeAll(async () => {
  userIdA = await createUser("a")
  userIdB = await createUser("b")
  userIdC = await createUser("c")
  acteurId = await createUser("acteur")

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `orders-cat-${runId}` },
  })
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Ordres Produit A",
        slug: `orders-prod-a-${runId}`,
        description: "Description A",
        brand: "Marque Ordres",
        categoryId: category.id,
        price: 100000,
        specs: {},
        images: [],
        freeShipping: false,
        variants: {
          create: [
            {
              name: "Standard",
              sku: `ORD-${runId}-A1`,
              priceDelta: 0,
              stock: 5,
            },
            {
              name: "Premium",
              sku: `ORD-${runId}-A2`,
              priceDelta: 50000,
              stock: 1,
            },
          ],
        },
      },
      include: { variants: true },
    }),
    prisma.product.create({
      data: {
        name: "Ordres Produit B",
        slug: `orders-prod-b-${runId}`,
        description: "Description B",
        brand: "Marque Ordres",
        categoryId: category.id,
        price: 50000,
        specs: {},
        images: [],
        freeShipping: true,
        variants: {
          create: [
            {
              name: "Standard",
              sku: `ORD-${runId}-B1`,
              priceDelta: 0,
              stock: 3,
            },
          ],
        },
      },
      include: { variants: true },
    }),
    prisma.product.create({
      data: {
        name: "Ordres Produit C",
        slug: `orders-prod-c-${runId}`,
        description: "Description C",
        brand: "Marque Ordres",
        categoryId: category.id,
        price: 30000,
        specs: {},
        images: [],
        freeShipping: false,
        variants: {
          create: [
            {
              name: "Standard",
              sku: `ORD-${runId}-C1`,
              priceDelta: 0,
              stock: 2,
            },
          ],
        },
      },
      include: { variants: true },
    }),
  ])
  variantP1 = products[0].variants.find((v) => v.name === "Standard")!.id
  variantP2 = products[0].variants.find((v) => v.name === "Premium")!.id
  variantP3 = products[1].variants[0].id
  variantP4 = products[2].variants[0].id

  const city = await prisma.deliveryCity.create({
    data: { name: cityName, slug: `ville-${runId}`, fee: 3500 },
  })
  cityId = city.id
})

beforeEach(async () => {
  sessionCouranteMock.mockReset()
  await prisma.deliveryCity.update({
    where: { id: cityId },
    data: { fee: 3500 },
  })
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email: { startsWith: `orders-${runId}-` } } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: `orders-${runId}-` } } },
  })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `orders-${runId}-` } } },
  })
  await prisma.productVariant.updateMany({
    where: { sku: { startsWith: `ORD-${runId}-` } },
    data: { stock: { set: 0 } },
  })
  const stockBySku = [
    { sku: `ORD-${runId}-A1`, stock: 5 },
    { sku: `ORD-${runId}-A2`, stock: 1 },
    { sku: `ORD-${runId}-B1`, stock: 3 },
    { sku: `ORD-${runId}-C1`, stock: 2 },
  ]
  for (const { sku, stock } of stockBySku) {
    await prisma.productVariant.updateMany({ where: { sku }, data: { stock } })
  }
})

afterAll(async () => {
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email: { startsWith: `orders-${runId}-` } } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: `orders-${runId}-` } } },
  })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `orders-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `orders-${runId}-` } },
  })
  await prisma.product.deleteMany({
    where: { slug: { endsWith: `-${runId}` } },
  })
  await prisma.category.deleteMany({ where: { slug: `orders-cat-${runId}` } })
  await prisma.deliveryCity.deleteMany({ where: { name: cityName } })
  await prisma.$disconnect()
})

async function checkoutInput(
  userId: string,
  overrides: Partial<CheckoutInput> = {}
): Promise<CheckoutInput> {
  const villeChoisie = overrides.cityId ?? cityId
  const chargé = await chargerDevis(await lirePanierClient(userId))
  const selection = projeterDevis(chargé, villeChoisie).selection

  return {
    cityId: villeChoisie,
    address: ADDRESS,
    phone: PHONE,
    ...overrides,
    totalAffiche: selection.cas === "validée" ? selection.devis.total : 0,
  }
}

type TransactionInteractive = (
  callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
  options?: unknown
) => Promise<unknown>

async function avecEcritureÀLOuvertureDeLaTransaction<T>(
  ecriture: () => Promise<unknown>,
  action: () => Promise<T>
): Promise<T> {
  const transactionReelle = prisma.$transaction.bind(
    prisma
  ) as unknown as TransactionInteractive

  const espion = vi.spyOn(prisma, "$transaction").mockImplementation(((
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: unknown
  ) =>
    transactionReelle(async (tx) => {
      await ecriture()
      return callback(tx)
    }, options)) as unknown as typeof prisma.$transaction)

  try {
    return await action()
  } finally {
    espion.mockRestore()
  }
}

async function retenirLeVerrou(
  verrouiller: (tx: Prisma.TransactionClient) => Promise<unknown>,
  motifAttente: string
) {
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
      await verrouiller(tx)
      verrouAcquis()
      await liberation
    },
    { timeout: 30_000 }
  )
  transaction.catch(() => {})
  await acquisition

  return {
    transaction,
    liberer,
    async attendreBloques(nombre: number): Promise<void> {
      const limite = Date.now() + 10_000
      while (Date.now() < limite) {
        const lignes = await prisma.$queryRawUnsafe<{ attendu: bigint }[]>(
          `SELECT count(*) AS attendu
             FROM pg_stat_activity
            WHERE datname = current_database()
              AND state = 'active'
              AND wait_event_type = 'Lock'
              AND query LIKE $1`,
          motifAttente
        )
        if (Number(lignes[0]?.attendu ?? 0) >= nombre) return
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      throw new Error("les appels concurrents n'ont pas attendu le verrou")
    },
  }
}

describe("order placement", () => {
  it("snapshots the cart into the order, decrements stock and empties the cart", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 2)

    const order = await placeOrder(userIdA, await checkoutInput(userIdA))

    expect(order.status).toBe("pending")
    expect(order.cityName).toBe(cityName)
    expect(order.address).toBe(ADDRESS)
    expect(order.phone).toBe(PHONE)
    expect(order.total).toBe(60000)
    expect(order.shippingFee).toBe(3500)
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({
      productName: "Ordres Produit C",
      variantName: "Standard",
      price: 30000,
      quantity: 2,
    })

    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP4 },
    })
    expect(stock.stock).toBe(0)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(0)
  })

  it("clears only the buyer's persisted Panier, leaving another compte's line on the same Variante intact", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    await prisma.cartItem.create({
      data: { userId: userIdB, variantId: variantP4, quantity: 1 },
    })

    await placeOrder(userIdA, await checkoutInput(userIdA))

    const cartA = await lirePanierClient(userIdA)
    expect(cartA.lines).toHaveLength(0)
    const itemB = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdB, variantId: variantP4 },
    })
    expect(itemB.quantity).toBe(1)
  })

  it("sends the confirmation e-mail after committing", async () => {
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)

    const order = await placeOrder(userIdA, await checkoutInput(userIdA), {
      sendOrderPlacedEmail,
      sendOrderStatusEmail,
    })

    expect(sendOrderPlacedEmail).toHaveBeenCalledOnce()
    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
    const snapshot = sendOrderPlacedEmail.mock.calls[0][0] as OrderEmailSnapshot
    expect(snapshot.userEmail).toBe(email("a"))
    expect(snapshot.orderId).toBe(order.id)
    expect(snapshot.items).toEqual([
      {
        productName: "Ordres Produit C",
        variantName: "Standard",
        quantity: 1,
        price: 30000,
      },
    ])
    expect(snapshot.total).toBe(30000)
    expect(snapshot.shippingFee).toBe(3500)
    expect(snapshot.totalPayable).toBe(33500)
    expect(snapshot.cityName).toBe(cityName)
  })

  it("still places the order when email dispatch fails", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)

    const order = await verifierFrontiereBestEffort(
      "e-mail de confirmation",
      async (effetQuiEchoue) =>
        placeOrder(userIdA, await checkoutInput(userIdA), {
          sendOrderPlacedEmail: effetQuiEchoue,
        })
    )

    expect(order.id).toBeTruthy()
    expect(order.total).toBe(30000)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(0)
  })

  it("charges the city fee below the free-shipping threshold", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))
    expect(order.shippingFee).toBe(3500)
  })

  it("persists the Devis-computed fee and total", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const cart = await lirePanierClient(userIdA)
    const chargé = await chargerDevis(cart)
    const selection = selectionValidee(projeterDevis(chargé, cityId).selection)

    const order = await placeOrder(userIdA, await checkoutInput(userIdA))

    expect(order.cityName).toBe(selection.ville.name)
    expect(order.shippingFee).toBe(selection.devis.shippingFee)
    expect(order.total).toBe(cart.subtotal)
    expect(order.total + order.shippingFee).toBe(selection.devis.total)
  })

  it("offers free shipping above the threshold", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 4)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))
    expect(order.total).toBe(400000)
    expect(order.shippingFee).toBe(0)
  })

  it("offers free shipping below the threshold when every item is flagged", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP3, 1)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))
    expect(order.shippingFee).toBe(0)
  })

  it("offers free shipping below the threshold when at least one item is flagged", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP3, 1)
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))
    expect(order.total).toBe(80000)
    expect(order.shippingFee).toBe(0)
  })

  it("refuses a Commande on a stale Devis, creating nothing and touching no effect", async () => {
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const input = await checkoutInput(userIdA)

    await ajouterArticleAuPanier(variantP4, 1)

    let refus: unknown
    try {
      await placeOrder(userIdA, input, {
        sendOrderPlacedEmail,
        sendOrderStatusEmail,
      })
    } catch (error) {
      refus = error
    }

    expect(refus).toBeInstanceOf(DevisPériméError)
    expect(refus).toMatchObject({
      name: "DevisPériméError",
      message:
        "Le Total à payer a changé depuis l'affichage — vérifiez le nouveau montant, puis confirmez.",
    })
    expect(await prisma.order.count({ where: { userId: userIdA } })).toBe(0)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].quantity).toBe(2)
    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP4 },
    })
    expect(stock.stock).toBe(2)
    expect(sendOrderPlacedEmail).not.toHaveBeenCalled()
    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
  })

  it("accepts a drift that changes the parts without changing the Total à payer", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP3, 1)
    const input = await checkoutInput(userIdA)
    expect(input.totalAffiche).toBe(50000)

    await prisma.cartItem.deleteMany({ where: { userId: userIdA } })
    await ajouterArticleAuPanier(variantP4, 1)
    await prisma.deliveryCity.update({
      where: { id: cityId },
      data: { fee: 20000 },
    })

    const order = await placeOrder(userIdA, input)

    expect(order.total).toBe(30000)
    expect(order.shippingFee).toBe(20000)
    expect(order.totalPayable).toBe(50000)
  })

  it("refuses Frais de livraison changed at transaction opening instead of storing the stale fee", async () => {
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const input = await checkoutInput(userIdA)
    expect(input.totalAffiche).toBe(33500)

    await expect(
      avecEcritureÀLOuvertureDeLaTransaction(
        () =>
          prisma.deliveryCity.update({
            where: { id: cityId },
            data: { fee: 9000 },
          }),
        () => placeOrder(userIdA, input, { sendOrderPlacedEmail })
      )
    ).rejects.toBeInstanceOf(DevisPériméError)

    expect(await prisma.order.count({ where: { userId: userIdA } })).toBe(0)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(1)
    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP4 },
    })
    expect(stock.stock).toBe(2)
    expect(sendOrderPlacedEmail).not.toHaveBeenCalled()
  })

  it("refuses a unit price changed at transaction opening instead of storing the stale price", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const input = await checkoutInput(userIdA)
    expect(input.totalAffiche).toBe(33500)

    try {
      await expect(
        avecEcritureÀLOuvertureDeLaTransaction(
          () =>
            prisma.product.update({
              where: { slug: `orders-prod-c-${runId}` },
              data: { price: 31000 },
            }),
          () => placeOrder(userIdA, input)
        )
      ).rejects.toBeInstanceOf(DevisPériméError)
    } finally {
      await prisma.product.update({
        where: { slug: `orders-prod-c-${runId}` },
        data: { price: 30000 },
      })
    }

    expect(await prisma.order.count({ where: { userId: userIdA } })).toBe(0)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(1)
    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP4 },
    })
    expect(stock.stock).toBe(2)
  })

  it("lets the Devis périmé refusal win over an out-of-stock refusal", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP2, 2)
    const input = await checkoutInput(userIdA)

    await expect(
      placeOrder(userIdA, { ...input, totalAffiche: input.totalAffiche - 1 })
    ).rejects.toBeInstanceOf(DevisPériméError)

    expect(await prisma.order.count({ where: { userId: userIdA } })).toBe(0)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(1)
    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP2 },
    })
    expect(stock.stock).toBe(1)
  })

  it("blocks out-of-stock variants at checkout without creating anything", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP2, 2)

    try {
      await placeOrder(userIdA, await checkoutInput(userIdA))
      throw new Error("placeOrder should have rejected")
    } catch (error) {
      expect(error).toBeInstanceOf(OutOfStockError)
      if (error instanceof OutOfStockError) {
        expect(error.message).toContain("Ordres Produit A")
        expect(error.items).toEqual([
          {
            productName: "Ordres Produit A",
            variantName: "Premium",
            requested: 2,
            available: 1,
          },
        ])
      }
    }

    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP2 },
    })
    expect(stock.stock).toBe(1)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(1)
    const orderCount = await prisma.order.count({ where: { userId: userIdA } })
    expect(orderCount).toBe(0)
  })

  it("le checkout déclare un Fait de stock par Produit vidé", async () => {
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    const produitA = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP1 },
    })
    const produitC = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP4 },
    })
    await prisma.automationEvent.deleteMany({
      where: { entityId: { in: [produitA.productId, produitC.productId] } },
    })
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 1)
    await ajouterArticleAuPanier(variantP2, 1)
    await ajouterArticleAuPanier(variantP4, 1)

    await placeOrder(userIdA, await checkoutInput(userIdA), {
      sendOrderPlacedEmail,
    })

    const faits = await prisma.automationEvent.findMany({
      where: {
        type: "variante.stock.changee",
        entityId: { in: [produitA.productId, produitC.productId] },
      },
    })
    expect(faits).toHaveLength(2)
    expect(faits.map((fait) => fait.entityId).sort()).toEqual(
      [produitA.productId, produitC.productId].sort()
    )
    for (const fait of faits) {
      expect(fait.payload).toEqual(
        expect.objectContaining({
          produitId: fait.entityId,
          slug: expect.any(String),
          categoryId: expect.any(String),
        })
      )
    }
  })

  it("regroupe en un seul refus les Produits du Panier en rupture de stock", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP2, 2)
    await ajouterArticleAuPanier(variantP4, 3)

    await expect(
      placeOrder(userIdA, await checkoutInput(userIdA))
    ).rejects.toMatchObject({
      name: "OutOfStockError",
      items: [
        expect.objectContaining({ requested: 2, available: 1 }),
        expect.objectContaining({ requested: 3, available: 2 }),
      ],
    })
  })

  it("rolls back the whole order when one line goes out of stock mid-placement", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 1)
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP2, 2)
    await prisma.productVariant.update({
      where: { id: variantP2 },
      data: { stock: { set: 1 } },
    })

    await expect(
      placeOrder(userIdA, await checkoutInput(userIdA))
    ).rejects.toThrow(OutOfStockError)

    const stockP1 = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP1 },
    })
    expect(stockP1.stock).toBe(5)
    const orderCount = await prisma.order.count({ where: { userId: userIdA } })
    expect(orderCount).toBe(0)
  })

  it("allows only one order to take the last unit under concurrency", async () => {
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    commeClient(userIdB)
    await ajouterArticleAuPanier(variantP2, 1)
    commeClient(userIdC)
    await ajouterArticleAuPanier(variantP2, 1)

    const [first, second] = await Promise.allSettled([
      placeOrder(userIdB, await checkoutInput(userIdB), {
        sendOrderPlacedEmail,
      }),
      placeOrder(userIdC, await checkoutInput(userIdC), {
        sendOrderPlacedEmail,
      }),
    ])

    expect([first.status, second.status].sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    const rejected = [first, second].find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    expect(rejected!.reason).toBeInstanceOf(OutOfStockError)
    expect(sendOrderPlacedEmail).toHaveBeenCalledOnce()
    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP2 },
    })
    expect(stock.stock).toBe(0)
    const orderCount = await prisma.order.count({
      where: { userId: { in: [userIdB, userIdC] } },
    })
    expect(orderCount).toBe(1)
  })

  it(
    "one Panier consumed by two concurrent submissions creates one Commande and refuses the second with EmptyCartError",
    { timeout: 20_000 },
    async () => {
      const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
        async () => {}
      )
      commeClient(userIdA)
      await ajouterArticleAuPanier(variantP1, 1)
      const input = await checkoutInput(userIdA)

      const verrou = await retenirLeVerrou(
        (tx) =>
          tx.$queryRawUnsafe(
            `SELECT id FROM "CartItem" WHERE "userId" = $1 ORDER BY "variantId" ASC FOR UPDATE`,
            userIdA
          ),
        `%FROM "CartItem"%FOR UPDATE%`
      )
      const premiere = placeOrder(userIdA, input, { sendOrderPlacedEmail })
      const seconde = placeOrder(userIdA, input, { sendOrderPlacedEmail })
      const resultats = Promise.allSettled([premiere, seconde])
      try {
        await verrou.attendreBloques(2)
      } finally {
        verrou.liberer()
      }
      await verrou.transaction

      const issues = await resultats
      const reussites = issues.filter((issue) => issue.status === "fulfilled")
      const echecs = issues.filter(
        (issue): issue is PromiseRejectedResult => issue.status === "rejected"
      )
      expect(reussites).toHaveLength(1)
      expect(echecs).toHaveLength(1)
      expect(echecs[0].reason).toBeInstanceOf(EmptyCartError)
      expect(sendOrderPlacedEmail).toHaveBeenCalledOnce()

      const commandes = await prisma.order.findMany({
        where: { userId: userIdA },
        include: { items: true },
      })
      expect(commandes).toHaveLength(1)
      expect(commandes[0].items).toHaveLength(1)
      expect(
        await prisma.automationEvent.count({
          where: { entityId: commandes[0].id, type: "commande.creee" },
        })
      ).toBe(1)
      const stock = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantP1 },
      })
      expect(stock.stock).toBe(4)
      expect((await lirePanierClient(userIdA)).lines).toHaveLength(0)
    }
  )

  it(
    "the last unit still yields one Commande and one OutOfStockError under concurrency",
    { timeout: 20_000 },
    async () => {
      const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
        async () => {}
      )
      commeClient(userIdA)
      await ajouterArticleAuPanier(variantP2, 1)
      commeClient(userIdB)
      await ajouterArticleAuPanier(variantP2, 1)
      const inputA = await checkoutInput(userIdA)
      const inputB = await checkoutInput(userIdB)

      const verrou = await retenirLeVerrou(
        (tx) =>
          tx.$queryRawUnsafe(
            `SELECT id FROM "ProductVariant" WHERE id = $1 FOR UPDATE`,
            variantP2
          ),
        `%UPDATE%ProductVariant%`
      )
      const premiere = placeOrder(userIdA, inputA, { sendOrderPlacedEmail })
      const seconde = placeOrder(userIdB, inputB, { sendOrderPlacedEmail })
      const resultats = Promise.allSettled([premiere, seconde])
      try {
        await verrou.attendreBloques(2)
      } finally {
        verrou.liberer()
      }
      await verrou.transaction

      const issues = await resultats
      expect(
        issues.filter((issue) => issue.status === "fulfilled")
      ).toHaveLength(1)
      const echecs = issues.filter(
        (issue): issue is PromiseRejectedResult => issue.status === "rejected"
      )
      expect(echecs).toHaveLength(1)
      expect(echecs[0].reason).toBeInstanceOf(OutOfStockError)
      expect(sendOrderPlacedEmail).toHaveBeenCalledOnce()
      expect(
        await prisma.order.count({
          where: { userId: { in: [userIdA, userIdB] } },
        })
      ).toBe(1)
      const stock = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantP2 },
      })
      expect(stock.stock).toBe(0)
    }
  )

  it("rejects an empty cart", async () => {
    await expect(
      placeOrder(userIdA, await checkoutInput(userIdA))
    ).rejects.toThrow(EmptyCartError)
  })

  it("rejects an unknown delivery city", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    await expect(
      placeOrder(
        userIdA,
        await checkoutInput(userIdA, { cityId: "ville-inconnue" })
      )
    ).rejects.toThrow(DeliveryCityNotFoundError)
  })

  it("rejects invalid address, phone and missing Ville de livraison before post-commit effects", async () => {
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const effects: Partial<OrderEffects> = {
      sendOrderPlacedEmail,
      sendOrderStatusEmail,
    }
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    await verifierRefusValidation(CheckoutValidationError, async () =>
      placeOrder(
        userIdA,
        await checkoutInput(userIdA, { address: "X" }),
        effects
      )
    )
    await verifierRefusValidation(CheckoutValidationError, async () =>
      placeOrder(
        userIdA,
        await checkoutInput(userIdA, { phone: "123" }),
        effects
      )
    )
    await verifierRefusValidation(CheckoutValidationError, async () =>
      placeOrder(userIdA, await checkoutInput(userIdA, { cityId: "" }), effects)
    )

    expect(sendOrderPlacedEmail).not.toHaveBeenCalled()
    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
  })
})

describe("order reads", () => {
  it("returns an order with its items to its owner", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))

    const fetched = await getOrder(userIdA, order.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.status).toBe("pending")
    expect(fetched!.totalPayable).toBe(33500)
    expect(fetched!.montantEncaisse).toBe(0)
    expect(fetched!.montantRembourse).toBe(0)
    expect(fetched!.montantNet).toBe(0)
    expect(fetched!.items).toHaveLength(1)
  })

  it("hides an order from another user", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))

    await expect(getOrder(userIdB, order.id)).resolves.toBeNull()
  })

  it("lists only the user's orders, newest first", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const first = await placeOrder(userIdA, await checkoutInput(userIdA))
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const second = await placeOrder(userIdA, await checkoutInput(userIdA))
    commeClient(userIdB)
    await ajouterArticleAuPanier(variantP3, 1)
    await placeOrder(userIdB, await checkoutInput(userIdB))

    const orders = await listUserOrders(userIdA)

    expect(orders.map((order) => order.id)).toEqual([second.id, first.id])
    expect(orders[0]).toMatchObject({
      status: "pending",
      total: 30000,
      shippingFee: 3500,
      totalPayable: 33500,
      montantEncaisse: 0,
      montantRembourse: 0,
      montantNet: 0,
    })
    expect(orders[0].itemCount).toBe(1)
  })
})

describe("order status transitions", () => {
  async function placeSmallOrder(userId: string): Promise<string> {
    commeClient(userId)
    await ajouterArticleAuPanier(variantP4, 2)
    const order = await placeOrder(userId, await checkoutInput(userId))
    return order.id
  }

  it("sends the status e-mail for each Transition de statut", async () => {
    const statuts: string[] = []
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async (_snapshot, status) => {
        statuts.push(status)
      }
    )
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))

    const effects: OrderEffects = {
      sendOrderPlacedEmail,
      sendOrderStatusEmail,
    }
    await updateOrderStatus(order.id, "confirmed", acteurId, effects)
    await updateOrderStatus(order.id, "shipped", acteurId, effects)
    await updateOrderStatus(order.id, "delivered", acteurId, effects)

    expect(statuts).toEqual(["confirmed", "shipped", "delivered"])
    expect(sendOrderPlacedEmail).not.toHaveBeenCalled()
    const final = await getOrder(userIdA, order.id)
    expect(final!.status).toBe("delivered")
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(3)
    expect(sendOrderStatusEmail.mock.calls.map((call) => call[1])).toEqual([
      "confirmed",
      "shipped",
      "delivered",
    ])
    const lastSnapshot = sendOrderStatusEmail.mock
      .calls[2][0] as OrderEmailSnapshot
    expect(lastSnapshot.orderId).toBe(order.id)
    expect(lastSnapshot.userEmail).toBe(email("a"))
  })

  it("hands the e-mail the Total à payer stored on the Commande, never the sum of its parts", async () => {
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const orderId = await createAdminOrderRecord(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      { totalPayable: 60000 }
    )

    await updateOrderStatus(orderId, "confirmed", acteurId, {
      sendOrderStatusEmail,
    })

    expect(sendOrderStatusEmail).toHaveBeenCalledOnce()
    const snapshot = sendOrderStatusEmail.mock.calls[0][0] as OrderEmailSnapshot
    expect(snapshot.total).toBe(50000)
    expect(snapshot.shippingFee).toBe(3500)
    expect(snapshot.totalPayable).toBe(60000)
  })

  it("cancels a pending order and restocks the variants", async () => {
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const orderId = await placeSmallOrder(userIdA)
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(0)

    await updateOrderStatus(orderId, "cancelled", acteurId, {
      sendOrderStatusEmail,
    })

    const order = await getOrder(userIdA, orderId)
    expect(order!.status).toBe("cancelled")
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(2)
    expect(sendOrderStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orderId }),
      "cancelled"
    )
  })

  it("l'Annulation déclare un Fait de stock par Produit réapprovisionné", async () => {
    const produitA = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP1 },
    })
    const produitC = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP4 },
    })
    await prisma.automationEvent.deleteMany({
      where: { entityId: { in: [produitA.productId, produitC.productId] } },
    })
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 1)
    await ajouterArticleAuPanier(variantP4, 1)
    const orderId = (await placeOrder(userIdA, await checkoutInput(userIdA))).id
    const avant = await prisma.automationEvent.findMany({
      where: {
        type: "variante.stock.changee",
        entityId: { in: [produitA.productId, produitC.productId] },
      },
    })
    expect(avant).toHaveLength(2)

    await updateOrderStatus(orderId, "cancelled", acteurId)

    const apres = await prisma.automationEvent.findMany({
      where: {
        type: "variante.stock.changee",
        entityId: { in: [produitA.productId, produitC.productId] },
      },
    })
    expect(apres).toHaveLength(4)
    for (const produitId of [produitA.productId, produitC.productId]) {
      expect(apres.filter((fait) => fait.entityId === produitId)).toHaveLength(
        2
      )
    }
  })

  it("la livraison ne déclare aucun Fait de stock", async () => {
    const produitC = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP4 },
    })
    const orderId = await placeSmallOrder(userIdA)
    const avant = await prisma.automationEvent.count({
      where: {
        type: "variante.stock.changee",
        entityId: produitC.productId,
      },
    })

    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)
    await updateOrderStatus(orderId, "delivered", acteurId)

    expect(
      await prisma.automationEvent.count({
        where: {
          type: "variante.stock.changee",
          entityId: produitC.productId,
        },
      })
    ).toBe(avant)
  })

  it(
    "updateOrderStatus attend le verrou de la Commande avant de la lire",
    { timeout: 20_000 },
    async () => {
      const orderId = await placeSmallOrder(userIdA)
      const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
        async () => {}
      )

      const verrou = await retenirLeVerrou(
        (tx) =>
          tx.$queryRawUnsafe(
            `SELECT id FROM "Order" WHERE id = $1 FOR UPDATE`,
            orderId
          ),
        `%FROM "Order" WHERE id = $1 FOR UPDATE%`
      )
      const changement = updateOrderStatus(orderId, "confirmed", acteurId, {
        sendOrderStatusEmail,
      })
      try {
        await verrou.attendreBloques(1)
      } finally {
        verrou.liberer()
      }
      await verrou.transaction

      expect((await changement).status).toBe("confirmed")
      expect(sendOrderStatusEmail).toHaveBeenCalledOnce()
    }
  )

  it("still updates the status when email dispatch fails", async () => {
    const orderId = await placeSmallOrder(userIdA)

    const updated = await verifierFrontiereBestEffort(
      "e-mail de statut",
      (effetQuiEchoue) =>
        updateOrderStatus(orderId, "confirmed", acteurId, {
          sendOrderStatusEmail: effetQuiEchoue,
        })
    )

    expect(updated.status).toBe("confirmed")
    const fetched = await getOrder(userIdA, orderId)
    expect(fetched!.status).toBe("confirmed")
  })

  it("refuse le passage manuel à Retournée : seule la réception du Retour l'atteint", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)
    await updateOrderStatus(orderId, "delivered", acteurId)
    const faitsAvant = await prisma.automationEvent.count({
      where: { type: "variante.stock.changee" },
    })

    await expect(
      updateOrderStatus(orderId, "returned", acteurId)
    ).rejects.toThrow(InvalidOrderTransitionError)

    expect(
      await prisma.automationEvent.count({
        where: { type: "variante.stock.changee" },
      })
    ).toBe(faitsAvant)
    const order = await getOrder(userIdA, orderId)
    expect(order!.status).toBe("delivered")
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(0)
  })

  it("rejects invalid Transition de statut without post-commit effects", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    await expect(
      updateOrderStatus(orderId, "cancelled", acteurId, {
        sendOrderStatusEmail,
      })
    ).rejects.toThrow(InvalidOrderTransitionError)
    await expect(
      updateOrderStatus(orderId, "confirmed", acteurId, {
        sendOrderStatusEmail,
      })
    ).rejects.toThrow(InvalidOrderTransitionError)

    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
  })

  it("rejects skipping a step", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await expect(
      updateOrderStatus(orderId, "delivered", acteurId)
    ).rejects.toThrow(InvalidOrderTransitionError)
  })

  it("restocks exactly once when a double cancel is attempted", async () => {
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "cancelled", acteurId, {
      sendOrderStatusEmail,
    })

    await expect(
      updateOrderStatus(orderId, "cancelled", acteurId, {
        sendOrderStatusEmail,
      })
    ).rejects.toThrow(InvalidOrderTransitionError)

    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(2)
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1)
  })

  it("restocks exactly once when two cancels race", async () => {
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const orderId = await placeSmallOrder(userIdA)

    const [first, second] = await Promise.allSettled([
      updateOrderStatus(orderId, "cancelled", acteurId, {
        sendOrderStatusEmail,
      }),
      updateOrderStatus(orderId, "cancelled", acteurId, {
        sendOrderStatusEmail,
      }),
    ])

    expect([first.status, second.status].sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    if (first.status === "rejected")
      expect(first.reason).toBeInstanceOf(InvalidOrderTransitionError)
    if (second.status === "rejected") {
      expect(second.reason).toBeInstanceOf(InvalidOrderTransitionError)
    }
    expect(sendOrderStatusEmail).toHaveBeenCalledOnce()
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(2)
  })

  it("enregistre la livraison avec sa date, un Encaissement et son Changement de statut", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)

    await updateOrderStatus(orderId, "delivered", acteurId)

    const commande = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    })
    expect(commande.deliveredAt).not.toBeNull()

    const encaissements = await prisma.payment.findMany({
      where: { orderId },
    })
    expect(encaissements).toHaveLength(1)
    expect(encaissements[0]).toMatchObject({
      orderId,
      amount: commande.totalPayable,
      mode: "cash_on_delivery",
      recordedById: acteurId,
    })
    expect(encaissements[0].collectedAt.getTime()).toBe(
      commande.deliveredAt!.getTime()
    )

    const changements = await prisma.orderStatusChange.findMany({
      where: { orderId },
      orderBy: { changedAt: "asc" },
    })
    expect(
      changements.map(({ fromStatus, toStatus }) => [fromStatus, toStatus])
    ).toEqual([
      ["pending", "confirmed"],
      ["confirmed", "shipped"],
      ["shipped", "delivered"],
    ])
    expect(changements.map(({ actorId }) => actorId)).toEqual([
      acteurId,
      acteurId,
      acteurId,
    ])
    expect(changements[2].changedAt.getTime()).toBe(
      commande.deliveredAt!.getTime()
    )
  })

  it("écrit le Changement de toute autre Transition, avec acteur et instant, sans encaisser", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)

    const changements = await prisma.orderStatusChange.findMany({
      where: { orderId },
      orderBy: { changedAt: "asc" },
    })
    expect(
      changements.map(({ fromStatus, toStatus }) => [fromStatus, toStatus])
    ).toEqual([
      ["pending", "confirmed"],
      ["confirmed", "shipped"],
    ])
    expect(changements.map(({ actorId }) => actorId)).toEqual([
      acteurId,
      acteurId,
    ])
    expect(
      changements.every(({ changedAt }) => changedAt instanceof Date)
    ).toBe(true)
    await expect(prisma.payment.count({ where: { orderId } })).resolves.toBe(0)
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    ).resolves.toMatchObject({ status: "shipped", deliveredAt: null })

    const annulee = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    await updateOrderStatus(annulee, "cancelled", acteurId)
    await expect(
      prisma.orderStatusChange.findFirstOrThrow({ where: { orderId: annulee } })
    ).resolves.toMatchObject({
      fromStatus: "pending",
      toStatus: "cancelled",
      actorId: acteurId,
    })
  })

  it("ne laisse rien d'une livraison dont la transaction échoue", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)

    await expect(
      updateOrderStatus(orderId, "delivered", "acteur-inconnu")
    ).rejects.toThrow()

    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    ).resolves.toMatchObject({ status: "shipped", deliveredAt: null })
    await expect(prisma.payment.count({ where: { orderId } })).resolves.toBe(0)
    await expect(
      prisma.orderStatusChange.count({
        where: { orderId, toStatus: "delivered" },
      })
    ).resolves.toBe(0)
  })

  it("deux livraisons concurrentes n'écrivent qu'un Encaissement et un Changement", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)

    const [premiere, seconde] = await Promise.allSettled([
      updateOrderStatus(orderId, "delivered", acteurId),
      updateOrderStatus(orderId, "delivered", acteurId),
    ])

    expect([premiere.status, seconde.status].sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    for (const issue of [premiere, seconde]) {
      if (issue.status === "rejected") {
        expect(issue.reason).toBeInstanceOf(InvalidOrderTransitionError)
      }
    }
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    ).resolves.toMatchObject({ status: "delivered" })
    await expect(prisma.payment.count({ where: { orderId } })).resolves.toBe(1)
    await expect(
      prisma.orderStatusChange.count({
        where: { orderId, toStatus: "delivered" },
      })
    ).resolves.toBe(1)
  })

  it("rejects an unknown order", async () => {
    await expect(
      updateOrderStatus("commande-inconnue", "confirmed", acteurId)
    ).rejects.toThrow(OrderNotFoundError)
  })
})

async function createAdminOrderRecord(
  userId: string,
  items: { variantId: string; quantity: number }[],
  opts?: { createdAt?: Date; shippingFee?: number; totalPayable?: number }
): Promise<string> {
  const total = items.reduce(
    (sum, item) =>
      sum +
      50000 * item.quantity +
      (item.variantId === variantP2 ? 10000 * item.quantity : 0),
    0
  )
  const shippingFee = opts?.shippingFee ?? 3500
  const order = await prisma.order.create({
    data: {
      userId,
      cityName,
      address: ADDRESS,
      phone: PHONE,
      total,
      shippingFee,
      totalPayable: opts?.totalPayable ?? total + shippingFee,
      ...(opts?.createdAt ? { createdAt: opts.createdAt } : {}),
      items: {
        create: items.map((item) => ({
          variantId: item.variantId,
          productName: "Ordres Produit A",
          variantName: item.variantId === variantP2 ? "Premium" : "Standard",
          price: 50000 + (item.variantId === variantP2 ? 10000 : 0),
          quantity: item.quantity,
        })),
      },
    },
  })
  return order.id
}

async function setOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { status } })
}

describe("admin order reads", () => {
  it("lists all orders with status, customer, totals and date, newest first", async () => {
    const firstId = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 2 },
    ])
    const secondId = await createAdminOrderRecord(userIdB, [
      { variantId: variantP1, quantity: 1 },
    ])

    const orders = await listAdminOrders()

    expect(orders.map((order) => order.id)).toEqual([secondId, firstId])
    expect(orders[1]).toMatchObject({
      status: "pending",
      total: 100000,
      shippingFee: 3500,
      totalPayable: 103500,
      itemCount: 2,
      customerName: "Utilisateur a",
      customerEmail: email("a"),
    })
    expect(orders[0].customerName).toBe("Utilisateur b")
    expect(orders[0].itemCount).toBe(1)
  })

  it("returns a single order with item snapshots, delivery info and customer", async () => {
    const orderId = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 1 },
      { variantId: variantP2, quantity: 2 },
    ])

    const order = await getAdminOrder(orderId)

    expect(order).toMatchObject({
      id: orderId,
      status: "pending",
      cityName,
      address: ADDRESS,
      phone: PHONE,
      total: 170000,
      shippingFee: 3500,
      totalPayable: 173500,
      customerName: "Utilisateur a",
      customerEmail: email("a"),
    })
    expect(order.items).toHaveLength(2)
    expect(order.items[1]).toMatchObject({
      productName: "Ordres Produit A",
      variantName: "Premium",
      price: 60000,
      quantity: 2,
    })
  })

  it("expose le brut, le remboursé et le net, et garde Livrée une Commande intégralement remboursée", async () => {
    const orderId = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    await updateOrderStatus(orderId, "confirmed", acteurId)
    await updateOrderStatus(orderId, "shipped", acteurId)
    await updateOrderStatus(orderId, "delivered", acteurId)

    const paiement = await prisma.payment.findFirstOrThrow({
      where: { orderId },
    })
    await enregistrerRemboursement({
      paymentId: paiement.id,
      amount: paiement.amount,
      mode: "cash",
      refundedAt: new Date(),
      recordedById: acteurId,
      idempotencyKey: `orders-refund-${randomUUID()}`,
    })

    const detail = await getAdminOrder(orderId)
    expect(detail.status).toBe("delivered")
    expect(detail.montantEncaisse).toBe(paiement.amount)
    expect(detail.montantRembourse).toBe(paiement.amount)
    expect(detail.montantNet).toBe(0)

    const listed = (await listAdminOrders()).find(
      (order) => order.id === orderId
    )
    expect(listed).toMatchObject({
      montantEncaisse: paiement.amount,
      montantRembourse: paiement.amount,
      montantNet: 0,
    })
  })

  it("rejects an unknown order", async () => {
    await expect(getAdminOrder("commande-inconnue")).rejects.toThrow(
      OrderNotFoundError
    )
  })
})

describe("admin lifecycle", () => {
  it("walks an order to delivered and reflects it in the admin reads", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))

    await updateOrderStatus(order.id, "confirmed", acteurId)
    await updateOrderStatus(order.id, "shipped", acteurId)
    await updateOrderStatus(order.id, "delivered", acteurId)

    const fetched = await getAdminOrder(order.id)
    expect(fetched.status).toBe("delivered")
    const listed = await listAdminOrders()
    expect(listed.find((item) => item.id === order.id)?.status).toBe(
      "delivered"
    )
  })

  it("emails the customer on each status change", async () => {
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))

    await updateOrderStatus(order.id, "confirmed", acteurId, {
      sendOrderStatusEmail,
    })
    await updateOrderStatus(order.id, "shipped", acteurId, {
      sendOrderStatusEmail,
    })
    await updateOrderStatus(order.id, "delivered", acteurId, {
      sendOrderStatusEmail,
    })

    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(3)
    expect(sendOrderStatusEmail.mock.calls.map((call) => call[1])).toEqual([
      "confirmed",
      "shipped",
      "delivered",
    ])
    expect(sendOrderStatusEmail.mock.calls[0][0]).toMatchObject({
      userEmail: email("a"),
      orderId: order.id,
    })
  })

  it("cancels a pending order, restocks the variants and reflects it in admin reads", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, await checkoutInput(userIdA))
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP1 },
        })
      ).stock
    ).toBe(3)

    await updateOrderStatus(order.id, "cancelled", acteurId)

    expect((await getAdminOrder(order.id)).status).toBe("cancelled")
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP1 },
        })
      ).stock
    ).toBe(5)
  })
})

describe("admin orders listing filters", () => {
  const six: OrderStatus[] = [
    "pending",
    "confirmed",
    "shipped",
    "delivered",
    "cancelled",
    "returned",
  ]

  it("filters by each of the six statuses alone", async () => {
    const idsByStatus = {} as Record<OrderStatus, string>
    for (const status of six) {
      const orderId = await createAdminOrderRecord(userIdA, [
        { variantId: variantP1, quantity: 1 },
      ])
      await setOrderStatus(orderId, status)
      idsByStatus[status] = orderId
    }

    for (const status of six) {
      const result = await listAdminOrders({ statuses: [status] })
      expect(result.orders.map((order) => order.id)).toEqual([
        idsByStatus[status],
      ])
      expect(result.orders[0].status).toBe(status)
      expect(result.totalCount).toBe(1)
      expect(result.pageCount).toBe(1)
    }
  })

  it("filters by a combination of statuses and excludes the rest", async () => {
    const pendingId = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    const deliveredId = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 2 },
    ])
    const confirmedId = await createAdminOrderRecord(userIdB, [
      { variantId: variantP1, quantity: 1 },
    ])
    await setOrderStatus(deliveredId, "delivered")
    await setOrderStatus(confirmedId, "confirmed")

    const result = await listAdminOrders({ statuses: ["confirmed", "pending"] })

    expect(result.orders.map((order) => order.id)).toEqual([
      confirmedId,
      pendingId,
    ])
    expect(result.totalCount).toBe(2)
  })

  it("searches case-insensitively by customer name and by email", async () => {
    const orderA = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    const orderB = await createAdminOrderRecord(userIdB, [
      { variantId: variantP1, quantity: 1 },
    ])

    const byName = await listAdminOrders({ q: "TEUR A" })
    expect(byName.orders.map((order) => order.id)).toEqual([orderA])
    expect(byName.totalCount).toBe(1)

    const byEmail = await listAdminOrders({ q: `-B@TEST.MA` })
    expect(byEmail.orders.map((order) => order.id)).toEqual([orderB])
    expect(byEmail.totalCount).toBe(1)

    const byRunId = await listAdminOrders({ q: runId.toUpperCase() })
    expect([...byRunId.orders.map((order) => order.id)].sort()).toEqual(
      [orderA, orderB].sort()
    )

    const noMatch = await listAdminOrders({ q: "zebre-inconnu" })
    expect(noMatch.orders).toEqual([])
    expect(noMatch.totalCount).toBe(0)
    expect(noMatch.pageCount).toBe(0)
  })
})

describe("admin orders listing sort", () => {
  it("sorts by date ascending and descending, defaulting to newest first", async () => {
    const olderId = await createAdminOrderRecord(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      {
        createdAt: new Date("2026-03-01T10:00:00Z"),
      }
    )
    const middleId = await createAdminOrderRecord(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      {
        createdAt: new Date("2026-03-02T10:00:00Z"),
      }
    )
    const newerId = await createAdminOrderRecord(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      {
        createdAt: new Date("2026-03-03T10:00:00Z"),
      }
    )

    const defaultSort = await listAdminOrders()
    expect(defaultSort.map((order) => order.id)).toEqual([
      newerId,
      middleId,
      olderId,
    ])

    const desc = await listAdminOrders({ tri: "date", sens: "desc" })
    expect(desc.orders.map((order) => order.id)).toEqual([
      newerId,
      middleId,
      olderId,
    ])

    const asc = await listAdminOrders({ tri: "date", sens: "asc" })
    expect(asc.orders.map((order) => order.id)).toEqual([
      olderId,
      middleId,
      newerId,
    ])
  })

  it("sorts by Total à payer ascending and descending", async () => {
    const smallId = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    const mediumId = await createAdminOrderRecord(userIdA, [
      { variantId: variantP1, quantity: 2 },
    ])
    const largeId = await createAdminOrderRecord(
      userIdA,
      [{ variantId: variantP2, quantity: 2 }],
      {
        createdAt: new Date("2026-03-01T10:00:00Z"),
      }
    )
    expect(largeId).toBeTruthy()

    const asc = await listAdminOrders({ tri: "total", sens: "asc" })
    expect(asc.orders.map((order) => order.id)).toEqual([
      smallId,
      mediumId,
      largeId,
    ])

    const desc = await listAdminOrders({ tri: "total", sens: "desc" })
    expect(desc.orders.map((order) => order.id)).toEqual([
      largeId,
      mediumId,
      smallId,
    ])
  })

  it("orders by Total à payer when Sous-totaux tie and Frais de livraison differ", async () => {
    const cheapDeliveryId = await createAdminOrderRecord(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      { shippingFee: 3500 }
    )
    const priceyDeliveryId = await createAdminOrderRecord(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      { shippingFee: 5000 }
    )

    const cheap = await getAdminOrder(cheapDeliveryId)
    const pricey = await getAdminOrder(priceyDeliveryId)
    expect(cheap.total).toBe(pricey.total)
    expect(cheap.totalPayable).toBe(cheap.total + 3500)
    expect(pricey.totalPayable).toBe(pricey.total + 5000)

    const asc = await listAdminOrders({ tri: "total", sens: "asc" })
    expect(asc.orders.map((order) => order.id)).toEqual([
      cheapDeliveryId,
      priceyDeliveryId,
    ])

    const desc = await listAdminOrders({ tri: "total", sens: "desc" })
    expect(desc.orders.map((order) => order.id)).toEqual([
      priceyDeliveryId,
      cheapDeliveryId,
    ])
  })
})

describe("admin orders listing pagination", () => {
  it("switches page size, keeps counts stable while pages slide and floors out-of-range pages", async () => {
    const createdAsc: string[] = []
    for (let index = 0; index < 25; index += 1) {
      const orderId = await createAdminOrderRecord(
        userIdA,
        [{ variantId: variantP1, quantity: 1 }],
        {
          createdAt: new Date(Date.UTC(2026, 0, 1, 9, index)),
        }
      )
      createdAsc.push(orderId)
    }
    const expectedDesc = [...createdAsc].reverse()

    for (const pageSize of [10, 20, 50] as const) {
      const pageCount = Math.ceil(25 / pageSize)
      let collected: string[] = []
      for (let page = 1; page <= pageCount; page += 1) {
        const result = await listAdminOrders({ page, pageSize })
        expect(result.pageCount).toBe(pageCount)
        expect(result.totalCount).toBe(25)
        collected = [...collected, ...result.orders.map((order) => order.id)]
      }
      expect(collected).toEqual(expectedDesc)
    }

    const beyondRange = await listAdminOrders({ page: 99, pageSize: 10 })
    expect(beyondRange.orders).toEqual([])
    expect(beyondRange.totalCount).toBe(25)
    expect(beyondRange.pageCount).toBe(3)
  })
})
