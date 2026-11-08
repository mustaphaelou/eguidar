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
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  toIndexableProduct,
  type IndexableProduct,
} from "@/lib/index-projection"
import type { DemandePurge } from "@/lib/purge-edge"
import {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"

export interface EntreeEmailDigest {
  destinataire: string
  sujet: string
  texte: string
  cleIdempotence: string
}

/** Le port e-mail : seul endroit où une clé d'idempotence est vérifiable. */
export interface PortEmailsAutomation {
  envoyerConfirmationCommande(
    snapshot: OrderEmailSnapshot,
    cleIdempotence: string
  ): Promise<void>
  envoyerStatutCommande(
    snapshot: OrderEmailSnapshot,
    statut: OrderStatus,
    cleIdempotence: string
  ): Promise<void>
  envoyerDigest(entree: EntreeEmailDigest): Promise<void>
}

export interface PortRechercheAutomation {
  indexer(produits: readonly IndexableProduct[]): Promise<void>
  desindexer(produitId: string): Promise<void>
  listerDocuments(): Promise<readonly IndexableProduct[]>
}

export interface PortCatalogueAutomation {
  revaliderCatalogue(produit: CatalogueEventProduct): void | Promise<void>
  revaliderStructure(): void | Promise<void>
  purger(demande: DemandePurge): Promise<void>
}

export interface DependancesAutomations {
  emails: PortEmailsAutomation
  recherche: PortRechercheAutomation
  catalogue: PortCatalogueAutomation
  maintenant: Date
  signaler: (message: string) => void
}

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

/**
 * Le destinataire d'un digest est nommé par une variable d'environnement
 * (ADR-0044) : la valeur est lue ici, jamais écrite en base ni affichée. Une
 * variable absente ou invalide est une panne nommée — sans sa valeur.
 */
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
  // Le Tableau de bord est la seule définition du stock bas : le digest relit
  // ses variantes au lieu de rejouer le seuil et l'agrégat une seconde fois.
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
      caEncaisse30j: stats.caEncaisse30j,
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

/**
 * Les actions qui n'ont pas de genre : leurs déclencheurs sont planifiés et
 * elles ne redéclarent aucun plan. Les actions durables sont exécutées par les
 * ponts d'entité, à partir du plan redéclaré depuis la Charge.
 */
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
