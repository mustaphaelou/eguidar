import {
  BRANCHE_SANS_STRUCTURE,
  type ConsequenceStructure,
  type PlanStructure,
} from "@/lib/apres-ecriture"
import type { IndexableProduct } from "@/lib/index-projection"
import type { LectureStructure } from "@/lib/use-cases/lecture-structure"
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
 * Les ports de la Structure que l'adaptateur projette. Ils sont
 * structurellement identiques à `StructureEffects` ; le type vit ici pour que
 * l'adaptateur n'importe pas le cas d'usage qui l'appelle.
 */
export interface EffetsStructure {
  reindexProducts(products: IndexableProduct[]): Promise<void>
  revalidateCategories(): Promise<void> | void
  deleteImage(url: string): Promise<void>
}

/**
 * Les lectures après commit de la Structure. L'arbre résout une branche en ses
 * identifiants de catégories ; les documents indexables sont lus par branche
 * résolue. Les deux sont paresseuses et mémoïsées par plan : l'arbre au plus
 * une fois, chaque branche au plus une fois. Une lecture omise échoue
 * nommément.
 */
export interface LecturesStructure {
  structure?: () => Promise<Pick<LectureStructure, "branche">>
  documents?: (
    categorieIds: readonly string[] | null
  ) => Promise<IndexableProduct[]>
}

function memoise<T>(lire: () => Promise<T>): () => Promise<T> {
  let valeur: Promise<T> | undefined
  return () => (valeur ??= lire())
}

function gestionnaires(
  effets: EffetsStructure,
  lectures: LecturesStructure
): GestionnairesPour<ConsequenceStructure> {
  const arbre = memoise(() => {
    if (!lectures.structure) throw new LectureManquanteError("structure")
    return lectures.structure()
  })
  const documentsParBranche = new Map<string, Promise<IndexableProduct[]>>()

  function documentsDeLaBranche(branche: string): Promise<IndexableProduct[]> {
    const memorise = documentsParBranche.get(branche)
    if (memorise) return memorise
    const documents = (async () => {
      // La branche Sans Structure n'a pas d'identifiant à résoudre dans
      // l'arbre : la supprimer de cette lecture évite de relire la Structure
      // supprimée, et de faire dépendre l'orphelinat d'un arbre.
      const categorieIds =
        branche === BRANCHE_SANS_STRUCTURE
          ? null
          : (await arbre()).branche(branche)
      if (!lectures.documents) throw new LectureManquanteError("documents")
      return lectures.documents(categorieIds)
    })()
    documentsParBranche.set(branche, documents)
    return documents
  }

  return {
    "suppression-images": async (consequence) => {
      for (const url of consequence.payload.urls) {
        await effets.deleteImage(url)
      }
    },
    reindexation: async (consequence) => {
      const produits = await documentsDeLaBranche(consequence.payload.branche)
      // Une branche vide n'appelle pas le port : rien n'a changé à indexer.
      if (produits.length > 0) await effets.reindexProducts(produits)
    },
    "invalidation-cache": () => effets.revalidateCategories(),
  }
}

/**
 * La tentative immédiate d'un plan de Structure : ordre déclaré, isolation,
 * mesure et journal, jamais d'exception.
 */
export async function executer(
  plan: PlanStructure,
  effets: EffetsStructure,
  lectures: LecturesStructure = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets, lectures), journal)
}

/**
 * Une conséquence de Structure pour le travailleur : l'échec remonte, c'est
 * lui qui fait échouer l'Exécution et déclenche la reprise.
 */
export async function executerUne(
  consequence: ConsequenceStructure,
  effets: EffetsStructure,
  lectures: LecturesStructure = {}
): Promise<void> {
  await executerUneConséquence(consequence, gestionnaires(effets, lectures))
}
