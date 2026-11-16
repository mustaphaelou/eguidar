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
  memoise,
  type GestionnairesPour,
} from "./executeur"

export interface EffetsStructure {
  reindexProducts(products: IndexableProduct[]): Promise<void>
  revalidateCategories(): Promise<void> | void
  deleteImage(url: string): Promise<void>
}

export interface LecturesStructure {
  structure?: () => Promise<Pick<LectureStructure, "branche">>
  documents?: (
    categorieIds: readonly string[] | null
  ) => Promise<IndexableProduct[]>
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
      if (produits.length > 0) await effets.reindexProducts(produits)
    },
    "invalidation-cache": () => effets.revalidateCategories(),
  }
}

export async function executer(
  plan: PlanStructure,
  effets: EffetsStructure,
  lectures: LecturesStructure = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets, lectures), journal)
}

export async function executerUne(
  consequence: ConsequenceStructure,
  effets: EffetsStructure,
  lectures: LecturesStructure = {}
): Promise<void> {
  await executerUneConséquence(consequence, gestionnaires(effets, lectures))
}
