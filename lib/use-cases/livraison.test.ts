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
  CitySlugConflictError,
  CityValidationError,
  createCity,
  deleteCity,
  getFreeShippingThreshold,
  getShippingSettings,
  listAdminCities,
  listDeliveryCities,
  ShippingValidationError,
  updateCity,
  updateShippingSettings,
} from "@/lib/use-cases/livraison"
import {
  computeShippingFee,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
} from "@/lib/use-cases/livraison-prix"
import {
  verifierFrontiereBestEffort,
  verifierRefusValidation,
} from "@/test/mutation-squelette-recette"

const runId = randomUUID().slice(0, 8)
const cityName = (suffix: string) => `Ville Livraison ${runId} ${suffix}`

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
      data: {
        name: cityName("b"),
        slug: `ville-livraison-${runId}-b`,
        fee: 5000,
      },
    })
    await prisma.deliveryCity.create({
      data: {
        name: cityName("a"),
        slug: `ville-livraison-${runId}-a`,
        fee: 3500,
      },
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
      slug: `ville-livraison-${runId}-a`,
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

  it("generates the city slug from its name", async () => {
    const created = await createCity({ name: cityName("Kénitra"), fee: 3500 })

    expect(created.slug).toBe(`ville-livraison-${runId}-kenitra`)
    const persisted = await prisma.deliveryCity.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(persisted.slug).toBe(`ville-livraison-${runId}-kenitra`)
  })

  it("keeps the slug unchanged when the city is renamed", async () => {
    const created = await createCity({ name: cityName("avant"), fee: 3000 })

    const updated = await updateCity(created.id, {
      name: cityName("apres"),
      fee: 3000,
    })

    expect(updated.name).toBe(cityName("apres"))
    expect(updated.slug).toBe(created.slug)
    const persisted = await prisma.deliveryCity.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(persisted.slug).toBe(created.slug)
  })

  it("rejects a duplicate folded slug and persists nothing", async () => {
    await createCity({ name: cityName("Kénitra"), fee: 3500 })

    await expect(
      createCity({ name: cityName("Kenitra"), fee: 4000 })
    ).rejects.toThrow(CitySlugConflictError)

    const nameCount = await prisma.deliveryCity.count({
      where: { name: cityName("Kenitra") },
    })
    expect(nameCount).toBe(0)
    const slugCount = await prisma.deliveryCity.count({
      where: { slug: `ville-livraison-${runId}-kenitra` },
    })
    expect(slugCount).toBe(1)
  })

  it("rejects a negative city fee", async () => {
    await verifierRefusValidation(CityValidationError, () =>
      createCity({ name: cityName("negatif"), fee: -100 })
    )
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
    await verifierRefusValidation(CityValidationError, () =>
      createCity({ name: " ", fee: 3000 })
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
    const city = await verifierFrontiereBestEffort(
      "invalidation",
      (effetQuiEchoue) =>
        createCity(
          { name: cityName("fail-cache"), fee: 2000 },
          { revalidateShipping: effetQuiEchoue }
        )
    )

    expect(city.name).toBe(cityName("fail-cache"))
  })

  it("throws CityNotFoundError for unknown cities", async () => {
    await expect(
      updateCity("unknown-id", { name: "X", fee: 1 })
    ).rejects.toThrow(CityNotFoundError)
    await expect(deleteCity("unknown-id")).rejects.toThrow(CityNotFoundError)
  })

  it("lists admin cities ordered by name", async () => {
    await prisma.deliveryCity.create({
      data: {
        name: cityName("b"),
        slug: `ville-livraison-${runId}-b`,
        fee: 5000,
      },
    })
    await prisma.deliveryCity.create({
      data: {
        name: cityName("a"),
        slug: `ville-livraison-${runId}-a`,
        fee: 3500,
      },
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
    await verifierRefusValidation(ShippingValidationError, () =>
      updateShippingSettings({ freeShippingThreshold: 0 })
    )
    await verifierRefusValidation(ShippingValidationError, () =>
      updateShippingSettings({ freeShippingThreshold: -100 })
    )
  })

  it("rejects a non-integer threshold", async () => {
    await verifierRefusValidation(ShippingValidationError, () =>
      updateShippingSettings({ freeShippingThreshold: 100.5 })
    )
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
