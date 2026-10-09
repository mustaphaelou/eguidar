import { describe, expect, it, vi } from "vitest"

import {
  projeterArbreAccueil,
  projeterEcranAdmin,
  projeterEcranEdition,
  projeterFilAriane,
  projeterOptionsSelecteur,
  projeterPageCategorie,
  type FaitStructure,
  type NoeudAccueil,
} from "@/lib/use-cases/lecture-structure"
import { structure, tousLesNoeuds } from "@/test/lecture-structure-recette"
import {
  dansLOrdreEprouve,
  exigerLeMemeOrdre,
  eprouverLOrdreDuModule,
} from "@/test/ordre-structures-recette"

function identifiants(noeuds: readonly NoeudAccueil[]): string[] {
  return tousLesNoeuds(noeuds).map((noeud) => noeud.id)
}

const ARBRE_SAIN: FaitStructure[] = [
  structure("racine", "Racine", null, 1),
  structure("enfant-a", "Enfant A", "racine"),
  structure("enfant-b", "Enfant B", "racine", 3),
  structure("petit-a", "Petit A", "enfant-a", 2),
  structure("isolee", "Isolée", null, 4),
]

eprouverLOrdreDuModule({
  nom: "projeterArbreAccueil",
  projeter: (faits) =>
    tousLesNoeuds(projeterArbreAccueil(faits)).map((n) => n.id),
})

eprouverLOrdreDuModule({
  nom: "projeterEcranAdmin — les lignes",
  projeter: (faits) =>
    projeterEcranAdmin(faits).lignes.map((ligne) => ligne.id),
})

eprouverLOrdreDuModule({
  nom: "projeterEcranAdmin — les cibles de la boîte de suppression",
  projeter: (faits) =>
    projeterEcranAdmin(faits).cibles.find((cible) => cible.id === faits[0].id)!
      .produits,
})

eprouverLOrdreDuModule({
  nom: "projeterOptionsSelecteur",
  projeter: (faits) =>
    projeterOptionsSelecteur(faits).map((option) => option.id),
})

eprouverLOrdreDuModule({
  nom: "projeterEcranEdition — les candidates",
  projeter: (faits) =>
    projeterEcranEdition(faits, faits[0].id)!.candidates.map((c) => c.id),
})

eprouverLOrdreDuModule({
  nom: "projeterPageCategorie — les sous-catégories",
  projeter: (faits) =>
    projeterPageCategorie(faits, faits[0].slug)!.enfants.map((e) => e.id),
})

describe("l'ordre du module — les rendus s'accordent entre eux", () => {
  it("l'arbre, les lignes, les cibles, les puces, les options et les candidates rangent les mêmes Structures de la même façon", () => {
    const faits = [
      {
        id: "racine",
        name: "Racine",
        slug: "racine",
        image: null,
        parentId: null,
        produitsDirects: 0,
      },
      {
        id: "zebre",
        name: "Zèbre",
        slug: "zebre",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
      },
      {
        id: "ecran",
        name: "Écran",
        slug: "ecran",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
      },
      {
        id: "jumeau-b",
        name: "Jumeau",
        slug: "aaa-jumeau",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
      },
      {
        id: "jumeau-a",
        name: "Jumeau",
        slug: "zzz-jumeau",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
      },
    ]
    const ecran = projeterEcranAdmin(faits)

    exigerLeMemeOrdre([
      {
        nom: "l'arbre d'accueil",
        ids: dansLOrdreEprouve(
          tousLesNoeuds(projeterArbreAccueil(faits)).map((n) => n.id)
        ),
      },
      {
        nom: "les lignes de l'Administration",
        ids: dansLOrdreEprouve(ecran.lignes.map((l) => l.id)),
      },
      {
        nom: "les cibles de la boîte de la racine",
        ids: dansLOrdreEprouve(
          ecran.cibles.find((cible) => cible.id === "racine")!.produits
        ),
      },
      {
        nom: "les puces de la page de catégorie",
        ids: dansLOrdreEprouve(
          projeterPageCategorie(faits, "racine")!.enfants.map((e) => e.id)
        ),
      },
      {
        nom: "les options du sélecteur",
        ids: dansLOrdreEprouve(
          projeterOptionsSelecteur(faits).map((o) => o.id)
        ),
      },
      {
        nom: "les candidates du formulaire d'édition",
        ids: dansLOrdreEprouve(
          projeterEcranEdition(faits, "racine")!.candidates.map((c) => c.id)
        ),
      },
    ])
  })

  it("le fil d'Ariane nomme les mêmes Structures que les puces, et se referme sur la Structure du Produit", () => {
    const parent = "racine"
    const puces = [
      { id: "ecran", nom: "Écran" },
      { id: "jumeau-a", nom: "Jumeau" },
      { id: "jumeau-b", nom: "Jumeau" },
      { id: "zebre", nom: "Zèbre" },
    ]
    const faits = [
      structure(parent, "Racine", null),
      ...puces.map((puce) => structure(puce.id, puce.nom, parent)),
    ]

    for (const puce of puces) {
      expect(
        projeterFilAriane(faits, puce.id).map((maillon) => maillon.slug),
        `le fil vers « ${puce.id} »`
      ).toEqual([parent, puce.id])
    }
  })
})

