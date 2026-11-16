import { z } from "zod"

import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import {
  TYPES_EVENEMENT_AUTOMATION,
  type TypeEvenementAutomation,
  typeEvenementAutomationSchema,
} from "@/lib/automations/evenements"
import {
  ACTIONS_AUTOMATION,
  CONDITIONS_AUTOMATION,
  NOM_DE_VARIABLE_ENVIRONNEMENT,
  verifierCombinaison,
  type ActionAutomation,
  type CompositionRegle,
  type ConditionAutomation,
  type ConfigurationRegle,
  type TypeConditionAutomation,
} from "@/lib/automations/vocabulaire"
import { reglesParDefaut } from "@/lib/apres-ecriture"
import { STATUTS_VALIDES } from "@/lib/statut-de-commande"

export { ACTIONS_AUTOMATION, CONDITIONS_AUTOMATION }
export type {
  ActionAutomation,
  ConditionAutomation,
  ConfigurationRegle,
  TypeConditionAutomation,
}

export const actionAutomationSchema = z.enum(ACTIONS_AUTOMATION)

export const conditionAutomationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("toujours") }).strict(),
  z
    .object({
      type: z.literal("statut-commande"),
      statuts: z.array(z.enum(STATUTS_VALIDES as [string, ...string[]])).min(0),
    })
    .strict(),
])

export const configurationRegleSchema = z
  .object({
    destinataireVariable: z
      .string()
      .trim()
      .regex(
        NOM_DE_VARIABLE_ENVIRONNEMENT,
        "nom de variable d'environnement invalide : majuscules, chiffres et « _ » seulement"
      ),
  })
  .strict()

export const regleAutomationSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "identifiant de règle invalide"),
  nom: z.string().trim().min(1),
  declencheur: z.enum(TYPES_EVENEMENT_AUTOMATION),
  condition: conditionAutomationSchema,
  action: z.enum(ACTIONS_AUTOMATION),
  configuration: configurationRegleSchema.optional(),
  actif: z.boolean(),
})

export type RegleAutomation = z.infer<typeof regleAutomationSchema>

export function verifierRegle(regle: unknown): RegleAutomation {
  const verifiee = regleAutomationSchema.parse(regle)
  verifierCombinaison(verifiee as unknown as CompositionRegle)
  return verifiee
}

export const REGLES_AUTOMATION: readonly RegleAutomation[] = Object.freeze(
  reglesParDefaut().map((regle) => verifierRegle(regle))
)

function instantane(regle: RegleAutomation) {
  return {
    id: regle.id,
    nom: regle.nom,
    declencheur: regle.declencheur,
    condition: regle.condition,
    action: regle.action,
    ...(regle.configuration ? { configuration: regle.configuration } : {}),
    actif: regle.actif,
  }
}

function serialiserStable(valeur: unknown): string {
  if (Array.isArray(valeur))
    return `[${valeur.map(serialiserStable).join(",")}]`
  if (valeur && typeof valeur === "object") {
    const entrees = Object.entries(valeur as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b)
    )
    return `{${entrees.map(([cle, v]) => `${JSON.stringify(cle)}:${serialiserStable(v)}`).join(",")}}`
  }
  return JSON.stringify(valeur) ?? "null"
}

function memesFaits(a: unknown, b: unknown): boolean {
  return serialiserStable(a) === serialiserStable(b)
}

export async function ecrireRevisionRegle(
  tx: Prisma.TransactionClient,
  regle: RegleAutomation,
  auteur: string,
  maintenant?: Date
): Promise<boolean> {
  const instantaneRegle = instantane(regle)
  const derniere = await tx.automationRuleRevision.findFirst({
    where: { ruleId: regle.id },
    orderBy: { createdAt: "desc" },
  })
  if (derniere && memesFaits(derniere.snapshot, instantaneRegle)) return false

  await tx.automationRuleRevision.create({
    data: {
      ruleId: regle.id,
      snapshot: instantaneRegle,
      author: auteur,
      ...(maintenant ? { createdAt: maintenant } : {}),
    },
  })
  return true
}

export async function semerLesRegles(
  regles: readonly RegleAutomation[] = REGLES_AUTOMATION,
  auteur = "graine"
): Promise<void> {
  for (const regle of regles) {
    const verifiee = verifierRegle(regle)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.automationRule.create({
          data: {
            id: verifiee.id,
            name: verifiee.nom,
            enabled: verifiee.actif,
            trigger: verifiee.declencheur,
            condition: verifiee.condition,
            action: verifiee.action,
            actionConfig: verifiee.configuration ?? Prisma.DbNull,
          },
        })
        await ecrireRevisionRegle(tx, verifiee, auteur)
      })
    } catch (error) {
      if (hasUniqueViolation(error, ["id"])) continue
      throw error
    }
  }
}

export type TypeEvenementRegle = TypeEvenementAutomation

export function versRegle(ligne: {
  id: string
  name: string
  enabled: boolean
  trigger: string
  condition: Prisma.JsonValue
  action: string
  actionConfig: Prisma.JsonValue | null
}): RegleAutomation {
  return {
    id: ligne.id,
    nom: ligne.name,
    declencheur: typeEvenementAutomationSchema.parse(ligne.trigger),
    condition: conditionAutomationSchema.parse(ligne.condition),
    action: ligne.action as ActionAutomation,
    ...(ligne.actionConfig
      ? { configuration: configurationRegleSchema.parse(ligne.actionConfig) }
      : {}),
    actif: ligne.enabled,
  }
}
