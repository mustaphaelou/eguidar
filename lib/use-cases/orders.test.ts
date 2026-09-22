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
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"
import type { OrderEmailSnapshot } from "@/lib/emails"
import { totalPayable } from "@/lib/money"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  CheckoutValidationError,
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

function checkoutInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    cityId,
    address: ADDRESS,
    phone: PHONE,
    ...overrides,
  }
}

describe("order placement", () => {
  it("snapshots the cart into the order, decrements stock and empties the cart", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 2)

    const order = await placeOrder(userIdA, checkoutInput())

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

    await placeOrder(userIdA, checkoutInput())

    const cartA = await lirePanierClient(userIdA)
    expect(cartA.lines).toHaveLength(0)
    const itemB = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdB, variantId: variantP4 },
    })
    expect(itemB.quantity).toBe(1)
  })

  it("sends the order placed email with the snapshot", async () => {
    const sendOrderPlacedEmail = vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    )
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)

    const order = await placeOrder(userIdA, checkoutInput(), {
      sendOrderPlacedEmail,
    })

    expect(sendOrderPlacedEmail).toHaveBeenCalledOnce()
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

  it("invalidates the order cache post-commit", async () => {
    const invalidateCommande = vi.fn<(orderId: string) => void>()
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)

    const order = await placeOrder(userIdA, checkoutInput(), {
      invalidateCommande,
    })

    expect(invalidateCommande).toHaveBeenCalledOnce()
    expect(invalidateCommande).toHaveBeenCalledWith(order.id)
  })

  it("still places the order when email dispatch fails", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)

    const order = await verifierFrontiereBestEffort(
      "e-mail de confirmation",
      (effetQuiEchoue) =>
        placeOrder(userIdA, checkoutInput(), {
          sendOrderPlacedEmail: effetQuiEchoue,
        })
    )

    expect(order.id).toBeTruthy()
    expect(order.total).toBe(30000)
    const cart = await lirePanierClient(userIdA)
    expect(cart.lines).toHaveLength(0)
  })

  it("still places the order when cache invalidation fails", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)

    const order = await verifierFrontiereBestEffort(
      "invalidation du cache",
      (effetQuiEchoue) =>
        placeOrder(userIdA, checkoutInput(), {
          invalidateCommande: effetQuiEchoue,
        })
    )

    expect(order.id).toBeTruthy()
  })

  it("charges the city fee below the free-shipping threshold", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, checkoutInput())
    expect(order.shippingFee).toBe(3500)
  })

  it("persists the Devis-computed fee and total", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const cart = await lirePanierClient(userIdA)
    const chargé = await chargerDevis(cart)
    const selection = selectionValidee(projeterDevis(chargé, cityId).selection)

    const order = await placeOrder(userIdA, checkoutInput())

    expect(order.cityName).toBe(selection.ville.name)
    expect(order.shippingFee).toBe(selection.devis.shippingFee)
    expect(order.total).toBe(cart.subtotal)
    expect(order.total + order.shippingFee).toBe(selection.devis.total)
  })

  it("offers free shipping above the threshold", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 4)
    const order = await placeOrder(userIdA, checkoutInput())
    expect(order.total).toBe(400000)
    expect(order.shippingFee).toBe(0)
  })

  it("offers free shipping below the threshold when every item is flagged", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP3, 1)
    const order = await placeOrder(userIdA, checkoutInput())
    expect(order.shippingFee).toBe(0)
  })

  it("offers free shipping below the threshold when at least one item is flagged", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP3, 1)
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, checkoutInput())
    expect(order.total).toBe(80000)
    expect(order.shippingFee).toBe(0)
  })

  it("blocks out-of-stock variants at checkout without creating anything", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP2, 2)

    try {
      await placeOrder(userIdA, checkoutInput())
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

  it("rolls back the whole order when one line goes out of stock mid-placement", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 1)
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP2, 2)
    await prisma.productVariant.update({
      where: { id: variantP2 },
      data: { stock: { set: 1 } },
    })

    await expect(placeOrder(userIdA, checkoutInput())).rejects.toThrow(
      OutOfStockError
    )

    const stockP1 = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP1 },
    })
    expect(stockP1.stock).toBe(5)
    const orderCount = await prisma.order.count({ where: { userId: userIdA } })
    expect(orderCount).toBe(0)
  })

  it("allows only one order to take the last unit under concurrency", async () => {
    commeClient(userIdB)
    await ajouterArticleAuPanier(variantP2, 1)
    commeClient(userIdC)
    await ajouterArticleAuPanier(variantP2, 1)

    const [first, second] = await Promise.allSettled([
      placeOrder(userIdB, checkoutInput()),
      placeOrder(userIdC, checkoutInput()),
    ])

    expect([first.status, second.status].sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    const rejected = [first, second].find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    expect(rejected!.reason).toBeInstanceOf(OutOfStockError)
    const stock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP2 },
    })
    expect(stock.stock).toBe(0)
    const orderCount = await prisma.order.count({
      where: { userId: { in: [userIdB, userIdC] } },
    })
    expect(orderCount).toBe(1)
  })

  it("rejects an empty cart", async () => {
    await expect(placeOrder(userIdA, checkoutInput())).rejects.toThrow(
      EmptyCartError
    )
  })

  it("rejects an unknown delivery city", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    await expect(
      placeOrder(userIdA, checkoutInput({ cityId: "ville-inconnue" }))
    ).rejects.toThrow(DeliveryCityNotFoundError)
  })

  it("rejects invalid address, phone and missing city", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    await verifierRefusValidation(CheckoutValidationError, () =>
      placeOrder(userIdA, checkoutInput({ address: "X" }))
    )
    await verifierRefusValidation(CheckoutValidationError, () =>
      placeOrder(userIdA, checkoutInput({ phone: "123" }))
    )
    await verifierRefusValidation(CheckoutValidationError, () =>
      placeOrder(userIdA, checkoutInput({ cityId: "" }))
    )
  })
})

