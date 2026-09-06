import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
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
  ShippingValidationError,
  updateCity,
  updateShippingSettings,
  type DeliveryCityOption,
  type PricingInput,
} from "@/lib/use-cases/livraison"

const runId = randomUUID().slice(0, 8)
const cityName = (suffix: string) => `Ville Livraison ${runId} ${suffix}`

const city = (id: string, name: string, fee: number): DeliveryCityOption => ({
  id,
  name,
  fee,
})

const pricing = (
  subtotal: number,
  anyFreeShippingItem = false
): PricingInput => ({
  subtotal,
  anyFreeShippingItem,
})


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
      expect(
        computeCityQuote(city("c1", "Casablanca", 3500), pricing(50000), 100000)
      ).toEqual({
        subtotal: 50000,
        shippingFee: 3500,
        total: 53500,
      })
    })

    it("quotes free shipping exactly at the threshold", () => {
      expect(
        computeCityQuote(
          city("c1", "Casablanca", 3500),
          pricing(100000),
          100000
        )
      ).toEqual({
        subtotal: 100000,
        shippingFee: 0,
        total: 100000,
      })
    })

    it("quotes free shipping above the threshold", () => {
      expect(
        computeCityQuote(
          city("c1", "Casablanca", 3500),
          pricing(150000),
          100000
        )
      ).toEqual({
        subtotal: 150000,
        shippingFee: 0,
        total: 150000,
      })
    })

    it("quotes free shipping below the threshold with a free-shipping item", () => {
      expect(
        computeCityQuote(
          city("c1", "Casablanca", 3500),
          pricing(50000, true),
          100000
        )
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
    await prisma.deliveryCity.deleteMany({
      where: { name: { startsWith: `Ville Livraison ${runId}` } },
    })
  })

  afterAll(async () => {
    await prisma.deliveryCity.deleteMany({
      where: { name: { startsWith: `Ville Livraison ${runId}` } },
    })
    await prisma.$disconnect()
  })

  it("lists delivery cities ordered by name", async () => {
    await prisma.deliveryCity.create({
      data: { name: cityName("b"), fee: 5000 },
    })
    await prisma.deliveryCity.create({
      data: { name: cityName("a"), fee: 3500 },
    })

    const cities = await listDeliveryCities()

    const relevant = cities.filter((candidate) =>
      candidate.name.startsWith(`Ville Livraison ${runId}`)
    )
    expect(relevant.map((candidate) => candidate.name)).toEqual([
      cityName("a"),
      cityName("b"),
    ])
    expect(relevant[0]).toEqual({
      id: relevant[0].id,
      name: cityName("a"),
      fee: 3500,
    })
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

    await expect(getFreeShippingThreshold()).resolves.toBe(
      DEFAULT_FREE_SHIPPING_THRESHOLD
    )

    await prisma.shippingSettings.create({
      data: { id: "default", freeShippingThreshold: 100000 },
    })
  })
})