describe("projeterArbreAccueil — sur un arbre sain", () => {
  it("rend les racines et leurs enfants dans l'ordre que le module promet", () => {
    const arbre = projeterArbreAccueil(ARBRE_SAIN)

    expect(arbre.map((noeud) => noeud.name)).toEqual(["Isolée", "Racine"])

    const racine = arbre[1]!
    expect(racine.children.map((noeud) => noeud.name)).toEqual([
      "Enfant A",
      "Enfant B",
    ])
    expect(racine.children[0]!.children.map((noeud) => noeud.name)).toEqual([
      "Petit A",
    ])
    expect(racine.children[1]!.children).toEqual([])
  })

  it("compte les Produits de la branche entière, descendance comprise", () => {
    const arbre = projeterArbreAccueil(ARBRE_SAIN)
    const parId = new Map(
      tousLesNoeuds(arbre).map((noeud) => [noeud.id, noeud])
    )

    expect(parId.get("isolee")!.productCount).toBe(4)
    expect(parId.get("petit-a")!.productCount).toBe(2)
    expect(parId.get("enfant-a")!.productCount).toBe(2)
    expect(parId.get("enfant-b")!.productCount).toBe(3)
    expect(parId.get("racine")!.productCount).toBe(6)
  })

  it("passe à la page le slug et l'image de la Structure", () => {
    const arbre = projeterArbreAccueil([
      {
        ...structure("racine", "Racine", null, 1),
        slug: "la-racine",
        image: "/racine.png",
      },
    ])

    expect(arbre[0]).toMatchObject({
      slug: "la-racine",
      image: "/racine.png",
    })
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterArbreAccueil(ARBRE_SAIN)

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterArbreAccueil — sur une Structure déjà cyclique", () => {
  const CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("enfant", "Enfant", "racine", 2),
    structure("amont-1", "Amont 1", "boucle-a"),
    structure("amont-2", "Amont 2", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("efface le cycle, rend le reste, et le journal le nomme une fois", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const arbre = projeterArbreAccueil(CYCLE)

      expect(arbre.map((noeud) => noeud.id)).toEqual(["racine"])
      expect(arbre[0]!.productCount).toBe(3)

      const presents = identifiants(arbre)
      for (const absent of ["boucle-a", "boucle-b", "amont-1", "amont-2"]) {
        expect(presents, absent).not.toContain(absent)
      }

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })

  it("efface une Structure qu'aucune racine n'atteint, sans la nommer", () => {
    const arbre = projeterArbreAccueil(CYCLE)

    expect(identifiants(arbre)).not.toContain("amont-1")
    expect(arbre[0]!.productCount).toBe(3)
  })

  // #593 : absente de l'arbre, et non la souche d'un arbre à elle — c'est ce que
  // dit la marche, qui la range parmi les Structures hors arbre.
  it("efface une Structure dont la parente ne nomme aucune rangée, comme elle efface un cycle", () => {
    const arbre = projeterArbreAccueil([
      structure("racine", "Racine", null, 1),
      structure("enfant", "Enfant", "racine", 2),
      structure("orpheline", "Orpheline", "absente-des-faits", 4),
    ])

    expect(arbre.map((noeud) => noeud.id)).toEqual(["racine"])
    expect(identifiants(arbre)).not.toContain("orpheline")
    expect(arbre[0]!.productCount).toBe(3)
  })
})

describe("projeterArbreAccueil — une longueur n'est jamais un refus", () => {
  const PROFONDEUR = 5_000

  function chaineAvecUnCycleAuBout(): FaitStructure[] {
    const chaine: FaitStructure[] = [structure("racine", "Racine", null, 1)]
    for (let rang = 1; rang < PROFONDEUR; rang += 1) {
      chaine.push(
        structure(
          `c${rang}`,
          `Maillon ${rang}`,
          rang === 1 ? "racine" : `c${rang - 1}`,
          1
        )
      )
    }
    const dernier = chaine[chaine.length - 1]!
    chaine[chaine.length - 1] = { ...dernier, parentId: "boucle-a" }
    return [
      ...chaine,
      structure("boucle-a", "Boucle A", "boucle-b", 1),
      structure("boucle-b", "Boucle B", "boucle-a", 1),
    ]
  }

  it("dégrade le cycle, rend la chaîne entière, et le rend borné", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const debut = Date.now()
      const arbre = projeterArbreAccueil(chaineAvecUnCycleAuBout())
      const duree = Date.now() - debut

      expect(arbre).toHaveLength(1)
      const presents = identifiants(arbre)
      expect(presents).toHaveLength(PROFONDEUR - 1)
      expect(presents).toContain("racine")
      expect(presents).toContain(`c${PROFONDEUR - 2}`)
      for (const absent of [`c${PROFONDEUR - 1}`, "boucle-a", "boucle-b"]) {
        expect(presents, absent).not.toContain(absent)
      }
      expect(arbre[0]!.productCount).toBe(PROFONDEUR - 1)

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      expect(ligne).not.toContain("Maillon")

      expect(duree).toBeLessThan(2_000)
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterEcranAdmin — les lignes — sur un arbre sain", () => {
  it("rend une ligne par Structure, dans l'ordre de la descente", () => {
    const { lignes } = projeterEcranAdmin(ARBRE_SAIN)

    expect(lignes.map((ligne) => ligne.id)).toEqual([
      "isolee",
      "racine",
      "enfant-a",
      "petit-a",
      "enfant-b",
    ])
  })

  it("donne à chaque ligne sa profondeur dans l'arbre", () => {
    const { lignes } = projeterEcranAdmin(ARBRE_SAIN)

    expect(lignes.map((ligne) => ligne.profondeur)).toEqual([0, 0, 1, 2, 1])
  })

  it("donne à chaque ligne le lien qui la nomme et le nom de sa parente", () => {
    const { lignes } = projeterEcranAdmin(ARBRE_SAIN)
    const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]))

    expect(parId.get("petit-a")).toMatchObject({
      parentId: "enfant-a",
      nomParente: "Enfant A",
    })
    expect(parId.get("enfant-b")).toMatchObject({
      parentId: "racine",
      nomParente: "Racine",
    })
    expect(parId.get("racine")).toMatchObject({
      parentId: null,
      nomParente: null,
    })
    expect(parId.get("isolee")).toMatchObject({
      parentId: null,
      nomParente: null,
    })
  })

  it("compte les Produits directs et les sous-catégories de chaque ligne", () => {
    const { lignes } = projeterEcranAdmin(ARBRE_SAIN)
    const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]))

    expect(parId.get("racine")).toMatchObject({
      nombreProduits: 1,
      nombreEnfants: 2,
    })
    expect(parId.get("enfant-a")).toMatchObject({
      nombreProduits: 0,
      nombreEnfants: 1,
    })
    expect(parId.get("petit-a")).toMatchObject({
      nombreProduits: 2,
      nombreEnfants: 0,
    })
    expect(parId.get("enfant-b")).toMatchObject({
      nombreProduits: 3,
      nombreEnfants: 0,
    })
    expect(parId.get("isolee")).toMatchObject({
      nombreProduits: 4,
      nombreEnfants: 0,
    })
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterEcranAdmin(ARBRE_SAIN)

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterEcranAdmin — les lignes — sur une Structure déjà cyclique", () => {
  const AVEC_CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("enfant-a", "Enfant A", "racine"),
    structure("petit-a", "Petit A", "enfant-a", 2),
    structure("isolee", "Isolée", null, 4),
    structure("amont", "Amont", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("liste après l'arbre, à la racine, et marque ce qu'aucune branche n'atteint", () => {
    const { lignes } = projeterEcranAdmin(AVEC_CYCLE)

    expect(lignes.map((ligne) => [ligne.id, ligne.profondeur])).toEqual([
      ["isolee", 0],
      ["racine", 0],
      ["enfant-a", 1],
      ["petit-a", 2],
      ["amont", 0],
      ["boucle-a", 0],
      ["boucle-b", 0],
    ])

    const marques = lignes
      .filter((ligne) => ligne.horsArbre)
      .map((ligne) => ligne.id)
    expect(marques).toEqual(["amont", "boucle-a", "boucle-b"])
    expect(lignes.filter((ligne) => !ligne.horsArbre)).toHaveLength(4)
  })

  it("journalise le cycle une fois pour toute la projection, en nommant ses Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterEcranAdmin(AVEC_CYCLE)

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })

  it("classe parmi les hors arbre une Structure dont la parente n'est pas dans les faits, et ne la rend qu'une fois", () => {
    const { lignes, cibles } = projeterEcranAdmin([
      structure("racine", "Racine", null, 1),
      structure("orpheline", "Orpheline", "absente-des-faits", 5),
      structure("enfant-orphelin", "Enfant orphelin", "orpheline"),
    ])

    expect(lignes.map((ligne) => [ligne.id, ligne.horsArbre])).toEqual([
      ["racine", false],
      ["enfant-orphelin", true],
      ["orpheline", true],
    ])
    const orpheline = lignes.find((ligne) => ligne.id === "orpheline")!
    expect(orpheline).toMatchObject({
      parentId: "absente-des-faits",
      nomParente: null,
      profondeur: 0,
    })

    for (const fait of ["orpheline", "enfant-orphelin"]) {
      expect(
        lignes.filter((ligne) => ligne.id === fait),
        fait
      ).toHaveLength(1)
    }
    const cible = cibles.find((entree) => entree.id === "orpheline")!
    expect(cible.produits).toEqual(["enfant-orphelin", "racine"])
    expect(cible.sousCategories).toEqual(["racine"])
    expect(orpheline.nombreEnfants).toBe(1)
  })
})

