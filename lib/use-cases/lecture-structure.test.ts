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
import {
  dansLOrdreEprouve,
  exigerLeMemeOrdre,
  eprouverLOrdreDuModule,
} from "@/test/ordre-structures-recette"

/**
 * La Lecture de la Structure, par sa porte pure : l'arbre d'accueil projeté sur
 * des faits déjà en mémoire.
 *
 * **Cette suite ne lit rien.** Les Structures sont des littéraux, la projection
 * est synchrone, aucune requête n'est émise — c'est le privilège qu'ADR-0030
 * revendiquait et que la boutique ne livrait pas : avant, la dégradation d'un
 * cycle ne se prouvait qu'avec un PostgreSQL, parce que le seul chemin vers elle
 * traversait une lecture. Elle se prouve ici, sur des faits, et la preuve ne
 * coûte plus une base.
 *
 * Ce qu'elle épingle est ce que le module **promet**, jamais la façon dont les
 * faits sont arrivés : la forme de l'arbre, l'ordre de ses frères, le compte de
 * Produits d'une branche entière, et le sort d'une Structure corrompue — absente
 * de l'arbre, nommée une fois dans le journal. Aucun Prisma, aucune espionage
 * d'une requête, aucun rendu : une épreuve qui casserait au premier changement
 * de marge ou de collation n'éprouverait pas un fait de Structure.
 *
 * Quatre projections s'y prouvent : l'arbre d'accueil, les lignes de
 * l'Administration, le sélecteur d'un formulaire, et l'écran d'édition. Elles
 * partagent les fixtures parce qu'elles interrogent les **mêmes** faits, pas
 * parce que la preuve est la même — l'une rend une hiérarchie, l'autre une liste
 * ordonnée qui se lit à l'écran, la troisième une liste d'options qui ne rend que
 * l'identifiant et le nom, la dernière ce qu'un formulaire propose pour une
 * Structure qu'il édite. Chaque projection garde donc ses épreuves, et une
 * assertion d'une projection ne vaut pas pour l'autre.
 */

/**
 * Une Structure en littéral : les six faits que la Lecture rend à ses
 * projections. Le slug reprend l'identifiant et l'image reste nulle — la suite
 * ne se prononce ni sur l'un ni sur l'autre, sauf là où elle l'asserte.
 */
function structure(
  id: string,
  name: string,
  parentId: string | null,
  produitsDirects = 0
): FaitStructure {
  return { id, name, slug: id, image: null, parentId, produitsDirects }
}

/**
 * Les nœuds de l'arbre, tous, dans l'ordre où le module les rend : un **pré-ordre**,
 * par une pile explicite — une chaîne de plusieurs milliers de maillons est une
 * forme ordinaire ici, et une récursion de facture l'aurait fait tomber.
 *
 * Les enfants sont empilés à l'envers pour que la pile les rende **dans l'ordre du
 * module** : une pile rend ce qu'on y pousse en dernier, et une liste qu'on retourne
 * pour éviter cela donnerait, pour une liste d'identifiants, une suite qui ressemble
 * à un classement sans en être un. C'est ce helper qui sert à l'épreuve d'accord
 * entre les rendus, donc la confusion ne resterait pas invisible longtemps.
 */
function tousLesNoeuds(noeuds: readonly NoeudAccueil[]): NoeudAccueil[] {
  const tous: NoeudAccueil[] = []
  const pile = [...noeuds].reverse()
  while (pile.length > 0) {
    const noeud = pile.pop()!
    tous.push(noeud)
    for (let rang = noeud.children.length - 1; rang >= 0; rang -= 1) {
      pile.push(noeud.children[rang]!)
    }
  }
  return tous
}

function identifiants(noeuds: readonly NoeudAccueil[]): string[] {
  return tousLesNoeuds(noeuds).map((noeud) => noeud.id)
}

/**
 * L'arbre ordinaire, à côté duquel la corruption se lit :
 *
 *     racine ─┬─ enfant-a ─── petit-a
 *             └─ enfant-b
 *     isolee
 *
 * Les produits sont répartis pour qu'un compte faux se voie : `racine` porte un
 * Produit, `enfant-a` n'en porte aucun et hérite des deux de `petit-a`,
 * `enfant-b` en porte trois sans descendante, et `isolee` quatre.
 */
const ARBRE_SAIN: FaitStructure[] = [
  structure("racine", "Racine", null, 1),
  structure("enfant-a", "Enfant A", "racine"),
  structure("enfant-b", "Enfant B", "racine", 3),
  structure("petit-a", "Petit A", "enfant-a", 2),
  structure("isolee", "Isolée", null, 4),
]

/* ======================================================================== *
 * L'ordre du module, une promesse et six rendus (US 5, US 31)               *
 * ======================================================================== *
 *
 * Les assertions d'ordre — le départage des Structures de même nom et la
 * collation française — sont **écrites une fois**, dans
 * `@/test/ordre-structures-recette`, avec leur fixture et l'ordre qu'elles
 * attendent. Elles vivaient dans trois de ces blocs, recopiées, et le cœur en
 * portait une quatrième dans `marche-structure-partition.test.ts` ; une projection
 * écrite plus tard aurait pu sortir son propre comparateur sans que rien ne la
 * lie aux trois autres, et rien ne se serait contredit sur une liste dont les
 * noms sont distincts. C'est le défaut que la fixture croisée de la recette ferme.
 *
 * **La recette ne remplace pas l'accord entre les rendus, elle s'y ajoute.** Que
 * chaque projection classe correctement ne dit pas qu'elles classent **pareillement** :
 * deux règles exactes et différentes passent la recette et trahissent la promesse
 * d'interface. L'épreuve d'accord compare donc les six rendus **côte à côte** —
 * sans recalculer le classement, ce qui serait écrire la règle une troisième fois,
 * dans la preuve même.
 *
 * Le **fil d'Ariane** est la seule forme que cet ordre ne classe pas, et ce n'est
 * pas un oubli : son ordre est un **chemin** — la racine d'abord, la Structure
 * demandée en dernier — et non un classement d'un ensemble. Ce qui doit y valoir,
 * c'est que le fil nomme les mêmes Structures que les puces de sa parente et se
 * referme sur celle de son Produit ; son bloc l'éprouve.
 */