describe("order reads", () => {
  it("returns an order with its items to its owner", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, checkoutInput())

    const fetched = await getOrder(userIdA, order.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.status).toBe("pending")
    expect(fetched!.totalPayable).toBe(33500)
    expect(fetched!.items).toHaveLength(1)
  })

  it("hides an order from another user", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, checkoutInput())

    await expect(getOrder(userIdB, order.id)).resolves.toBeNull()
  })

  it("lists only the user's orders, newest first", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const first = await placeOrder(userIdA, checkoutInput())
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const second = await placeOrder(userIdA, checkoutInput())
    commeClient(userIdB)
    await ajouterArticleAuPanier(variantP3, 1)
    await placeOrder(userIdB, checkoutInput())

    const orders = await listUserOrders(userIdA)

    expect(orders.map((order) => order.id)).toEqual([second.id, first.id])
    expect(orders[0]).toMatchObject({
      status: "pending",
      total: 30000,
      shippingFee: 3500,
      totalPayable: 33500,
    })
    expect(orders[0].itemCount).toBe(1)
  })
})

describe("order status transitions", () => {
  async function placeSmallOrder(userId: string): Promise<string> {
    commeClient(userId)
    await ajouterArticleAuPanier(variantP4, 2)
    const order = await placeOrder(userId, checkoutInput())
    return order.id
  }

  it("walks pending → confirmed → shipped → delivered, emailing each change", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP4, 1)
    const order = await placeOrder(userIdA, checkoutInput())
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )

    await updateOrderStatus(order.id, "confirmed", { sendOrderStatusEmail })
    await updateOrderStatus(order.id, "shipped", { sendOrderStatusEmail })
    await updateOrderStatus(order.id, "delivered", { sendOrderStatusEmail })

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

    await updateOrderStatus(orderId, "cancelled", { sendOrderStatusEmail })

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

  it("invalidates the order cache post-commit", async () => {
    const orderId = await placeSmallOrder(userIdA)
    const invalidateCommande = vi.fn<(orderId: string) => void>()

    await updateOrderStatus(orderId, "confirmed", { invalidateCommande })

    expect(invalidateCommande).toHaveBeenCalledOnce()
    expect(invalidateCommande).toHaveBeenCalledWith(orderId)
  })

  it("still updates the status when email dispatch fails", async () => {
    const orderId = await placeSmallOrder(userIdA)

    const updated = await verifierFrontiereBestEffort(
      "e-mail de statut",
      (effetQuiEchoue) =>
        updateOrderStatus(orderId, "confirmed", {
          sendOrderStatusEmail: effetQuiEchoue,
        })
    )

    expect(updated.status).toBe("confirmed")
    const fetched = await getOrder(userIdA, orderId)
    expect(fetched!.status).toBe("confirmed")
  })

  it("still updates the status when cache invalidation fails", async () => {
    const orderId = await placeSmallOrder(userIdA)

    const updated = await verifierFrontiereBestEffort(
      "invalidation du cache",
      (effetQuiEchoue) =>
        updateOrderStatus(orderId, "confirmed", {
          invalidateCommande: effetQuiEchoue,
        })
    )

    expect(updated.status).toBe("confirmed")
  })

  it("returns a delivered order and restocks the variants", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed")
    await updateOrderStatus(orderId, "shipped")
    await updateOrderStatus(orderId, "delivered")

    await updateOrderStatus(orderId, "returned")

    const order = await getOrder(userIdA, orderId)
    expect(order!.status).toBe("returned")
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(2)
  })

  it("rejects invalid transitions", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed")
    await updateOrderStatus(orderId, "shipped")

    await expect(updateOrderStatus(orderId, "cancelled")).rejects.toThrow(
      InvalidOrderTransitionError
    )
    await expect(updateOrderStatus(orderId, "confirmed")).rejects.toThrow(
      InvalidOrderTransitionError
    )
  })

  it("rejects skipping a step", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await expect(updateOrderStatus(orderId, "delivered")).rejects.toThrow(
      InvalidOrderTransitionError
    )
  })

  it("restocks exactly once when a double cancel is attempted", async () => {
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "cancelled", { sendOrderStatusEmail })

    await expect(
      updateOrderStatus(orderId, "cancelled", { sendOrderStatusEmail })
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
    const orderId = await placeSmallOrder(userIdA)

    const [first, second] = await Promise.allSettled([
      updateOrderStatus(orderId, "cancelled"),
      updateOrderStatus(orderId, "cancelled"),
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
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(2)
  })

  it("rejects an unknown order", async () => {
    await expect(
      updateOrderStatus("commande-inconnue", "confirmed")
    ).rejects.toThrow(OrderNotFoundError)
  })
})