describe("projeterEcranAdmin — les cibles que la boîte de chaque ligne reçoit", () => {
  it("offre à un Produit toutes les Structures, descendantes comprises", () => {
    const { cibles } = projeterEcranAdmin(ARBRE_SAIN)
    const parId = new Map(cibles.map((cible) => [cible.id, cible]))

    expect(parId.get("enfant-a")!.produits).toEqual([
      "enfant-b",
      "isolee",
      "petit-a",
      "racine",
    ])
    expect(parId.get("isolee")!.produits).toEqual([
      "enfant-a",
      "enfant-b",
      "petit-a",
      "racine",
    ])
    for (const cible of cibles) {
      expect(cible.produits, cible.id).not.toContain(cible.id)
      expect(new Set(cible.produits).size, cible.id).toBe(cible.produits.length)
    }
  })

  it("écarte des sous-catégories ce qui descend de la Structure de la ligne", () => {
    const { cibles } = projeterEcranAdmin(ARBRE_SAIN)
    const parId = new Map(cibles.map((cible) => [cible.id, cible]))

    expect(parId.get("enfant-a")!.sousCategories).toEqual([
      "enfant-b",
      "isolee",
      "racine",
    ])
    expect(parId.get("petit-a")!.sousCategories).toEqual([
      "enfant-a",
      "enfant-b",
      "isolee",
      "racine",
    ])
  })

  it("porte une cible par Structure, et rien d'autre que ses deux listes", () => {
    const { lignes, cibles } = projeterEcranAdmin(ARBRE_SAIN)

    expect(new Set(cibles.map((cible) => cible.id))).toEqual(
      new Set(lignes.map((ligne) => ligne.id))
    )
    for (const cible of cibles) {
      expect(Object.keys(cible).sort(), cible.id).toEqual([
        "id",
        "produits",
        "sousCategories",
      ])
    }
  })

  it("ne rend que des chaînes : rien d'appelable ne franchit la couture", () => {
    for (const cible of projeterEcranAdmin(ARBRE_SAIN).cibles) {
      for (const liste of [cible.produits, cible.sousCategories]) {
        expect(liste.length).toBeGreaterThan(0)
        for (const valeur of liste) {
          expect(typeof valeur).toBe("string")
        }
      }
    }
  })
})

