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
import { lirePanier } from "@/lib/panier"
import { ajouterArticleAuPanier } from "@/lib/panier"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { OrderEffects } from "@/lib/use-cases/order-effects"
import {
  EmptyCartError,
  getOrder,
  InvalidOrderTransitionError,
  listUserOrders,
  OrderNotFoundError,
  OutOfStockError,
  placeOrder,
  updateOrderStatus,
  type CheckoutInput,
} from "@/lib/use-cases/orders"

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

function makeEffects(): OrderEffects & {
  sendOrderPlacedEmail: ReturnType<typeof vi.fn>
  sendOrderStatusEmail: ReturnType<typeof vi.fn>
} {
  return {
    sendOrderPlacedEmail: vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    ),
    sendOrderStatusEmail: vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    ),
  }
}

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
    data: { name: cityName, fee: 3500 },
  })
  cityId = city.id
})

beforeEach(async () => {
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
    const effects = makeEffects()
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      2
    )

    const order = await placeOrder(userIdA, checkoutInput(), effects)

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
    const cart = await lirePanier({ role: "client", compteId: userIdA })
    expect(cart.lines).toHaveLength(0)
  })

  it("sends the order placed email with the snapshot", async () => {
    const effects = makeEffects()
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )

    const order = await placeOrder(userIdA, checkoutInput(), effects)

    expect(effects.sendOrderPlacedEmail).toHaveBeenCalledOnce()
    const snapshot = effects.sendOrderPlacedEmail.mock
      .calls[0][0] as OrderEmailSnapshot
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
    expect(snapshot.cityName).toBe(cityName)
    expect(effects.sendOrderStatusEmail).not.toHaveBeenCalled()
  })

  it("charges the city fee below the free-shipping threshold", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    const order = await placeOrder(userIdA, checkoutInput(), makeEffects())
    expect(order.shippingFee).toBe(3500)
  })

  it("offers free shipping above the threshold", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP1,
      4
    )
    const order = await placeOrder(userIdA, checkoutInput(), makeEffects())
    expect(order.total).toBe(400000)
    expect(order.shippingFee).toBe(0)
  })

  it("offers free shipping below the threshold when every item is flagged", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP3,
      1
    )
    const order = await placeOrder(userIdA, checkoutInput(), makeEffects())
    expect(order.shippingFee).toBe(0)
  })

  it("offers free shipping below the threshold when at least one item is flagged", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP3,
      1
    )
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    const order = await placeOrder(userIdA, checkoutInput(), makeEffects())
    expect(order.total).toBe(80000)
    expect(order.shippingFee).toBe(0)
  })

  it("blocks out-of-stock variants at checkout without creating anything", async () => {
    const effects = makeEffects()
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP2,
      2
    )

    try {
      await placeOrder(userIdA, checkoutInput(), effects)
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
    const cart = await lirePanier({ role: "client", compteId: userIdA })
    expect(cart.lines).toHaveLength(1)
    const orderCount = await prisma.order.count({ where: { userId: userIdA } })
    expect(orderCount).toBe(0)
    expect(effects.sendOrderPlacedEmail).not.toHaveBeenCalled()
  })

  it("rolls back the whole order when one line goes out of stock mid-placement", async () => {
    const effects = makeEffects()
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP1,
      1
    )
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP2,
      2
    )
    await prisma.productVariant.update({
      where: { id: variantP2 },
      data: { stock: { set: 1 } },
    })

    await expect(placeOrder(userIdA, checkoutInput(), effects)).rejects.toThrow(
      OutOfStockError
    )

    const stockP1 = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantP1 },
    })
    expect(stockP1.stock).toBe(5)
    const orderCount = await prisma.order.count({ where: { userId: userIdA } })
    expect(orderCount).toBe(0)
    expect(effects.sendOrderPlacedEmail).not.toHaveBeenCalled()
  })

  it("allows only one order to take the last unit under concurrency", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdB },
      variantP2,
      1
    )
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdC },
      variantP2,
      1
    )

    const [first, second] = await Promise.allSettled([
      placeOrder(userIdB, checkoutInput(), makeEffects()),
      placeOrder(userIdC, checkoutInput(), makeEffects()),
    ])

    expect(first.status).toBe("fulfilled")
    expect(second.status).toBe("rejected")
    if (second.status === "rejected") {
      expect(second.reason).toBeInstanceOf(OutOfStockError)
    }
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
    await expect(
      placeOrder(userIdA, checkoutInput(), makeEffects())
    ).rejects.toThrow(EmptyCartError)
  })

  it("rejects an unknown delivery city", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    await expect(
      placeOrder(
        userIdA,
        checkoutInput({ cityId: "ville-inconnue" }),
        makeEffects()
      )
    ).rejects.toThrow(DeliveryCityNotFoundError)
  })

  it("rejects invalid address, phone and missing city", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    await expect(
      placeOrder(userIdA, checkoutInput({ address: "X" }), makeEffects())
    ).rejects.toThrow(/invalides/)
    await expect(
      placeOrder(userIdA, checkoutInput({ phone: "123" }), makeEffects())
    ).rejects.toThrow(/invalides/)
    await expect(
      placeOrder(userIdA, checkoutInput({ cityId: "" }), makeEffects())
    ).rejects.toThrow(/invalides/)
  })
})

