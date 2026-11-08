import { describe, expect, it, vi } from "vitest"

import type { PreuvePromotion } from "@/lib/cycle-vie-image-produit"
import type { IndexableProduct } from "@/lib/index-projection"
import {
  declarerApresEcriture,
  type ConsequenceCatalogue,
  type PlanCatalogue,
} from "@/lib/apres-ecriture"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"
import type { EntreeRegistreImageProduit } from "@/lib/use-cases/images-produit"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import {
  EvenementCatalogueIntrouvableError,
  executer,
  executerUne,
  type DocumentCatalogue,
  type EffetsCatalogue,
  type LecturesCatalogue,
} from "./catalogue"
import { LectureManquanteError, type GestionnairesPour } from "./executeur"

const PRODUIT = "produit-953"
const SLUG = "produit-953"
const SLUG_PRECEDENT = "produit-953-precedent"
const CATEGORIE = "categorie-953"
const CATEGORIE_PRECEDENTE = "categorie-953-precedente"
const IMAGE = "https://cdn.example.test/produits/953.jpg"

const ENTREE: EntreeRegistreImageProduit = {
  publicUrl: IMAGE,
  alt: "Produit 953",
  faits: null,
}

const PROMOTION: PreuvePromotion = {
  draftId: "brouillon-953",
  publicUrl: "https://cdn.example.test/brouillons/953.jpg",
  contentType: "image/jpeg",
  tentativeId: "tentative-953",
  faits: null,
}

const INDEXABLE: IndexableProduct = {
  id: PRODUIT,
  name: "Produit 953",
  slug: SLUG,
  description: "Description",
  brand: "Marque",
  price: 12000,
  minPrice: 12000,
  totalStock: 1,
  images: [IMAGE],
  categorySlug: "categorie-953",
  categoryName: "Catégorie 953",
  specsText: "",
  variantNames: ["Standard"],
  skus: ["SKU-953"],
  isFeatured: false,
  freeShipping: false,
  priceBucket: "10000-20000",
  updatedAt: 0,
}

const EVENEMENT: CatalogueEventProduct = {
  id: PRODUIT,
  slug: SLUG,
  categoryChain: [{ slug: "racine" }],
}

const DOCUMENT: DocumentCatalogue = {
  indexable: INDEXABLE,
  evenement: EVENEMENT,
}

const IDENTITE = {
  id: PRODUIT,
  slug: SLUG,
  slugPrecedent: SLUG_PRECEDENT,
  categoryId: CATEGORIE,
  categoryIdPrecedent: CATEGORIE_PRECEDENTE,
}

interface Appel {
  port: string
  arguments: unknown[]
}

function portsEnregistreurs(): {
  appels: Appel[]
  effets: EffetsCatalogue
} {
  const appels: Appel[] = []
  return {
    appels,
    effets: {
      enregistrerImages: async (entrees, ownerId) => {
        appels.push({
          port: "registre-images",
          arguments: [entrees, ownerId],
        })
      },
      cycleVie: {
        supprimerSources: async (promotions) => {
          appels.push({
            port: "suppression-brouillons",
            arguments: [promotions],
          })
        },
      },
      deleteImages: async (urls) => {
        appels.push({
          port: "suppression-images",
          arguments: [urls],
        })
      },
      reindexProducts: async (produits) => {
        appels.push({ port: "reindexation", arguments: [produits] })
      },
      removeProductFromIndex: async (produitId) => {
        appels.push({ port: "desindexation", arguments: [produitId] })
      },
      revalidateCatalog: (produit) => {
        appels.push({ port: "invalidation-cache", arguments: [produit] })
      },
      purgeCatalogue: (produit) => {
        appels.push({ port: "purge-catalogue", arguments: [produit] })
      },
    },
  }
}

function lecturesEnregistreuses(): {
  lectures: LecturesCatalogue
  documents: ReturnType<typeof vi.fn>
  evenements: ReturnType<typeof vi.fn>
} {
  const documents = vi.fn(async () => [DOCUMENT])
  const evenements = vi.fn(async () => [EVENEMENT])
  return {
    documents,
    evenements,
    lectures: { documents, evenements },
  }
}

function evenementsDuPlan(plan: PlanCatalogue): string[] {
  return plan.consequences.map((consequence) => consequence.effet)
}

