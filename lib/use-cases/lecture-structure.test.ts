import { describe, expect, it, vi } from "vitest"

import {
  lectureDesStructures,
  type FaitStructure,
  type NoeudAccueil,
} from "@/lib/use-cases/lecture-structure"
import { structure, tousLesNoeuds } from "@/test/lecture-structure-recette"
import {
  FAITS_POSITIONNES,
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
  nom: "arbreAccueil",
  projeter: (faits) =>
    tousLesNoeuds(lectureDesStructures(faits).arbreAccueil()).map((n) => n.id),
})

eprouverLOrdreDuModule({
  nom: "lignesAdmin",
  projeter: (faits) =>
    lectureDesStructures(faits)
      .lignesAdmin()
      .map((ligne) => ligne.id),
})

eprouverLOrdreDuModule({
  nom: "ciblesSuppression — les cibles de la boîte de suppression",
  projeter: (faits) =>
    lectureDesStructures(faits)
      .ciblesSuppression()
      .find((cible) => cible.id === faits[0].id)!.produits,
})

eprouverLOrdreDuModule({
  nom: "options",
  projeter: (faits) =>
    lectureDesStructures(faits)
      .options()
      .map((option) => option.id),
})

eprouverLOrdreDuModule({
  nom: "branche",
  projeter: (faits) => lectureDesStructures(faits).branche(faits[0].id),
})

eprouverLOrdreDuModule({
  nom: "enfants",
  projeter: (faits) =>
    lectureDesStructures(faits)
      .enfants(faits[0].id)
      .map((enfant) => enfant.id),
})

