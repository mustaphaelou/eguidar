import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  TYPES_EVENEMENT_AUTOMATION,
  type TypeEvenementAutomation,
} from "@/lib/automations/evenements"
import { STATUTS_VALIDES } from "@/lib/statut-de-commande"

/**
 * Les actions sont un vocabulaire fermé (ADR-0041) : une règle nomme une
 * action connue, jamais du code, une URL libre ou un secret. Chaque action
 * enveloppe un adaptateur qui existe déjà.
 */
export const ACTIONS_AUTOMATION = Object.freeze([
  "email.commande-creee",
  "email.commande-statut",
  "index.produit",
  "desindex.produit",
  "invalidation.catalogue",
  "invalidation.structure",
  "purge.catalogue",
  "digest.stock-bas",
  "digest.proprietaire",
  "reconciliation.recherche",
] as const)

export type ActionAutomation = (typeof ACTIONS_AUTOMATION)[number]

export const actionAutomationSchema = z.enum(ACTIONS_AUTOMATION)

export const CONDITIONS_AUTOMATION = Object.freeze([
  "toujours",
  "statut-commande",
] as const)

export type TypeConditionAutomation = (typeof CONDITIONS_AUTOMATION)[number]

export type ConditionAutomation =
  { type: "toujours" } | { type: "statut-commande"; statuts: readonly string[] }

export const conditionAutomationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("toujours") }).strict(),
  z
    .object({
      type: z.literal("statut-commande"),
      statuts: z.array(z.enum(STATUTS_VALIDES as [string, ...string[]])).min(0),
    })
    .strict(),
])

export const regleAutomationSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "identifiant de règle invalide"),
  nom: z.string().trim().min(1),
  declencheur: z.enum(TYPES_EVENEMENT_AUTOMATION),
  condition: conditionAutomationSchema,
  action: z.enum(ACTIONS_AUTOMATION),
  actif: z.boolean(),
})

export type RegleAutomation = z.infer<typeof regleAutomationSchema>

export function verifierRegle(regle: unknown): RegleAutomation {
  return regleAutomationSchema.parse(regle)
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

/**
 * Évalue la condition d'une règle sur la charge d'un événement. Une condition
 * inconnue ou une charge qui ne porte pas le champ demandé vaut « non » : la
 * règle ne s'exécute pas, plutôt que de s'exécuter à l'aveugle.
 */
export function laConditionEstRemplie(
  condition: ConditionAutomation,
  payload: unknown
): boolean {
  if (condition.type === "toujours") return true
  if (condition.type === "statut-commande") {
    if (!payload || typeof payload !== "object") return false
    const statut = (payload as { statut?: unknown }).statut
    return typeof statut === "string" && condition.statuts.includes(statut)
  }
  return false
}

function instantane(regle: RegleAutomation) {
  return {
    id: regle.id,
    nom: regle.nom,
    declencheur: regle.declencheur,
    condition: regle.condition,
    action: regle.action,
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
    const instantaneRegle = instantane(verifiee)

    const existante = await prisma.automationRule.findUnique({
      where: { id: verifiee.id },
      include: {
        revisions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    })

    await prisma.automationRule.upsert({
      where: { id: verifiee.id },
      create: {
        id: verifiee.id,
        name: verifiee.nom,
        enabled: verifiee.actif,
        trigger: verifiee.declencheur,
        condition: verifiee.condition,
        action: verifiee.action,
      },
      update: {
        name: verifiee.nom,
        enabled: verifiee.actif,
        trigger: verifiee.declencheur,
        condition: verifiee.condition,
        action: verifiee.action,
      },
    })

    const derniere = existante?.revisions[0]
    if (derniere && memesFaits(derniere.snapshot, instantaneRegle)) continue
    await prisma.automationRuleRevision.create({
      data: {
        ruleId: verifiee.id,
        snapshot: instantaneRegle,
        author: auteur,
      },
    })
  }
}

export type TypeEvenementRegle = TypeEvenementAutomation
