import type { DependancesAutomations } from "@/lib/automations/actions"
import type { Charge, TypeEvenementAutomation } from "@/lib/automations/charge"
import type {
  ConsequenceApresEcriture,
  ConsequenceCatalogue,
  ConsequenceCommande,
  ConsequenceStructure,
  GenreEcriture,
} from "@/lib/apres-ecriture"
import { BRANCHE_SANS_STRUCTURE } from "@/lib/apres-ecriture"
import { prisma } from "@/lib/db"
import {
  cleIdempotenceEmailPlacee,
  cleIdempotenceEmailStatut,
} from "@/lib/emails"
import {
  toIndexableProduct,
  type IndexableProduct,
} from "@/lib/index-projection"
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
import { memoise } from "@/lib/use-cases/apres-ecriture/executeur"
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
  }
  return {
    executerUne: (consequence) =>
      executerUneCommande(consequence as ConsequenceCommande, effets),
  }
}

type ChargeProduitDurable =
  | Charge<"produit.enregistre">
  | Charge<"produit.supprime">
  | Charge<"variante.stock.changee">

function identifiantDeLaCharge(charge: ChargeProduitDurable): string {
  return charge.produitId
}

export class EvenementCatalogueNonDurableError extends Error {
  constructor(readonly type: TypeEvenementAutomation) {
    super(`aucun Événement Catalogue durable pour « ${type} »`)
    this.name = "EvenementCatalogueNonDurableError"
  }
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
    default:
      throw new EvenementCatalogueNonDurableError(type)
  }
}

function documentSansEvenement(indexable: IndexableProduct): DocumentCatalogue {
  return {
    indexable,
    get evenement(): CatalogueEventProduct {
      throw new EvenementCatalogueNonDurableError("variante.stock.changee")
    },
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
      const indexable = toIndexableProduct(produit)
      if (type === "variante.stock.changee") {
        return [documentSansEvenement(indexable)]
      }
      return [{ indexable, evenement: await evenement() }]
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
  const arbre = memoise(() => lireStructure())
  const documentsParBranche = new Map<string, Promise<IndexableProduct[]>>()
  function documents(
    categorieIds: readonly string[] | null
  ): Promise<IndexableProduct[]> {
    const cle =
      categorieIds === null ? BRANCHE_SANS_STRUCTURE : categorieIds.join(",")
    const memorise = documentsParBranche.get(cle)
    if (memorise) return memorise
    const documents = (async () => {
      const produits = await prisma.product.findMany({
        where:
          categorieIds === null
            ? { categoryId: null }
            : { categoryId: { in: [...categorieIds] } },
        include: { variants: true, category: true },
      })
      return produits.map(toIndexableProduct)
    })()
    documentsParBranche.set(cle, documents)
    return documents
  }
  const lectures: LecturesStructure = { structure: arbre, documents }
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
  charge: Charge<TypeEvenementAutomation>,
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
