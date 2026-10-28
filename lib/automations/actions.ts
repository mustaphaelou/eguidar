import { z } from "zod"

import type {
  TypeEvenementAutomation,
  TypeEntiteAutomation,
} from "@/lib/automations/evenements"
import {
  construireDigestProprietaire,
  construireDigestStockBas,
  construireReconciliation,
  type LigneStockBas,
} from "@/lib/automations/digests"
import {
  cleIdempotenceEmailPlacee,
  cleIdempotenceEmailStatut,
  type OrderEmailSnapshot,
} from "@/lib/emails"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  toIndexableProduct,
  type IndexableProduct,
} from "@/lib/index-projection"
import type { DemandePurge } from "@/lib/purge-edge"
import { STATUTS_VALIDES } from "@/lib/statut-de-commande"
import {
  demandeDePurgeCatalogue,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
import type {
  ActionAutomation,
  RegleAutomation,
} from "@/lib/automations/regles"

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
  regle: Pick<RegleAutomation, "id" | "action">
  dependances: DependancesAutomations
}

const emailSnapshotSchema = z.object({
  userEmail: z.string().min(1),
  orderId: z.string().min(1),
  items: z.array(
    z.object({
      productName: z.string(),
      variantName: z.string(),
      quantity: z.number().int(),
      price: z.number().int(),
    })
  ),
  total: z.number().int(),
  shippingFee: z.number().int(),
  totalPayable: z.number().int(),
  cityName: z.string(),
  address: z.string(),
  phone: z.string(),
})