async function createAdminOrderRecord(
  userId: string,
  items: { variantId: string; quantity: number }[],
  opts?: { createdAt?: Date; shippingFee?: number }
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
      totalPayable: totalPayable({ total, shippingFee }),
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
    const order = await placeOrder(userIdA, checkoutInput())

    await updateOrderStatus(order.id, "confirmed")
    await updateOrderStatus(order.id, "shipped")
    await updateOrderStatus(order.id, "delivered")

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
    const order = await placeOrder(userIdA, checkoutInput())

    await updateOrderStatus(order.id, "confirmed", { sendOrderStatusEmail })
    await updateOrderStatus(order.id, "shipped", { sendOrderStatusEmail })
    await updateOrderStatus(order.id, "delivered", { sendOrderStatusEmail })

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

  it("invalidates the order cache post-commit", async () => {
    const invalidateCommande = vi.fn<(orderId: string) => void>()
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, checkoutInput())

    await updateOrderStatus(order.id, "confirmed", { invalidateCommande })

    expect(invalidateCommande).toHaveBeenCalledOnce()
    expect(invalidateCommande).toHaveBeenCalledWith(order.id)
  })

  it("cancels a pending order, restocks the variants and reflects it in admin reads", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, checkoutInput())
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP1 },
        })
      ).stock
    ).toBe(3)

    await updateOrderStatus(order.id, "cancelled")

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
