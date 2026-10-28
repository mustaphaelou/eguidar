import type {
  DependancesAutomations,
  EntreeEmailDigest,
  PortCatalogueAutomation,
  PortEmailsAutomation,
  PortRechercheAutomation,
} from "@/lib/automations/actions"
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import type { IndexableProduct } from "@/lib/index-projection"
import type { DemandePurge } from "@/lib/purge-edge"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"

export interface AppelEmailMemoire {
  genre: "confirmation" | "statut" | "digest"
  cleIdempotence: string
  destinataire: string
  statut?: OrderStatus
  texte?: string
}

export interface PortEmailsMemoire {
  port: PortEmailsAutomation
  /** Tous les appels, doublons compris — c'est là qu'on lit la clé. */
  appels: AppelEmailMemoire[]
  /** Les envois réels : une clé déjà vue est dédupliquée, comme chez Resend. */
  envoyes: AppelEmailMemoire[]
}

export function creerPortEmailsMemoire(): PortEmailsMemoire {
  const appels: AppelEmailMemoire[] = []
  const envoyes: AppelEmailMemoire[] = []
  const clesVues = new Set<string>()

  function recevoir(appel: AppelEmailMemoire): void {
    appels.push(appel)
    if (clesVues.has(appel.cleIdempotence)) return
    clesVues.add(appel.cleIdempotence)
    envoyes.push(appel)
  }

  const port: PortEmailsAutomation = {
    async envoyerConfirmationCommande(
      snapshot: OrderEmailSnapshot,
      cleIdempotence: string
    ) {
      recevoir({
        genre: "confirmation",
        cleIdempotence,
        destinataire: snapshot.userEmail,
      })
    },
    async envoyerStatutCommande(
      snapshot: OrderEmailSnapshot,
      statut: OrderStatus,
      cleIdempotence: string
    ) {
      recevoir({
        genre: "statut",
        cleIdempotence,
        destinataire: snapshot.userEmail,
        statut,
      })
    },
    async envoyerDigest(entree: EntreeEmailDigest) {
      recevoir({
        genre: "digest",
        cleIdempotence: entree.cleIdempotence,
        destinataire: entree.destinataire,
        texte: entree.texte,
      })
    },
  }

  return { port, appels, envoyes }
}

export interface PortRechercheMemoire {
  port: PortRechercheAutomation
  index: Map<string, IndexableProduct>
  operations: (
    | { operation: "indexer"; ids: string[] }
    | { operation: "desindexer"; id: string }
  )[]
}

export function creerPortRechercheMemoire(
  documents: readonly IndexableProduct[] = []
): PortRechercheMemoire {
  const index = new Map(documents.map((document) => [document.id, document]))
  const operations: PortRechercheMemoire["operations"] = []

  return {
    port: {
      async indexer(produits) {
        operations.push({
          operation: "indexer",
          ids: produits.map((produit) => produit.id),
        })
        for (const produit of produits) index.set(produit.id, produit)
      },
      async desindexer(produitId) {
        operations.push({ operation: "desindexer", id: produitId })
        index.delete(produitId)
      },
      async listerDocuments() {
        return [...index.values()]
      },
    },
    index,
    operations,
  }
}

export interface PortCatalogueMemoire {
  port: PortCatalogueAutomation
  invalidations: CatalogueEventProduct[]
  purges: DemandePurge[]
  structures: number
}

export function creerPortCatalogueMemoire(options?: {
  pannePurge?: Error
  panneStructure?: Error
}): PortCatalogueMemoire {
  const memoire: PortCatalogueMemoire = {
    invalidations: [],
    purges: [],
    structures: 0,
    port: {
      revaliderCatalogue(produit) {
        memoire.invalidations.push(produit)
      },
      revaliderStructure() {
        memoire.structures += 1
        if (options?.panneStructure) throw options.panneStructure
      },
      async purger(demande) {
        memoire.purges.push(demande)
        if (options?.pannePurge) throw options.pannePurge
      },
    },
  }
  return memoire
}

export function dependancesDeTest(
  maintenant: Date,
  morceaux: Partial<DependancesAutomations> = {}
): DependancesAutomations {
  return {
    emails: creerPortEmailsMemoire().port,
    recherche: creerPortRechercheMemoire().port,
    catalogue: creerPortCatalogueMemoire().port,
    maintenant,
    signaler: () => {},
    ...morceaux,
  }
}
