import { describe, expect, it, vi } from "vitest"

import type { Charge } from "@/lib/automations/charge"
import {
  BRANCHE_SANS_STRUCTURE,
  declarerApresEcriture,
  type ConsequenceStructure,
  type PlanStructure,
} from "@/lib/apres-ecriture"
import type { IndexableProduct } from "@/lib/index-projection"
import type { LectureStructure } from "@/lib/use-cases/lecture-structure"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import { LectureManquanteError, type GestionnairesPour } from "./executeur"
import {
  executer,
  executerUne,
  type EffetsStructure,
  type LecturesStructure,
} from "./structure"

const CATEGORIE = "categorie-955"
const CIBLE_PRODUITS = "cible-produits-955"
const CIBLE_ENFANTS = "cible-enfants-955"
const IMAGE = "https://cdn.example.test/categories/955.jpg"

function documentDe(id: string): IndexableProduct {
  return {
    id,
    name: `Produit ${id}`,
    slug: `produit-${id}`,
    description: "Description",
    brand: "Marque",
    price: 10000,
    minPrice: 10000,
    totalStock: 1,
    images: [],
    categorySlug: "categorie",
    categoryName: "Catégorie",
    specsText: "",
    variantNames: ["Standard"],
    skus: [`sku-${id}`],
    isFeatured: false,
    freeShipping: false,
    priceBucket: "10000-20000",
    updatedAt: 0,
  }
}

interface Appel {
  port: string
  arguments: unknown[]
}

function portsEnregistreurs(): {
  appels: Appel[]
  effets: EffetsStructure
} {
  const appels: Appel[] = []
  return {
    appels,
    effets: {
      deleteImage: async (url) => {
        appels.push({ port: "suppression-images", arguments: [url] })
      },
      reindexProducts: async (produits) => {
        appels.push({ port: "reindexation", arguments: [produits] })
      },
      revalidateCategories: () => {
        appels.push({ port: "invalidation-cache", arguments: [] })
      },
    },
  }
}

function lecturesEnregistreuses(branches: Record<string, string[]> = {}) {
  const branche = vi.fn((id: string) => branches[id] ?? [id])
  const arbre: Pick<LectureStructure, "branche"> = { branche }
  const structure = vi.fn(async () => arbre)
  const documents = vi.fn(
    async (
      categorieIds: readonly string[] | null
    ): Promise<IndexableProduct[]> => {
      if (categorieIds === null) return [documentDe(BRANCHE_SANS_STRUCTURE)]
      return categorieIds.map((id) => documentDe(`document-${id}`))
    }
  )
  return {
    arbre,
    branche,
    structure,
    documents,
    lectures: { structure, documents } satisfies LecturesStructure,
  }
}

function effetsDuPlan(plan: PlanStructure): string[] {
  return plan.consequences.map((consequence) => consequence.effet)
}

function durablesDuPlan(plan: PlanStructure) {
  return plan.consequences
    .filter((consequence) => consequence.durable)
    .map((consequence) => [
      consequence.action,
      consequence.entite.type,
      consequence.entite.id,
    ])
}

