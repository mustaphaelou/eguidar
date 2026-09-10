import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"
import {
  getProfile,
  ProfileValidationError,
  updateProfile,
} from "@/lib/use-cases/account"

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `account-${runId}-${suffix}@test.ma`
const cityName = `Ville ${runId}`

let userId: string
let cityId: string

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { id: randomUUID(), email: email("a"), name: "Utilisateur Profil" },
  })
  userId = user.id
  const city = await prisma.deliveryCity.create({
    data: { name: cityName, slug: `ville-${runId}`, fee: 3500 },
  })
  cityId = city.id
})

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: `account-${runId}-` } },
  })
  await prisma.deliveryCity.deleteMany({ where: { name: cityName } })
  await prisma.$disconnect()
})

describe("profile", () => {
  it("returns an empty profile for a fresh account", async () => {
    await expect(getProfile(userId)).resolves.toEqual({
      phone: null,
      address: null,
      cityId: null,
      cityName: null,
    })
  })

  it("saves phone, address and delivery city", async () => {
    const profile = await updateProfile(userId, {
      phone: "+212 600 111 222",
      address: "15 Rue des Orangers, Appt 3",
      cityId,
    })

    expect(profile).toMatchObject({
      phone: "+212 600 111 222",
      address: "15 Rue des Orangers, Appt 3",
      cityId,
      cityName: cityName,
    })
    const persisted = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })
    expect(persisted.shippingCityId).toBe(cityId)
  })

  it("clears the delivery city when null is passed", async () => {
    await updateProfile(userId, {
      phone: "+212 600 111 222",
      address: "15 Rue des Orangers",
      cityId,
    })
    await updateProfile(userId, {
      phone: "+212 600 111 222",
      address: "15 Rue des Orangers",
      cityId: null,
    })

    await expect(getProfile(userId)).resolves.toMatchObject({
      cityId: null,
      cityName: null,
    })
  })

  it("rejects an invalid phone or a too-short address", async () => {
    await expect(
      updateProfile(userId, {
        phone: "12",
        address: "15 Rue des Orangers",
        cityId: null,
      })
    ).rejects.toThrow(ProfileValidationError)
    await expect(
      updateProfile(userId, {
        phone: "+212 600 111 222",
        address: "X",
        cityId: null,
      })
    ).rejects.toThrow(ProfileValidationError)
  })

  it("rejects an unknown delivery city", async () => {
    await expect(
      updateProfile(userId, {
        phone: "+212 600 111 222",
        address: "15 Rue des Orangers",
        cityId: "ville-inconnue",
      })
    ).rejects.toThrow(DeliveryCityNotFoundError)
  })
})
