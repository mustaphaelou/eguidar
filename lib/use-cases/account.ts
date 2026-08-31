import { z } from "zod"

import { prisma } from "@/lib/db"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"
import {
  deliveryAddressField,
  deliveryPhoneField,
} from "@/lib/use-cases/contact"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export interface ProfileInput {
  phone: string
  address: string
  cityId: string | null
}

export interface Profile {
  phone: string | null
  address: string | null
  cityId: string | null
  cityName: string | null
}

export class ProfileValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "ProfileValidationError"
  }
}

const profileInputSchema = z.object({
  phone: deliveryPhoneField,
  address: deliveryAddressField,
  cityId: z.string().nullable().optional(),
})

function parseProfileInput(input: ProfileInput): ProfileInput {
  const result = profileInputSchema.safeParse(input)
  if (!result.success) {
    throw new ProfileValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return {
    phone: result.data.phone,
    address: result.data.address,
    cityId: result.data.cityId ?? null,
  }
}

export async function getProfile(userId: string): Promise<Profile> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { shippingCity: { select: { id: true, name: true } } },
  })
  return {
    phone: user.phone,
    address: user.shippingAddress,
    cityId: user.shippingCityId,
    cityName: user.shippingCity?.name ?? null,
  }
}

export async function updateProfile(
  userId: string,
  input: ProfileInput
): Promise<Profile> {
  const data = parseProfileInput(input)

  if (data.cityId) {
    const city = await prisma.deliveryCity.findUnique({
      where: { id: data.cityId },
    })
    if (!city) throw new DeliveryCityNotFoundError()
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      phone: data.phone,
      shippingAddress: data.address,
      shippingCityId: data.cityId ?? null,
    },
  })

  return getProfile(userId)
}
