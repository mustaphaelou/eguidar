import type {
  ConsequenceCatalogue,
  IdentiteProduitCatalogue,
  PlanCatalogue,
} from "@/lib/apres-ecriture"
import type { PreuvePromotion } from "@/lib/cycle-vie-image-produit"
import type { IndexableProduct } from "@/lib/index-projection"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"
import type { EntreeRegistreImageProduit } from "@/lib/use-cases/images-produit"
import {
  journalEffetsConsole,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"

import {
  LectureManquanteError,
  executerPlan,
  executerUne as executerUneConséquence,
  type GestionnairesPour,
} from "./executeur"

/**
 * Les ports du Catalogue que l'adaptateur projette. Ils sont tous optionnels :
 * le Texte alternatif n'a que la révalidation de cache, et le travailleur ne
 * rejoue que les effets durables. Un port absent qu'une conséquence exige
 * échoue par un nom, jamais en silence.
 */
export interface EffetsCatalogue {
  reindexProducts?(produits: IndexableProduct[]): Promise<void>
  removeProductFromIndex?(produitId: string): Promise<void>
  revalidateCatalog?(produit: CatalogueEventProduct): Promise<void> | void
  purgeCatalogue?(produit: CatalogueEventProduct): Promise<void> | void
  deleteImages?(urls: string[]): Promise<void>
  enregistrerImages?(
    entrees: readonly EntreeRegistreImageProduit[],
    createdBy: string | null
  ): Promise<void>
  cycleVie?: {
    supprimerSources(promotions: readonly PreuvePromotion[]): Promise<void>
  }
}

/**
 * Un document indexable et l'événement Catalogue du même Produit. Les deux
 * viennent d'une lecture après commit ; l'adaptateur les mémoïse ensemble pour
 * que l'invalidation et la purge ne relisent pas la Structure.
 */
export interface DocumentCatalogue {
  indexable: IndexableProduct
  evenement: CatalogueEventProduct
}

/**
 * Les lectures après commit du Catalogue. Elles sont paresseuses et mémoïsées
 * une fois par plan. Une lecture absente lève `LectureManquanteError`.
 */
export interface LecturesCatalogue {
  documents?: () => Promise<readonly DocumentCatalogue[]>
  evenements?: () => Promise<readonly CatalogueEventProduct[]>
}

export class PortCatalogueManquantError extends Error {
  constructor(readonly port: string) {
    super(`port Catalogue manquant : ${port}`)
    this.name = "PortCatalogueManquantError"
  }
}

export class EvenementCatalogueIntrouvableError extends Error {
  constructor(readonly produitId: string) {
    super(`événement Catalogue introuvable pour le Produit ${produitId}`)
    this.name = "EvenementCatalogueIntrouvableError"
  }
}

function memoise<T>(lire: () => Promise<T>): () => Promise<T> {
  let valeur: Promise<T> | undefined
  return () => (valeur ??= lire())
}

function port<T>(valeur: T | undefined, nom: string): NonNullable<T> {
  if (valeur === undefined) throw new PortCatalogueManquantError(nom)
  return valeur as NonNullable<T>
}

function gestionnaires(
  effets: EffetsCatalogue,
  lectures: LecturesCatalogue
): GestionnairesPour<ConsequenceCatalogue> {
  const documents = memoise(() => {
    if (!lectures.documents) throw new LectureManquanteError("documents")
    return lectures.documents()
  })
  const evenements = memoise(() => {
    if (!lectures.evenements) throw new LectureManquanteError("evenements")
    return lectures.evenements()
  })

  async function evenementDu(
    produitId: string
  ): Promise<CatalogueEventProduct> {
    const evenement = (await evenements()).find(
      (candidat) => candidat.id === produitId
    )
    if (!evenement) throw new EvenementCatalogueIntrouvableError(produitId)
    return evenement
  }

  return {
    "registre-images": async (consequence) => {
      if (consequence.payload.entrees.length === 0) return
      await port(effets.enregistrerImages, "enregistrerImages")(
        consequence.payload.entrees,
        consequence.payload.ownerId
      )
    },
    "suppression-brouillons": async (consequence) => {
      if (consequence.payload.promotions.length === 0) return
      const cycleVie = port(effets.cycleVie, "cycleVie")
      await cycleVie.supprimerSources(consequence.payload.promotions)
    },
    "suppression-images": async (consequence) => {
      if (consequence.payload.urls.length === 0) return
      await port(
        effets.deleteImages,
        "deleteImages"
      )([...consequence.payload.urls])
    },
    reindexation: async () => {
      const documentsLus = await documents()
      const indexables = documentsLus.map((document) => document.indexable)
      if (indexables.length === 0) return
      await port(effets.reindexProducts, "reindexProducts")(indexables)
    },
    desindexation: async (consequence) => {
      await port(
        effets.removeProductFromIndex,
        "removeProductFromIndex"
      )(consequence.payload.produitId)
    },
    "invalidation-cache": async (consequence) => {
      await port(
        effets.revalidateCatalog,
        "revalidateCatalog"
      )(await evenementDu(consequence.payload.produit.id))
    },
    "purge-catalogue": async (consequence) => {
      await port(
        effets.purgeCatalogue,
        "purgeCatalogue"
      )(await evenementDu(consequence.payload.produit.id))
    },
  }
}

/**
 * La tentative immédiate d'un plan de Catalogue : ordre déclaré, isolation,
 * mesure et journal, jamais d'exception.
 */
export async function executer(
  plan: PlanCatalogue,
  effets: EffetsCatalogue,
  lectures: LecturesCatalogue = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets, lectures), journal)
}

/**
 * Une conséquence de Catalogue pour le travailleur : l'échec remonte.
 */
export async function executerUne(
  consequence: ConsequenceCatalogue,
  effets: EffetsCatalogue,
  lectures: LecturesCatalogue = {}
): Promise<void> {
  await executerUneConséquence(consequence, gestionnaires(effets, lectures))
}

export type { IdentiteProduitCatalogue }
