import {
  sendDigestEmail,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  type OrderEmailSnapshot,
} from "@/lib/emails"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import type { IndexableProduct } from "@/lib/index-projection"
import {
  deleteProductDocument,
  indexProductDocuments,
  listProductDocuments,
} from "@/lib/meili"
import type { DemandePurge } from "@/lib/purge-edge"
import {
  invalidateStructureDurable,
  purgerEdgeDurable,
  revaliderCatalogue,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
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

export interface PortImagesAutomation {
  supprimerImagesProduit(urls: readonly string[]): Promise<void>
  supprimerImageStructure(url: string): Promise<void>
}

export interface DependancesAutomations {
  emails: PortEmailsAutomation
  recherche: PortRechercheAutomation
  catalogue: PortCatalogueAutomation
  images: PortImagesAutomation
  maintenant: Date
  signaler: (message: string) => void
}

export function dependancesAutomations(
  maintenant: Date
): DependancesAutomations {
  return {
    emails: {
      envoyerConfirmationCommande: sendOrderPlacedEmail,
      envoyerStatutCommande: (snapshot, statut, cleIdempotence) =>
        sendOrderStatusEmail(snapshot, statut, cleIdempotence),
      envoyerDigest: sendDigestEmail,
    },
    recherche: {
      indexer: indexProductDocuments,
      async desindexer(produitId) {
        await deleteProductDocument(produitId)
      },
      listerDocuments: listProductDocuments,
    },
    catalogue: {
      revaliderCatalogue,
      revaliderStructure: invalidateStructureDurable,
      purger: purgerEdgeDurable,
    },
    images: {
      supprimerImagesProduit: supprimerImagesProduitDuStockage,
      async supprimerImageStructure(url) {
        await supprimerImagesCategorieDuStockage([url])
      },
    },
    maintenant,
    signaler: (message) => console.info(`[automatisations] ${message}`),
  }
}
