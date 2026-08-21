import { z } from "zod"

import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import type { CartData } from "@/lib/use-cases/cart"

export interface ShippingQuote {
  subtotal: number
  shippingFee: number
  total: number
}

export interface PanierQuote {
  cities: DeliveryCityOption[]
  threshold: number
  quotes: Record<string, ShippingQuote>
  selected: ShippingQuote | null
}

export interface DeliveryCityOption {
  id: string
  name: string
  fee: number
}

export interface PricingInput {
  subtotal: number
  anyFreeShippingItem: boolean
}

export interface ShippingFeeInput {
  subtotal: number
  cityFee: number
  freeShippingThreshold: number
  anyFreeShippingItem: boolean
}

export interface CityInput {
  name: string
  fee: number
}

export interface LivraisonEffects {
  revalidateShipping(): void
}

export class DeliveryCityNotFoundError extends Error {
  constructor() {
    super("Ville de livraison introuvable")
    this.name = "DeliveryCityNotFoundError"
  }
}

export class CityValidationError extends Error {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "CityValidationError"
  }
}

export class CityNameConflictError extends Error {
  constructor() {
    super("Une ville avec ce nom existe déjà")
    this.name = "CityNameConflictError"
  }
}

export class CityNotFoundError extends Error {
  constructor() {
    super("Ville introuvable")
    this.name = "CityNotFoundError"
  }
}

export class ShippingValidationError extends Error {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "ShippingValidationError"
  }
}

export const DEFAULT_FREE_SHIPPING_THRESHOLD = 100000

export function computeShippingFee(input: ShippingFeeInput): number {
  if (input.subtotal >= input.freeShippingThreshold) return 0
  if (input.anyFreeShippingItem) return 0
  return input.cityFee
}

export function computeCityQuote(
  city: DeliveryCityOption,
  pricing: PricingInput,
  freeShippingThreshold: number
): ShippingQuote {
  const shippingFee = computeShippingFee({
    subtotal: pricing.subtotal,
    cityFee: city.fee,
    freeShippingThreshold,
    anyFreeShippingItem: pricing.anyFreeShippingItem,
  })
  return { subtotal: pricing.subtotal, shippingFee, total: pricing.subtotal + shippingFee }
}

export function computeCityQuotes(
  cities: DeliveryCityOption[],
  pricing: PricingInput,
  freeShippingThreshold: number
): Record<string, ShippingQuote> {
  const quotes: Record<string, ShippingQuote> = {}
  for (const city of cities) {
    quotes[city.id] = computeCityQuote(city, pricing, freeShippingThreshold)
  }
  return quotes
}

export async function quotePanier(
  cart: CartData,
  cityId?: string | null
): Promise<PanierQuote> {
  const [cities, threshold] = await Promise.all([
    listDeliveryCities(),
    getFreeShippingThreshold(),
  ])
  const quotes = computeCityQuotes(
    cities,
    {
      subtotal: cart.subtotal,
      anyFreeShippingItem: cart.lines.some((line) => line.freeShipping),
    },
    threshold
  )
  return {
    cities,
    threshold,
    quotes,
    selected: cityId ? (quotes[cityId] ?? null) : null,
  }
}

export async function getFreeShippingThreshold(): Promise<number> {
  const settings = await prisma.shippingSettings.findUnique({ where: { id: "default" } })
  return settings?.freeShippingThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD
}

export function listDeliveryCities(): Promise<DeliveryCityOption[]> {
  return prisma.deliveryCity.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, fee: true },
  })
}

const cityInputSchema = z.object({
  name: z.string().trim().min(1, "nom requis"),
  fee: z.number().int().min(0, "le frais de livraison doit être positif ou nul"),
})

const shippingInputSchema = z.object({
  freeShippingThreshold: z.number().int().min(1, "le seuil de livraison offerte doit être positif"),
})

function parseCityInput(input: CityInput): CityInput {
  const result = cityInputSchema.safeParse(input)
  if (!result.success) {
    throw new CityValidationError(result.error.issues.map((issue) => issue.message))
  }
  return result.data
}

function uniqueViolationFields(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return []
  const meta = error.meta as Record<string, unknown> | undefined
  if (Array.isArray(meta?.target)) return meta.target as string[]
  const driverError = meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: string[] } } }
    | undefined
  return driverError?.cause?.constraint?.fields ?? []
}

function isUniqueViolation(error: unknown, fields: string[]): boolean {
  return uniqueViolationFields(error).some((target) => fields.includes(target))
}

function mapCityUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error, ["name"])) throw new CityNameConflictError()
  throw error
}

async function assertUniqueCityName(name: string, excludeCityId?: string): Promise<void> {
  const existing = await prisma.deliveryCity.findUnique({ where: { name } })
  if (existing && existing.id !== excludeCityId) throw new CityNameConflictError()
}

export async function createCity(input: CityInput, effects: LivraisonEffects) {
  const data = parseCityInput(input)
  await assertUniqueCityName(data.name)

  let city
  try {
    city = await prisma.deliveryCity.create({ data })
  } catch (error) {
    mapCityUniqueViolation(error)
  }

  effects.revalidateShipping()
  return city
}

export async function updateCity(id: string, input: CityInput, effects: LivraisonEffects) {
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

  effects.revalidateShipping()
  return city
}

export async function deleteCity(id: string, effects: LivraisonEffects): Promise<void> {
  const existing = await prisma.deliveryCity.findUnique({ where: { id } })
  if (!existing) throw new CityNotFoundError()

  await prisma.deliveryCity.delete({ where: { id } })
  effects.revalidateShipping()
}

export function listAdminCities() {
  return prisma.deliveryCity.findMany({ orderBy: { name: "asc" } })
}

export function getShippingSettings() {
  return prisma.shippingSettings.findUnique({ where: { id: "default" } })
}

export async function updateShippingSettings(
  input: { freeShippingThreshold: number },
  effects: LivraisonEffects
) {
  const result = shippingInputSchema.safeParse(input)
  if (!result.success) {
    throw new ShippingValidationError(result.error.issues.map((issue) => issue.message))
  }

  const settings = await prisma.shippingSettings.upsert({
    where: { id: "default" },
    update: { freeShippingThreshold: result.data.freeShippingThreshold },
    create: { id: "default", freeShippingThreshold: result.data.freeShippingThreshold },
  })

  effects.revalidateShipping()
  return settings
}