describe("projeterEcranAdmin — les cibles d'une Structure déjà cyclique", () => {
  const AVEC_CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("enfant-a", "Enfant A", "racine"),
    structure("petit-a", "Petit A", "enfant-a", 2),
    structure("isolee", "Isolée", null, 4),
    structure("amont", "Amont", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("propose les maillons du cycle pour un Produit, et les écarte des sous-catégories", () => {
    const { cibles } = projeterEcranAdmin(AVEC_CYCLE)
    const boucleA = cibles.find((cible) => cible.id === "boucle-a")!

    expect(boucleA.produits).toEqual([
      "amont",
      "boucle-b",
      "enfant-a",
      "isolee",
      "petit-a",
      "racine",
    ])
    expect(boucleA.sousCategories).not.toContain("boucle-b")
    expect(boucleA.sousCategories).toEqual([
      "enfant-a",
      "isolee",
      "petit-a",
      "racine",
    ])
  })

  it("donne à une Structure hors arbre les mêmes cibles qu'à une Structure saine", () => {
    const { cibles } = projeterEcranAdmin(AVEC_CYCLE)
    const amont = cibles.find((cible) => cible.id === "amont")!

    expect(amont.produits).toEqual([
      "boucle-a",
      "boucle-b",
      "enfant-a",
      "isolee",
      "petit-a",
      "racine",
    ])
    expect(amont.sousCategories).toEqual(amont.produits)
  })
})

describe("projeterOptionsSelecteur — un sélecteur ne rend que ce qu'il affiche", () => {
  it("rend l'identifiant et le nom de chaque Structure, dans l'ordre promis", () => {
    const options = projeterOptionsSelecteur(ARBRE_SAIN)

    expect(options).toEqual([
      { id: "enfant-a", name: "Enfant A" },
      { id: "enfant-b", name: "Enfant B" },
      { id: "isolee", name: "Isolée" },
      { id: "petit-a", name: "Petit A" },
      { id: "racine", name: "Racine" },
    ])
  })

  it("rend exactement deux faits : ni compteur, ni nom de parente", () => {
    const options = projeterOptionsSelecteur(ARBRE_SAIN)

    for (const option of options) {
      expect(Object.keys(option).sort()).toEqual(["id", "name"])
    }
  })

  it("propose une Structure corrompue, et ne journalise rien", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const options = projeterOptionsSelecteur([
        structure("racine", "Racine", null, 1),
        structure("boucle-a", "Boucle A", "boucle-b"),
        structure("boucle-b", "Boucle B", "boucle-a"),
      ])

      expect(options.map((option) => option.id)).toEqual([
        "boucle-a",
        "boucle-b",
        "racine",
      ])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterEcranEdition — sur un arbre sain", () => {
  it("rend la Structure éditée, ses candidates, et la primitive comme parentes exclues", () => {
    const ecran = projeterEcranEdition(ARBRE_SAIN, "enfant-a")!

    expect(ecran.structureEditee).toEqual({
      id: "enfant-a",
      name: "Enfant A",
      slug: "enfant-a",
      image: null,
      parentId: "racine",
    })

    expect(ecran.candidates).toEqual([
      { id: "enfant-a", name: "Enfant A" },
      { id: "enfant-b", name: "Enfant B" },
      { id: "isolee", name: "Isolée" },
      { id: "petit-a", name: "Petit A" },
      { id: "racine", name: "Racine" },
    ])

    expect(ecran.parentesExclues).toEqual(["enfant-a", "petit-a"])
  })

  it("laisse la parente actuelle parmi les candidates, jamais parmi les exclues", () => {
    const ecran = projeterEcranEdition(ARBRE_SAIN, "enfant-a")!

    expect(ecran.structureEditee.parentId).toBe("racine")
    expect(ecran.parentesExclues).not.toContain("racine")
    expect(ecran.candidates).toContainEqual({ id: "racine", name: "Racine" })
  })

  it("rend une Structure que les faits ne portent pas comme un écran absent", () => {
    expect(projeterEcranEdition(ARBRE_SAIN, "inconnue")).toBeNull()
    expect(projeterEcranEdition([], "inconnue")).toBeNull()
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterEcranEdition(ARBRE_SAIN, "enfant-a")

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterEcranEdition — sur une Structure déjà cyclique", () => {
  const AVEC_CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("amont", "Amont", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("rend l'écran sur un maillon du cycle, sans rien perdre du reste", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const ecran = projeterEcranEdition(AVEC_CYCLE, "boucle-a")!

      expect(ecran.structureEditee).toMatchObject({
        id: "boucle-a",
        parentId: "boucle-b",
      })
      expect(ecran.candidates.map((candidat) => candidat.id)).toEqual([
        "amont",
        "boucle-a",
        "boucle-b",
        "racine",
      ])

      expect(ecran.parentesExclues).toEqual(["boucle-a", "amont", "boucle-b"])
      expect(new Set(ecran.parentesExclues).size).toBe(
        ecran.parentesExclues.length
      )
    } finally {
      warn.mockRestore()
    }
  })

  it("journalise le cycle une fois, en nommant ses Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterEcranEdition(AVEC_CYCLE, "boucle-a")

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("[marche-structure]")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterPageCategorie — sur un arbre sain", () => {
  const PAGE: FaitStructure[] = [
    {
      ...structure("c1", "Racine", null, 1),
      slug: "racine",
      image: "/racine.png",
    },
    { ...structure("c2", "Enfant A", "c1"), slug: "enfant-a" },
    { ...structure("c3", "Petit A", "c2", 2), slug: "petit-a" },
    { ...structure("c4", "Isolée", null, 4), slug: "isolee" },
    { ...structure("c5", "Zèbre", "c4"), slug: "zèbre" },
    { ...structure("c6", "Écran", "c4"), slug: "écran" },
  ]

  it("trouve la Structure par son slug et rend son fil, la racine d'abord", () => {
    const page = projeterPageCategorie(PAGE, "petit-a")!

    expect(page.categorie).toEqual({
      id: "c3",
      name: "Petit A",
      slug: "petit-a",
      image: null,
    })

    expect(page.filAriane).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
      { name: "Petit A", slug: "petit-a" },
    ])
  })

  it("passe l'image à la rangée qu'il rend, et rien d'autre", () => {
    const page = projeterPageCategorie(PAGE, "racine")!

    expect(page.categorie).toEqual({
      id: "c1",
      name: "Racine",
      slug: "racine",
      image: "/racine.png",
    })
  })

  it("ne rend qu'elle-même quand la Structure est une racine", () => {
    const page = projeterPageCategorie(PAGE, "racine")!

    expect(page.filAriane).toEqual([{ name: "Racine", slug: "racine" }])
  })

  it("rend les sous-catégories directes dans l'ordre que le module promet", () => {
    const page = projeterPageCategorie(PAGE, "isolee")!

    expect(page.enfants.map((enfant) => enfant.name)).toEqual([
      "Écran",
      "Zèbre",
    ])
  })

  it("donne au filtre des Produits la Structure et ses descendantes, chacune une fois", () => {
    const ids = projeterPageCategorie(PAGE, "racine")!.idsProduits

    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(["c1", "c2", "c3"])
    expect(ids).toContain("c1")
    expect(ids).not.toContain("c4")
  })

  it("rend un slug que les faits ne portent pas comme une page absente", () => {
    expect(projeterPageCategorie(PAGE, "categorie-inconnue")).toBeNull()
    expect(projeterPageCategorie([], "petit-a")).toBeNull()
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterPageCategorie(PAGE, "petit-a")

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterPageCategorie — sur une Structure déjà cyclique", () => {
  const AVEC_CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("amont-1", "Amont 1", "boucle-a"),
    structure("amont-2", "Amont 2", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("dégrade le cycle, rend le fil jusqu'à lui, et ne le répète pas", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const page = projeterPageCategorie(AVEC_CYCLE, "boucle-a")!

      expect(page.filAriane.map((maillon) => maillon.name)).toEqual([
        "Boucle B",
        "Boucle A",
      ])
      expect(new Set(page.filAriane.map((maillon) => maillon.slug)).size).toBe(
        page.filAriane.length
      )

      expect(page.enfants.map((enfant) => enfant.slug)).toEqual([
        "amont-1",
        "amont-2",
        "boucle-b",
      ])
    } finally {
      warn.mockRestore()
    }
  })

  it("ne donne aucun doublon au filtre, et ne dit le cycle qu'une fois", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const page = projeterPageCategorie(AVEC_CYCLE, "boucle-a")!

      expect(page.idsProduits).toHaveLength(4)
      expect(new Set(page.idsProduits).size).toBe(page.idsProduits.length)
      expect([...page.idsProduits].sort()).toEqual([
        "amont-1",
        "amont-2",
        "boucle-a",
        "boucle-b",
      ])
      expect(page.idsProduits).not.toContain("racine")

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterFilAriane — sur un arbre sain", () => {
  it("remonte de la racine à la Structure du Produit, qui ferme le fil", () => {
    const fil = projeterFilAriane(ARBRE_SAIN, "petit-a")

    expect(fil).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
      { name: "Petit A", slug: "petit-a" },
    ])
  })

  it("ne rend qu'elle-même quand la Structure du Produit est une racine", () => {
    expect(projeterFilAriane(ARBRE_SAIN, "isolee")).toEqual([
      { name: "Isolée", slug: "isolee" },
    ])
  })

  it("ne rend que les deux faits d'un lien, jamais davantage", () => {
    expect(projeterFilAriane(ARBRE_SAIN, "enfant-a")).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
    ])
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterFilAriane(ARBRE_SAIN, "petit-a")

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterFilAriane — sur une Structure déjà cyclique", () => {
  const AVEC_CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("amont", "Amont", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("dégrade le cycle quand le Produit est dans la boucle, et ferme le fil dessus", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const fil = projeterFilAriane(AVEC_CYCLE, "boucle-a")

      expect(fil).toEqual([
        { name: "Boucle B", slug: "boucle-b" },
        { name: "Boucle A", slug: "boucle-a" },
      ])

      expect(new Set(fil.map((maillon) => maillon.slug)).size).toBe(fil.length)
    } finally {
      warn.mockRestore()
    }
  })

  it("dégrade le cycle quand le Produit est en amont de lui, et ferme le fil sur lui", () => {
    const fil = projeterFilAriane(AVEC_CYCLE, "amont")

    expect(fil).toEqual([
      { name: "Boucle B", slug: "boucle-b" },
      { name: "Boucle A", slug: "boucle-a" },
      { name: "Amont", slug: "amont" },
    ])
    expect(new Set(fil.map((maillon) => maillon.slug)).size).toBe(fil.length)
  })

  it("journalise le cycle une fois pour toute la fiche, en nommant ses Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterFilAriane(AVEC_CYCLE, "boucle-a")

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("[marche-structure]")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })

  it("rend un fil vide pour une Structure que les faits ne portent pas", () => {
    expect(projeterFilAriane(AVEC_CYCLE, "rangee-supprimee")).toEqual([])
  })
})