describe("l'ordre du module — les rendus s'accordent entre eux", () => {
  it("l'arbre, les lignes, les cibles, les puces, les options et la branche rangent les mêmes Structures de la même façon", () => {
    const faits = [
      {
        id: "racine",
        name: "Racine",
        slug: "racine",
        image: null,
        parentId: null,
        produitsDirects: 0,
        position: 0,
      },
      {
        id: "zebre",
        name: "Zèbre",
        slug: "zebre",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
        position: 0,
      },
      {
        id: "ecran",
        name: "Écran",
        slug: "ecran",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
        position: 0,
      },
      {
        id: "jumeau-b",
        name: "Jumeau",
        slug: "aaa-jumeau",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
        position: 0,
      },
      {
        id: "jumeau-a",
        name: "Jumeau",
        slug: "zzz-jumeau",
        image: null,
        parentId: "racine",
        produitsDirects: 0,
        position: 0,
      },
    ]
    const lecture = lectureDesStructures(faits)
    const lignes = lecture.lignesAdmin()
    const cibles = lecture.ciblesSuppression()

    exigerLeMemeOrdre([
      {
        nom: "l'arbre d'accueil",
        ids: dansLOrdreEprouve(
          tousLesNoeuds(lecture.arbreAccueil()).map((n) => n.id)
        ),
      },
      {
        nom: "les lignes de l'Administration",
        ids: dansLOrdreEprouve(lignes.map((l) => l.id)),
      },
      {
        nom: "les cibles de la boîte de la racine",
        ids: dansLOrdreEprouve(
          cibles.find((cible) => cible.id === "racine")!.produits
        ),
      },
      {
        nom: "les puces de la page de catégorie",
        ids: dansLOrdreEprouve(
          lecture.enfants("racine").map((enfant) => enfant.id)
        ),
      },
      {
        nom: "les options du sélecteur",
        ids: dansLOrdreEprouve(lecture.options().map((o) => o.id)),
      },
      {
        nom: "la branche de la racine",
        ids: dansLOrdreEprouve(lecture.branche("racine")),
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
        lectureDesStructures(faits)
          .filAriane(puce.id)
          .map((maillon) => maillon.slug),
        `le fil vers « ${puce.id} »`
      ).toEqual([parent, puce.id])
    }
  })
})

describe("arbreAccueil — sur un arbre sain", () => {
  it("rend les racines et leurs enfants dans l'ordre que le module promet", () => {
    const arbre = lectureDesStructures(ARBRE_SAIN).arbreAccueil()

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
    const arbre = lectureDesStructures(ARBRE_SAIN).arbreAccueil()
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
    const arbre = lectureDesStructures([
      {
        ...structure("racine", "Racine", null, 1),
        slug: "la-racine",
        image: "/racine.png",
      },
    ]).arbreAccueil()

    expect(arbre[0]).toMatchObject({
      slug: "la-racine",
      image: "/racine.png",
    })
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      lectureDesStructures(ARBRE_SAIN).arbreAccueil()

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("arbreAccueil — sur une Structure déjà cyclique", () => {
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
      const arbre = lectureDesStructures(CYCLE).arbreAccueil()

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
    const arbre = lectureDesStructures(CYCLE).arbreAccueil()

    expect(identifiants(arbre)).not.toContain("amont-1")
    expect(arbre[0]!.productCount).toBe(3)
  })

  it("efface une Structure dont la parente ne nomme aucune rangée, comme elle efface un cycle", () => {
    const arbre = lectureDesStructures([
      structure("racine", "Racine", null, 1),
      structure("enfant", "Enfant", "racine", 2),
      structure("orpheline", "Orpheline", "absente-des-faits", 4),
    ]).arbreAccueil()

    expect(arbre.map((noeud) => noeud.id)).toEqual(["racine"])
    expect(identifiants(arbre)).not.toContain("orpheline")
    expect(arbre[0]!.productCount).toBe(3)
  })
})

describe("arbreAccueil — une longueur n'est jamais un refus", () => {
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
      const arbre = lectureDesStructures(
        chaineAvecUnCycleAuBout()
      ).arbreAccueil()
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

describe("branche — une longueur n'est jamais un refus", () => {
  const PROFONDEUR = 5_000

  function chaineSousUnCycle(): FaitStructure[] {
    const chaine: FaitStructure[] = [
      structure("racine", "Racine", "boucle-a", 1),
    ]
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
    return [
      ...chaine,
      structure("boucle-a", "Boucle A", "boucle-b", 1),
      structure("boucle-b", "Boucle B", "boucle-a", 1),
    ]
  }

  function brancheEnSilence(id: string): { ids: string[]; duree: number } {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const debut = Date.now()
      const ids = lectureDesStructures(chaineSousUnCycle()).branche(id)
      return { ids, duree: Date.now() - debut }
    } finally {
      warn.mockRestore()
    }
  }

  it("descend une chaîne qui mène à un cycle, et s'arrête", () => {
    const { ids: branche, duree } = brancheEnSilence("racine")

    expect(branche).toHaveLength(PROFONDEUR)
    expect(branche[0]).toBe("racine")
    expect(branche).toContain(`c${PROFONDEUR - 1}`)
    expect(new Set(branche).size).toBe(branche.length)

    expect(duree).toBeLessThan(2_000)
  })

  it("descend depuis une Structure qu'aucune racine n'atteint, et s'arrête", () => {
    const { ids: branche, duree } = brancheEnSilence("boucle-a")

    expect(branche).toHaveLength(PROFONDEUR + 2)
    expect(branche[0]).toBe("boucle-a")
    expect(branche).toContain("boucle-b")
    expect(branche).toContain(`c${PROFONDEUR - 1}`)
    expect(new Set(branche).size).toBe(branche.length)

    expect(duree).toBeLessThan(2_000)
  })
})

describe("lignesAdmin — sur un arbre sain", () => {
  it("rend une ligne par Structure, dans l'ordre de la descente", () => {
    const lignes = lectureDesStructures(ARBRE_SAIN).lignesAdmin()

    expect(lignes.map((ligne) => ligne.id)).toEqual([
      "isolee",
      "racine",
      "enfant-a",
      "petit-a",
      "enfant-b",
    ])
  })

  it("donne à chaque ligne sa profondeur dans l'arbre", () => {
    const lignes = lectureDesStructures(ARBRE_SAIN).lignesAdmin()

    expect(lignes.map((ligne) => ligne.profondeur)).toEqual([0, 0, 1, 2, 1])
  })

  it("donne à chaque ligne le lien qui la nomme et le nom de sa parente", () => {
    const lignes = lectureDesStructures(ARBRE_SAIN).lignesAdmin()
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
    const lignes = lectureDesStructures(ARBRE_SAIN).lignesAdmin()
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
      lectureDesStructures(ARBRE_SAIN).lignesAdmin()

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("lignesAdmin — la position, le cumul et le fil d'Ariane", () => {
  it("donne à chaque ligne sa position parmi ses sœurs, et leur nombre", () => {
    const lignes = lectureDesStructures(ARBRE_SAIN).lignesAdmin()
    const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]))

    expect(parId.get("isolee")).toMatchObject({ position: 1, nombreFreres: 2 })
    expect(parId.get("racine")).toMatchObject({ position: 2, nombreFreres: 2 })
    expect(parId.get("enfant-a")).toMatchObject({
      position: 1,
      nombreFreres: 2,
    })
    expect(parId.get("enfant-b")).toMatchObject({
      position: 2,
      nombreFreres: 2,
    })
    expect(parId.get("petit-a")).toMatchObject({ position: 1, nombreFreres: 1 })
  })

  it("cumule les Produits de la branche entière à côté du compte direct", () => {
    const lignes = lectureDesStructures(ARBRE_SAIN).lignesAdmin()
    const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]))

    expect(parId.get("racine")).toMatchObject({
      nombreProduits: 1,
      nombreProduitsCumules: 6,
    })
    expect(parId.get("enfant-a")).toMatchObject({
      nombreProduits: 0,
      nombreProduitsCumules: 2,
    })
    expect(parId.get("petit-a")).toMatchObject({
      nombreProduits: 2,
      nombreProduitsCumules: 2,
    })
    expect(parId.get("enfant-b")).toMatchObject({
      nombreProduits: 3,
      nombreProduitsCumules: 3,
    })
    expect(parId.get("isolee")).toMatchObject({
      nombreProduits: 4,
      nombreProduitsCumules: 4,
    })
  })

  it("porte le fil d'Ariane de chaque ligne, la racine d'abord", () => {
    const lignes = lectureDesStructures(ARBRE_SAIN).lignesAdmin()
    const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]))

    expect(parId.get("petit-a")!.chemin).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
      { name: "Petit A", slug: "petit-a" },
    ])
    expect(parId.get("racine")!.chemin).toEqual([
      { name: "Racine", slug: "racine" },
    ])
  })

  it("cumule les Produits d'une Structure hors arbre sans boucler", () => {
    const lignes = lectureDesStructures([
      structure("racine", "Racine", null, 1),
      structure("amont", "Amont", "boucle-a", 2),
      structure("boucle-a", "Boucle A", "boucle-b", 3),
      structure("boucle-b", "Boucle B", "boucle-a", 4),
    ]).lignesAdmin()
    const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]))

    expect(parId.get("boucle-a")!.nombreProduitsCumules).toBe(9)
    expect(parId.get("boucle-b")!.nombreProduitsCumules).toBe(9)
    expect(parId.get("amont")!.nombreProduitsCumules).toBe(2)
  })

  it("range les lignes, l'arbre, les options et la branche par position, pas par nom", () => {
    const lecture = lectureDesStructures(FAITS_POSITIONNES)
    const ids = (noms: string[]) => noms

    expect(lecture.lignesAdmin().map((ligne) => ligne.id)).toEqual([
      "racine",
      "zebre",
      "alpha",
      "ecran",
    ])
    expect(
      lecture.arbreAccueil()[0]!.children.map((noeud) => noeud.id)
    ).toEqual(ids(["zebre", "alpha", "ecran"]))
    expect(lecture.enfants("racine").map((enfant) => enfant.id)).toEqual(
      ids(["zebre", "alpha", "ecran"])
    )
    expect(lecture.options().map((option) => option.id)).toEqual([
      "racine",
      "zebre",
      "alpha",
      "ecran",
    ])
    expect(lecture.branche("racine")).toEqual([
      "racine",
      "zebre",
      "alpha",
      "ecran",
    ])
    expect(
      lecture.ciblesSuppression().find((c) => c.id === "racine")!.produits
    ).toEqual(["zebre", "alpha", "ecran"])
  })
})

