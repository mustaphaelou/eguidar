import { describe, expect, it } from "vitest"

import {
  declarerApresEcriture,
  FAITS_POUR_REGLES,
  GENRES_MIGRES,
  REGLES_EN_ATTENTE,
  reglesParDefaut,
  type PlanApresEcriture,
} from "@/lib/apres-ecriture"

const PRODUIT = "produit-869"
const SLUG = "produit-869"

function effets(plan: PlanApresEcriture): string[] {
  return plan.consequences.map((consequence) => consequence.effet)
}

function durable(plan: PlanApresEcriture): string[] {
  return plan.consequences
    .filter((consequence) => consequence.durable)
    .map((consequence) => consequence.effet)
}

function actions(plan: PlanApresEcriture): string[] {
  return plan.consequences.flatMap((consequence) =>
    consequence.action ? [consequence.action] : []
  )
}

describe("la déclaration de produit.enregistre", () => {
  it("distingue la création de la mise à jour par ses faits typés seulement", () => {
    const creation = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      slugPrecedent: null,
      categoryId: "structure",
      categoryIdPrecedent: null,
      galerie: [],
    })
    const miseAJour = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      slugPrecedent: "produit-869-precedent",
      categoryId: "structure",
      categoryIdPrecedent: "structure-precedente",
      imagesRetirees: ["https://cdn.example.test/retiree.jpg"],
      galerie: ["https://cdn.example.test/conservee.jpg"],
    })

    expect(effets(creation)).not.toContain("suppression-images")
    expect(effets(miseAJour)).toContain("suppression-images")
    expect(
      effets(miseAJour).filter((effet) => effet !== "suppression-images")
    ).toEqual(effets(creation))
    expect(miseAJour.faits).toHaveLength(1)
    expect(creation.faits).toHaveLength(1)
  })

  it("ordonne ses conséquences et sépare le durable du non durable", () => {
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      imagesRetirees: ["https://cdn.example.test/retiree.jpg"],
      galerie: ["https://cdn.example.test/conservee.jpg"],
    })

    expect(effets(plan)).toEqual([
      "registre-images",
      "suppression-brouillons",
      "suppression-images",
      "reindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(durable(plan)).toEqual([
      "suppression-images",
      "reindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(actions(plan)).toEqual([
      "suppression.images",
      "index.produit",
      "invalidation.catalogue",
      "purge.catalogue",
    ])
    for (const consequence of plan.consequences) {
      if (consequence.durable) expect(consequence.reparation).toBeUndefined()
      else expect(consequence.reparation).toBeTruthy()
    }
  })

  it("porte les URL retirées et la galerie dans la charge partagée", () => {
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      imagesRetirees: [
        "https://cdn.example.test/retiree-a.jpg",
        "https://cdn.example.test/retiree-b.jpg",
      ],
      galerie: ["https://cdn.example.test/conservee.jpg"],
    })

    expect(plan.faits[0]).toMatchObject({
      declencheur: "produit.enregistre",
      entite: "produit",
      identifiant: PRODUIT,
      charge: {
        produitId: PRODUIT,
        slug: SLUG,
        imagesRetirees: [
          "https://cdn.example.test/retiree-a.jpg",
          "https://cdn.example.test/retiree-b.jpg",
        ],
        galerie: ["https://cdn.example.test/conservee.jpg"],
      },
    })
  })

  it("ne déclare la suppression des images que si une image a été retirée", () => {
    const sansRetrait = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
      imagesRetirees: [],
    })

    expect(effets(sansRetrait)).not.toContain("suppression-images")
    expect(durable(sansRetrait)).toEqual([
      "reindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
  })
})

describe("la déclaration de produit.enregistre.lot", () => {
  it("émet un fait par Produit et une réindexation groupée portant sa portée", () => {
    const plan = declarerApresEcriture("produit.enregistre.lot", {
      produitIds: ["a", "b"],
      produits: [
        { id: "a", slug: "a", categoryId: "structure" },
        { id: "b", slug: "b", categoryId: "structure" },
      ],
    })

    expect(plan.faits.map((fait) => fait.identifiant)).toEqual(["a", "b"])
    expect(
      plan.faits.every((fait) => fait.declencheur === "produit.enregistre")
    ).toBe(true)
    const reindexation = plan.consequences.find(
      (consequence) => consequence.effet === "reindexation"
    )
    expect(reindexation).toMatchObject({ durable: true, portee: 2 })
    expect(
      plan.consequences.filter(
        (consequence) =>
          consequence.effet === "invalidation-cache" && consequence.durable
      )
    ).toHaveLength(2)
  })
})

