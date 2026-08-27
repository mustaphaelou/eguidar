import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import { lirePanier } from "@/lib/panier"
import { addToCart } from "@/lib/use-cases/cart"
import {
  CityNameConflictError,
  CityNotFoundError,
  CityValidationError,
  computeCityQuote,
  computeCityQuotes,
  computeShippingFee,
  createCity,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
  deleteCity,
  getFreeShippingThreshold,
  getShippingSettings,
  listAdminCities,
  listDeliveryCities,
  quotePanier,
  ShippingValidationError,
  updateCity,
  updateShippingSettings,
  type DeliveryCityOption,
  type LivraisonEffects,
  type PricingInput,
} from "@/lib/use-cases/livraison"

const runId = randomUUID().slice(0, 8)
const cityName = (suffix: string) => `Ville Livraison ${runId} ${suffix}`

const city = (id: string, name: string, fee: number): DeliveryCityOption => ({
  id,
  name,
  fee,
})

const pricing = (subtotal: number, anyFreeShippingItem = false): PricingInput => ({
  subtotal,
  anyFreeShippingItem,
})

function makeEffects(): LivraisonEffects {
  return { revalidateShipping: vi.fn() }
}

describe("frais de livraison rule", () => {
  it("charges the city fee below the threshold when nothing is free-shipping", () => {
    expect(
      computeShippingFee({
        subtotal: 50000,
        cityFee: 3500,
        freeShippingThreshold: 100000,
        anyFreeShippingItem: false,
      })
    ).toBe(3500)
  })

  it("is free exactly at the threshold", () => {
    expect(
      computeShippingFee({
        subtotal: 100000,
        cityFee: 3500,
        freeShippingThreshold: 100000,
        anyFreeShippingItem: false,
      })
    ).toBe(0)
  })

  it("is free above the threshold", () => {
    expect(
      computeShippingFee({
        subtotal: 150000,
        cityFee: 3500,
        freeShippingThreshold: 100000,
        anyFreeShippingItem: false,
      })
    ).toBe(0)
  })

  it("is free below the threshold when every item is free-shipping flagged", () => {
    expect(
      computeShippingFee({
        subtotal: 50000,
        cityFee: 3500,
        freeShippingThreshold: 100000,
        anyFreeShippingItem: true,
      })
    ).toBe(0)
  })

  it("is free below the threshold when at least one item is free-shipping flagged", () => {
    expect(
      computeShippingFee({
        subtotal: 80000,
        cityFee: 3500,
        freeShippingThreshold: 100000,
        anyFreeShippingItem: true,
      })
    ).toBe(0)
  })

  it("is free for a zero subtotal (no city fee on an empty cart)", () => {
    expect(
      computeShippingFee({
        subtotal: 0,
        cityFee: 3500,
        freeShippingThreshold: 100000,
        anyFreeShippingItem: true,
      })
    ).toBe(0)
  })
})

describe("pure quote operations", () => {
  describe("computeCityQuote", () => {
    it("quotes the city fee below the threshold", () => {
      expect(computeCityQuote(city("c1", "Casablanca", 3500), pricing(50000), 100000)).toEqual({
        subtotal: 50000,
        shippingFee: 3500,
        total: 53500,
      })
    })

    it("quotes free shipping exactly at the threshold", () => {
      expect(computeCityQuote(city("c1", "Casablanca", 3500), pricing(100000), 100000)).toEqual({
        subtotal: 100000,
        shippingFee: 0,
        total: 100000,
      })
    })

    it("quotes free shipping above the threshold", () => {
      expect(computeCityQuote(city("c1", "Casablanca", 3500), pricing(150000), 100000)).toEqual({
        subtotal: 150000,
        shippingFee: 0,
        total: 150000,
      })
    })

    it("quotes free shipping below the threshold with a free-shipping item", () => {
      expect(
        computeCityQuote(city("c1", "Casablanca", 3500), pricing(50000, true), 100000)
      ).toEqual({ subtotal: 50000, shippingFee: 0, total: 50000 })
    })
  })

  describe("computeCityQuotes", () => {
    it("quotes each city with its own fee below the threshold", () => {
      const cities = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

      expect(computeCityQuotes(cities, pricing(50000), 100000)).toEqual({
        c1: { subtotal: 50000, shippingFee: 3500, total: 53500 },
        c2: { subtotal: 50000, shippingFee: 5000, total: 55000 },
      })
    })

    it("quotes every city free above the threshold", () => {
      const cities = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

      expect(computeCityQuotes(cities, pricing(150000), 100000)).toEqual({
        c1: { subtotal: 150000, shippingFee: 0, total: 150000 },
        c2: { subtotal: 150000, shippingFee: 0, total: 150000 },
      })
    })

    it("quotes every city free with a free-shipping item below the threshold", () => {
      const cities = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

      expect(computeCityQuotes(cities, pricing(50000, true), 100000)).toEqual({
        c1: { subtotal: 50000, shippingFee: 0, total: 50000 },
        c2: { subtotal: 50000, shippingFee: 0, total: 50000 },
      })
    })

    it("returns an empty map for no cities", () => {
      expect(computeCityQuotes([], pricing(50000), 100000)).toEqual({})
    })
  })
})