describe("lignesAdmin — sur une Structure déjà cyclique", () => {
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
    const lignes = lectureDesStructures(AVEC_CYCLE).lignesAdmin()

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

  it("journalise le cycle une fois pour toute la lecture, en nommant ses Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const lecture = lectureDesStructures(AVEC_CYCLE)
      lecture.lignesAdmin()
      lecture.ciblesSuppression()

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
    const lecture = lectureDesStructures([
      structure("racine", "Racine", null, 1),
      structure("orpheline", "Orpheline", "absente-des-faits", 5),
      structure("enfant-orphelin", "Enfant orphelin", "orpheline"),
    ])
    const lignes = lecture.lignesAdmin()
    const cibles = lecture.ciblesSuppression()

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

describe("ciblesSuppression — les deux listes que la boîte de chaque ligne reçoit", () => {
  it("offre à un Produit toutes les Structures, descendantes comprises", () => {
    const cibles = lectureDesStructures(ARBRE_SAIN).ciblesSuppression()
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
    const cibles = lectureDesStructures(ARBRE_SAIN).ciblesSuppression()
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
    const lecture = lectureDesStructures(ARBRE_SAIN)
    const lignes = lecture.lignesAdmin()
    const cibles = lecture.ciblesSuppression()

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
    for (const cible of lectureDesStructures(ARBRE_SAIN).ciblesSuppression()) {
      for (const liste of [cible.produits, cible.sousCategories]) {
        expect(liste.length).toBeGreaterThan(0)
        for (const valeur of liste) {
          expect(typeof valeur).toBe("string")
        }
      }
    }
  })
})

describe("ciblesSuppression — sur une Structure déjà cyclique", () => {
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
    const cibles = lectureDesStructures(AVEC_CYCLE).ciblesSuppression()
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
    const cibles = lectureDesStructures(AVEC_CYCLE).ciblesSuppression()
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

describe("options — un sélecteur ne rend que ce qu'il affiche", () => {
  it("rend l'identifiant et le nom de chaque Structure, dans l'ordre promis", () => {
    const options = lectureDesStructures(ARBRE_SAIN).options()

    expect(options).toEqual([
      { id: "enfant-a", name: "Enfant A" },
      { id: "enfant-b", name: "Enfant B" },
      { id: "isolee", name: "Isolée" },
      { id: "petit-a", name: "Petit A" },
      { id: "racine", name: "Racine" },
    ])
  })

  it("rend exactement deux faits : ni compteur, ni nom de parente", () => {
    const options = lectureDesStructures(ARBRE_SAIN).options()

    for (const option of options) {
      expect(Object.keys(option).sort()).toEqual(["id", "name"])
    }
  })

  it("propose une Structure corrompue, et ne journalise rien", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const options = lectureDesStructures([
        structure("racine", "Racine", null, 1),
        structure("boucle-a", "Boucle A", "boucle-b"),
        structure("boucle-b", "Boucle B", "boucle-a"),
      ]).options()

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

describe("structure, options et branche — sur un arbre sain", () => {
  it("rend la Structure demandée, les options du sélecteur, et la branche comme parentes exclues", () => {
    const lecture = lectureDesStructures(ARBRE_SAIN)

    expect(lecture.structure("enfant-a")).toEqual({
      id: "enfant-a",
      name: "Enfant A",
      slug: "enfant-a",
      image: null,
      parentId: "racine",
    })

    expect(lecture.options()).toEqual([
      { id: "enfant-a", name: "Enfant A" },
      { id: "enfant-b", name: "Enfant B" },
      { id: "isolee", name: "Isolée" },
      { id: "petit-a", name: "Petit A" },
      { id: "racine", name: "Racine" },
    ])

    expect(lecture.branche("enfant-a")).toEqual(["enfant-a", "petit-a"])
  })

  it("laisse la parente actuelle parmi les options, jamais parmi la branche", () => {
    const lecture = lectureDesStructures(ARBRE_SAIN)

    expect(lecture.structure("enfant-a")!.parentId).toBe("racine")
    expect(lecture.branche("enfant-a")).not.toContain("racine")
    expect(lecture.options()).toContainEqual({ id: "racine", name: "Racine" })
  })

  it("rend une Structure que les faits ne portent pas comme une fiche absente", () => {
    expect(lectureDesStructures(ARBRE_SAIN).structure("inconnue")).toBeNull()
    expect(lectureDesStructures([]).structure("inconnue")).toBeNull()
  })

  it("rend une Structure sans descendante elle seule : sa branche est elle-même", () => {
    const lecture = lectureDesStructures(ARBRE_SAIN)

    expect(lecture.branche("isolee")).toEqual(["isolee"])
    expect(lecture.branche("petit-a")).toEqual(["petit-a"])
  })

  it("rend une Structure que les faits ne portent pas elle seule, sans lever", () => {
    expect(lectureDesStructures(ARBRE_SAIN).branche("inconnue")).toEqual([
      "inconnue",
    ])
    expect(lectureDesStructures([]).branche("inconnue")).toEqual(["inconnue"])
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const lecture = lectureDesStructures(ARBRE_SAIN)
      lecture.structure("enfant-a")
      lecture.options()
      lecture.branche("enfant-a")

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("structure, options et branche — sur une Structure déjà cyclique", () => {
  const AVEC_CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("amont", "Amont", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("rend la fiche et la branche d'un maillon du cycle, sans rien perdre du reste", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const lecture = lectureDesStructures(AVEC_CYCLE)

      expect(lecture.structure("boucle-a")).toMatchObject({
        id: "boucle-a",
        parentId: "boucle-b",
      })
      expect(lecture.options().map((option) => option.id)).toEqual([
        "amont",
        "boucle-a",
        "boucle-b",
        "racine",
      ])

      expect(lecture.branche("boucle-a")).toEqual([
        "boucle-a",
        "amont",
        "boucle-b",
      ])
      expect(new Set(lecture.branche("boucle-a")).size).toBe(
        lecture.branche("boucle-a").length
      )
    } finally {
      warn.mockRestore()
    }
  })

  it("rend le même ensemble par chacun des deux maillons du cycle", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const lecture = lectureDesStructures(AVEC_CYCLE)

      expect([...lecture.branche("boucle-b")].sort()).toEqual(
        [...lecture.branche("boucle-a")].sort()
      )
    } finally {
      warn.mockRestore()
    }
  })

  it("journalise le cycle une fois, en nommant ses Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      lectureDesStructures(AVEC_CYCLE).branche("boucle-a")

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

describe("structureParSlug, filAriane, enfants et branche — sur un arbre sain", () => {
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
    const lecture = lectureDesStructures(PAGE)

    expect(lecture.structureParSlug("petit-a")).toEqual({
      id: "c3",
      name: "Petit A",
      slug: "petit-a",
      image: null,
      parentId: "c2",
    })

    expect(lecture.filAriane("c3")).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
      { name: "Petit A", slug: "petit-a" },
    ])
  })

  it("passe l'image à la rangée qu'il rend, et rien d'autre", () => {
    const fiche = lectureDesStructures(PAGE).structureParSlug("racine")

    expect(fiche).toEqual({
      id: "c1",
      name: "Racine",
      slug: "racine",
      image: "/racine.png",
      parentId: null,
    })
  })

  it("ne rend qu'elle-même quand la Structure est une racine", () => {
    expect(lectureDesStructures(PAGE).filAriane("c1")).toEqual([
      { name: "Racine", slug: "racine" },
    ])
  })

  it("rend les sous-catégories directes dans l'ordre que le module promet", () => {
    expect(
      lectureDesStructures(PAGE)
        .enfants("c4")
        .map((enfant) => enfant.name)
    ).toEqual(["Écran", "Zèbre"])
  })

  it("donne au filtre des Produits la Structure et ses descendantes, chacune une fois", () => {
    const ids = lectureDesStructures(PAGE).branche("c1")

    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(["c1", "c2", "c3"])
    expect(ids).toContain("c1")
    expect(ids).not.toContain("c4")
  })

  it("rend un slug que les faits ne portent pas comme une fiche absente", () => {
    expect(
      lectureDesStructures(PAGE).structureParSlug("categorie-inconnue")
    ).toBeNull()
    expect(lectureDesStructures([]).structureParSlug("petit-a")).toBeNull()
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const lecture = lectureDesStructures(PAGE)
      lecture.structureParSlug("petit-a")
      lecture.filAriane("c3")
      lecture.enfants("c4")
      lecture.branche("c1")

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("structureParSlug, filAriane, enfants et branche — sur une Structure déjà cyclique", () => {
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
      const lecture = lectureDesStructures(AVEC_CYCLE)

      expect(
        lecture.filAriane("boucle-a").map((maillon) => maillon.name)
      ).toEqual(["Boucle B", "Boucle A"])
      expect(
        new Set(lecture.filAriane("boucle-a").map((maillon) => maillon.slug))
          .size
      ).toBe(lecture.filAriane("boucle-a").length)

      expect(lecture.enfants("boucle-a").map((enfant) => enfant.slug)).toEqual([
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
      const lecture = lectureDesStructures(AVEC_CYCLE)
      lecture.filAriane("boucle-a")
      lecture.enfants("boucle-a")
      const ids = lecture.branche("boucle-a")

      expect(ids).toHaveLength(4)
      expect(new Set(ids).size).toBe(ids.length)
      expect([...ids].sort()).toEqual([
        "amont-1",
        "amont-2",
        "boucle-a",
        "boucle-b",
      ])
      expect(ids).not.toContain("racine")

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

describe("filAriane — sur un arbre sain", () => {
  it("remonte de la racine à la Structure du Produit, qui ferme le fil", () => {
    const fil = lectureDesStructures(ARBRE_SAIN).filAriane("petit-a")

    expect(fil).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
      { name: "Petit A", slug: "petit-a" },
    ])
  })

  it("ne rend qu'elle-même quand la Structure du Produit est une racine", () => {
    expect(lectureDesStructures(ARBRE_SAIN).filAriane("isolee")).toEqual([
      { name: "Isolée", slug: "isolee" },
    ])
  })

  it("ne rend que les deux faits d'un lien, jamais davantage", () => {
    expect(lectureDesStructures(ARBRE_SAIN).filAriane("enfant-a")).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
    ])
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      lectureDesStructures(ARBRE_SAIN).filAriane("petit-a")

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it("laisse une parente que les faits ne nomment pas hors du fil, au lieu d'en dire un lien", () => {
    const fil = lectureDesStructures([
      structure("racine", "Racine", null, 1),
      structure("enfant", "Enfant", "absente-des-faits", 2),
    ]).filAriane("enfant")

    expect(fil).toEqual([{ name: "Enfant", slug: "enfant" }])
  })
})

describe("filAriane — sur une Structure déjà cyclique", () => {
  const AVEC_CYCLE: FaitStructure[] = [
    structure("racine", "Racine", null, 1),
    structure("amont", "Amont", "boucle-a"),
    structure("boucle-a", "Boucle A", "boucle-b"),
    structure("boucle-b", "Boucle B", "boucle-a"),
  ]

  it("dégrade le cycle quand le Produit est dans la boucle, et ferme le fil dessus", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const fil = lectureDesStructures(AVEC_CYCLE).filAriane("boucle-a")

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
    const fil = lectureDesStructures(AVEC_CYCLE).filAriane("amont")

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
      lectureDesStructures(AVEC_CYCLE).filAriane("boucle-a")

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
    expect(
      lectureDesStructures(AVEC_CYCLE).filAriane("rangee-supprimee")
    ).toEqual([])
  })
})