const payloadCommandeCreee = z.object({ snapshot: emailSnapshotSchema })
const payloadCommandeStatut = payloadCommandeCreee.extend({
  statut: z.enum(STATUTS_VALIDES as [string, ...string[]]),
})
const payloadProduit = z.object({
  produitId: z.string().min(1),
  slug: z.string().min(1),
  slugPrecedent: z.string().nullish(),
  categoryId: z.string().nullish(),
  categoryIdPrecedent: z.string().nullish(),
})
const payloadVariante = z.object({ produitId: z.string().min(1) })
const payloadStructure = z.object({ categorieId: z.string().min(1) })
const payloadJour = z.object({ jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

function destinataireDuProprietaire(): string {
  const email = (process.env.ADMIN_EMAIL ?? "").trim()
  if (!email) throw new Error("ADMIN_EMAIL absent : digest non envoyé")
  return email
}

function chainesDepuis(
  payload: z.infer<typeof payloadProduit>
): CatalogueEventProduct {
  return {
    id: payload.produitId,
    slug: payload.slug,
    previousSlug:
      payload.slugPrecedent && payload.slugPrecedent !== payload.slug
        ? payload.slugPrecedent
        : undefined,
    categoryChain: [],
    previousCategoryChain: [],
  }
}

async function chargerLaStructure() {
  const { lireStructure } = await import("@/lib/use-cases/lecture-structure")
  const { chaineDeLaStructure } =
    await import("@/lib/use-cases/cache-invalidation")
  return { lecture: await lireStructure(), chaineDeLaStructure }
}

async function evenementCatalogue(
  payload: z.infer<typeof payloadProduit>
): Promise<CatalogueEventProduct> {
  const { lecture, chaineDeLaStructure } = await chargerLaStructure()
  const base = chainesDepuis(payload)
  return {
    ...base,
    categoryChain: chaineDeLaStructure(lecture, payload.categoryId),
    previousCategoryChain: chaineDeLaStructure(
      lecture,
      payload.categoryIdPrecedent
    ),
  }
}

async function chargerProduitIndexable(produitId: string) {
  const { prisma } = await import("@/lib/db")
  return prisma.product.findUnique({
    where: { id: produitId },
    include: { variants: true, category: true },
  })
}

async function envoyerConfirmationCommande(
  contexte: ContexteAction
): Promise<void> {
  const { snapshot } = payloadCommandeCreee.parse(contexte.evenement.payload)
  await contexte.dependances.emails.envoyerConfirmationCommande(
    snapshot,
    cleIdempotenceEmailPlacee(snapshot.orderId)
  )
}

async function envoyerStatutCommande(contexte: ContexteAction): Promise<void> {
  const { snapshot, statut } = payloadCommandeStatut.parse(
    contexte.evenement.payload
  )
  await contexte.dependances.emails.envoyerStatutCommande(
    snapshot,
    statut as OrderStatus,
    cleIdempotenceEmailStatut(snapshot.orderId, statut as OrderStatus)
  )
}

async function indexerProduit(contexte: ContexteAction): Promise<void> {
  const payload = payloadProduit
    .pick({ produitId: true })
    .parse(contexte.evenement.payload)
  const produit = await chargerProduitIndexable(payload.produitId)
  if (!produit) return
  await contexte.dependances.recherche.indexer([toIndexableProduct(produit)])
}

async function desindexerProduit(contexte: ContexteAction): Promise<void> {
  const payload = payloadProduit
    .pick({ produitId: true })
    .parse(contexte.evenement.payload)
  await contexte.dependances.recherche.desindexer(payload.produitId)
}

async function invaliderCatalogue(contexte: ContexteAction): Promise<void> {
  const payload = payloadProduit.parse(contexte.evenement.payload)
  await contexte.dependances.catalogue.revaliderCatalogue(
    await evenementCatalogue(payload)
  )
}

async function purgerCatalogue(contexte: ContexteAction): Promise<void> {
  const payload = payloadProduit.parse(contexte.evenement.payload)
  await contexte.dependances.catalogue.purger(
    demandeDePurgeCatalogue(await evenementCatalogue(payload))
  )
}

async function invaliderStructure(contexte: ContexteAction): Promise<void> {
  payloadStructure.parse(contexte.evenement.payload)
  await contexte.dependances.catalogue.revaliderStructure()
}

async function envoyerDigestStockBas(contexte: ContexteAction): Promise<void> {
  const { jour } = payloadJour.parse(contexte.evenement.payload)
  const { prisma } = await import("@/lib/db")
  const { LOW_STOCK_THRESHOLD } =
    await import("@/lib/use-cases/admin-dashboard")
  const variantes = await prisma.productVariant.findMany({
    where: { stock: { lte: LOW_STOCK_THRESHOLD } },
    include: { product: { select: { name: true } } },
  })
  const lignes: LigneStockBas[] = variantes.map((variante) => ({
    produit: variante.product.name,
    variante: variante.name,
    sku: variante.sku,
    stock: variante.stock,
  }))
  await contexte.dependances.emails.envoyerDigest({
    destinataire: destinataireDuProprietaire(),
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
  const { jour } = payloadJour.parse(contexte.evenement.payload)
  const { getDashboardStats } = await import("@/lib/use-cases/admin-dashboard")
  const stats = await getDashboardStats()
  await contexte.dependances.emails.envoyerDigest({
    destinataire: destinataireDuProprietaire(),
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
  const { jour } = payloadJour.parse(contexte.evenement.payload)
  const { prisma } = await import("@/lib/db")
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

const ACTIONS: Record<
  ActionAutomation,
  (contexte: ContexteAction) => Promise<void>
> = {
  "email.commande-creee": envoyerConfirmationCommande,
  "email.commande-statut": envoyerStatutCommande,
  "index.produit": indexerProduit,
  "desindex.produit": desindexerProduit,
  "invalidation.catalogue": invaliderCatalogue,
  "invalidation.structure": invaliderStructure,
  "purge.catalogue": purgerCatalogue,
  "digest.stock-bas": envoyerDigestStockBas,
  "digest.proprietaire": envoyerDigestProprietaire,
  "reconciliation.recherche": reconcilierRecherche,
}

export async function executerLAction(contexte: ContexteAction): Promise<void> {
  const action = ACTIONS[contexte.regle.action]
  if (!action) {
    throw new Error(`action inconnue : ${contexte.regle.action}`)
  }
  await action(contexte)
}
