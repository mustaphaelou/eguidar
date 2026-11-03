import { z } from "zod"

import { CHARGES_PAR_DECLENCHEUR } from "@/lib/automations/charge"

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
import type {
  ActionAutomation,
  ConfigurationRegle,
  RegleAutomation,
} from "@/lib/automations/regles"
import { prisma } from "@/lib/db"
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
import {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"
import {
  chaineDeLaStructure,
  demandeDePurgeCatalogue,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import {
  supprimerImagesCategorieDuStockage,
  supprimerImagesProduitDuStockage,
} from "@/lib/use-cases/images-produit"

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

async function evenementCatalogue(
  payload: z.infer<typeof payloadProduit>
): Promise<CatalogueEventProduct> {
  const lecture = await lireStructure()
  const previousSlug =
    payload.slugPrecedent && payload.slugPrecedent !== payload.slug
      ? payload.slugPrecedent
      : undefined
  return {
    id: payload.produitId,
    slug: payload.slug,
    previousSlug,
    categoryChain: chaineDeLaStructure(lecture, payload.categoryId),
    previousCategoryChain: chaineDeLaStructure(
      lecture,
      payload.categoryIdPrecedent
    ),
  }
}

async function chargerProduitIndexable(produitId: string) {
  return prisma.product.findUnique({
    where: { id: produitId },
    include: { variants: true, category: true },
  })
}

async function envoyerConfirmationCommande(
  contexte: ContexteAction
): Promise<void> {
  const charge = contexte.evenement.payload as { snapshot: OrderEmailSnapshot }
  const { snapshot } = charge
  await contexte.dependances.emails.envoyerConfirmationCommande(
    snapshot,
    cleIdempotenceEmailPlacee(snapshot.orderId)
  )
}

async function envoyerStatutCommande(contexte: ContexteAction): Promise<void> {
  const charge = contexte.evenement.payload as {
    snapshot: OrderEmailSnapshot
    statut: OrderStatus
  }
  const { snapshot, statut } = charge
  await contexte.dependances.emails.envoyerStatutCommande(
    snapshot,
    statut as OrderStatus,
    cleIdempotenceEmailStatut(snapshot.orderId, statut as OrderStatus)
  )
}

async function indexerProduit(contexte: ContexteAction): Promise<void> {
  const { produitId } = contexte.evenement.payload as { produitId: string }
  const produit = await chargerProduitIndexable(produitId)
  if (!produit) return
  await contexte.dependances.recherche.indexer([toIndexableProduct(produit)])
}

async function desindexerProduit(contexte: ContexteAction): Promise<void> {
  const { produitId } = contexte.evenement.payload as { produitId: string }
  await contexte.dependances.recherche.desindexer(produitId)
}

async function invaliderCatalogue(contexte: ContexteAction): Promise<void> {
  const payload = contexte.evenement.payload as z.infer<
    typeof CHARGES_PAR_DECLENCHEUR["produit.enregistre"]
  >
  await contexte.dependances.catalogue.revaliderCatalogue(
    await evenementCatalogue(payload)
  )
}

async function purgerCatalogue(contexte: ContexteAction): Promise<void> {
  const payload = contexte.evenement.payload as z.infer<
    typeof CHARGES_PAR_DECLENCHEUR["produit.enregistre"]
  >
  await contexte.dependances.catalogue.purger(
    demandeDePurgeCatalogue(await evenementCatalogue(payload))
  )
}

async function invaliderStructure(contexte: ContexteAction): Promise<void> {
  // charge déjà validée par la porte
  // Le cache et le bord sont une seule conséquence déclarée : une purge qui
  // échoue fait réessayer l'invalidation entière, cache compris.
  await contexte.dependances.catalogue.revaliderStructure()
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

async function collecterIdsBranche(
  categorieId: string | null
): Promise<string[]> {
  if (!categorieId) return []
  const tous = await prisma.category.findMany({
    select: { id: true, parentId: true },
  })
  const enfants = new Map<string, string[]>()
  for (const c of tous) {
    if (c.parentId) {
      if (!enfants.has(c.parentId)) enfants.set(c.parentId, [])
      enfants.get(c.parentId)!.push(c.id)
    }
  }
  const resultat: string[] = []
  const pile = [categorieId]
  while (pile.length) {
    const id = pile.pop()!
    resultat.push(id)
    for (const enfant of enfants.get(id) ?? []) pile.push(enfant)
  }
  return resultat
}

async function indexerBranche(
  contexte: ContexteAction,
  destination: string | null
): Promise<void> {
  const where =
    destination === null
      ? { categoryId: null }
      : { categoryId: { in: await collecterIdsBranche(destination) } }
  const produits = await prisma.product.findMany({
    where,
    include: { variants: true, category: true },
  })
  if (produits.length > 0) {
    await contexte.dependances.recherche.indexer(
      produits.map(toIndexableProduct)
    )
  }
}

/**
 * L'action résout la branche après le commit : une modification réindexe la
 * branche de la Structure touchée, une suppression les branches de destination
 * (ou les Produits restés sans Structure). La charge ne porte jamais la
 * branche, seulement des identifiants.
 */
async function indexerStructure(contexte: ContexteAction): Promise<void> {
  const payload = contexte.evenement.payload as {
    categorieId?: string | null
    destinations?: string[] | null
    produitsSansStructure?: boolean
  }

  if (contexte.evenement.type !== "structure.supprimee") {
    const categorieId = payload.categorieId
    if (!categorieId) {
      throw new Error("catégorie absente de la charge de la Structure")
    }
    await indexerBranche(contexte, categorieId)
    return
  }

  const destinations = payload.destinations ?? []
  for (const destination of destinations) {
    if (destination === "sans-structure") {
      await indexerBranche(contexte, null)
    } else {
      await indexerBranche(contexte, destination)
    }
  }
  if (payload.produitsSansStructure === true && !destinations.includes("sans-structure")) {
    await indexerBranche(contexte, null)
  }
}

async function supprimerImages(contexte: ContexteAction): Promise<void> {
  const charge = contexte.evenement.payload as { imagesRetirees?: unknown }
  const urls = Array.isArray(charge.imagesRetirees)
    ? charge.imagesRetirees.filter((u): u is string => typeof u === "string")
    : []
  if (urls.length === 0) return
  // Le même fait nomme l'URL ; l'entité de l'Événement choisit l'espace de
  // noms, car l'image d'une Structure vit hors du préfixe des Images produit.
  if (contexte.evenement.entityType === "categorie") {
    await supprimerImagesCategorieDuStockage(urls)
    return
  }
  await supprimerImagesProduitDuStockage(urls)
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
  "index.structure": indexerStructure,
  "suppression.images": supprimerImages,
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
