import { z } from "zod"

export const MESSAGE_DESCRIPTION_REQUISE = "description requise"

export const descriptionProduitSchema = z
  .string()
  .trim()
  .min(1, MESSAGE_DESCRIPTION_REQUISE)
