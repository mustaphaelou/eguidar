import type { DependancesAutomations } from "@/lib/automations/actions"
import {
  sendDigestEmail,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
} from "@/lib/emails"
import {
  deleteProductDocument,
  indexProductDocuments,
  listProductDocuments,
} from "@/lib/meili"
import {
  invalidateStructureDurable,
  purgerEdgeDurable,
  revaliderCatalogue,
} from "@/lib/use-cases/cache-invalidation"

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
    maintenant,
    signaler: (message) => console.info(`[automatisations] ${message}`),
  }
}
