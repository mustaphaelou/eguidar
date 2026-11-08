import type { DependancesAutomations } from "@/lib/automations/actions"
import type { Charge, TypeEvenementAutomation } from "@/lib/automations/charge"
import type {
  ConsequenceApresEcriture,
  ConsequenceCatalogue,
  ConsequenceCommande,
  ConsequenceStructure,
  GenreEcriture,
} from "@/lib/apres-ecriture"
import { prisma } from "@/lib/db"
import {
  cleIdempotenceEmailPlacee,
  cleIdempotenceEmailStatut,
} from "@/lib/emails"
import { toIndexableProduct } from "@/lib/index-projection"
import {
  chaineDeLaStructure,
  demandeDePurgeCatalogue,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
import {
  executerUne as executerUneCatalogue,
  type DocumentCatalogue,
  type EffetsCatalogue,
  type LecturesCatalogue,
} from "@/lib/use-cases/apres-ecriture/catalogue"
import {
  executerUne as executerUneCommande,
  type EffetsCommande,
} from "@/lib/use-cases/apres-ecriture/commande"
import {
  executerUne as executerUneStructure,
  type EffetsStructure,
  type LecturesStructure,
} from "@/lib/use-cases/apres-ecriture/structure"
import {
  supprimerImagesCategorieDuStockage,
  supprimerImagesProduitDuStockage,
} from "@/lib/use-cases/images-produit"
import { lireStructure } from "@/lib/use-cases/lecture-structure"

/**
 * Un pont d'entité : il construit les ports et les lectures que le travailleur
 * possède, puis confie une conséquence du plan à l'adaptateur de l'entité.
 * L'échec remonte, c'est lui qui fait échouer l'Exécution.
 */
export interface PontExecution {
  executerUne(consequence: ConsequenceApresEcriture): Promise<void>
}

function pontCommande(dependances: DependancesAutomations): PontExecution {
  const effets: EffetsCommande = {
    sendOrderPlacedEmail: (snapshot) =>
      dependances.emails.envoyerConfirmationCommande(
        snapshot,
        cleIdempotenceEmailPlacee(snapshot.orderId)
      ),
    sendOrderStatusEmail: (snapshot, statut) =>
      dependances.emails.envoyerStatutCommande(
        snapshot,
        statut,
        cleIdempotenceEmailStatut(snapshot.orderId, statut)
      ),
    invalidateCommande: () => {
      throw new Error("invalidation de Commande non durable : hors travailleur")
    },
    invalidateProduits: async () => {
      throw new Error("purge de Commande non durable : hors travailleur")
    },
  }
  return {
    executerUne: (consequence) =>
      executerUneCommande(consequence as ConsequenceCommande, effets, {}),
  }
}

type ChargeProduitDurable =
  | Charge<"produit.enregistre">
  | Charge<"produit.supprime">
  | Charge<"variante.stock.changee">

function identifiantDeLaCharge(charge: ChargeProduitDurable): string {
  return charge.produitId
}

async function evenementCatalogue(
  type: TypeEvenementAutomation,
  charge: ChargeProduitDurable
): Promise<CatalogueEventProduct> {
  switch (type) {
    case "produit.enregistre": {
      const c = charge as Charge<"produit.enregistre">
      const lecture = await lireStructure()
      const previousSlug =
        c.slugPrecedent && c.slugPrecedent !== c.slug
          ? c.slugPrecedent
          : undefined
      return {
        id: c.produitId,
        slug: c.slug,
        previousSlug,
        categoryChain: chaineDeLaStructure(lecture, c.categoryId),
        previousCategoryChain: chaineDeLaStructure(
          lecture,
          c.categoryIdPrecedent
        ),
      }
    }
    case "produit.supprime": {
      const c = charge as Charge<"produit.supprime">
      const lecture = await lireStructure()
      return {
        id: c.produitId,
        slug: c.slug,
        categoryChain: chaineDeLaStructure(lecture, c.categoryId),
      }
    }
    default: {
      // Le changement de stock n'a qu'une invalidation non durable : la lecture
      // n'est jamais demandée, mais un événement vide garde le pont total.
      const c = charge as Charge<"variante.stock.changee">
      return { id: c.produitId, slug: "", categoryChain: [] }
    }
  }
}

function pontCatalogue(
  dependances: DependancesAutomations,
  type: TypeEvenementAutomation,
  charge: ChargeProduitDurable
): PontExecution {
  let evenementLu: Promise<CatalogueEventProduct> | undefined
  const evenement = () => (evenementLu ??= evenementCatalogue(type, charge))
  let documentsLus: Promise<readonly DocumentCatalogue[]> | undefined
  const documents = () =>
    (documentsLus ??= (async () => {
      const produit = await prisma.product.findUnique({
        where: { id: identifiantDeLaCharge(charge) },
        include: { variants: true, category: true },
      })
      if (!produit) return []
      return [
        {
          indexable: toIndexableProduct(produit),
          evenement: await evenement(),
        },
      ]
    })())

  const effets: EffetsCatalogue = {
    reindexProducts: dependances.recherche.indexer,
    removeProductFromIndex: dependances.recherche.desindexer,
    revalidateCatalog: dependances.catalogue.revaliderCatalogue,
    purgeCatalogue: (produit) =>
      dependances.catalogue.purger(demandeDePurgeCatalogue(produit)),
    deleteImages: supprimerImagesProduitDuStockage,
  }
  const lectures: LecturesCatalogue = {
    documents,
    evenements: async () => [await evenement()],
  }
  return {
    executerUne: (consequence) =>
      executerUneCatalogue(
        consequence as ConsequenceCatalogue,
        effets,
        lectures
      ),
  }
}

function pontStructure(dependances: DependancesAutomations): PontExecution {
  const effets: EffetsStructure = {
    reindexProducts: dependances.recherche.indexer,
    revalidateCategories: () => dependances.catalogue.revaliderStructure(),
    deleteImage: async (url) => {
      await supprimerImagesCategorieDuStockage([url])
    },
  }
  const lectures: LecturesStructure = {
    structure: lireStructure,
    documents: async (categorieIds) => {
      const produits = await prisma.product.findMany({
        where:
          categorieIds === null
            ? { categoryId: null }
            : { categoryId: { in: [...categorieIds] } },
        include: { variants: true, category: true },
      })
      return produits.map(toIndexableProduct)
    },
  }
  return {
    executerUne: (consequence) =>
      executerUneStructure(
        consequence as ConsequenceStructure,
        effets,
        lectures
      ),
  }
}

export function creerPont(
  genre: GenreEcriture,
  type: TypeEvenementAutomation,
  charge: unknown,
  dependances: DependancesAutomations
): PontExecution {
  switch (genre) {
    case "commande.creee":
    case "commande.statut.changee":
      return pontCommande(dependances)
    case "produit.enregistre":
    case "produit.supprime":
    case "variante.stock.changee":
      return pontCatalogue(dependances, type, charge as ChargeProduitDurable)
    case "structure.creee":
    case "structure.modifiee":
    case "structure.supprimee":
      return pontStructure(dependances)
    default:
      throw new Error(`aucun pont durable pour le genre « ${genre} »`)
  }
}