describe("l'adaptateur Catalogue unitaire", () => {
  it("déclare et exécute l'enregistrement dans l'ordre, avec les charges utiles", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      slugPrecedent: SLUG_PRECEDENT,
      categoryId: CATEGORIE,
      categoryIdPrecedent: CATEGORIE_PRECEDENTE,
      imagesRetirees: [IMAGE],
      entreesRegistre: [ENTREE],
      promotions: [PROMOTION],
      ownerId: "owner-953",
    })

    expect(evenementsDuPlan(plan)).toEqual([
      "registre-images",
      "suppression-brouillons",
      "suppression-images",
      "reindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(plan.consequences.map((consequence) => consequence.payload)).toEqual(
      [
        { entrees: [ENTREE], ownerId: "owner-953" },
        { promotions: [PROMOTION] },
        { urls: [IMAGE] },
        { produits: [IDENTITE] },
        { produit: IDENTITE },
        { produit: IDENTITE },
      ]
    )
    // Les faits d'immédiat ne polluent pas la Charge du Fait.
    expect(plan.faits[0]!.charge).toEqual({
      produitId: PRODUIT,
      slug: SLUG,
      slugPrecedent: SLUG_PRECEDENT,
      categoryId: CATEGORIE,
      categoryIdPrecedent: CATEGORIE_PRECEDENTE,
      imagesRetirees: [IMAGE],
    })

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels).toEqual([
      {
        port: "registre-images",
        arguments: [[ENTREE], "owner-953"],
      },
      {
        port: "suppression-brouillons",
        arguments: [[PROMOTION]],
      },
      { port: "suppression-images", arguments: [[IMAGE]] },
      { port: "reindexation", arguments: [[INDEXABLE]] },
      { port: "invalidation-cache", arguments: [EVENEMENT] },
      { port: "purge-catalogue", arguments: [EVENEMENT] },
    ])
    expect(lecture.documents).toHaveBeenCalledOnce()
    expect(lecture.evenements).toHaveBeenCalledOnce()
    expect(journal.mesures).toHaveLength(6)
    expect(
      journal.mesures.map((mesure) => [
        mesure.effet,
        mesure.entite.id,
        mesure.resultat,
      ])
    ).toEqual([
      ["registre-images", PRODUIT, "succes"],
      ["suppression-brouillons", PRODUIT, "succes"],
      ["suppression-images", PRODUIT, "succes"],
      ["reindexation", PRODUIT, "succes"],
      ["invalidation-cache", PRODUIT, "succes"],
      ["purge-catalogue", PRODUIT, "succes"],
    ])
    expect(journal.mesures.some((mesure) => mesure.resultat === "echec")).toBe(
      false
    )
  })

  it("ne déclare pas la suppression des images quand aucune n'est retirée", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      imagesRetirees: [],
      entreesRegistre: [],
      promotions: [],
    })

    expect(evenementsDuPlan(plan)).toEqual([
      "registre-images",
      "suppression-brouillons",
      "reindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])

    await executer(plan, effets, lecture.lectures, journal)

    // Les gestionnaires du Registre et des Brouillons ne font rien sur une
    // charge utile vide : aucun port n'est appelé.
    expect(appels.map((appel) => appel.port)).toEqual([
      "reindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(journal.mesures).toHaveLength(5)
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("déclare et exécute la suppression du Produit, désindexation comprise", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("produit.supprime", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: CATEGORIE,
      imagesRetirees: [IMAGE],
    })

    expect(evenementsDuPlan(plan)).toEqual([
      "suppression-images",
      "desindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels).toEqual([
      { port: "suppression-images", arguments: [[IMAGE]] },
      { port: "desindexation", arguments: [PRODUIT] },
      { port: "invalidation-cache", arguments: [EVENEMENT] },
      { port: "purge-catalogue", arguments: [EVENEMENT] },
    ])
    expect(lecture.documents).not.toHaveBeenCalled()
    expect(lecture.evenements).toHaveBeenCalledOnce()
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("déclare et exécute le changement de stock : réindexation puis invalidation", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = lecturesEnregistreuses()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("variante.stock.changee", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: CATEGORIE,
    })

    expect(evenementsDuPlan(plan)).toEqual([
      "reindexation",
      "invalidation-cache",
    ])

    await executer(plan, effets, lecture.lectures, journal)

    expect(appels).toEqual([
      { port: "reindexation", arguments: [[INDEXABLE]] },
      { port: "invalidation-cache", arguments: [EVENEMENT] },
    ])
    expect(journal.mesures).toHaveLength(2)
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("échoue nommément, journalise et poursuit quand une lecture manque", async () => {
    const { appels, effets } = portsEnregistreurs()
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      imagesRetirees: [IMAGE],
    })

    const sansDocuments = creerJournalEffetsMemoire()
    await expect(
      executer(
        plan,
        effets,
        { evenements: async () => [EVENEMENT] },
        sansDocuments
      )
    ).resolves.toBeUndefined()

    expect(sansDocuments.mesures.map((mesure) => mesure.effet)).toEqual([
      "registre-images",
      "suppression-brouillons",
      "suppression-images",
      "reindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(sansDocuments.mesures[3]).toMatchObject({
      resultat: "echec",
      erreur: "lecture après-écriture manquante : documents",
    })
    expect(sansDocuments.mesures[4]).toMatchObject({ resultat: "succes" })
    expect(appels.map((appel) => appel.port)).toEqual([
      "suppression-images",
      "invalidation-cache",
      "purge-catalogue",
    ])

    appels.length = 0
    const sansEvenements = creerJournalEffetsMemoire()
    await executer(
      plan,
      effets,
      { documents: async () => [DOCUMENT] },
      sansEvenements
    )
    expect(sansEvenements.mesures[3]).toMatchObject({ resultat: "succes" })
    expect(sansEvenements.mesures[4]).toMatchObject({
      resultat: "echec",
      erreur: "lecture après-écriture manquante : evenements",
    })
    expect(sansEvenements.mesures[5]).toMatchObject({
      resultat: "echec",
      erreur: "lecture après-écriture manquante : evenements",
    })
    expect(appels.map((appel) => appel.port)).toEqual([
      "suppression-images",
      "reindexation",
    ])
  })

  it("lève la lecture manquante nommée par `executerUne`", async () => {
    const { effets } = portsEnregistreurs()
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
    })
    const reindexation = plan.consequences.find(
      (
        consequence
      ): consequence is Extract<
        ConsequenceCatalogue,
        { effet: "reindexation" }
      > => consequence.effet === "reindexation"
    )!

    await expect(executerUne(reindexation, effets, {})).rejects.toBeInstanceOf(
      LectureManquanteError
    )
    await expect(
      executerUne(reindexation, effets, { documents: async () => [DOCUMENT] })
    ).resolves.toBeUndefined()
  })

  it("nomme un port absent plutôt que de sauter la conséquence", async () => {
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("variante.stock.changee", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: CATEGORIE,
    })

    await executer(
      plan,
      { revalidateCatalog: () => {} },
      {
        documents: async () => [DOCUMENT],
        evenements: async () => [EVENEMENT],
      },
      journal
    )

    expect(journal.mesures[0]).toMatchObject({
      effet: "reindexation",
      resultat: "echec",
      erreur: "port Catalogue manquant : reindexProducts",
    })
    expect(journal.mesures[1]).toMatchObject({ resultat: "succes" })
  })

  it("signale un événement Catalogue introuvable pour le Produit nommé", async () => {
    const { effets } = portsEnregistreurs()
    const plan = declarerApresEcriture("produit.supprime", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: CATEGORIE,
      imagesRetirees: [],
    })
    const invalidation = plan.consequences.find(
      (
        consequence
      ): consequence is Extract<
        ConsequenceCatalogue,
        { effet: "invalidation-cache" }
      > => consequence.effet === "invalidation-cache"
    )!

    await expect(
      executerUne(invalidation, effets, { evenements: async () => [] })
    ).rejects.toBeInstanceOf(EvenementCatalogueIntrouvableError)
  })

  it("isole l'échec d'une conséquence et poursuit la suivante", async () => {
    const { appels, effets } = portsEnregistreurs()
    effets.deleteImages = async () => {
      appels.push({ port: "suppression-images", arguments: [] })
      throw new Error("R2 indisponible")
    }
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("produit.supprime", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: CATEGORIE,
      imagesRetirees: [IMAGE],
    })

    await expect(
      executer(plan, effets, lecturesEnregistreuses().lectures, journal)
    ).resolves.toBeUndefined()

    expect(appels.map((appel) => appel.port)).toEqual([
      "suppression-images",
      "desindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(
      journal.mesures.map((mesure) => [mesure.effet, mesure.resultat])
    ).toEqual([
      ["suppression-images", "echec"],
      ["desindexation", "succes"],
      ["invalidation-cache", "succes"],
      ["purge-catalogue", "succes"],
    ])
    expect(journal.mesures[0]!.erreur).toBe("R2 indisponible")
  })

  it("exécute une seule conséquence directement, sans journal, et laisse l'échec remonter", async () => {
    const { appels, effets } = portsEnregistreurs()
    const plan = declarerApresEcriture("produit.supprime", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: CATEGORIE,
      imagesRetirees: [IMAGE],
    })
    const desindexation = plan.consequences.find(
      (
        consequence
      ): consequence is Extract<
        ConsequenceCatalogue,
        { effet: "desindexation" }
      > => consequence.effet === "desindexation"
    )!

    await executerUne(desindexation, effets, {})
    expect(appels).toEqual([{ port: "desindexation", arguments: [PRODUIT] }])

    const panne = new Error("index indisponible")
    await expect(
      executerUne(desindexation, {
        ...effets,
        removeProductFromIndex: async () => {
          throw panne
        },
      })
    ).rejects.toBe(panne)
  })

  it("prouve au type que la carte est totale et sans gestionnaire superflu", () => {
    const complet = {
      "registre-images": async () => {},
      "suppression-brouillons": async () => {},
      "suppression-images": async () => {},
      reindexation: async () => {},
      desindexation: async () => {},
      "invalidation-cache": async () => {},
      "purge-catalogue": async () => {},
    }
    const total: GestionnairesPour<ConsequenceCatalogue> = complet

    const partiel = {
      "registre-images": async () => {},
      "suppression-brouillons": async () => {},
      "suppression-images": async () => {},
      reindexation: async () => {},
      desindexation: async () => {},
      "invalidation-cache": async () => {},
    }
    // @ts-expect-error — un effet déclaré sans gestionnaire ne compile pas.
    const incomplet: GestionnairesPour<ConsequenceCatalogue> = partiel

    const superflu: GestionnairesPour<ConsequenceCatalogue> = {
      ...complet,
      // @ts-expect-error — un gestionnaire que les genres n'émettent pas ne compile pas.
      email: async () => {},
    }

    const lectures: LecturesCatalogue = {}
    expect([total, incomplet, superflu, lectures]).toHaveLength(4)
  })
})