describe("l'adaptateur Structure", () => {
  it("exécute la création : une invalidation, aucune lecture", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("structure.creee", {
      categorieId: CATEGORIE,
    })

    expect(plan.consequences.map((c) => [c.effet, c.payload])).toEqual([
      ["invalidation-cache", { categorieId: CATEGORIE }],
    ])

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels).toEqual([{ port: "invalidation-cache", arguments: [] }])
    expect(lecture.structure).not.toHaveBeenCalled()
    expect(lecture.documents).not.toHaveBeenCalled()
    expect(
      journal.mesures.map((mesure) => [
        mesure.effet,
        mesure.entite.id,
        mesure.resultat,
      ])
    ).toEqual([["invalidation-cache", CATEGORIE, "succes"]])
  })

  it("exécute la modification : l'image, la branche modifiée, puis l'invalidation", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses({ [CATEGORIE]: [CATEGORIE] })
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("structure.modifiee", {
      categorieId: CATEGORIE,
      imagesRetirees: [IMAGE],
      destinations: [CIBLE_PRODUITS],
    })

    expect(effetsDuPlan(plan)).toEqual([
      "suppression-images",
      "reindexation",
      "invalidation-cache",
    ])
    // La réindexation vise la branche modifiée, jamais la destination du
    // déplacement : c'est la charge utile qui le dit, pas l'entité du fait.
    expect(plan.consequences.map((c) => c.payload)).toEqual([
      { urls: [IMAGE] },
      { branche: CATEGORIE },
      { categorieId: CATEGORIE },
    ])

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels).toEqual([
      { port: "suppression-images", arguments: [IMAGE] },
      {
        port: "reindexation",
        arguments: [[documentDe(`document-${CATEGORIE}`)]],
      },
      { port: "invalidation-cache", arguments: [] },
    ])
    expect(lecture.structure).toHaveBeenCalledOnce()
    expect(lecture.branche).toHaveBeenCalledWith(CATEGORIE)
    expect(lecture.documents).toHaveBeenCalledWith([CATEGORIE])
    expect(
      journal.mesures.map((mesure) => [
        mesure.effet,
        mesure.entite.id,
        mesure.resultat,
      ])
    ).toEqual([
      ["suppression-images", CATEGORIE, "succes"],
      ["reindexation", CATEGORIE, "succes"],
      ["invalidation-cache", CATEGORIE, "succes"],
    ])
    expect(journal.mesures.some((mesure) => mesure.resultat === "echec")).toBe(
      false
    )
  })

  it("n'exécute aucune suppression d'image quand la modification n'en retire pas", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("structure.modifiee", {
      categorieId: CATEGORIE,
      imagesRetirees: [],
      destinations: [],
    })

    expect(effetsDuPlan(plan)).toEqual(["reindexation", "invalidation-cache"])

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels.map((appel) => appel.port)).toEqual([
      "reindexation",
      "invalidation-cache",
    ])
    expect(journal.mesures).toHaveLength(2)
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("exécute la suppression : une réindexation par destination dans l'ordre, puis l'image et l'invalidation", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("structure.supprimee", {
      categorieId: CATEGORIE,
      imagesRetirees: [IMAGE],
      destinations: [CIBLE_PRODUITS, CIBLE_ENFANTS],
    })

    expect(effetsDuPlan(plan)).toEqual([
      "reindexation",
      "reindexation",
      "suppression-images",
      "invalidation-cache",
    ])
    expect(
      plan.consequences.map((consequence) => consequence.entite.id)
    ).toEqual([CIBLE_PRODUITS, CIBLE_ENFANTS, CATEGORIE, CATEGORIE])
    expect(plan.consequences.map((c) => c.payload)).toEqual([
      { branche: CIBLE_PRODUITS },
      { branche: CIBLE_ENFANTS },
      { urls: [IMAGE] },
      { categorieId: CATEGORIE },
    ])

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels).toEqual([
      {
        port: "reindexation",
        arguments: [[documentDe(`document-${CIBLE_PRODUITS}`)]],
      },
      {
        port: "reindexation",
        arguments: [[documentDe(`document-${CIBLE_ENFANTS}`)]],
      },
      { port: "suppression-images", arguments: [IMAGE] },
      { port: "invalidation-cache", arguments: [] },
    ])
    // Un seul arbre lu pour le plan, et jamais la branche supprimée.
    expect(lecture.structure).toHaveBeenCalledOnce()
    expect(lecture.branche.mock.calls).toEqual([
      [CIBLE_PRODUITS],
      [CIBLE_ENFANTS],
    ])
    expect(
      journal.mesures.map((mesure) => [
        mesure.effet,
        mesure.entite.id,
        mesure.resultat,
      ])
    ).toEqual([
      ["reindexation", CIBLE_PRODUITS, "succes"],
      ["reindexation", CIBLE_ENFANTS, "succes"],
      ["suppression-images", CATEGORIE, "succes"],
      ["invalidation-cache", CATEGORIE, "succes"],
    ])
    expect(journal.mesures.some((mesure) => mesure.resultat === "echec")).toBe(
      false
    )
  })

  it("inclut la branche Sans Structure quand des Produits sont orphelins, dans l'ordre déclaré", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("structure.supprimee", {
      categorieId: CATEGORIE,
      imagesRetirees: [],
      destinations: [CIBLE_ENFANTS, BRANCHE_SANS_STRUCTURE],
    })

    expect(effetsDuPlan(plan)).toEqual([
      "reindexation",
      "reindexation",
      "invalidation-cache",
    ])
    expect(
      plan.consequences.map((consequence) => consequence.entite.id)
    ).toEqual([CIBLE_ENFANTS, BRANCHE_SANS_STRUCTURE, CATEGORIE])

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels).toEqual([
      {
        port: "reindexation",
        arguments: [[documentDe(`document-${CIBLE_ENFANTS}`)]],
      },
      {
        port: "reindexation",
        arguments: [[documentDe(BRANCHE_SANS_STRUCTURE)]],
      },
      { port: "invalidation-cache", arguments: [] },
    ])
    expect(lecture.structure).toHaveBeenCalledOnce()
    // La branche Sans Structure n'a pas d'identifiant à résoudre dans l'arbre.
    expect(lecture.branche.mock.calls).toEqual([[CIBLE_ENFANTS]])
    expect(lecture.documents.mock.calls).toEqual([[[CIBLE_ENFANTS]], [null]])
  })

  it("échoue nommément, journalise et poursuit quand une lecture manque", async () => {
    const { appels, effets } = portsEnregistreurs()
    const plan = declarerApresEcriture("structure.supprimee", {
      categorieId: CATEGORIE,
      imagesRetirees: [IMAGE],
      destinations: [CIBLE_PRODUITS],
    })

    const sansDocuments = creerJournalEffetsMemoire()
    await expect(
      executer(
        plan,
        effets,
        { structure: async () => ({ branche: () => [] }) },
        sansDocuments
      )
    ).resolves.toBeUndefined()

    expect(appels).toEqual([
      { port: "suppression-images", arguments: [IMAGE] },
      { port: "invalidation-cache", arguments: [] },
    ])
    expect(
      sansDocuments.mesures.map((mesure) => [
        mesure.effet,
        mesure.resultat,
        mesure.erreur,
      ])
    ).toEqual([
      ["reindexation", "echec", "lecture après-écriture manquante : documents"],
      ["suppression-images", "succes", undefined],
      ["invalidation-cache", "succes", undefined],
    ])

    const sansStructure = creerJournalEffetsMemoire()
    const lecture = {
      documents: vi.fn(async () => []),
    }
    await executer(plan, effets, lecture, sansStructure)

    expect(sansStructure.mesures[0]).toMatchObject({
      effet: "reindexation",
      resultat: "echec",
    })
    expect(sansStructure.mesures[0]!.erreur).toContain(
      "lecture après-écriture manquante : structure"
    )
    expect(sansStructure.mesures[1]).toMatchObject({
      effet: "suppression-images",
      resultat: "succes",
    })
  })

  it("lève la lecture manquante nommée par `executerUne`", async () => {
    const { effets } = portsEnregistreurs()
    const plan = declarerApresEcriture("structure.supprimee", {
      categorieId: CATEGORIE,
      imagesRetirees: [],
      destinations: [CIBLE_PRODUITS],
    })
    const reindexation = plan.consequences.find(
      (
        consequence
      ): consequence is Extract<
        ConsequenceStructure,
        { effet: "reindexation" }
      > => consequence.effet === "reindexation"
    )!

    await expect(executerUne(reindexation, effets, {})).rejects.toBeInstanceOf(
      LectureManquanteError
    )
    await expect(executerUne(reindexation, effets, {})).rejects.toThrow(
      "lecture après-écriture manquante : structure"
    )

    const sansDocuments = {
      structure: async () => ({ branche: () => [] }),
    }
    await expect(
      executerUne(reindexation, effets, sansDocuments)
    ).rejects.toThrow("lecture après-écriture manquante : documents")

    const lecture = lecturesEnregistreuses()
    await executerUne(reindexation, effets, lecture.lectures)
    expect(lecture.documents).toHaveBeenCalledOnce()
  })

  it("prouve au type que la carte est totale et sans gestionnaire superflu", () => {
    const complet = {
      "suppression-images": async () => {},
      reindexation: async () => {},
      "invalidation-cache": async () => {},
    }
    const total: GestionnairesPour<ConsequenceStructure> = complet

    const partiel = {
      "suppression-images": async () => {},
      "invalidation-cache": async () => {},
    }
    // @ts-expect-error — un effet déclaré sans gestionnaire ne compile pas.
    const incomplet: GestionnairesPour<ConsequenceStructure> = partiel

    const superflu: GestionnairesPour<ConsequenceStructure> = {
      "suppression-images": async () => {},
      reindexation: async () => {},
      "invalidation-cache": async () => {},
      // @ts-expect-error — un gestionnaire que les genres n'émettent pas ne compile pas.
      email: async () => {},
    }

    expect([total, incomplet, superflu]).toHaveLength(3)
  })
})

