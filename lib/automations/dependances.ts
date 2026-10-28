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
  invalidateStructure,
  purgerEdgeDurable,
  revaliderCatalogue,
} from "@/lib/use-cases/cache-invalidation"

/**
 * Les adaptateurs réels des actions, assemblés une fois. Une panne d'un
 * fournisseur remonte : c'est elle qui déclenche la reprise avec backoff.
 * Une purge non configurée n'est pas une panne — rien à purger.
 */
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
      revaliderStructure: invalidateStructure,
      purger: purgerEdgeDurable,
    },
    maintenant,
    signaler: (message) => console.info(`[automatisations] ${message}`),
  }
}
