import { describe, expect, it } from "vitest"

import {
  BRANCHE_SANS_STRUCTURE,
  declarerApresEcriture,
  FAITS_POUR_REGLES,
  GENRES_DERIVES,
  identiteDeRegle,
  IdentiteRegleInconnueError,
  reglesParDefaut,
  type PlanApresEcriture,
} from "@/lib/apres-ecriture"

const PRODUIT = "produit-869"
const SLUG = "produit-869"
const CATEGORIE = "categorie-873"

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

describe("la déclaration de Commande", () => {
  const SNAPSHOT = {
    userEmail: "client-869@example.test",
    orderId: "c1",
    items: [
      {
        productName: "Produit 869",
        variantName: "Standard",
        quantity: 1,
        price: 4200,
      },
    ],
    total: 4200,
    shippingFee: 0,
    totalPayable: 4200,
    cityName: "Casablanca",
    address: "1 rue du Test",
    phone: "0600000000",
  }
  const creation = () =>
    declarerApresEcriture("commande.creee", {
      commandeId: "c1",
      snapshot: SNAPSHOT,
    })
  const changementDeStatut = () =>
    declarerApresEcriture("commande.statut.changee", {
      commandeId: "c1",
      snapshot: SNAPSHOT,
      statut: "shipped",
    })

  it("ordonne les trois effets de la création : e-mail, invalidation, purge", () => {
    expect(effets(creation())).toEqual([
      "email",
      "invalidation-cache",
      "purge-catalogue",
    ])
  })

  it("ordonne les mêmes trois effets pour le changement de statut", () => {
    expect(effets(changementDeStatut())).toEqual([
      "email",
      "invalidation-cache",
      "purge-catalogue",
    ])
  })

  it("garde l'e-mail durable et répare les deux autres par le TTL", () => {
    const plan = creation()

    expect(plan.consequences.map((consequence) => consequence.durable)).toEqual(
      [true, false, false]
    )
    for (const consequence of plan.consequences) {
      if (consequence.durable) {
        expect(consequence.reparation).toBeUndefined()
      } else {
        expect(consequence.reparation).toBe("TTL")
      }
    }
  })

  it("donne à la conséquence durable l'action de l'e-mail de Commande", () => {
    expect(
      creation().consequences.find((consequence) => consequence.durable)?.action
    ).toBe("email.commande-creee")
    expect(
      changementDeStatut().consequences.find(
        (consequence) => consequence.durable
      )?.action
    ).toBe("email.commande-statut")
  })

  it("garde l'instantané et le statut dans la charge du fait", () => {
    expect(creation().faits).toEqual([
      {
        declencheur: "commande.creee",
        entite: "commande",
        identifiant: "c1",
        charge: { snapshot: SNAPSHOT },
      },
    ])
    expect(changementDeStatut().faits).toEqual([
      {
        declencheur: "commande.statut.changee",
        entite: "commande",
        identifiant: "c1",
        charge: { snapshot: SNAPSHOT, statut: "shipped" },
      },
    ])
  })

  it("n'écrit un fait que parce qu'une conséquence durable existe", () => {
    for (const plan of [creation(), changementDeStatut()]) {
      const aDurable = plan.consequences.some(
        (consequence) => consequence.durable
      )
      expect(plan.faits.length > 0).toBe(aDurable)
    }
  })
})

describe("les Règles par défaut dérivées de la Commande", () => {
  it("réutilise confirmation-commande et statut-commande", () => {
    const parDeclencheur = (declencheur: string) =>
      reglesParDefaut()
        .filter((regle) => regle.declencheur === declencheur)
        .map((regle) => [regle.id, regle.action])

    expect(parDeclencheur("commande.creee")).toEqual([
      ["confirmation-commande", "email.commande-creee"],
    ])
    expect(parDeclencheur("commande.statut.changee")).toEqual([
      ["statut-commande", "email.commande-statut"],
    ])
  })
})

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
      imagesRetirees: ["https://cdn.example.test/a.jpg"],
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
          imagesRetirees: [
            "https://cdn.example.test/une.jpg",
            "https://cdn.example.test/deux.jpg",
          ],
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
          imagesRetirees: ["https://cdn.example.test/a.jpg"],
        },
        { id: "b", slug: "b", categoryId: null, imagesRetirees: [] },
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
      imagesRetirees: [],
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