describe("delivery reads", () => {
  beforeEach(async () => {
    await prisma.deliveryCity.deleteMany({ where: { name: { startsWith: `Ville Livraison ${runId}` } } })
  })

  afterAll(async () => {
    await prisma.deliveryCity.deleteMany({ where: { name: { startsWith: `Ville Livraison ${runId}` } } })
    await prisma.$disconnect()
  })

  it("lists delivery cities ordered by name", async () => {
    await prisma.deliveryCity.create({ data: { name: cityName("b"), fee: 5000 } })
    await prisma.deliveryCity.create({ data: { name: cityName("a"), fee: 3500 } })

    const cities = await listDeliveryCities()

    const relevant = cities.filter((candidate) => candidate.name.startsWith(`Ville Livraison ${runId}`))
    expect(relevant.map((candidate) => candidate.name)).toEqual([cityName("a"), cityName("b")])
    expect(relevant[0]).toEqual({ id: relevant[0].id, name: cityName("a"), fee: 3500 })
  })
})

describe("free-shipping threshold read", () => {
  afterAll(async () => {
    await prisma.shippingSettings.upsert({
      where: { id: "default" },
      update: { freeShippingThreshold: 100000 },
      create: { id: "default", freeShippingThreshold: 100000 },
    })
  })

  it("returns the stored threshold", async () => {
    await prisma.shippingSettings.upsert({
      where: { id: "default" },
      update: { freeShippingThreshold: 250000 },
      create: { id: "default", freeShippingThreshold: 250000 },
    })

    await expect(getFreeShippingThreshold()).resolves.toBe(250000)
  })

  it("falls back to the default threshold when no settings row exists", async () => {
    await prisma.shippingSettings.deleteMany({ where: { id: "default" } })

    await expect(getFreeShippingThreshold()).resolves.toBe(DEFAULT_FREE_SHIPPING_THRESHOLD)

    await prisma.shippingSettings.create({
      data: { id: "default", freeShippingThreshold: 100000 },
    })
  })
})

describe("admin city writes", () => {
  beforeEach(async () => {
    await prisma.deliveryCity.deleteMany({ where: { name: { startsWith: `Ville Livraison ${runId}` } } })
  })

  afterAll(async () => {
    await prisma.deliveryCity.deleteMany({ where: { name: { startsWith: `Ville Livraison ${runId}` } } })
  })

  it("creates a city with its flat fee and revalidates shipping", async () => {
    const effects = makeEffects()

    const created = await createCity({ name: cityName("creer"), fee: 3500 }, effects)

    expect(created.id).toBeTruthy()
    const persisted = await prisma.deliveryCity.findUniqueOrThrow({ where: { id: created.id } })
    expect(persisted.name).toBe(cityName("creer"))
    expect(persisted.fee).toBe(3500)
    expect(effects.revalidateShipping).toHaveBeenCalledOnce()
  })

  it("rejects a negative city fee", async () => {
    await expect(createCity({ name: cityName("negatif"), fee: -100 }, makeEffects())).rejects.toThrow(
      CityValidationError
    )
  })

  it("accepts a zero fee city", async () => {
    const created = await createCity({ name: cityName("gratuite"), fee: 0 }, makeEffects())
    expect(created.fee).toBe(0)
  })

  it("rejects a duplicate city name and persists nothing", async () => {
    const effects = makeEffects()
    await createCity({ name: cityName("dupliquee"), fee: 3000 }, effects)

    await expect(createCity({ name: cityName("dupliquee"), fee: 4000 }, makeEffects())).rejects.toThrow(
      CityNameConflictError
    )

    const count = await prisma.deliveryCity.count({ where: { name: cityName("dupliquee") } })
    expect(count).toBe(1)
  })

  it("rejects an empty city name", async () => {
    await expect(createCity({ name: " ", fee: 3000 }, makeEffects())).rejects.toThrow(
      CityValidationError
    )
  })

  it("updates a city and revalidates shipping", async () => {
    const effects = makeEffects()
    const created = await createCity({ name: cityName("maj"), fee: 3000 }, makeEffects())

    const updated = await updateCity(created.id, { name: cityName("maj"), fee: 4500 }, effects)

    expect(updated.fee).toBe(4500)
    const persisted = await prisma.deliveryCity.findUniqueOrThrow({ where: { id: created.id } })
    expect(persisted.fee).toBe(4500)
    expect(effects.revalidateShipping).toHaveBeenCalled()
  })

  it("rejects updating a city to another city's name", async () => {
    const first = await createCity({ name: cityName("a"), fee: 3000 }, makeEffects())
    await createCity({ name: cityName("b"), fee: 3000 }, makeEffects())

    await expect(
      updateCity(first.id, { name: cityName("b"), fee: 3000 }, makeEffects())
    ).rejects.toThrow(CityNameConflictError)
  })

  it("deletes a city and revalidates shipping", async () => {
    const effects = makeEffects()
    const created = await createCity({ name: cityName("suppression"), fee: 3000 }, makeEffects())

    await deleteCity(created.id, effects)

    await expect(prisma.deliveryCity.findUnique({ where: { id: created.id } })).resolves.toBeNull()
    expect(effects.revalidateShipping).toHaveBeenCalled()
  })

  it("throws CityNotFoundError for unknown cities", async () => {
    await expect(updateCity("unknown-id", { name: "X", fee: 1 }, makeEffects())).rejects.toThrow(
      CityNotFoundError
    )
    await expect(deleteCity("unknown-id", makeEffects())).rejects.toThrow(CityNotFoundError)
  })

  it("lists admin cities ordered by name", async () => {
    await prisma.deliveryCity.create({ data: { name: cityName("b"), fee: 5000 } })
    await prisma.deliveryCity.create({ data: { name: cityName("a"), fee: 3500 } })

    const cities = await listAdminCities()

    const relevant = cities.filter((candidate) => candidate.name.startsWith(`Ville Livraison ${runId}`))
    expect(relevant.map((candidate) => candidate.name)).toEqual([cityName("a"), cityName("b")])
  })
})