eprouverLOrdreDuModule({
  nom: "projeterArbreAccueil",
  // L'arbre entier, à plat : la recette ne garde que les quatre épinglées, et
  // l'ordre dans lequel elles apparaissent est l'ordre du pré-ordre.
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
  // Les cibles de la **racine** — et non d'une des quatre : une cible s'écarte
  // toujours la Structure dont elle est la cible, donc les quatre y sont toutes.
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

    // Chacune est réduite aux quatre Structures épinglées : les rendus ne portent
    // pas tous la même liste — le pré-ordre de l'arbre passe par la racine, les
    // cibles de la racine l'excluent — et ce qui doit être **le même** est l'ordre
    // dans lequel chacun range les mêmes Structures.
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
    // Le fil n'est **pas** un classement : c'est un chemin, la racine d'abord et la
    // Structure du Produit en dernier. Ce qu'il partage avec les puces de sa
    // parente, ce sont les Structures qu'il nomme et l'ordre dans lequel il les
    // rencontre : pour chaque puce, le fil est le chemin de la racine **plus** cette
    // puce. Un fil qui classerait autrement que les puces romprait cette égalité
    // sans qu'aucune des deux épreuves tombe.
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

    // L'ordre se lit par nom, en français : « Isolée » avant « Racine ». Ni
    // l'ordre d'écriture des faits, ni la collation d'un serveur de base ne
    // décident — le module tient la promesse que la base ne tenait pas.
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
    // `enfant-a` ne porte rien lui-même : les deux Produits de `petit-a` sont
    // les siens, et c'est ce que la carte d'accueil annonce.
    expect(parId.get("enfant-a")!.productCount).toBe(2)
    expect(parId.get("enfant-b")!.productCount).toBe(3)
    // Et la racine cumule les trois branches, pas seulement la sienne.
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

    // La page tire son lien et son image de là : une projection qui les
    // perdrait ne se verrait pas dans son propre rendu, et le défaut
    // n'apparaîtrait qu'en production.
    expect(arbre[0]).toMatchObject({
      slug: "la-racine",
      image: "/racine.png",
    })
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterArbreAccueil(ARBRE_SAIN)

      // Une ligne sur un arbre sain serait une alerte qu'un éditeur prendrait
      // pour une corruption, et il chercherait une faute qui n'existe pas.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterArbreAccueil — sur une Structure déjà cyclique", () => {
  /**
   * Un cycle que deux amont mènent à, à côté d'une branche saine :
   *
   *     racine ─── enfant
   *     amont-1 ──┐
   *               ├─ boucle-a ⇄ boucle-b
   *     amont-2 ──┘
   *
   * Deux amont et non un : c'est ce qui distingue « une ligne par cycle » de
   * « une ligne par Structure avalée ». Un journal naïf en rendrait une par
   * maillon remonté, et c'est le nombre de lignes que l'avertissement doit
   * fixer qui le dit.
   */
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

      // La branche saine est rendue entière : une corruption à un bout de la
      // table n'a pas de quoi vider la page d'accueil (ADR-0030). Un visiteur
      // n'a personne à qui se plaindre — la boutique dégrade.
      expect(arbre.map((noeud) => noeud.id)).toEqual(["racine"])
      expect(arbre[0]!.productCount).toBe(3)

      // Le cycle et ce qui y mène sont absents de l'arbre, et n'y ont jamais
      // eu de place : l'arbre descend depuis les racines.
      const presents = identifiants(arbre)
      for (const absent of ["boucle-a", "boucle-b", "amont-1", "amont-2"]) {
        expect(presents, absent).not.toContain(absent)
      }

      // Une ligne, pas une par maillon ni une par Structure avalée : c'est la
      // retenue de la marche, qui meurt avec elle donc avec la lecture.
      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      // Les amont ne sont pas dans le cycle : la ligne nomme ce qu'il faut
      // réparer, et un `Maillon` de plus la rendrait illisible.
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })

  it("efface une Structure qu'aucune racine n'atteint, sans la nommer", () => {
    const arbre = projeterArbreAccueil(CYCLE)

    // `amont-1` a bien une parente en base : ce n'est pas une racine qui
    // manque, c'est une branche que le cycle soustrait à l'arbre. Elle n'a donc
    // pas de place à l'accueil, et son absence ne se confondit pas avec celle
    // d'une Structure que le journal signale.
    expect(identifiants(arbre)).not.toContain("amont-1")
    // Et ses Produits ne se comptabilisent sur personne : une carte qui les
    // additionnerait annoncerait un nombre que le catalogue n'a pas.
    expect(arbre[0]!.productCount).toBe(3)
  })

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
  /**
   * Un cycle **au bout** d'une chaîne de plusieurs milliers de maillons, une
   * racine en tête. La taille est celle que le cœur pur emploie déjà : aucune
   * profondeur maximale n'est une règle de ce dépôt, et une borne implicite
   * ne doit pas se glisser dans une projection (ADR-0027, ADR-0030).
   */
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
    // Le dernier maillon est suspendu sous la boucle : le cycle est au bout
    // de la chaîne, et c'est ce qui l'en sépare.
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

      // Les trois derniers maillons sont hors arbre — le dernier de la chaîne
      // et les deux de la boucle — et la page rend les `PROFONDEUR - 1`
      // maillons qu'une racine atteint, à cinq mille niveaux d'elle.
      expect(arbre).toHaveLength(1)
      const presents = identifiants(arbre)
      expect(presents).toHaveLength(PROFONDEUR - 1)
      expect(presents).toContain("racine")
      expect(presents).toContain(`c${PROFONDEUR - 2}`)
      for (const absent of [`c${PROFONDEUR - 1}`, "boucle-a", "boucle-b"]) {
        expect(presents, absent).not.toContain(absent)
      }
      // Chaque maillon porte un Produit : la racine annonce toute la chaîne
      // qu'elle atteint, et la boucle n'y verse rien.
      expect(arbre[0]!.productCount).toBe(PROFONDEUR - 1)

      // Une ligne, qui nomme la boucle et pas la chaîne : le cycle est résumé
      // par la marche, et un cycle de cinq mille maillons ne s'énumère pas.
      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      expect(ligne).not.toContain("Maillon")

      // Une borne large : elle ne mesure pas la performance, elle refuse le
      // quadratique — un cumul qui remonte chaque nœud jusqu'à la racine ferait
      // vingt-cinq millions de pas et ne tiendrait pas dans cette borne.
      expect(duree).toBeLessThan(2_000)
    } finally {
      warn.mockRestore()
    }
  })
})

