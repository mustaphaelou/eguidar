import { describe, expect, it, vi } from "vitest"

import {
  projeterArbreAccueil,
  projeterLignesAdmin,
  projeterOptionsSelecteur,
  type FaitStructure,
  type NoeudAccueil,
} from "@/lib/use-cases/lecture-structure"

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
 * Trois projections s'y prouvent : l'arbre d'accueil, les lignes de
 * l'Administration, et le sélecteur d'un formulaire. Elles partagent les
 * fixtures parce qu'elles interrogent les **mêmes** faits, pas parce que la
 * preuve est la même — l'une rend une hiérarchie, l'autre une liste ordonnée qui
 * se lit à l'écran, la troisième une liste d'options qui ne rend que
 * l'identifiant et le nom. Chaque projection garde donc ses épreuves, et une
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
 * Les identifiants de l'arbre, tous, en montant et en descendant par une pile
 * explicite : une chaîne de plusieurs milliers de maillons est une forme
 * ordinaire ici, et une récursion de facture l'aurait fait tomber.
 */
function tousLesNoeuds(noeuds: readonly NoeudAccueil[]): NoeudAccueil[] {
  const tous: NoeudAccueil[] = []
  const pile = [...noeuds]
  while (pile.length > 0) {
    const noeud = pile.pop()!
    tous.push(noeud)
    for (const enfant of noeud.children) pile.push(enfant)
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

  it("départage les Structures de même nom par leur slug", () => {
    const arbre = projeterArbreAccueil([
      structure("jumeau-b", "Jumeau", null),
      structure("jumeau-a", "Jumeau", null),
    ])

    // Le nom seul ne promet pas un ordre — deux Structures peuvent porter le
    // même. Les slugs sont uniques, donc le départage est un fait et non un
    // tirage : c'est lui qui rend l'ordre total sur toutes les machines.
    expect(arbre.map((noeud) => noeud.id)).toEqual(["jumeau-a", "jumeau-b"])
  })

  it("nomme l'ordre avec la collation française, pas avec celle du serveur", () => {
    const arbre = projeterArbreAccueil([
      structure("zebre", "Zèbre", null),
      structure("ecran", "Écran", null),
    ])

    // « Écran » se lit avant « Zèbre » en français, et après sous une collation
    // qui range les octets. La promesse est celle que le dépôt écrit déjà en
    // deux endroits, et elle ne dépend d'aucun serveur de base.
    expect(arbre.map((noeud) => noeud.id)).toEqual(["ecran", "zebre"])
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
describe("projeterLignesAdmin — sur un arbre sain", () => {
  it("rend une ligne par Structure, dans l'ordre de la descente", () => {
    const lignes = projeterLignesAdmin(ARBRE_SAIN)

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
    const lignes = projeterLignesAdmin(ARBRE_SAIN)

    // La profondeur est un fait de la Structure, pas une mesure d'écran : la
    // profondeur d'un enfant est celle de sa parente plus un, et une racine est
    // à zéro. C'est l'écran qui en fait un retrait ; c'est ici qu'elle se compte.
    expect(lignes.map((ligne) => ligne.profondeur)).toEqual([0, 0, 1, 2, 1])
  })

  it("départage les Structures de même nom par leur slug", () => {
    const lignes = projeterLignesAdmin([
      structure("jumeau-b", "Jumeau", null),
      structure("jumeau-a", "Jumeau", null),
    ])

    // Le nom seul ne promet pas un ordre — deux Structures peuvent porter le
    // même. Les slugs sont uniques, donc le départage est un fait et non un
    // tirage : c'est lui qui rend l'ordre total sur toutes les machines.
    expect(lignes.map((ligne) => ligne.id)).toEqual(["jumeau-a", "jumeau-b"])
  })

  it("nomme l'ordre avec la collation française, pas avec celle du serveur", () => {
    const lignes = projeterLignesAdmin([
      structure("zebre", "Zèbre", null),
      structure("ecran", "Écran", null),
    ])

    // « Écran » se lit avant « Zèbre » en français, et après sous une collation
    // qui range les octets. La promesse est celle que le dépôt écrit déjà, et elle
    // ne dépend d'aucun serveur de base.
    expect(lignes.map((ligne) => ligne.id)).toEqual(["ecran", "zebre"])
  })

  it("donne à chaque ligne le lien qui la nomme et le nom de sa parente", () => {
    const lignes = projeterLignesAdmin(ARBRE_SAIN)
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
    const lignes = projeterLignesAdmin(ARBRE_SAIN)
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
      projeterLignesAdmin(ARBRE_SAIN)

      // Une ligne sur un arbre sain serait une alerte qu'un éditeur prendrait
      // pour une corruption, et il chercherait une faute qui n'existe pas.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("projeterLignesAdmin — sur une Structure déjà cyclique", () => {
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
    const lignes = projeterLignesAdmin(AVEC_CYCLE)

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
      projeterLignesAdmin(AVEC_CYCLE)

      // **Une ligne, pas une par Structure avalée** : trois Structures hors arbre
      // ici, et le journal n'en dit qu'une. C'est la même marche qui sert à
      // fonder le sous-ensemble hors arbre et à la nommer, donc la retenue qui
      // empêche la seconde ligne est celle de la marche — et elle meurt avec elle,
      // donc avec la lecture. Une projection qui bâtirait une seconde marche
      // dirait le même cycle deux fois, et l'avertissement cesserait de dire
      // combien de Structures toucher.
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

  it("classe parmi les hors arbre une Structure dont la parente n'est pas dans les faits", () => {
    const lignes = projeterLignesAdmin([
      structure("racine", "Racine", null, 1),
      structure("orpheline", "Orpheline", "absente-des-faits"),
    ])

    // Une `parentId` que rien ne nomme est impossible côté base — la clé étrangère
    // la garantit — mais pas sur la porte pure. La liste **dégrade** alors comme
    // la boutique : elle ne perd pas la rangée. Le bâtisseur d'arbre que l'écran
    // portait la perdait, et cette ligne manquante n'aurait été visible d'aucune
    // épreuve.
    expect(lignes.map((ligne) => [ligne.id, ligne.horsArbre])).toEqual([
      ["racine", false],
      ["orpheline", true],
    ])
    // Et aucun nom de parente n'est inventé pour elle : le lien reste, le nom
    // reste absent, et c'est l'écran qui décide comment l'annoncer.
    expect(lignes[1]).toMatchObject({
      parentId: "absente-des-faits",
      nomParente: null,
      profondeur: 0,
    })
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
 * Réutiliser `projeterLignesAdmin` aurait été la voie courte — la liste est déjà
 * faite, il n'y avait qu'à la réduire — et elle aurait fait payer au formulaire
 * des faits qu'il n'a pas demandés, sous une forme large dont la réduction
 * serait restée à la charge de chaque appelant. Une surface ne reçoit pas plus
 * qu'elle ne l'a demandé (US 32) : la forme étroite se dérive ici, une fois, et
 * l'appelant n'a rien à réduire.
 */
describe("projeterOptionsSelecteur — un sélecteur ne rend que ce qu'il affiche", () => {
  it("rend l'identifiant et le nom de chaque Structure, dans l'ordre promis", () => {
    const options = projeterOptionsSelecteur(ARBRE_SAIN)

    // L'ordre est celui que le module promet déjà — le nom en français, puis le
    // slug — donc le même qu'à l'accueil et dans la liste d'Administration. Le
    // formulaire ne trie pas pour sa despece : trois surfaces, une seule
    // promesse, et un éditeur qui voit le même ordre partout (US 31).
    expect(options).toEqual([
      { id: "enfant-a", name: "Enfant A" },
      { id: "enfant-b", name: "Enfant B" },
      { id: "isolee", name: "Isolée" },
      { id: "petit-a", name: "Petit A" },
      { id: "racine", name: "Racine" },
    ])
  })

  it("départage les Structures de même nom par leur slug", () => {
    const options = projeterOptionsSelecteur([
      structure("jumeau-b", "Jumeau", null),
      structure("jumeau-a", "Jumeau", null),
    ])

    // Le départage ne se voit pas dans la forme rendue — deux options portant le
    // même nom se ressemblent — mais il décide laquelle vient d'abord, donc
    // l'ordre reste total sur toutes les machines. L'épingler ici dit que le
    // sélecteur tient la même promesse que les deux autres projections, et non
    // qu'il se sort un ordre de lui-même.
    expect(options.map((option) => option.id)).toEqual(["jumeau-a", "jumeau-b"])
  })

  it("nomme l'ordre avec la collation française, pas avec celle du serveur", () => {
    const options = projeterOptionsSelecteur([
      structure("zebre", "Zèbre", null),
      structure("ecran", "Écran", null),
    ])

    // « Écran » se lit avant « Zèbre » en français, et après sous une collation
    // qui range les octets — l'ordre que la collation d'un serveur de base peut
    // donner, et que le module refuse de promettre à la place de la sienne.
    expect(options.map((option) => option.id)).toEqual(["ecran", "zebre"])
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
