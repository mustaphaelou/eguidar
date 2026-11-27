import type { DependancesAutomations } from "@/lib/automations/dependances"
import type {
  TypeEntiteAutomation,
  TypeEvenementAutomation,
} from "@/lib/automations/evenements"
import {
  construireDigestProprietaire,
  construireDigestStockBas,
  construireReconciliation,
  type LigneStockBas,
} from "@/lib/automations/digests"
import type {
  ActionAutomation,
  ConfigurationRegle,
  RegleAutomation,
} from "@/lib/automations/regles"
import { prisma } from "@/lib/db"
import { toIndexableProduct } from "@/lib/index-projection"
import {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"

export interface ContexteAction {
  evenement: {
    type: TypeEvenementAutomation
    entityType: TypeEntiteAutomation
    entityId: string
    payload: unknown
  }
  regle: Pick<RegleAutomation, "id" | "action"> & {
    configuration?: ConfigurationRegle
  }
  dependances: DependancesAutomations
}

export const VARIABLE_DESTINATAIRE_PAR_DEFAUT = "ADMIN_EMAIL"

const ADRESSE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function destinataireDuProprietaire(contexte: ContexteAction): string {
  const variable =
    contexte.regle.configuration?.destinataireVariable ??
    VARIABLE_DESTINATAIRE_PAR_DEFAUT
  const valeur = (process.env[variable] ?? "").trim()
  if (!valeur) {
    throw new Error(
      `variable d'environnement ${variable} absente ou vide : digest non envoyé`
    )
  }
  if (!ADRESSE_EMAIL.test(valeur)) {
    throw new Error(
      `variable d'environnement ${variable} ne contient pas une adresse valide : digest non envoyé`
    )
  }
  return valeur
}

async function envoyerDigestStockBas(contexte: ContexteAction): Promise<void> {
  const { jour } = contexte.evenement.payload as { jour: string }
  const stats = await getDashboardStats()
  const lignes: LigneStockBas[] = stats.lowStockVariants.map((variante) => ({
    produit: variante.productName,
    variante: variante.name,
    sku: variante.sku,
    stock: variante.stock,
  }))
  await contexte.dependances.emails.envoyerDigest({
    destinataire: destinataireDuProprietaire(contexte),
    sujet: `Eguidar — stock bas du ${jour}`,
    texte: construireDigestStockBas({
      jour,
      seuil: LOW_STOCK_THRESHOLD,
      lignes,
    }),
    cleIdempotence: `digest.stock-bas/${jour}`,
  })
}

async function envoyerDigestProprietaire(
  contexte: ContexteAction
): Promise<void> {
  const { jour } = contexte.evenement.payload as { jour: string }
  const stats = await getDashboardStats()
  await contexte.dependances.emails.envoyerDigest({
    destinataire: destinataireDuProprietaire(contexte),
    sujet: `Eguidar — tableau de bord du ${jour}`,
    texte: construireDigestProprietaire({
      jour,
      produitCount: stats.productCount,
      commandeEnAttente: stats.pendingOrderCount,
      chiffreAffairesNet30j: stats.chiffreAffairesNet30j,
      stockBas: stats.lowStockVariants.length,
    }),
    cleIdempotence: `digest.proprietaire/${jour}`,
  })
}

async function reconcilierRecherche(contexte: ContexteAction): Promise<void> {
  const { jour } = contexte.evenement.payload as { jour: string }
  const produits = await prisma.product.findMany({
    include: { variants: true, category: true },
  })
  const documents = await contexte.dependances.recherche.listerDocuments()
  const rapport = construireReconciliation({
    jour,
    produits: produits.map(toIndexableProduct),
    documents,
  })

  if (rapport.aReecrire.length > 0) {
    await contexte.dependances.recherche.indexer(rapport.aReecrire)
  }
  for (const produitId of rapport.aRetirer) {
    await contexte.dependances.recherche.desindexer(produitId)
  }
  contexte.dependances.signaler(rapport.texte)
}

export const ACTIONS_PLANIFIEES = [
  "digest.stock-bas",
  "digest.proprietaire",
  "reconciliation.recherche",
] as const

export type ActionPlanifiee = (typeof ACTIONS_PLANIFIEES)[number]

export function estActionPlanifiee(
  action: ActionAutomation
): action is ActionPlanifiee {
  return (ACTIONS_PLANIFIEES as readonly string[]).includes(action)
}

const ACTIONS: Record<
  ActionPlanifiee,
  (contexte: ContexteAction) => Promise<void>
> = {
  "digest.stock-bas": envoyerDigestStockBas,
  "digest.proprietaire": envoyerDigestProprietaire,
  "reconciliation.recherche": reconcilierRecherche,
}

export async function executerLAction(
  contexte: ContexteAction & { regle: { action: ActionPlanifiee } }
): Promise<void> {
  const action = ACTIONS[contexte.regle.action]
  if (!action) {
    throw new Error(`action planifiée inconnue : ${contexte.regle.action}`)
  }
  await action(contexte)
}