describe("admin shipping settings writes", () => {
  afterAll(async () => {
    await prisma.shippingSettings.upsert({
      where: { id: "default" },
      update: { freeShippingThreshold: 100000 },
      create: { id: "default", freeShippingThreshold: 100000 },
    })
    await prisma.$disconnect()
  })

  it("updates the free-shipping threshold and revalidates shipping", async () => {
    const effects = makeEffects()

    await updateShippingSettings({ freeShippingThreshold: 250000 }, effects)

    const settings = await prisma.shippingSettings.findUniqueOrThrow({ where: { id: "default" } })
    expect(settings.freeShippingThreshold).toBe(250000)
    expect(effects.revalidateShipping).toHaveBeenCalledOnce()
  })

  it("rejects a zero or negative threshold", async () => {
    await expect(
      updateShippingSettings({ freeShippingThreshold: 0 }, makeEffects())
    ).rejects.toThrow(ShippingValidationError)
    await expect(
      updateShippingSettings({ freeShippingThreshold: -100 }, makeEffects())
    ).rejects.toThrow(ShippingValidationError)
  })

  it("rejects a non-integer threshold", async () => {
    await expect(
      updateShippingSettings({ freeShippingThreshold: 100.5 }, makeEffects())
    ).rejects.toThrow(ShippingValidationError)
  })

  it("returns the current shipping settings", async () => {
    await prisma.shippingSettings.upsert({
      where: { id: "default" },
      update: { freeShippingThreshold: 300000 },
      create: { id: "default", freeShippingThreshold: 300000 },
    })

    const settings = await getShippingSettings()

    expect(settings?.freeShippingThreshold).toBe(300000)
  })
})