/* ======================================================================== *
 * Les lignes de l'Administration (#567)                                     *
 * ======================================================================== *
 *
 * La seconde forme que la Lecture rend : une liste **plate** et ordonnée, que
 * l'écran d'Administration lit ligne à ligne. Ce qui la distingue de l'arbre
 * d'accueil n'est pas la matière — ce sont les mêmes six faits — mais la
 * question : l'arbre demande « quelle Structure est sous laquelle », la liste
 * demande « dans quel ordre je les lis et à quel niveau ». D'où les deux seules
 * choses qu'elle ajoute, la **profondeur** et la **marque hors arbre**, et d'où
 * sa règle : rien n'est perdu, pas même une Structure que son `parentId` ne
 * nomme pas.
 *
 * Ces épreuves vivent ici, et non dans la suite de la page, parce que la page
 * ne peut pas les faire mieux : elle rendrait l'ordre et la profondeur en
 * `padding-left`, donc une épreuve du HTML dirait « ce retrait vaut 1,5 » —
 * ce qu'elle n'affirme pas. Elle dit « cette ligne est à deux niveaux », et le
 * retrait n'est plus qu'une façon de le montrer (US 42).
 */
describe("projeterEcranAdmin — les lignes — sur un arbre sain", () => {
  it("rend une ligne par Structure, dans l'ordre de la descente", () => {
    const { lignes } = projeterEcranAdmin(ARBRE_SAIN)

    // Pré-ordre, frères par nom en français : la racine `Isolée` ouvre la liste,
    // puis la branche de `Racine` entière avant de revenir. Ni l'ordre d'écriture
    // des faits ni la collation d'un serveur de base ne décident — le module tient
    // la promesse que la base ne tenait pas.
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

    // La profondeur est un fait de la Structure, pas une mesure d'écran : la
    // profondeur d'un enfant est celle de sa parente plus un, et une racine est
    // à zéro. C'est l'écran qui en fait un retrait ; c'est ici qu'elle se compte.
    expect(lignes.map((ligne) => ligne.profondeur)).toEqual([0, 0, 1, 2, 1])
  })

  it("donne à chaque ligne le lien qui la nomme et le nom de sa parente", () => {
    const { lignes } = projeterEcranAdmin(ARBRE_SAIN)
    const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]))

    // Le nom de la parente est **dérivé** du lien et du nom, jamais joint : le
    // module lit la table entière, donc la carte des noms répond déjà, et une
    // jointure de plus serait une seconde manière de lire la Structure. Une
    // racine n'a ni lien ni nom de parente.
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

    // Les deux compteurs sont **dérivés en mémoire** — les sous-catégories, en
    // comptant les Structures dont le lien est cette rangée — et non lus. Deux
    // compteurs ne peuvent donc pas se contredire : ils sortent du même fait, le
    // lien, et la base n'est pas interrogée une fois de plus pour l'un d'eux.
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

      // Une ligne sur un arbre sain serait une alerte qu'un éditeur prendrait
      // pour une corruption, et il chercherait une faute qui n'existe pas.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterEcranAdmin — les lignes — sur une Structure déjà cyclique", () => {
  /**
   * Un cycle, et une branche qui y mène, à côté d'un arbre sain :
   *
   *     racine ─── enfant-a ─── petit-a
   *     isolee
   *     amont ──┐
   *             ├─ boucle-a ⇄ boucle-b
   *             ┘
   *
   * Les trois Structures avalées sont donc **hors arbre** — c'est le terme du
   * glossaire — et c'est le fait que la liste d'Administration doit rendre
   * visible : la boutique les dégrade en silence, et la corruption ne se répare
   * que d'ici (ADR-0030).
   */
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

    // L'arbre ordinaire d'abord, le hors arbre ensuite — et **à la racine**, sans
    // retrait : aucune branche ne les porte, donc une indentation leur prêterait
    // une place qu'elles n'ont pas (US 10).
    expect(lignes.map((ligne) => [ligne.id, ligne.profondeur])).toEqual([
      ["isolee", 0],
      ["racine", 0],
      ["enfant-a", 1],
      ["petit-a", 2],
      ["amont", 0],
      ["boucle-a", 0],
      ["boucle-b", 0],
    ])

    // La marque est la seule chose que ces trois lignes doivent à leur
    // provenance, et rien d'autre ne la porte : les quatre premières en sont
    // exemptes.
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

      // **Une ligne, pas une par Structure avalée** : trois Structures hors arbre
      // ici, et le journal n'en dit qu'une. C'est la même marche qui sert à
      // fonder le sous-ensemble hors arbre et à le nommer, donc la retenue qui
      // empêche la seconde ligne est celle de la marche — et elle meurt avec elle,
      // donc avec la lecture. Une projection qui bâtirait une seconde marche
      // dirait le même cycle deux fois, et l'avertissement cesserait de dire
      // combien de Structures toucher.
      //
      // Et c'est aussi ce qui est en jeu pour les **cibles de chaque ligne** : la
      // projection en demande une par Structure, donc une descente par ligne, et
      // chacune d'elles retombe sur la boucle — puisque les trois maillons sont
      // les ancêtres les uns des autres. Une marche par ligne dirait donc le cycle
      // une fois de plus par ligne, et l'avertissement annoncerait un cycle à
      // réparer par Structure d'une boucle qui n'en compte qu'un. Les cibles
      // sortent donc de la marche de la projection, pas d'une autre.
      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      // L'amont n'est pas dans le cycle : la ligne nomme ce qu'il faut réparer,
      // et un `Amont` de plus la rendrait illisible — sa place, elle, est dans la
      // liste, sous la marque.
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

    // Une `parentId` que rien ne nomme est impossible côté base — la clé étrangère
    // la garantit — mais pas sur la porte pure. La liste **dégrade** alors comme
    // la boutique : elle ne perd pas la rangée. Le bâtisseur d'arbre que l'écran
    // portait la perdait, et cette ligne manquante n'aurait été visible d'aucune
    // épreuve.
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

/* ======================================================================== *
 * Les cibles que la boîte de suppression reçoit (#573)                      *
 * ======================================================================== *
 *
 * La troisième question que l'écran d'Administration pose aux mêmes faits :
 * où vont les Produits de la Structure d'une ligne, et où vont ses
 * sous-catégories. Elle était jusqu'ici posée par la **boîte de suppression**, dans
 * un composant `"use client"`, qui bâtissait sa marche à chaque rendu pour y
 * répondre (US 40). Elle se pose ici, à côté des deux autres — donc de la même
 * lecture et de la même marche, ce qui est la seule façon de ne pas dire le même
 * cycle autant de fois qu'il y a de lignes.
 *
 * **Ce ne sont pas les lignes qui les portent, et c'est la forme étroite qui le
 * dit.** Les deux listes sont deux fois plus longues que la ligne qui les reçoit :
 * les mettre sur la ligne aurait fait porter à chaque rangée un fait qui n'est pas
 * le sien, et une ligne est rendue par un composant qui n'a pas d'autre chose à
 * afficher. Elles arrivent donc par **leur propre forme**, `CiblesSuppression`,
 * que la même projection rend dans le même retour — une lecture, une marche, une
 * ligne de journal, et deux formes étroites (US 32). Le prix en props reste au
 * carré du nombre de Structures : une boîte par ligne, une liste de cibles par
 * boîte. Il est consigné dans ADR-0030 (§ Further Notes, « le coût, énoncé »), et
 * l'en-tête du module le rappelle à côté de la forme.
 *
 * Leur ordre est **celui du module**, comme le reste de l'écran : le cœur écrit
 * l'ordre une fois — le nom en français, départagé par l'identifiant — et la
 * projection comme les quatre autres le reprennent tel quel. L'accord des deux est
 * éprouvé plus haut, parmi les sept rendus.
 */
describe("projeterEcranAdmin — les cibles que la boîte de chaque ligne reçoit", () => {
  it("offre à un Produit toutes les Structures, descendantes comprises", () => {
    const { cibles } = projeterEcranAdmin(ARBRE_SAIN)
    const parId = new Map(cibles.map((cible) => [cible.id, cible]))

    // Un Produit n'a pas d'accusé de réception : il atterrit où l'on dit, donc
    // **toute** Structure autre que celle-ci est une cible — une descendante
    // comprise, sans quoi déplacer un Produit serait plus astreint que le tri
    // d'une sous-catégorie (US 16).
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
    // Et jamais la Structure elle-même : elle est la ligne qu'on supprime.
    for (const cible of cibles) {
      expect(cible.produits, cible.id).not.toContain(cible.id)
      expect(new Set(cible.produits).size, cible.id).toBe(cible.produits.length)
    }
  })

  it("écarte des sous-catégories ce qui descend de la Structure de la ligne", () => {
    const { cibles } = projeterEcranAdmin(ARBRE_SAIN)
    const parId = new Map(cibles.map((cible) => [cible.id, cible]))

    // Rattacher une Structure à l'une de ses descendantes refermerait la boucle
    // sur elle-même : la liste des sous-catégories est donc la première moins la
    // branche, et rien d'autre. `Petit A` reste une cible de **Produit** — c'est
    // la seule différence entre les deux listes, et elle tient à la règle
    // (ADR-0030).
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

    // Une cible par Structure de la table, et **une seule** : c'est ce qui permet
    // à l'écran de rendre une boîte par ligne sans jamais chercher une cible qui
    // n'est pas là. Les cibles viennent dans **l'ordre de la lecture**, pas dans
    // celui des lignes — un pré-ordre qui range chaque Structure avant ses
    // descendantes ; l'écran les joint donc par identifiant, et rien dans la forme
    // ne prétend le contraire. Le `Object.keys` est ce qui assure le reste : un
    // fait de plus dans la forme se verrait, et une cible de plus aussi.
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
    // Ce qui traverse la frontière client/serveur, ce sont des identifiants
    // (ADR-0028) : aucune fonction, aucun getter, aucune instance. Une forme plus
    // grande qu'une constante, pas différente.
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
  /**
   * Le cycle de la suite, avec une branche saine à côté :
   *
   *     racine ─── enfant-a ─── petit-a
   *     isolee
   *     amont ──┐
   *             ├─ boucle-a ⇄ boucle-b
   *             ┘
   *
   * Les trois maillons sont les ancêtres les uns des autres, donc les descen
   * dantes les uns des autres : c'est la forme la plus dure pour la partition, et
   * celle où une liste de cibles qui refuse au lieu de rendre se verrait tout de
   * suite.
   */
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

    // **La divergence d'ADR-0030, en deux listes.** Le maillon de la boucle est
    // proposé comme destination d'un Produit et retiré de celle d'une
    // sous-catégorie : ce n'est pas un refus, c'est le fait qu'un tel
    // raccordement refermerait la boucle. La boîte **propose**, le serveur seul
    // **refuse** — et `assertAcyclicCategoryTree` reste le seul à lever
    // `CategoryAncestorCycleError`. Une liste qui aurait retiré le maillon des
    // deux côtés aurait fait dire la même chose aux deux surfaces, et c'est
    // précisément ce que la décision exclut (US 17).
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

    // La corruption ne change rien aux listes : `horsArbre` est un fait de
    // **place** dans l'arbre, pas de nature — « présente en base, absente de toute
    // branche » (glossaire). Une ligne hors arbre se supprime donc comme les
    // autres, et sa boîte propose comme les autres ; c'est le serveur, seul, qui
    // refusera une cible qui referait la boucle.
    //
    // Et l'amont est la forme qui rend le fait lisible : il **n'a aucune
    // descendante**, donc sa branche est lui seul, et les deux listes valent
    // « tout sauf lui ». Une liste qui refuserait de se remplir sur une Structure
    // hors arbre ferait disparaître de l'Administration la rangée qu'un éditeur
    // vient réparer (ADR-0030).
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

/* ======================================================================== *
 * Le sélecteur de Structure d'un formulaire (#568)                         *
 * ======================================================================== *
 *
 * La troisième forme que la Lecture rend, et la plus étroite : un **sélecteur**
 * affiche deux choses — le nom choisi, et l'identifiant que la soumission
 * renverra. C'est tout ce qu'il sait, donc tout ce qu'il a le droit de recevoir.
 *
 * Cette projection est ici pour une raison d'interface, autant que de matière :
 * la lecture étroite que les deux formulaires Produit employaient était l'une
 * des **six lectures** de la table `Category` que ce travail fait rejoindre le
 * module, et elle était la seule des six à vivre dans un module qui ne savait
 * pas qu'il lisait une Structure (`lib/use-cases/admin-catalog.ts`). La garder
 * aurait récréé le second propriétaire que le déplacement supprime ; le prix de
 * l'échange se limite donc à deux agrégats et une jointure que ce sélecteur ne
 * regarde pas (ADR-0026, amendement).
 *
 * **Une projection n'est pas obliged d'être un sous-ensemble de sa voisine**, et
 * c'est même ce qu'on lui demande ici : la liste d'Administration rend des
 * compteurs et le nom de la parente, un sélecteur ne rend ni l'un ni l'autre.
 * Réutiliser `projeterEcranAdmin` aurait été la voie courte — la liste est déjà
 * faite, il n'y avait qu'à la réduire — et elle aurait fait payer au formulaire
 * des faits qu'il n'a pas demandés, sous une forme large dont la réduction
 * serait restée à la charge de chaque appelant. Une surface ne reçoit pas plus
 * qu'elle ne l'a demandé (US 32) : la forme étroite se dérive ici, une fois, et
 * l'appelant n'a rien à réduire.
 */
describe("projeterOptionsSelecteur — un sélecteur ne rend que ce qu'il affiche", () => {
  it("rend l'identifiant et le nom de chaque Structure, dans l'ordre promis", () => {
    const options = projeterOptionsSelecteur(ARBRE_SAIN)

    // L'ordre est celui que le module promet déjà — le nom en français, puis
    // l'identifiant — donc le même qu'à l'accueil et dans la liste
    // d'Administration. Le formulaire ne trie pas pour sa despece : six surfaces, une seule
    // promesse, et un éditeur qui voit le même ordre partout (US 31).
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

    // La forme étroite est l'**accord**, pas une intention : une projection qui
    // rendrait la ligne entière ferait payer au formulaire des compteurs, un nom
    // de parente, une profondeur et un lien — et le jour où le formulaire change
    // d'options, ces faits voyageaient encore. Le verrou de compilation
    // (`lib/admin-produit-frontiere.test.ts`) tient la même exigence par le
    // type ; ici elle est tenue par la valeur, donc par les faits. La liste de
    // l'Administration en rend dix : celle-ci en rend deux, et c'est le
    // message que porte chaque clé.
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

      // Un sélecteur **n'est pas une marche** : il ne classe rien, donc il n'a
      // aucun cycles à dégrader, et une Structure dont le lien ne mène nulle
      // part y a sa place comme les autres. La laisser de côté ferait
      // disparaître de l'Administration une rangée qu'un éditeur doit pouvoir
      // choisir pour la réparer — la boutique dégrade, le formulaire propose, et
      // le serveur seul refuse (ADR-0030).
      expect(options.map((option) => option.id)).toEqual([
        "boucle-a",
        "boucle-b",
        "racine",
      ])
      // Le cycle ne se signale donc pas ici, et c'est délibéré : la liste
      // d'Administration le nomme une fois pour toute la table, sur la surface
      // faite pour le rendre lisible. Un sélecteur qui en dirait un mot à chaque
      // enregistrement ajouterait une seconde ligne pour le même cycle, et
      // l'avertissement cesserait de dire combien de Structures toucher.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

/* ======================================================================== *
 * L'écran d'édition d'une Structure (#572)                                  *
 * ======================================================================== *
 *
 * La quatrième forme que la Lecture rend, et la première qui ne soit ni une liste
 * à regarder ni un simple choix de parente : ce qu'un **formulaire** affiche
 * pour une Structure — la Structure elle-même, les candidates qu'il propose, et
 * celles qu'il ne peut pas proposer. Les deux dernières n'en sont qu'une : le
 * formulaire reçoit des identifiants et **construit lui-même** le `Set` qui les
 * écarte (ADR-0028) ; la projection n'en rend donc aucun, et ne décide de rien.
 *
 * **C'est la même lecture et la même marche que tout le reste, et c'est le
 * point.** L'écran d'édition a deux questions à poser — « quelle Structure
 * j'édite » et « quelles parentes puis-je proposer » — et chacune prise seule
 * se paierait d'une lecture et d'une marche : deux lignes de journal pour un
 * seul cycle, et l'avertissement cesserait de dire combien de Structures
 * toucher. D'où une seule porte, qui répond à tout ce que l'écran rend
 * (ADR-0030).
 */
describe("projeterEcranEdition — sur un arbre sain", () => {
  it("rend la Structure éditée, ses candidates, et la primitive comme parentes exclues", () => {
    const ecran = projeterEcranEdition(ARBRE_SAIN, "enfant-a")!

    // La Structure éditée, dans la forme **étroite** que le formulaire rend :
    // ni compte de Produits, ni profondeur, ni nom de parente — le formulaire ne
    // les montre pas, donc les lire serait lui payer une preuve qu'il n'a pas
    // demandée. Le `toEqual` est ce qui l'asserte : un fait de plus se verrait.
    expect(ecran.structureEditee).toEqual({
      id: "enfant-a",
      name: "Enfant A",
      slug: "enfant-a",
      image: null,
      parentId: "racine",
    })

    // Les candidates : la table entière, l'identifiant et le nom — les deux seuls
    // faits d'une option de sélecteur — dans l'ordre que le module promet, et
    // **sans** la descendance en moins. C'est le formulaire qui soustrait sa
    // liste, donc une projection qui la soustrairait ici decidingait deux fois
    // la même règle, à deux endroits qu'aucune épreuve ne relierait.
    expect(ecran.candidates).toEqual([
      { id: "enfant-a", name: "Enfant A" },
      { id: "enfant-b", name: "Enfant B" },
      { id: "isolee", name: "Isolée" },
      { id: "petit-a", name: "Petit A" },
      { id: "racine", name: "Racine" },
    ])

    // Et les parentes exclues : **la primitive, telle qu'elle est** — la
    // Structure elle-même comprise. Ce « elle-même comprise » n'appartient pas à
    // l'écran, qui le disait jusqu'ici en l'ajoutant à la main ; il vient de la
    // marche, donc il ne peut pas s'oublier en chemin. Une projection qui le
    // retirerait rendrait l'écran capable de proposer de suspendre une Structure
    // sous elle-même, donc de refermer une boucle par un simple enregistrement.
    expect(ecran.parentesExclues).toEqual(["enfant-a", "petit-a"])
  })

  it("laisse la parente actuelle parmi les candidates, jamais parmi les exclues", () => {
    const ecran = projeterEcranEdition(ARBRE_SAIN, "enfant-a")!

    // Le fait que la spec énonce par une histoire d'éditeur (US 14) : renommer
    // une Structure ne doit pas obliger à lui choisir une nouvelle place. La
    // parente est un **ancêtre**, donc elle n'est pas dans la branche qu'on
    // exclut — et elle reste donc offerte. L'exclure « pour être sûr » est le
    // régression que ces deux attentes gardent.
    expect(ecran.structureEditee.parentId).toBe("racine")
    expect(ecran.parentesExclues).not.toContain("racine")
    expect(ecran.candidates).toContainEqual({ id: "racine", name: "Racine" })
  })

  it("rend une Structure que les faits ne portent pas comme un écran absent", () => {
    // Une lecture peut nommer une rangée que la table ne porte plus : une
    // suppression entre la lecture et le rendu. La Lecture **dégrade** — elle ne
    // lève pas, elle ne rend pas une Structure imaginaire (ADR-0030) — et c'est
    // l'écran qui décide alors ce qu'il en dit.
    expect(projeterEcranEdition(ARBRE_SAIN, "inconnue")).toBeNull()
    expect(projeterEcranEdition([], "inconnue")).toBeNull()
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterEcranEdition(ARBRE_SAIN, "enfant-a")

      // Une ligne sur un arbre sain serait une alerte qu'un éditeur prendrait
      // pour une corruption, et il chercherait une faute qui n'existe pas.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterEcranEdition — sur une Structure déjà cyclique", () => {
  /**
   * Un cycle, et une branche qui y mène, à côté d'une Structure saine :
   *
   *     racine
   *     amont ──┐
   *             ├─ boucle-a ⇄ boucle-b
   *     ┘
   *
   * La forme exacte de l'écran d '#546' : c'est elle qu'un éditeur doit pouvoir
   * ouvrir pour réparer la donnée, donc elle doit se rendre — et le dire une
   * fois.
   */
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

      // L'écran entier est là : la Structure éditée, la boucle qu'on peut
      // réparer, et la Structure saine qu'on n'a pas à réécrire parce qu'une
      // corruption existe ailleurs.
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

      // Les parentes exclues sont la branche du cycle : ses deux maillons et la
      // branche accrochée, **chacun une fois**. La règle de terminaison de la
      // marche est ce qui borne la liste, et une exclusion qui se répéterait
      // proposerait deux fois la même.
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

      // **Une ligne, et c'est une preuve de structure, pas de contenu.** Les trois
      // faits de l'écran — la Structure, les candidates, la branche exclue —
      // sortent d'**une** marche : la retenue qui tait un cycle vit dans la
      // marche et meurt avec elle. Une projection qui bâti une seconde marche
      // pour l'une de ses trois réponses dirait le même cycle une seconde fois,
      // et cette épreuve tomberait. Une ligne de plus se lirait « deux cycles »,
      // alors qu'il n'y en a qu'un à réparer.
      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("[marche-structure]")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      // L'amont mène au cycle sans en être : la ligne nomme ce qu'il faut
      // réparer, et un `Amont` de plus la rendrait illisible.
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })
})

/* ======================================================================== *
 * La page de catégorie (#570)                                              *
 * ======================================================================== *
 *
 * La cinquième forme que la Lecture rend, et la première qu'on appelle par une
 * **adresse** plutôt que par un écran : la page de catégorie est jointe par son
 * slug, et la Structure qu'elle rend est un fait que le surensemble porte déjà.
 * Elle était donc la seule des surfaces à payer une rangée **de plus** pour se
 * reconnaître — un `findUnique({ where: { slug } })` — et c'est celle que le
 * déplacement supprime. C'est le seul gain visible de toute l'opération, et il
 * ne se voit pas dans la page : il se voit dans le nombre de requêtes
 * (#564).
 *
 * **Trois réponses, une seule marche, un seul journal.** La page rend la
 * Structure qu'elle a demandée, le fil qui y mène, les sous-catégories qu'elle
 * propose en puces, et l'ensemble d'identifiants qui décide de ses Produits. Les
 * deux dernières réponses sont deux traversées **de sens opposé** — la remontée
 * et la descente — et c'est ce qui décide qu'elles ne peuvent pas être deux
 * projections : chacune bâtirait sa propre marche, et une boucle déjà en base
 * serait dite deux fois dans une exécution qui n'a qu'une seule boucle à
 * réparer (ADR-0030).
 */
describe("projeterPageCategorie — sur un arbre sain", () => {
  /**
   * L'arbre que la page rend, avec des **slugs distincts des identifiants** —
   * c'est la première différence avec les fixtures des autres projections, et
   * elle est le sujet même de celle-ci : une page est appelée par son adresse,
   * donc c'est le slug qu'elle cherche, et la projection doit savoir le trouver
   * dans des faits indexés par identifiant.
   *
   *     racine ─── enfant-a ─── petit-a
   *     isolee ─┬─ zèbre
   *            └─ écran
   */
  const PAGE: FaitStructure[] = [
    {
      ...structure("c1", "Racine", null, 1),
      slug: "racine",
      image: "/racine.png",
    },
    { ...structure("c2", "Enfant A", "c1"), slug: "enfant-a" },
    { ...structure("c3", "Petit A", "c2", 2), slug: "petit-a" },
    { ...structure("c4", "Isolée", null, 4), slug: "isolee" },
    // Les deux derniers sont écrits dans l'ordre **inverse** de celui que le
    // module promet : la comparaison française lit « Écran » avant « Zèbre »,
    // et une collation qui range les octets ferait l'inverse.
    { ...structure("c5", "Zèbre", "c4"), slug: "zèbre" },
    { ...structure("c6", "Écran", "c4"), slug: "écran" },
  ]

  it("trouve la Structure par son slug et rend son fil, la racine d'abord", () => {
    const page = projeterPageCategorie(PAGE, "petit-a")!

    // La rangée est **trouvée**, pas lue : la projection prend le fait dans le
    // surensemble que la Lecture a déjà en mémoire. Une requête de plus, et la
    // page ferait de nouveau deux propriétaires d'un même fait — celui que le
    // déplacement vient de supprimer.
    expect(page.categorie).toEqual({
      id: "c3",
      name: "Petit A",
      slug: "petit-a",
      image: null,
    })

    // L'ordre est la promesse même du cœur : la racine ouvre le fil, la
    // Structure demandée le ferme. Un fil qui l'ouvrirait afficherait « Petit A
    // › Enfant A » — donc l'inverse de l'endroit où l'on est, et une adresse qui
    // remonte au lieu de descendre. C'est l'invariant que la page et le cœur se
    // partagent sans avoir à se le dire.
    expect(page.filAriane).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
      { name: "Petit A", slug: "petit-a" },
    ])
  })

  it("passe l'image à la rangée qu'il rend, et rien d'autre", () => {
    const page = projeterPageCategorie(PAGE, "racine")!

    // La forme rendue est **étroite** : quatre faits, ceux que la page lit. Une
    // projection qui rendrait la ligne entière ferait payer à la page un compte
    // de Produits, une profondeur et un nom de parente qu'elle n'affiche pas
    // (US 32) — et le `toEqual` est ce qui l'asserte : un fait de plus se verrait.
    expect(page.categorie).toEqual({
      id: "c1",
      name: "Racine",
      slug: "racine",
      image: "/racine.png",
    })
  })

  it("ne rend qu'elle-même quand la Structure est une racine", () => {
    const page = projeterPageCategorie(PAGE, "racine")!

    // Un fil d'une seule entrée n'est pas un fil tronqué : il dit que la page
    // est au sommet de l'arbre, et c'est la seule chose qu'il puisse dire.
    expect(page.filAriane).toEqual([{ name: "Racine", slug: "racine" }])
  })

  it("rend les sous-catégories directes dans l'ordre que le module promet", () => {
    const page = projeterPageCategorie(PAGE, "isolee")!

    // Les puces de la page sont ses enfants **directs**, et rien de plus : une
    // petite-fille y serait un lien vers une page qui affiche elle-même la même
    // puce, et la liste s'étofferait d'une entrée qui ne mène nulle part. Le
    // lien — et lui seul — décide de l'appartenance.
    expect(page.enfants.map((enfant) => enfant.name)).toEqual([
      "Écran",
      "Zèbre",
    ])
    // L'ordre est celui du module — le nom en français, départagé par
    // l'identifiant — et non celui dans lequel les faits ont été écrits : le
    // tableau ci-dessus porte « Zèbre » avant « Écran ».
  })

  it("donne au filtre des Produits la Structure et ses descendantes, chacune une fois", () => {
    const ids = projeterPageCategorie(PAGE, "racine")!.idsProduits

    // « Chacune une fois » est une garantie de la primitive, et elle doit
    // arriver **jusqu'à la requête** : la liste est un fait que la page reçoit,
    // pas une variable locale que la Marche effacerait en sortant. Un `in` qui
    // répéterait un identifiant rendrait le même ensemble — SQL teste
    // l'appartenance, pas la multiplicité — donc personne ne verrait le doublon
    // ici ; c'est la preuve sur les faits qui le tient.
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(["c1", "c2", "c3"])
    // La Structure **elle-même** comprise : ses propres Produits sont ceux de sa
    // page, et une liste de ses seules descendantes en laisserait la page vide.
    expect(ids).toContain("c1")
    // Et rien d'autre : une Structure voisine n'est pas une descendante, et une
    // liste qui ramènerait la table entière ferait de la page un catalogue.
    expect(ids).not.toContain("c4")
  })

  it("rend un slug que les faits ne portent pas comme une page absente", () => {
    // Un slug inconnu est l'absence d'une page, pas une page sans Structure :
    // la Lecture **dégrade** et rend une absence, et c'est la page qui en fait
    // un `notFound()` (ADR-0030). Lever ici, ou rendre une Structure imaginaire,
    // ferait porter à la projection une décision qui n'est pas la sienne.
    expect(projeterPageCategorie(PAGE, "categorie-inconnue")).toBeNull()
    expect(projeterPageCategorie([], "petit-a")).toBeNull()
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterPageCategorie(PAGE, "petit-a")

      // Une ligne sur un arbre sain serait une alerte qu'un éditeur prendrait
      // pour une corruption, et il chercherait une faute qui n'existe pas. Les
      // deux traversées de cette projection partagent une marche, donc le
      // journal n'a rien à dire ici.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterPageCategorie — sur une Structure déjà cyclique", () => {
  /**
   * Une boucle que deux amont mènent à, à côté d'une Structure saine :
   *
   *     racine
   *     amont-1 ──┐
   *               ├─ boucle-a ⇄ boucle-b
   *     amont-2 ──┘
   *
   * C'est la forme exacte du fichier de #546 : un cycle en base, atteint par
   * deux entrées, qu'aucune racine n'atteint. La page de catégorie doit le
   * rendre — elle rend ce qu'elle a sous la main — et le dire une fois.
   */
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

      // Le fil s'arrête sur la revisite et rend ses maillons une fois chacun, la
      // Structure demandée **en dernier** : l'invariant tient sur une chaîne
      // cyclique comme sur une autre, et un fil qui se répéterait mentirait sur
      // l'arborescence.
      expect(page.filAriane.map((maillon) => maillon.name)).toEqual([
        "Boucle B",
        "Boucle A",
      ])
      expect(new Set(page.filAriane.map((maillon) => maillon.slug)).size).toBe(
        page.filAriane.length
      )

      // Les sous-catégories ne sont pas filtrées : une Structure corrompue reste
      // une rangée, et la retirer des puces serait une seconde façon de
      // l'effacer de l'écran. La boutique dégrade, elle ne purge pas.
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

      // Quatre identifiants, **quatre** : la boucle est atteinte par deux chemins
      // et la règle de terminaison est ce qui l'en empêche. Une liste qui
      // compterait deux fois une Structure ferait entrer deux fois le même
      // Produit dans le compte que la page annonce sur son en-tête.
      expect(page.idsProduits).toHaveLength(4)
      expect(new Set(page.idsProduits).size).toBe(page.idsProduits.length)
      expect([...page.idsProduits].sort()).toEqual([
        "amont-1",
        "amont-2",
        "boucle-a",
        "boucle-b",
      ])
      // La Structure saine, elle, n'en fait pas partie : elle n'est pas une
      // descendante d'un maillon de la boucle.
      expect(page.idsProduits).not.toContain("racine")

      // **Une ligne, et c'est une preuve de structure.** Les deux traversées de
      // cette page sont de sens opposé et sortent de la même marche : une
      // projection qui en bâtirait une par réponse dirait le cycle deux fois, et
      // l'avertissement cesserait de dire combien de Structures toucher.
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

/* ======================================================================== *
 * La fiche Produit (#571)                                                 *
 * ======================================================================== *
 *
 * La sixième forme rendue, et la plus étroite de toutes : un **fil d'Ariane**.
 * Deux faits par maillon — le nom et le slug — et c'est tout ce qu'un lien de
 * navigation rend. La page de catégorie rend le même fil pour sa Structure
 * (#570) : la forme est donc **nommée une fois** (`MaillonAriane`), et le fil
 * d'Ariane reste une promesse unique du module plutôt que deux listes de
 * `{ name, slug }` qui divergeraient sans qu'aucune épreuve ne s'en aperçoive.
 *
 * **Ce que la fiche Produit ne demande pas, et ne doit donc pas payer.** Elle
 * ne demande ni les sous-catégories de sa Structure, ni sa descendance, ni son
 * image : ses « Produits liés » sont ceux de sa **seule** Structure, à elle
 * seule, et la page tire son fil de la remontée. Réutiliser la projection de la
 * page de catégorie aurait été la voie courte — elle rend déjà un fil — et elle
 * aurait fait payer à une fiche Produit deux listes qu'elle ne lit pas, pour un
 * module dont l'interface promet qu'une surface ne reçoit pas plus qu'elle n'a
 * demandé (US 32).
 *
 * **Ce qui change pour la page, et ce qui ne change pas.** Elle ne construit
 * plus sa marche : la lecture des liens et le `getCategoryChain` de `storefront`
 * disparaissent, donc la boutique n'atteint plus la table `Category` hors du
 * module. Ce qui ne change pas est le contrat de la marche elle-même : la
 * Structure du Produit **en dernier**, chaque maillon **une fois**, et un cycle
 * dégradé et nommé. Ces trois promesses étaient déjà celles d'`ancetres` ; la
 * page les obtient désormais de la même source, et l'ordre du fil qu'elle rend
 * ne bouge pas d'un caractère (US 3).
 */
describe("projeterFilAriane — sur un arbre sain", () => {
  // `ARBRE_SAIN`, l'arbre ordinaire de la suite — une remontée n'a rien du
  // parcours d'arbre à prouver, elle n'a qu'à remonter :
  //
  //     racine ─── enfant-a ─── petit-a
  //     isolee
  it("remonte de la racine à la Structure du Produit, qui ferme le fil", () => {
    const fil = projeterFilAriane(ARBRE_SAIN, "petit-a")

    // L'ordre est **la** promesse du cœur : la racine ouvre, la Structure
    // demandée ferme. Une fiche qui l'ouvrirait afficherait « Petit A › Enfant A »
    // — donc l'inverse du chemin qu'on vient d'emprunter.
    expect(fil).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
      { name: "Petit A", slug: "petit-a" },
    ])
  })

  it("ne rend qu'elle-même quand la Structure du Produit est une racine", () => {
    // Un fil d'une seule entrée n'est pas un fil tronqué : il dit que la fiche
    // est au sommet de l'arbre, et c'est la seule chose qu'il puisse dire.
    expect(projeterFilAriane(ARBRE_SAIN, "isolee")).toEqual([
      { name: "Isolée", slug: "isolee" },
    ])
  })

  it("ne rend que les deux faits d'un lien, jamais davantage", () => {
    // La forme rendue est **étroite** : deux faits, ceux qu'un lien de
    // navigation rend. Le `toEqual` est ce qui l'asserte — un fait de plus
    // porterait à une fiche Produit un compte de Produits, une profondeur ou un
    // nom de parente qu'elle n'affiche pas (US 32).
    expect(projeterFilAriane(ARBRE_SAIN, "enfant-a")).toEqual([
      { name: "Racine", slug: "racine" },
      { name: "Enfant A", slug: "enfant-a" },
    ])
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      projeterFilAriane(ARBRE_SAIN, "petit-a")

      // Une ligne sur un arbre sain serait une alerte qu'un éditeur prendrait
      // pour une corruption, et il chercherait une faute qui n'existe pas. Le fil
      // ne fait qu'une remontée, et la retenue qui tait un cycle n'a rien à
      // retenir ici.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterFilAriane — sur une Structure déjà cyclique", () => {
  /**
   * Un cycle qu'un amont mène à, à côté d'une Structure saine :
   *
   *     racine
   *     amont ──┐
   *             ├─ boucle-a ⇄ boucle-b
   *     ┘
   *
   * La fiche Produit ne rend pas le fil de la Structure du cycle : elle rend le
   * fil de **la Structure de son Produit**, et cette Structure peut être n'importe
   * laquelle de la table — un maillon de la boucle, l'amont qui y mène, ou une
   * rangée saine. Les deux premiers cas sont donc prouvés séparément : ils ne
   * racontent pas la même chose sur l'ordre.
   */
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

      // Le cas le plus piégeux : la Structure du Produit est **elle-même un
      // maillon du cycle**. La remontée s'arrête sur la revisite et rend ce
      // qu'elle a remonté — la Structure du Produit **en dernier**, l'invariant
      // du fil d'Ariane tenant sur une chaîne cyclique comme sur une autre. Un
      // fil qui l'ouvrirait afficherait « Boucle A › Boucle B », donc l'inverse
      // du chemin emprunté.
      expect(fil).toEqual([
        { name: "Boucle B", slug: "boucle-b" },
        { name: "Boucle A", slug: "boucle-a" },
      ])

      // Chaque maillon une fois : c'est la règle de terminaison de la Marche qui
      // l'assure, et une fiche dont le fil se répéterait mentirait sur
      // l'arborescence enossilant un lien deux fois.
      expect(new Set(fil.map((maillon) => maillon.slug)).size).toBe(fil.length)
    } finally {
      warn.mockRestore()
    }
  })

  it("dégrade le cycle quand le Produit est en amont de lui, et ferme le fil sur lui", () => {
    const fil = projeterFilAriane(AVEC_CYCLE, "amont")

    // Le second cas : la Structure du Produit est **au-dessus** de la boucle. Le
    // fil rend alors tout ce que la remontée a traversé — les deux maillons de la
    // boucle, puis l'amont — et **la Structure du Produit reste la dernière** :
    // c'est elle qui ferme, quoi qu'il y ait en dessous. Le cycle ne vide donc
    // pas le fil comme le ferait une Structure hors arbre : la boutique dégrade,
    // elle ne purge pas (ADR-0030).
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

      // **Une ligne, et c'est une preuve de structure.** Le fil est la seule
      // traversée de cette fiche : elle bâtit une marche, et la retenue qui tait
      // un cycle vit dans la marche, donc meurt avec elle. Une porte qui en
      // bâtirait une par réponse dirait la même boucle une seconde fois, et
      // l'avertissement cesserait de dire combien de Structures un éditeur doit
      // réparer — c'est la seule chose qu'il doit pouvoir y lire (ADR-0030, US 34).
      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("[marche-structure]")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
      // L'amont mène au cycle sans en être : la ligne nomme ce qu'il faut
      // réparer, et un `Amont` de plus la rendrait illisible.
      expect(ligne).not.toContain("Amont")
    } finally {
      warn.mockRestore()
    }
  })

  it("rend un fil vide pour une Structure que les faits ne portent pas", () => {
    // Une suppression entre la lecture du Produit et celle des Structures : la
    // rangée n'y est plus. La Lecture dégrade — elle rend une absence, elle ne
    // lève pas (ADR-0030) — et l'absence est celle d'un Produit sans Structure,
    // que la page déduit sans changer de code (ADR-0029). Un `!` aurait rendu la
    // fiche cassée pour une fenêtre de quelques millisecondes entre deux
    // requêtes ; un nom inventé aurait produit un lien vers une page morte.
    expect(projeterFilAriane(AVEC_CYCLE, "rangee-supprimee")).toEqual([])
  })
})