describe("order reads", () => {
  it("returns an order with its items to its owner", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    const order = await placeOrder(userIdA, checkoutInput(), makeEffects())

    const fetched = await getOrder(userIdA, order.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.status).toBe("pending")
    expect(fetched!.items).toHaveLength(1)
  })

  it("hides an order from another user", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    const order = await placeOrder(userIdA, checkoutInput(), makeEffects())

    await expect(getOrder(userIdB, order.id)).resolves.toBeNull()
  })

  it("lists only the user's orders, newest first", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    const first = await placeOrder(userIdA, checkoutInput(), makeEffects())
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    const second = await placeOrder(userIdA, checkoutInput(), makeEffects())
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdB },
      variantP3,
      1
    )
    await placeOrder(userIdB, checkoutInput(), makeEffects())

    const orders = await listUserOrders(userIdA)

    expect(orders.map((order) => order.id)).toEqual([second.id, first.id])
    expect(orders[0]).toMatchObject({
      status: "pending",
      total: 30000,
      shippingFee: 3500,
    })
    expect(orders[0].itemCount).toBe(1)
  })
})

describe("order status transitions", () => {
  async function placeSmallOrder(userId: string): Promise<string> {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userId },
      variantP4,
      2
    )
    const order = await placeOrder(userId, checkoutInput(), makeEffects())
    return order.id
  }

  it("walks pending → confirmed → shipped → delivered, emailing each change", async () => {
    const effects = makeEffects()
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP4,
      1
    )
    const order = await placeOrder(userIdA, checkoutInput(), effects)
    effects.sendOrderStatusEmail.mockClear()

    await updateOrderStatus(order.id, "confirmed", effects)
    await updateOrderStatus(order.id, "shipped", effects)
    await updateOrderStatus(order.id, "delivered", effects)

    const final = await getOrder(userIdA, order.id)
    expect(final!.status).toBe("delivered")
    expect(effects.sendOrderStatusEmail).toHaveBeenCalledTimes(3)
    expect(
      effects.sendOrderStatusEmail.mock.calls.map((call) => call[1])
    ).toEqual(["confirmed", "shipped", "delivered"])
    const lastSnapshot = effects.sendOrderStatusEmail.mock
      .calls[2][0] as OrderEmailSnapshot
    expect(lastSnapshot.orderId).toBe(order.id)
    expect(lastSnapshot.userEmail).toBe(email("a"))
  })

  it("cancels a pending order and restocks the variants", async () => {
    const effects = makeEffects()
    const orderId = await placeSmallOrder(userIdA)
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(0)

    await updateOrderStatus(orderId, "cancelled", effects)

    const order = await getOrder(userIdA, orderId)
    expect(order!.status).toBe("cancelled")
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(2)
    expect(effects.sendOrderStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orderId }),
      "cancelled"
    )
  })

  it("returns a delivered order and restocks the variants", async () => {
    const effects = makeEffects()
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "confirmed", effects)
    await updateOrderStatus(orderId, "shipped", effects)
    await updateOrderStatus(orderId, "delivered", effects)

    await updateOrderStatus(orderId, "returned", effects)

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
    await updateOrderStatus(orderId, "confirmed", makeEffects())
    await updateOrderStatus(orderId, "shipped", makeEffects())

    await expect(
      updateOrderStatus(orderId, "cancelled", makeEffects())
    ).rejects.toThrow(InvalidOrderTransitionError)
    await expect(
      updateOrderStatus(orderId, "confirmed", makeEffects())
    ).rejects.toThrow(InvalidOrderTransitionError)
  })

  it("rejects skipping a step", async () => {
    const orderId = await placeSmallOrder(userIdA)
    await expect(
      updateOrderStatus(orderId, "delivered", makeEffects())
    ).rejects.toThrow(InvalidOrderTransitionError)
  })

  it("restocks exactly once when a double cancel is attempted", async () => {
    const effects = makeEffects()
    const orderId = await placeSmallOrder(userIdA)
    await updateOrderStatus(orderId, "cancelled", effects)

    await expect(
      updateOrderStatus(orderId, "cancelled", effects)
    ).rejects.toThrow(InvalidOrderTransitionError)

    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP4 },
        })
      ).stock
    ).toBe(2)
    expect(effects.sendOrderStatusEmail).toHaveBeenCalledTimes(1)
  })

  it("restocks exactly once when two cancels race", async () => {
    const orderId = await placeSmallOrder(userIdA)

    const [first, second] = await Promise.allSettled([
      updateOrderStatus(orderId, "cancelled", makeEffects()),
      updateOrderStatus(orderId, "cancelled", makeEffects()),
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
      updateOrderStatus("commande-inconnue", "confirmed", makeEffects())
    ).rejects.toThrow(OrderNotFoundError)
  })
})