describe("admin city writes", () => {
  beforeEach(async () => {
    await prisma.deliveryCity.deleteMany({
      where: { name: { startsWith: `Ville Livraison ${runId}` } },
    })
  })

  afterAll(async () => {
    await prisma.deliveryCity.deleteMany({
      where: { name: { startsWith: `Ville Livraison ${runId}` } },
    })
  })

  it("creates a city with its flat fee and revalidates shipping", async () => {
    const revalidateShipping = vi.fn()

    const created = await createCity(
      { name: cityName("creer"), fee: 3500 },
      { revalidateShipping }
    )

    expect(created.id).toBeTruthy()
    const persisted = await prisma.deliveryCity.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(persisted.name).toBe(cityName("creer"))
    expect(persisted.fee).toBe(3500)
    expect(revalidateShipping).toHaveBeenCalledOnce()
  })

  it("rejects a negative city fee", async () => {
    await expect(
      createCity({ name: cityName("negatif"), fee: -100 })
    ).rejects.toThrow(CityValidationError)
  })

  it("accepts a zero fee city", async () => {
    const created = await createCity({ name: cityName("gratuite"), fee: 0 })
    expect(created.fee).toBe(0)
  })

  it("rejects a duplicate city name and persists nothing", async () => {
    await createCity({ name: cityName("dupliquee"), fee: 3000 })

    await expect(
      createCity({ name: cityName("dupliquee"), fee: 4000 })
    ).rejects.toThrow(CityNameConflictError)

    const count = await prisma.deliveryCity.count({
      where: { name: cityName("dupliquee") },
    })
    expect(count).toBe(1)
  })

  it("rejects an empty city name", async () => {
    await expect(createCity({ name: " ", fee: 3000 })).rejects.toThrow(
      CityValidationError
    )
  })

  it("updates a city and revalidates shipping", async () => {
    const revalidateShipping = vi.fn()
    const created = await createCity({ name: cityName("maj"), fee: 3000 })

    const updated = await updateCity(
      created.id,
      { name: cityName("maj"), fee: 4500 },
      { revalidateShipping }
    )

    expect(updated.fee).toBe(4500)
    const persisted = await prisma.deliveryCity.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(persisted.fee).toBe(4500)
    expect(revalidateShipping).toHaveBeenCalled()
  })

  it("rejects updating a city to another city's name", async () => {
    const first = await createCity({ name: cityName("a"), fee: 3000 })
    await createCity({ name: cityName("b"), fee: 3000 })

    await expect(
      updateCity(first.id, { name: cityName("b"), fee: 3000 })
    ).rejects.toThrow(CityNameConflictError)
  })

  it("deletes a city and revalidates shipping", async () => {
    const revalidateShipping = vi.fn()
    const created = await createCity({
      name: cityName("suppression"),
      fee: 3000,
    })

    await deleteCity(created.id, { revalidateShipping })

    await expect(
      prisma.deliveryCity.findUnique({ where: { id: created.id } })
    ).resolves.toBeNull()
    expect(revalidateShipping).toHaveBeenCalled()
  })

  it("still persists the mutation when revalidation throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const city = await createCity(
        { name: cityName("fail-cache"), fee: 2000 },
        {
          revalidateShipping: vi.fn(() => {
            throw new Error("cache down")
          }),
        }
      )
      expect(city.name).toBe(cityName("fail-cache"))
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("invalidation"),
        expect.any(Error)
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("throws CityNotFoundError for unknown cities", async () => {
    await expect(
      updateCity("unknown-id", { name: "X", fee: 1 })
    ).rejects.toThrow(CityNotFoundError)
    await expect(deleteCity("unknown-id")).rejects.toThrow(CityNotFoundError)
  })

  it("lists admin cities ordered by name", async () => {
    await prisma.deliveryCity.create({
      data: { name: cityName("b"), fee: 5000 },
    })
    await prisma.deliveryCity.create({
      data: { name: cityName("a"), fee: 3500 },
    })

    const cities = await listAdminCities()

    const relevant = cities.filter((candidate) =>
      candidate.name.startsWith(`Ville Livraison ${runId}`)
    )
    expect(relevant.map((candidate) => candidate.name)).toEqual([
      cityName("a"),
      cityName("b"),
    ])
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
    const revalidateShipping = vi.fn()

    await updateShippingSettings(
      { freeShippingThreshold: 250000 },
      { revalidateShipping }
    )

    const settings = await prisma.shippingSettings.findUniqueOrThrow({
      where: { id: "default" },
    })
    expect(settings.freeShippingThreshold).toBe(250000)
    expect(revalidateShipping).toHaveBeenCalledOnce()
  })

  it("rejects a zero or negative threshold", async () => {
    await expect(
      updateShippingSettings({ freeShippingThreshold: 0 })
    ).rejects.toThrow(ShippingValidationError)
    await expect(
      updateShippingSettings({ freeShippingThreshold: -100 })
    ).rejects.toThrow(ShippingValidationError)
  })

  it("rejects a non-integer threshold", async () => {
    await expect(
      updateShippingSettings({ freeShippingThreshold: 100.5 })
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