describe("les Règles par défaut dérivées de la déclaration", () => {
  it("donne une Règle par conséquence durable de produit.enregistre", () => {
    const regles = reglesParDefaut().filter(
      (regle) => regle.declencheur === "produit.enregistre"
    )

    expect(regles.map((regle) => [regle.id, regle.action])).toEqual([
      ["suppression-images-produit-enregistre", "suppression.images"],
      ["indexation-produit", "index.produit"],
      ["invalidation-catalogue", "invalidation.catalogue"],
      ["purge-catalogue", "purge.catalogue"],
    ])
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      imagesRetirees: ["https://cdn.example.test/retiree.jpg"],
    })
    const actionsDurables = actions(plan).sort()
    expect(regles.map((regle) => regle.action).sort()).toEqual(actionsDurables)
  })

  it("ne crée aucune Règle pour les conséquences non durables", () => {
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      imagesRetirees: ["https://cdn.example.test/retiree.jpg"],
    })
    const nonDurables = plan.consequences.filter(
      (consequence) => !consequence.durable
    )

    expect(nonDurables.length).toBeGreaterThan(0)
    expect(
      nonDurables.every((consequence) => consequence.action === undefined)
    ).toBe(true)
  })
})

describe("la déclaration de variante.stock.changee", () => {
  it("réindexe durablement puis invalide le cache, réparé par le TTL", () => {
    const plan = declarerApresEcriture("variante.stock.changee", {
      produitId: PRODUIT,
    })

    expect(plan.faits).toEqual([
      {
        declencheur: "variante.stock.changee",
        entite: "produit",
        identifiant: PRODUIT,
        charge: { produitId: PRODUIT },
      },
    ])
    expect(effets(plan)).toEqual(["reindexation", "invalidation-cache"])
    expect(durable(plan)).toEqual(["reindexation"])
    expect(actions(plan)).toEqual(["index.produit"])

    const invalidation = plan.consequences.find(
      (consequence) => consequence.effet === "invalidation-cache"
    )
    expect(invalidation).toMatchObject({
      durable: false,
      reparation: "TTL",
      entite: { type: "produit", id: PRODUIT },
    })
  })
})

describe("les Règles par défaut dérivées de variante.stock.changee", () => {
  it("reprend l'identité indexation-stock pour la seule réindexation durable", () => {
    expect(
      reglesParDefaut()
        .filter((regle) => regle.declencheur === "variante.stock.changee")
        .map((regle) => [regle.id, regle.action, regle.nom])
    ).toEqual([["indexation-stock", "index.produit", "Indexation du stock"]])
  })

  it("retire la Règle de la liste en attente et ne duplique aucune identité", () => {
    expect(GENRES_MIGRES).toContain("variante.stock.changee")
    expect(
      REGLES_EN_ATTENTE.some((regle) => regle.id === "indexation-stock")
    ).toBe(false)
    expect(
      reglesParDefaut().filter((regle) => regle.id === "indexation-stock")
    ).toHaveLength(1)
    const ids = reglesParDefaut().map((regle) => regle.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("chaque conséquence durable a exactement une Règle, aucune non durable n'en a", () => {
    const regles = reglesParDefaut()

    for (const genre of GENRES_MIGRES) {
      const plan = declarerApresEcriture(genre, FAITS_POUR_REGLES[genre] ?? {})
      const declencheur = plan.faits[0]?.declencheur ?? genre
      for (const consequence of plan.consequences) {
        if (!consequence.action) continue
        expect(
          regles.filter(
            (regle) =>
              regle.declencheur === declencheur &&
              regle.action === consequence.action
          )
        ).toHaveLength(consequence.durable ? 1 : 0)
      }
    }
  })
})
