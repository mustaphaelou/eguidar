import { z } from "zod"

import {
  ANNONCE_LIEN_LIBELLE_MAX_LENGTH,
  ANNONCE_MESSAGE_MAX_LENGTH,
} from "@/lib/annonce-contrat"
import { declarerApresEcriture } from "@/lib/apres-ecriture"
import { prisma } from "@/lib/db"
import { safeDestination } from "@/lib/lien-de-connexion"
import {
  executer as executerAnnonce,
  type EffetsAnnonce,
} from "@/lib/use-cases/apres-ecriture/annonce"
import { invalidateAnnonce } from "@/lib/use-cases/cache-invalidation"
import {
  avecSurcharges,
  messageDeValidation,
} from "@/lib/use-cases/mutation-squelette"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export { ANNONCE_LIEN_LIBELLE_MAX_LENGTH, ANNONCE_MESSAGE_MAX_LENGTH }

export interface AnnonceInput {
  actif: boolean
  message: string
  lienUrl?: string | null
  lienLibelle?: string | null
}

export type AnnonceEffects = EffetsAnnonce

const defaultAnnonceEffects: AnnonceEffects = {
  async invalidateAnnonce() {
    await invalidateAnnonce()
  },
}

export class AnnonceValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "AnnonceValidationError"
  }
}

function normaliserChampOptionnel(
  value: string | null | undefined
): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed === "" ? null : trimmed
}

const annonceInputSchema = z
  .object({
    actif: z.boolean(),
    message: z
      .string()
      .trim()
      .max(
        ANNONCE_MESSAGE_MAX_LENGTH,
        `le message ne doit pas dépasser ${ANNONCE_MESSAGE_MAX_LENGTH} caractères`
      ),
    lienUrl: z
      .string()
      .nullish()
      .transform((value) => normaliserChampOptionnel(value)),
    lienLibelle: z
      .string()
      .nullish()
      .transform((value) => normaliserChampOptionnel(value)),
  })
  .superRefine((data, ctx) => {
    if (data.actif && data.message.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["message"],
        message: "le message est requis lorsque l'Annonce est active",
      })
    }

    const aUrl = data.lienUrl !== null
    const aLibelle = data.lienLibelle !== null

    if (aUrl !== aLibelle) {
      ctx.addIssue({
        code: "custom",
        path: [aUrl ? "lienLibelle" : "lienUrl"],
        message:
          "l'URL et le libellé du lien doivent être renseignés ensemble ou laissés vides",
      })
    }

    if (
      data.lienLibelle !== null &&
      data.lienLibelle.length > ANNONCE_LIEN_LIBELLE_MAX_LENGTH
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["lienLibelle"],
        message: `le libellé du lien ne doit pas dépasser ${ANNONCE_LIEN_LIBELLE_MAX_LENGTH} caractères`,
      })
    }

    if (data.lienUrl !== null && safeDestination(data.lienUrl) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["lienUrl"],
        message:
          "l'URL du lien doit être un chemin interne relatif commençant par /",
      })
    }
  })

export function getAnnonce() {
  return prisma.annonce.findUnique({ where: { id: "default" } })
}

export async function updateAnnonce(
  input: AnnonceInput,
  overrides?: Partial<AnnonceEffects>
) {
  const effects = avecSurcharges(defaultAnnonceEffects, overrides)
  const result = annonceInputSchema.safeParse(input)
  if (!result.success) {
    throw new AnnonceValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }

  const annonce = await prisma.annonce.upsert({
    where: { id: "default" },
    update: result.data,
    create: {
      id: "default",
      ...result.data,
    },
  })

  await executerAnnonce(
    declarerApresEcriture("annonce.reglee", { annonceId: "default" }),
    effects
  )
  return annonce
}