describe("la déclaration de structure.supprimee", () => {
  function planDeSuppression(
    faits: {
      imagesRetirees?: readonly string[]
      destinations?: readonly string[]
    } = {}
  ): PlanApresEcriture {
    return declarerApresEcriture("structure.supprimee", {
      categorieId: CATEGORIE,
      imagesRetirees: [],
      destinations: [],
      ...faits,
    })
  }

  it("réindexe chaque destination, supprime l'image puis invalide la Structure", () => {
    const plan = planDeSuppression({
      imagesRetirees: ["https://cdn.example.test/categories/supprimee.jpg"],
      destinations: ["cible-produits", "cible-enfants"],
    })

    expect(effets(plan)).toEqual([
      "reindexation",
      "reindexation",
      "suppression-images",
      "invalidation-cache",
    ])
    expect(actions(plan)).toEqual([
      "index.structure",
      "index.structure",
      "suppression.images",
      "invalidation.structure",
    ])
    expect(
      plan.consequences.map((consequence) => consequence.entite.id)
    ).toEqual(["cible-produits", "cible-enfants", CATEGORIE, CATEGORIE])
    expect(durable(plan)).toEqual(effets(plan))
    for (const consequence of plan.consequences) {
      expect(consequence.reparation).toBeUndefined()
    }
  })

  it("ne lit jamais la branche supprimée : le fait ne porte que les destinations", () => {
    const plan = planDeSuppression({
      imagesRetirees: ["https://cdn.example.test/categories/supprimee.jpg"],
      destinations: ["cible-produits", "cible-enfants"],
    })

    expect(plan.faits).toEqual([
      {
        declencheur: "structure.supprimee",
        entite: "categorie",
        identifiant: CATEGORIE,
        charge: {
          categorieId: CATEGORIE,
          imagesRetirees: ["https://cdn.example.test/categories/supprimee.jpg"],
          destinations: ["cible-produits", "cible-enfants"],
        },
      },
    ])
  })

  it("dédoublonne deux destinations qui désignent la même branche", () => {
    const plan = planDeSuppression({
      destinations: ["meme-cible", "meme-cible"],
    })

    expect(effets(plan).filter((effet) => effet === "reindexation")).toEqual([
      "reindexation",
    ])
    expect(plan.faits[0]?.charge).toMatchObject({
      destinations: ["meme-cible"],
    })
  })

  it("vise la branche Sans Structure quand les Produits sont orphelins", () => {
    const plan = planDeSuppression({
      destinations: [BRANCHE_SANS_STRUCTURE],
    })

    expect(effets(plan)).toEqual(["reindexation", "invalidation-cache"])
    expect(plan.consequences[0]).toMatchObject({
      durable: true,
      action: "index.structure",
      entite: { type: "categorie", id: BRANCHE_SANS_STRUCTURE },
    })
    expect(plan.faits[0]?.charge).toMatchObject({
      destinations: ["sans-structure"],
    })
  })

  it("réindexe la destination des enfants et la branche Sans Structure quand les Produits sont orphelins", () => {
    const plan = planDeSuppression({
      destinations: ["cible-enfants", BRANCHE_SANS_STRUCTURE],
    })

    expect(effets(plan)).toEqual([
      "reindexation",
      "reindexation",
      "invalidation-cache",
    ])
    expect(
      plan.consequences.map((consequence) => consequence.entite.id)
    ).toEqual(["cible-enfants", BRANCHE_SANS_STRUCTURE, CATEGORIE])
    expect(plan.faits[0]?.charge).toMatchObject({
      destinations: ["cible-enfants", "sans-structure"],
    })
  })

  it("ne déclare aucune réindexation quand rien n'a changé de branche", () => {
    const plan = planDeSuppression()

    expect(effets(plan)).toEqual(["invalidation-cache"])
    expect(actions(plan)).toEqual(["invalidation.structure"])
    expect(plan.faits[0]?.charge).toMatchObject({
      destinations: [],
    })
  })

  it("n'ajoute pas de suppression d'image quand la Structure n'en avait pas", () => {
    const plan = planDeSuppression({ destinations: ["cible-produits"] })

    expect(effets(plan)).not.toContain("suppression-images")
  })
})

