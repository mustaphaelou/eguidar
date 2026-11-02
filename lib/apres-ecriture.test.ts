import { describe, expect, it } from "vitest"

import {
  declarerApresEcriture,
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

describe("la déclaration de produit.supprime", () => {
  it("ordonne les quatre conséquences durables du Produit supprimé", () => {
    const plan = declarerApresEcriture("produit.supprime", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: "structure",
      images: ["https://cdn.example.test/a.jpg"],
    })

    expect(effets(plan)).toEqual([
      "suppression-images",
      "desindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(durable(plan)).toEqual([
      "suppression-images",
      "desindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(actions(plan)).toEqual([
      "suppression.images",
      "desindex.produit",
      "invalidation.catalogue",
      "purge.catalogue",
    ])
    for (const consequence of plan.consequences) {
      if (consequence.durable) expect(consequence.reparation).toBeUndefined()
    }
  })

  it("porte l'identité, le slug, la Structure et toutes les URL dans le fait", () => {
    const images = [
      "https://cdn.example.test/une.jpg",
      "https://cdn.example.test/deux.jpg",
    ]
    const plan = declarerApresEcriture("produit.supprime", {
      produitId: PRODUIT,
      slug: SLUG,
      categoryId: "structure",
      images,
    })

    expect(plan.faits).toEqual([
      {
        declencheur: "produit.supprime",
        entite: "produit",
        identifiant: PRODUIT,
        charge: {
          produitId: PRODUIT,
          slug: SLUG,
          categoryId: "structure",
          images,
        },
      },
    ])
  })
})

describe("la déclaration de produit.supprime.lot", () => {
  it("émet un fait complet par Produit et une conséquence groupée par effet avec sa portée", () => {
    const plan = declarerApresEcriture("produit.supprime.lot", {
      produits: [
        {
          id: "a",
          slug: "a",
          categoryId: "structure",
          images: ["https://cdn.example.test/a.jpg"],
        },
        { id: "b", slug: "b", categoryId: null, images: [] },
      ],
    })

    expect(plan.faits.map((fait) => fait.identifiant)).toEqual(["a", "b"])
    expect(
      plan.faits.every((fait) => fait.declencheur === "produit.supprime")
    ).toBe(true)
    expect(plan.faits[1]!.charge).toEqual({
      produitId: "b",
      slug: "b",
      categoryId: null,
      images: [],
    })
    expect(effets(plan)).toEqual([
      "suppression-images",
      "desindexation",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(plan.consequences.map((consequence) => consequence.portee)).toEqual([
      2, 2, 2, 2,
    ])
    for (const consequence of plan.consequences) {
      expect(consequence).toMatchObject({ durable: true, portee: 2 })
    }
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

  it("réutilise les identités de suppression et crée la Règle de purge", () => {
    const regles = reglesParDefaut().filter(
      (regle) => regle.declencheur === "produit.supprime"
    )

    expect(regles.map((regle) => [regle.id, regle.action])).toEqual([
      ["suppression-images-produit", "suppression.images"],
      ["desindexation-produit", "desindex.produit"],
      ["invalidation-catalogue-suppression", "invalidation.catalogue"],
      ["purge-catalogue-suppression", "purge.catalogue"],
    ])
    const plan = declarerApresEcriture("produit.supprime", {
      produitId: PRODUIT,
      images: ["https://cdn.example.test/une.jpg"],
    })
    expect(regles.map((regle) => regle.action).sort()).toEqual(
      actions(plan).sort()
    )
  })

  it("ne dérive jamais deux Règles de même identité", () => {
    const identifiants = reglesParDefaut().map((regle) => regle.id)

    expect(new Set(identifiants).size).toBe(identifiants.length)
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
