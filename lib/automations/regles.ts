import { z } from "zod"

import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import {
  TYPES_EVENEMENT_AUTOMATION,
  type TypeEvenementAutomation,
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
import { STATUTS_VALIDES } from "@/lib/statut-de-commande"

/**
 * Le vocabulaire fermé vit dans `vocabulaire.ts`, sans base ni travailleur,
 * pour que le formulaire client et l'éditeur serveur lisent la même liste. Il
 * est ré-exporté ici pour les appelants de la phase 4.
 */
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

/**
 * Le destinataire d'un digest est un **nom** de variable d'environnement. La
 * valeur est lue à l'exécution et ne touche jamais la base, l'instantané ni
 * l'interface.
 */
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

/**
 * La validation d'une règle a deux étages : la forme (Zod) puis la
 * combinaison (vocabulaire). Un couple impossible est refusé en le nommant.
 */
export function verifierRegle(regle: unknown): RegleAutomation {
  const verifiee = regleAutomationSchema.parse(regle)
  verifierCombinaison(verifiee as unknown as CompositionRegle)
  return verifiee
}

/**
 * Les règles semées dans le code. Phase 5 en fera une surface d'édition : le
 * semis reste la référence d'une installation neuve, la table la copie.
 */
export const REGLES_AUTOMATION: readonly RegleAutomation[] = Object.freeze(
  [
    {
      id: "confirmation-commande",
      nom: "Confirmation de Commande",
      declencheur: "commande.creee",
      condition: { type: "toujours" },
      action: "email.commande-creee",
      actif: true,
    },
    {
      id: "statut-commande",
      nom: "E-mail de statut de Commande",
      declencheur: "commande.statut.changee",
      condition: { type: "toujours" },
      action: "email.commande-statut",
      actif: true,
    },
    {
      id: "indexation-produit",
      nom: "Indexation du Produit",
      declencheur: "produit.enregistre",
      condition: { type: "toujours" },
      action: "index.produit",
      actif: true,
    },
    {
      id: "indexation-stock",
      nom: "Indexation du stock",
      declencheur: "variante.stock.changee",
      condition: { type: "toujours" },
      action: "index.produit",
      actif: true,
    },
    {
      id: "desindexation-produit",
      nom: "Désindexation du Produit",
      declencheur: "produit.supprime",
      condition: { type: "toujours" },
      action: "desindex.produit",
      actif: true,
    },
    {
      id: "invalidation-catalogue",
      nom: "Invalidation du Catalogue",
      declencheur: "produit.enregistre",
      condition: { type: "toujours" },
      action: "invalidation.catalogue",
      actif: true,
    },
    {
      id: "invalidation-catalogue-suppression",
      nom: "Invalidation après suppression",
      declencheur: "produit.supprime",
      condition: { type: "toujours" },
      action: "invalidation.catalogue",
      actif: true,
    },
    {
      id: "purge-catalogue",
      nom: "Purge du bord",
      declencheur: "produit.enregistre",
      condition: { type: "toujours" },
      action: "purge.catalogue",
      actif: true,
    },
    {
      id: "invalidation-structure",
      nom: "Invalidation de la Structure",
      declencheur: "structure.creee",
      condition: { type: "toujours" },
      action: "invalidation.structure",
      actif: true,
    },
    {
      id: "invalidation-structure-modifiee",
      nom: "Invalidation de la Structure modifiée",
      declencheur: "structure.modifiee",
      condition: { type: "toujours" },
      action: "invalidation.structure",
      actif: true,
    },
    {
      id: "invalidation-structure-supprimee",
      nom: "Invalidation de la Structure supprimée",
      declencheur: "structure.supprimee",
      condition: { type: "toujours" },
      action: "invalidation.structure",
      actif: true,
    },
    {
      id: "digest-stock-bas",
      nom: "Digest du stock bas",
      declencheur: "planification.digest-stock-bas",
      condition: { type: "toujours" },
      action: "digest.stock-bas",
      actif: true,
    },
    {
      id: "reconciliation-recherche",
      nom: "Réconciliation de la recherche",
      declencheur: "planification.reconciliation-recherche",
      condition: { type: "toujours" },
      action: "reconciliation.recherche",
      actif: true,
    },
    {
      id: "digest-proprietaire",
      nom: "Digest du propriétaire",
      declencheur: "planification.digest-stock-bas",
      condition: { type: "toujours" },
      action: "digest.proprietaire",
      actif: false,
    },
  ].map((regle) => verifierRegle(regle))
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

/**
 * Postgres ne conserve pas l'ordre des clés d'un JSONB : comparer deux
 * instantanés par `JSON.stringify` créerait une révision à chaque semis.
 */
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

/**
 * Écrit une révision seulement si l'instantané a changé : le semis d'un
 * redéploiement et un enregistrement sans modification ne gonflent pas
 * l'audit. Le même écrivain sert le semis et l'éditeur.
 */
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

/**
 * Écrit les règles du code dans la table, sans doublon. Une révision n'est
 * ajoutée que si l'instantané change : le semis d'un redéploiement ne gonfle
 * donc pas l'historique.
 */
export async function semerLesRegles(
  regles: readonly RegleAutomation[] = REGLES_AUTOMATION,
  auteur = "graine"
): Promise<void> {
  for (const regle of regles) {
    const verifiee = verifierRegle(regle)
    await prisma.$transaction(async (tx) => {
      await tx.automationRule.upsert({
        where: { id: verifiee.id },
        create: {
          id: verifiee.id,
          name: verifiee.nom,
          enabled: verifiee.actif,
          trigger: verifiee.declencheur,
          condition: verifiee.condition,
          action: verifiee.action,
          actionConfig: verifiee.configuration ?? Prisma.DbNull,
        },
        update: {
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
  }
}

export type TypeEvenementRegle = TypeEvenementAutomation