describe("les Règles par défaut dérivées de structure.supprimee", () => {
  it("dérive les trois règles du plan, une par action durable", () => {
    expect(
      reglesParDefaut()
        .filter((regle) => regle.declencheur === "structure.supprimee")
        .map((regle) => [regle.id, regle.action])
    ).toEqual([
      ["indexation-structure-supprimee", "index.structure"],
      ["suppression-images-structure-supprimee", "suppression.images"],
      ["invalidation-structure-supprimee", "invalidation.structure"],
    ])
  })

  it("ne duplique pas la Règle d'indexation quand deux branches la déclarent", () => {
    const plan = declarerApresEcriture("structure.supprimee", {
      categorieId: CATEGORIE,
      imagesRetirees: [],
      destinations: ["cible-produits", "cible-enfants"],
    })

    expect(
      plan.consequences.filter(
        (consequence) => consequence.action === "index.structure"
      )
    ).toHaveLength(2)
    expect(
      reglesParDefaut().filter(
        (regle) =>
          regle.declencheur === "structure.supprimee" &&
          regle.action === "index.structure"
      )
    ).toHaveLength(1)
  })

  it("ne duplique aucune identité et donne une seule Règle à chaque conséquence durable de la Structure supprimée", () => {
    expect(GENRES_DERIVES).toContain("structure.supprimee")
    expect(
      reglesParDefaut().filter(
        (regle) => regle.id === "invalidation-structure-supprimee"
      )
    ).toHaveLength(1)
    const ids = reglesParDefaut().map((regle) => regle.id)
    expect(new Set(ids).size).toBe(ids.length)
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
      slug: SLUG,
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
      slug: SLUG,
      imagesRetirees: ["https://cdn.example.test/une.jpg"],
    })
    expect(regles.map((regle) => regle.action).sort()).toEqual(
      actions(plan).sort()
    )
  })

  it("ne crée aucune Règle pour les conséquences non durables", () => {
    const plan = declarerApresEcriture("produit.enregistre", {
      produitId: PRODUIT,
      slug: SLUG,
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
      slug: SLUG,
      categoryId: CATEGORIE,
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

describe("la déclaration de structure.creee", () => {
  it("ne déclare que l'invalidation durable : ni réindexation ni image", () => {
    const plan = declarerApresEcriture("structure.creee", {
      categorieId: CATEGORIE,
    })

    expect(plan.faits).toEqual([
      {
        declencheur: "structure.creee",
        entite: "categorie",
        identifiant: CATEGORIE,
        charge: { categorieId: CATEGORIE },
      },
    ])
    expect(effets(plan)).toEqual(["invalidation-cache"])
    expect(durable(plan)).toEqual(["invalidation-cache"])
    expect(actions(plan)).toEqual(["invalidation.structure"])
    expect(plan.consequences[0]).toMatchObject({
      entite: { type: "categorie", id: CATEGORIE },
    })
  })
})

describe("la déclaration de structure.modifiee", () => {
  it("porte le fait borné : catégorie, images retirées et destinations", () => {
    const image = "https://cdn.example.test/categories/ancienne.jpg"
    const plan = declarerApresEcriture("structure.modifiee", {
      categorieId: CATEGORIE,
      imagesRetirees: [image],
      destinations: ["categorie-parente"],
    })

    expect(plan.faits).toEqual([
      {
        declencheur: "structure.modifiee",
        entite: "categorie",
        identifiant: CATEGORIE,
        charge: {
          categorieId: CATEGORIE,
          imagesRetirees: [image],
          destinations: ["categorie-parente"],
        },
      },
    ])
    expect(Object.keys(plan.faits[0]!.charge as object)).not.toContain(
      "branche"
    )
  })

  it("ordonne la suppression d'image, la réindexation puis l'invalidation", () => {
    const plan = declarerApresEcriture("structure.modifiee", {
      categorieId: CATEGORIE,
      imagesRetirees: ["https://cdn.example.test/categories/ancienne.jpg"],
      destinations: ["categorie-parente"],
    })

    expect(effets(plan)).toEqual([
      "suppression-images",
      "reindexation",
      "invalidation-cache",
    ])
    expect(durable(plan)).toEqual(effets(plan))
    expect(actions(plan)).toEqual([
      "suppression.images",
      "index.structure",
      "invalidation.structure",
    ])
    expect(plan.consequences[0]!.entite).toEqual({
      type: "categorie",
      id: CATEGORIE,
    })
    expect(plan.consequences[1]!.payload).toEqual({ branche: CATEGORIE })
  })

  it("ne déclare la suppression d'image que si une image est retirée", () => {
    const plan = declarerApresEcriture("structure.modifiee", {
      categorieId: CATEGORIE,
      imagesRetirees: [],
      destinations: [],
    })

    expect(effets(plan)).toEqual(["reindexation", "invalidation-cache"])
    expect(durable(plan)).toEqual(["reindexation", "invalidation-cache"])
    expect(actions(plan)).toEqual(["index.structure", "invalidation.structure"])
    expect(plan.faits[0]!.charge).toEqual({
      categorieId: CATEGORIE,
      imagesRetirees: [],
      destinations: [],
    })
  })
})

describe("les écritures de maintenance sans conséquence durable", () => {
  const plansDeMaintenance = () => [
    declarerApresEcriture("ville.creee", { villeId: "ville-1" }),
    declarerApresEcriture("ville.modifiee", { villeId: "ville-1" }),
    declarerApresEcriture("ville.supprimee", { villeId: "ville-1" }),
    declarerApresEcriture("livraison.reglee", { livraisonId: "default" }),
    declarerApresEcriture("image.texte-alternatif", {
      produits: [{ id: "produit-a", slug: "produit-a" }],
    }),
  ]

  it("ne déclarent aucun fait et une seule invalidation de cache réparée par le TTL", () => {
    for (const plan of plansDeMaintenance()) {
      expect(plan.faits).toEqual([])
      expect(effets(plan)).toEqual(["invalidation-cache"])
      expect(durable(plan)).toEqual([])
      expect(actions(plan)).toEqual([])
      expect(plan.consequences[0]).toMatchObject({
        durable: false,
        reparation: "TTL",
      })
    }

    const [creation, , suppression, reglage, texte] = plansDeMaintenance()
    expect(creation!.consequences[0]!.entite).toEqual({
      type: "ville",
      id: "ville-1",
    })
    expect(suppression!.consequences[0]!.entite).toEqual({
      type: "ville",
      id: "ville-1",
    })
    expect(reglage!.consequences[0]!.entite).toEqual({
      type: "livraison",
      id: "default",
    })
    expect(texte!.consequences[0]!.entite).toEqual({
      type: "produit",
      id: "produit-a",
    })
  })

  it("donne une conséquence par Produit dont le Texte alternatif change", () => {
    const plan = declarerApresEcriture("image.texte-alternatif", {
      produits: [
        { id: "produit-a", slug: "produit-a" },
        { id: "produit-b", slug: "produit-b" },
      ],
    })

    expect(plan.faits).toEqual([])
    expect(
      plan.consequences.map((consequence) => consequence.entite.id)
    ).toEqual(["produit-a", "produit-b"])
    expect(plan.consequences.every((consequence) => !consequence.durable)).toBe(
      true
    )
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

  it("ne duplique aucune identité et donne une seule Règle à la réindexation durable du stock", () => {
    expect(GENRES_DERIVES).toContain("variante.stock.changee")
    expect(
      reglesParDefaut().filter((regle) => regle.id === "indexation-stock")
    ).toHaveLength(1)
    const ids = reglesParDefaut().map((regle) => regle.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("les Règles par défaut dérivées des déclarations de Structure", () => {
  it("reprend les identités existantes pour la création et l'invalidation", () => {
    const creation = reglesParDefaut().filter(
      (regle) => regle.declencheur === "structure.creee"
    )
    expect(creation.map((regle) => [regle.id, regle.action])).toEqual([
      ["invalidation-structure", "invalidation.structure"],
    ])

    const modification = reglesParDefaut().filter(
      (regle) => regle.declencheur === "structure.modifiee"
    )
    expect(modification.map((regle) => [regle.id, regle.action])).toEqual([
      ["suppression-images-structure-modifiee", "suppression.images"],
      ["indexation-structure", "index.structure"],
      ["invalidation-structure-modifiee", "invalidation.structure"],
    ])
  })

  it("ne duplique aucune identité et donne une seule Règle à chaque conséquence durable de Structure", () => {
    expect(GENRES_DERIVES).toContain("structure.creee")
    expect(GENRES_DERIVES).toContain("structure.modifiee")
    for (const id of [
      "invalidation-structure",
      "invalidation-structure-modifiee",
      "indexation-structure",
    ]) {
      expect(
        reglesParDefaut().filter((regle) => regle.id === id),
        id
      ).toHaveLength(1)
    }
  })
})

describe("l'identité d'une Règle par défaut", () => {
  it("lève un nom quand le couple déclencheur/action n'a aucune identité", () => {
    const identiteInconnue = () =>
      identiteDeRegle("commande.creee", "digest.stock-bas")

    expect(identiteInconnue).toThrow(IdentiteRegleInconnueError)
    expect(identiteInconnue).toThrow(
      "Aucune identité de Règle par défaut pour « digest.stock-bas » déclenchée par « commande.creee »"
    )
  })
})

describe("l'invariant du fait et de la conséquence durable", () => {
  it("n'écrit un fait que si au moins une conséquence est durable, pour chaque genre dérivé", () => {
    for (const genre of GENRES_DERIVES) {
      const plan = declarerApresEcriture(genre, FAITS_POUR_REGLES[genre] ?? {})
      expect(plan.faits.length > 0, genre).toBe(
        plan.consequences.some((consequence) => consequence.durable)
      )
    }
  })
})

describe("chaque conséquence durable a exactement une Règle par déclencheur", () => {
  it("aucune conséquence non durable n'en a", () => {
    const regles = reglesParDefaut()

    for (const genre of GENRES_DERIVES) {
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

describe("les Règles par défaut de l'installation", () => {
  it("gardent leurs identités et leurs déclencheurs, planification comprise", () => {
    const parId = Object.fromEntries(
      reglesParDefaut().map((regle) => [
        regle.id,
        {
          declencheur: regle.declencheur,
          action: regle.action,
          actif: regle.actif,
        },
      ])
    )

    expect(parId).toEqual({
      "confirmation-commande": {
        declencheur: "commande.creee",
        action: "email.commande-creee",
        actif: true,
      },
      "statut-commande": {
        declencheur: "commande.statut.changee",
        action: "email.commande-statut",
        actif: true,
      },
      "suppression-images-produit-enregistre": {
        declencheur: "produit.enregistre",
        action: "suppression.images",
        actif: true,
      },
      "indexation-produit": {
        declencheur: "produit.enregistre",
        action: "index.produit",
        actif: true,
      },
      "invalidation-catalogue": {
        declencheur: "produit.enregistre",
        action: "invalidation.catalogue",
        actif: true,
      },
      "purge-catalogue": {
        declencheur: "produit.enregistre",
        action: "purge.catalogue",
        actif: true,
      },
      "suppression-images-produit": {
        declencheur: "produit.supprime",
        action: "suppression.images",
        actif: true,
      },
      "desindexation-produit": {
        declencheur: "produit.supprime",
        action: "desindex.produit",
        actif: true,
      },
      "invalidation-catalogue-suppression": {
        declencheur: "produit.supprime",
        action: "invalidation.catalogue",
        actif: true,
      },
      "purge-catalogue-suppression": {
        declencheur: "produit.supprime",
        action: "purge.catalogue",
        actif: true,
      },
      "indexation-stock": {
        declencheur: "variante.stock.changee",
        action: "index.produit",
        actif: true,
      },
      "invalidation-structure": {
        declencheur: "structure.creee",
        action: "invalidation.structure",
        actif: true,
      },
      "invalidation-structure-modifiee": {
        declencheur: "structure.modifiee",
        action: "invalidation.structure",
        actif: true,
      },
      "indexation-structure": {
        declencheur: "structure.modifiee",
        action: "index.structure",
        actif: true,
      },
      "suppression-images-structure-modifiee": {
        declencheur: "structure.modifiee",
        action: "suppression.images",
        actif: true,
      },
      "invalidation-structure-supprimee": {
        declencheur: "structure.supprimee",
        action: "invalidation.structure",
        actif: true,
      },
      "indexation-structure-supprimee": {
        declencheur: "structure.supprimee",
        action: "index.structure",
        actif: true,
      },
      "suppression-images-structure-supprimee": {
        declencheur: "structure.supprimee",
        action: "suppression.images",
        actif: true,
      },
      "digest-stock-bas": {
        declencheur: "planification.digest-stock-bas",
        action: "digest.stock-bas",
        actif: true,
      },
      "reconciliation-recherche": {
        declencheur: "planification.reconciliation-recherche",
        action: "reconciliation.recherche",
        actif: true,
      },
      "digest-proprietaire": {
        declencheur: "planification.digest-stock-bas",
        action: "digest.proprietaire",
        actif: false,
      },
    })
  })

  it("dérivent toute Règle non planifiée d'une conséquence durable déclarée", () => {
    const durables = new Set<string>()
    for (const genre of GENRES_DERIVES) {
      const plan = declarerApresEcriture(genre, FAITS_POUR_REGLES[genre] ?? {})
      const declencheur = plan.faits[0]?.declencheur
      for (const consequence of plan.consequences) {
        if (!consequence.durable || !consequence.action) continue
        durables.add(`${declencheur ?? genre}|${consequence.action}`)
      }
    }

    for (const regle of reglesParDefaut()) {
      if (regle.declencheur.startsWith("planification.")) continue
      expect(durables.has(`${regle.declencheur}|${regle.action}`)).toBe(true)
    }
  })
})
