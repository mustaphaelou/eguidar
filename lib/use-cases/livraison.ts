import { z } from "zod"

import { prisma } from "@/lib/db"
import { slugify } from "@/lib/slug"
import { invalidateLivraison } from "@/lib/use-cases/cache-invalidation"
import {
  DEFAULT_FREE_SHIPPING_THRESHOLD,
  type DeliveryCityOption,
} from "@/lib/use-cases/livraison-prix"
import {
  avecSurcharges,
  leverConflitUnique,
  messageDeValidation,
  runEffect,
} from "@/lib/use-cases/mutation-squelette"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export type {
  DeliveryCityOption,
  PricingInput,
  ShippingFeeInput,
  ShippingQuote,
} from "@/lib/use-cases/livraison-prix"
export {
  computeShippingFee,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
  DeliveryCityNotFoundError,
} from "@/lib/use-cases/livraison-prix"

export interface CityInput {
  name: string
  fee: number
}

export interface LivraisonEffects {
  revalidateShipping(): void
}

const defaultLivraisonEffects: LivraisonEffects = {
  revalidateShipping() {
    invalidateLivraison()
  },
}

export class CityValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "CityValidationError"
  }
}

export class CityNameConflictError extends UserFacingError {
  constructor() {
    super("Une ville avec ce nom existe déjà")
    this.name = "CityNameConflictError"
  }
}

export class CitySlugConflictError extends UserFacingError {
  constructor() {
    super("Une ville avec un nom équivalent existe déjà")
    this.name = "CitySlugConflictError"
  }
}

export class CityNotFoundError extends UserFacingError {
  constructor() {
    super("Ville introuvable")
    this.name = "CityNotFoundError"
  }
}

export class ShippingValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "ShippingValidationError"
  }
}

export async function getFreeShippingThreshold(): Promise<number> {
  const settings = await prisma.shippingSettings.findUnique({
    where: { id: "default" },
  })
  return settings?.freeShippingThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD
}

export function listDeliveryCities(): Promise<DeliveryCityOption[]> {
  return prisma.deliveryCity.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, fee: true },
  })
}

const cityInputSchema = z.object({
  name: z.string().trim().min(1, "nom requis"),
  fee: z
    .number()
    .int()
    .min(0, "le frais de livraison doit être positif ou nul"),
})

const shippingInputSchema = z.object({
  freeShippingThreshold: z
    .number()
    .int()
    .min(1, "le seuil de livraison offerte doit être positif"),
})

function parseCityInput(input: CityInput): CityInput {
  const result = cityInputSchema.safeParse(input)
  if (!result.success) {
    throw new CityValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function mapCityUniqueViolation(error: unknown): never {
  return leverConflitUnique(
    error,
    [
      { champs: ["name"], erreur: new CityNameConflictError() },
      { champs: ["slug"], erreur: new CitySlugConflictError() },
    ],
    hasUniqueViolation
  )
}

async function assertUniqueCityName(
  name: string,
  excludeCityId?: string
): Promise<void> {
  const existing = await prisma.deliveryCity.findUnique({ where: { name } })
  if (existing && existing.id !== excludeCityId)
    throw new CityNameConflictError()
}

async function assertUniqueCitySlug(slug: string): Promise<void> {
  const existing = await prisma.deliveryCity.findUnique({ where: { slug } })
  if (existing) throw new CitySlugConflictError()
}

export async function createCity(
  input: CityInput,
  overrides?: Partial<LivraisonEffects>
) {
  const effects = avecSurcharges(defaultLivraisonEffects, overrides)
  const data = parseCityInput(input)
  const slug = slugify(data.name)
  await assertUniqueCityName(data.name)
  await assertUniqueCitySlug(slug)

  let city
  try {
    city = await prisma.deliveryCity.create({ data: { ...data, slug } })
  } catch (error) {
    mapCityUniqueViolation(error)
  }

  await runEffect(
    "[livraison] invalidation du cache non effectuée pour la création de ville",
    () => effects.revalidateShipping()
  )
  return city
}

export async function updateCity(
  id: string,
  input: CityInput,
  overrides?: Partial<LivraisonEffects>
) {
  const effects = avecSurcharges(defaultLivraisonEffects, overrides)
  const existing = await prisma.deliveryCity.findUnique({ where: { id } })
  if (!existing) throw new CityNotFoundError()

  const data = parseCityInput(input)
  await assertUniqueCityName(data.name, id)

  let city
  try {
    city = await prisma.deliveryCity.update({ where: { id }, data })
  } catch (error) {
    mapCityUniqueViolation(error)
  }

  await runEffect(
    `[livraison] invalidation du cache non effectuée pour ${id}`,
    () => effects.revalidateShipping()
  )
  return city
}

export async function deleteCity(
  id: string,
  overrides?: Partial<LivraisonEffects>
): Promise<void> {
  const effects = avecSurcharges(defaultLivraisonEffects, overrides)
  const existing = await prisma.deliveryCity.findUnique({ where: { id } })
  if (!existing) throw new CityNotFoundError()

  await prisma.deliveryCity.delete({ where: { id } })
  await runEffect(
    `[livraison] invalidation du cache non effectuée pour ${id}`,
    () => effects.revalidateShipping()
  )
}

export function listAdminCities() {
  return prisma.deliveryCity.findMany({ orderBy: { name: "asc" } })
}

export function getShippingSettings() {
  return prisma.shippingSettings.findUnique({ where: { id: "default" } })
}

export async function updateShippingSettings(
  input: { freeShippingThreshold: number },
  overrides?: Partial<LivraisonEffects>
) {
  const effects = avecSurcharges(defaultLivraisonEffects, overrides)
  const result = shippingInputSchema.safeParse(input)
  if (!result.success) {
    throw new ShippingValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }

  const settings = await prisma.shippingSettings.upsert({
    where: { id: "default" },
    update: { freeShippingThreshold: result.data.freeShippingThreshold },
    create: {
      id: "default",
      freeShippingThreshold: result.data.freeShippingThreshold,
    },
  })

  await runEffect(
    "[livraison] invalidation du cache non effectuée pour le seuil de livraison",
    () => effects.revalidateShipping()
  )
  return settings
}
