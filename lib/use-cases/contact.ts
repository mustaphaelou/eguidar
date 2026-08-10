import { z } from "zod"

export const deliveryAddressField = z
  .string()
  .trim()
  .min(5, "adresse trop courte")
  .max(500, "adresse trop longue")

export const deliveryPhoneField = z
  .string()
  .trim()
  .min(8, "numéro de téléphone invalide")
  .max(20, "numéro de téléphone invalide")
  .regex(/^[+0-9][0-9 ()-]*$/, "numéro de téléphone invalide")