describe("storefront quote reads", () => {
  let userIdA: string
  let variantA: string
  let variantC: string
  let variantD: string
  let cityId: string

  const quoteEmail = (suffix: string) => `livraison-quote-${runId}-${suffix}@test.ma`

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { id: randomUUID(), email: quoteEmail("a"), name: "Utilisateur Quote A" },
    })
    userIdA = user.id

    const category = await prisma.category.create({
      data: { name: `Catégorie Livraison ${runId}`, slug: `livraison-cat-${runId}` },
    })
    const [productA, productB, productC] = await Promise.all([
      prisma.product.create({
        data: {
          name: "Produit Livraison A",
          slug: `livraison-prod-a-${runId}`,
          description: "Description A",
          brand: "Marque Livraison",
          categoryId: category.id,
          price: 100000,
          specs: {},
          images: ["https://example.com/a.jpg"],
          freeShipping: false,
          variants: {
            create: [{ name: "Standard", sku: `LIV-${runId}-A1`, priceDelta: 0, stock: 10 }],
          },
        },
        include: { variants: true },
      }),
      prisma.product.create({
        data: {
          name: "Produit Livraison B",
          slug: `livraison-prod-b-${runId}`,
          description: "Description B",
          brand: "Marque Livraison",
          categoryId: category.id,
          price: 50000,
          specs: {},
          images: ["https://example.com/b.jpg"],
          freeShipping: true,
          variants: {
            create: [{ name: "Standard", sku: `LIV-${runId}-B1`, priceDelta: 0, stock: 5 }],
          },
        },
        include: { variants: true },
      }),
      prisma.product.create({
        data: {
          name: "Produit Livraison C",
          slug: `livraison-prod-c-${runId}`,
          description: "Description C",
          brand: "Marque Livraison",
          categoryId: category.id,
          price: 30000,
          specs: {},
          images: ["https://example.com/c.jpg"],
          freeShipping: false,
          variants: {
            create: [{ name: "Standard", sku: `LIV-${runId}-C1`, priceDelta: 0, stock: 5 }],
          },
        },
        include: { variants: true },
      }),
    ])
    variantA = productA.variants[0].id
    variantC = productB.variants[0].id
    variantD = productC.variants[0].id

    const city = await prisma.deliveryCity.create({ data: { name: cityName("quote"), fee: 3500 } })
    cityId = city.id
  })

  beforeEach(async () => {
    await prisma.shippingSettings.upsert({
      where: { id: "default" },
      update: { freeShippingThreshold: 100000 },
      create: { id: "default", freeShippingThreshold: 100000 },
    })
    await prisma.cartItem.deleteMany({
      where: { user: { email: { startsWith: `livraison-quote-${runId}-` } } },
    })
  })

  afterAll(async () => {
    await prisma.cartItem.deleteMany({
      where: { user: { email: { startsWith: `livraison-quote-${runId}-` } } },
    })
    await prisma.user.deleteMany({ where: { email: { startsWith: `livraison-quote-${runId}-` } } })
    await prisma.product.deleteMany({ where: { slug: { startsWith: `livraison-prod-` } } })
    await prisma.category.deleteMany({ where: { slug: `livraison-cat-${runId}` } })
    await prisma.deliveryCity.deleteMany({ where: { name: cityName("quote") } })
  })

  it("quotes the shipping fee for a chosen city below the threshold", async () => {
    await addToCart(userIdA, variantD, 1)

    const cart = await lirePanier({ role: "client", compteId: userIdA })
    await expect(quotePanier(cart, cityId)).resolves.toMatchObject({
      selected: { subtotal: 30000, shippingFee: 3500, total: 33500 },
    })
  })

  it("quotes free shipping for an all-free-shipping cart below the threshold", async () => {
    await addToCart(userIdA, variantC, 1)

    const cart = await lirePanier({ role: "client", compteId: userIdA })
    await expect(quotePanier(cart, cityId)).resolves.toMatchObject({
      selected: { subtotal: 50000, shippingFee: 0, total: 50000 },
    })
  })

  it("quotes free shipping for a mixed cart with one free-shipping item below the threshold", async () => {
    await addToCart(userIdA, variantC, 1)
    await addToCart(userIdA, variantD, 1)

    const cart = await lirePanier({ role: "client", compteId: userIdA })
    await expect(quotePanier(cart, cityId)).resolves.toMatchObject({
      selected: { subtotal: 80000, shippingFee: 0, total: 80000 },
    })
  })

  it("quotes free shipping for a cart above the threshold", async () => {
    await addToCart(userIdA, variantA, 20)

    const cart = await lirePanier({ role: "client", compteId: userIdA })
    await expect(quotePanier(cart, cityId)).resolves.toMatchObject({
      selected: { subtotal: 2000000, shippingFee: 0, total: 2000000 },
    })
  })

  it("returns no quote for a ville not in the delivery city list", async () => {
    await addToCart(userIdA, variantA, 1)

    const cart = await lirePanier({ role: "client", compteId: userIdA })
    const quote = await quotePanier(cart, "ville-inconnue")
    expect(quote.selected).toBeNull()
  })

  it("returns the full panier quote shape for a chosen city", async () => {
    await addToCart(userIdA, variantD, 1)

    const cart = await lirePanier({ role: "client", compteId: userIdA })
    const quote = await quotePanier(cart, cityId)

    expect(quote.cities.map((candidate) => candidate.id)).toContain(cityId)
    expect(quote.threshold).toBe(100000)
    expect(quote.quotes[cityId]).toEqual({ subtotal: 30000, shippingFee: 3500, total: 33500 })
    expect(quote.selected).toEqual(quote.quotes[cityId])
  })
})