describe("la redéclaration de la Structure depuis la Charge", () => {
  it("donne à structure.modifiee les mêmes conséquences durables que l'écriture", () => {
    const faitDEcriture = {
      categorieId: CATEGORIE,
      imagesRetirees: [IMAGE],
      destinations: [CIBLE_PRODUITS],
    }
    const planEcriture = declarerApresEcriture(
      "structure.modifiee",
      faitDEcriture
    )
    const charge: Charge<"structure.modifiee"> = planEcriture.faits[0]!
      .charge as Charge<"structure.modifiee">
    const planRedéclaré = declarerApresEcriture("structure.modifiee", charge)

    expect(durablesDuPlan(planRedéclaré)).toEqual(durablesDuPlan(planEcriture))
    expect(durablesDuPlan(planEcriture)).toEqual([
      ["suppression.images", "categorie", CATEGORIE],
      ["index.structure", "categorie", CATEGORIE],
      ["invalidation.structure", "categorie", CATEGORIE],
    ])
  })

  it("donne à structure.supprimee les mêmes conséquences durables que l'écriture, branches comprises", () => {
    const faitDEcriture = {
      categorieId: CATEGORIE,
      imagesRetirees: [IMAGE],
      destinations: [CIBLE_PRODUITS, CIBLE_ENFANTS, BRANCHE_SANS_STRUCTURE],
    }
    const planEcriture = declarerApresEcriture(
      "structure.supprimee",
      faitDEcriture
    )
    const charge: Charge<"structure.supprimee"> = planEcriture.faits[0]!
      .charge as Charge<"structure.supprimee">
    const planRedéclaré = declarerApresEcriture("structure.supprimee", charge)

    expect(durablesDuPlan(planRedéclaré)).toEqual(durablesDuPlan(planEcriture))
    expect(durablesDuPlan(planEcriture)).toEqual([
      ["index.structure", "categorie", CIBLE_PRODUITS],
      ["index.structure", "categorie", CIBLE_ENFANTS],
      ["index.structure", "categorie", BRANCHE_SANS_STRUCTURE],
      ["suppression.images", "categorie", CATEGORIE],
      ["invalidation.structure", "categorie", CATEGORIE],
    ])
  })
})
