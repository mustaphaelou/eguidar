import { describe, expect, it, vi } from "vitest"

import {
  marcheDesStructures,
  marcheStructure,
  type LiensStructure,
  type StructureLue,
} from "@/lib/marche-structure"

/**
 * La Marche de la Structure : la traversée d'une Structure par `parentId`,
 * qui s'arrête sur toute revisite et rend ce qu'elle a parcouru (ADR-0030).
 *
 * Cette suite est la première du dépôt qui éprouve un cycle **sans base de
 * données** : la marche est synchrone, pure et ne lit rien, donc elle se laisse
 * exercer là où tournent tous les autres checks. C'est l'intérêt de la couture,
 * et c'est pourquoi elle est ici plutôt que dans une suite de lecture.
 *
 * Ce qu'elle épingle est la **terminaison et l'identité**, jamais la forme : un
 * parcours est un ensemble de faits — ce qui a été atteint, et une seule fois —
 * et non un ordre dont un remaniement ferait un échec. Les seules attentes de
 * forme sont celles qui portent un invariant du fil d'Ariane ou de la
 * descendance, et elles sont nommées comme telles.
 */

/** Une marche construite sur des liens donnés, sans nom : le cas minimal. */
function marcheDe(
  parentParId: Record<string, string | null>,
  noms?: Record<string, string>
) {
  const liens: LiensStructure = {
    parentParId: new Map(Object.entries(parentParId)),
  }
  if (noms) liens.noms = new Map(Object.entries(noms))
  return marcheStructure(liens)
}

/**
 * Un arbre sain, celui que la plupart des épreuves prennent pour point de
 * départ — la forme ordinaire, à côté de laquelle le cycle se lit.
 *
 *     racine ─┬─ enfant-a ─── petit-a
 *             └─ enfant-b
 *     isolee
 */
const ARBRE_SAIN = {
  racine: null,
  "enfant-a": "racine",
  "enfant-b": "racine",
  "petit-a": "enfant-a",
  isolee: null,
} as const

describe("marcheStructure — sur un arbre sain", () => {
  it("remonte la chaîne d'ancêtres, la Structure courante en dernier", () => {
    const marche = marcheDe(ARBRE_SAIN)

    // L'invariant du fil d'Ariane : la Structure courante est la dernière
    // entrée, et ses ancêtres la précèdent dans l'ordre de la remontée.
    expect(marche.ancetres("petit-a")).toEqual([
      "racine",
      "enfant-a",
      "petit-a",
    ])
    expect(marche.ancetres("racine")).toEqual(["racine"])
  })

  it("descend la Structure et toutes ses descendantes, chacune une fois", () => {
    const marche = marcheDe(ARBRE_SAIN)

    expect(new Set(marche.descendance("racine"))).toEqual(
      new Set(["racine", "enfant-a", "enfant-b", "petit-a"])
    )
    expect(marche.descendance("racine")).toHaveLength(4)
    expect(marche.descendance("petit-a")).toEqual(["petit-a"])
  })

  it("ne connaît pas une Structure absente des liens", () => {
    const marche = marcheDe(ARBRE_SAIN)

    // Une lecture peut demander une Structure que sa carte ne porte pas — un
    // filtre en amont, une rangée supprimée entre deux requêtes. La marche
    // rend alors la seule Structure qu'elle connaisse : celle qu'on lui nomme.
    expect(marche.ancetres("inconnue")).toEqual(["inconnue"])
    expect(marche.descendance("inconnue")).toEqual(["inconnue"])
  })

  it("ne journalise rien : le journal garde son sens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const marche = marcheDe(ARBRE_SAIN, { racine: "Racine" })
      marche.ancetres("petit-a")
      marche.descendance("racine")
      marche.horsArbre()

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it("ne connaît aucune Structure hors arbre", () => {
    expect(marcheDe(ARBRE_SAIN).horsArbre()).toEqual([])
  })
})

describe("marcheDesStructures — la marche d'une lecture", () => {
  /**
   * Le cycle de la suite, écrit comme une lecture le rend : une rangée par
   * Structure, avec son nom et sa parente. C'est la forme que les surfaces ont
   * en main — deux écrans d'administration, l'arbre d'accueil, la page de
   * catégorie et la boîte de suppression — et celle que la marche doit
   * consommer sans qu'aucune ne rebâtisse les deux cartes à la main (ADR-0022).
   */
  const RANGEES: StructureLue[] = [
    { id: "a", name: "Boucle A", parentId: "b" },
    { id: "b", name: "Boucle B", parentId: "c" },
    { id: "c", name: "Boucle C", parentId: "a" },
    { id: "accrochee", name: "Accrochée", parentId: "a" },
    { id: "amont", name: "Amont", parentId: "a" },
  ]

  it("rend les mêmes faits que la forme en cartes", () => {
    const parRangees = marcheDesStructures(RANGEES)
    const parCartes = marcheDe(
      { a: "b", b: "c", c: "a", accrochee: "a", amont: "a" },
      { a: "Boucle A", b: "Boucle B", c: "Boucle C" }
    )

    // Les mêmes faits, quelle que soit la forme d'entrée : la marche ne doit
    // pas dépendre de celle que l'appelant avait sous la main.
    expect(new Set(parRangees.ancetres("a"))).toEqual(
      new Set(parCartes.ancetres("a"))
    )
    expect(new Set(parRangees.descendance("a"))).toEqual(
      new Set(parCartes.descendance("a"))
    )
    expect(new Set(parRangees.horsArbre())).toEqual(
      new Set(parCartes.horsArbre())
    )
    // Cinq Structures, aucune racine : le cycle, sa descendante, et l'amont qui
    // y mène. La forme en rangées ne perd rien de ce que les cartes disaient.
    expect(parRangees.horsArbre()).toHaveLength(5)
  })

  it("nomme le journal par les noms des rangées", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      marcheDesStructures(RANGEES).ancetres("a")

      // Le journal lit le nom sur la rangée : une lecture qui a déjà le nom
      // n'a pas à le traduire en une seconde carte pour le rendre lisible.
      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      for (const nom of ["Boucle A", "Boucle B", "Boucle C"]) {
        expect(ligne).toContain(nom)
      }
    } finally {
      warn.mockRestore()
    }
  })
})

describe("marcheStructure — racines et enfants directs (#585)", () => {
  const LIENS = {
    ...ARBRE_SAIN,
    orpheline: "parente-absente",
    amont: "boucle-a",
    "boucle-a": "boucle-b",
    "boucle-b": "boucle-a",
  } as const

  it("rend les racines que les liens déclarent, dans l'ordre du module", () => {
    expect(marcheDe(LIENS).racines()).toEqual(["isolee", "racine"])

    const noms = { isolee: "Zèbre", racine: "Alpha" }
    expect(marcheDe(LIENS, noms).racines()).toEqual(["racine", "isolee"])
  })

  it("rend les enfants directs d'une Structure, dans l'ordre du module", () => {
    const noms = { "enfant-a": "Zèbre", "enfant-b": "Écran" }
    expect(marcheDe(LIENS, noms).enfantsDe("racine")).toEqual([
      "enfant-b",
      "enfant-a",
    ])
    expect(marcheDe(LIENS).enfantsDe("racine")).toEqual([
      "enfant-a",
      "enfant-b",
    ])

    expect(marcheDe(LIENS).enfantsDe("enfant-a")).toEqual(["petit-a"])
    expect(marcheDe(LIENS).enfantsDe("isolee")).toEqual([])
    expect(marcheDe(LIENS).enfantsDe("inconnue")).toEqual([])
  })

  it("ne fait pas racine d'une Structure dont la parente ne nomme aucune rangée", () => {
    const marche = marcheDe(LIENS)

    expect(marche.racines()).not.toContain("orpheline")
    expect(marche.horsArbre()).toContain("orpheline")
  })

  it("répond de toute la fratrie, branche corrompue comprise", () => {
    const marche = marcheDe(LIENS, { amont: "Amont", "boucle-b": "Boucle B" })

    expect(marche.enfantsDe("boucle-a")).toEqual(["amont", "boucle-b"])
  })

  it("n'accorde aucun enfant hors arbre à une Structure dans l'arbre", () => {
    const marche = marcheDe(LIENS)
    const horsArbre = new Set(marche.horsArbre())
    expect(horsArbre.size).toBeGreaterThan(0)

    for (const id of Object.keys(LIENS)) {
      if (horsArbre.has(id)) continue
      for (const enfant of marche.enfantsDe(id)) {
        expect(horsArbre.has(enfant), `${id} → ${enfant}`).toBe(false)
      }
    }
  })

  it("une descente partie des racines s'arrête d'elle-même, cycle compris", () => {
    const marche = marcheDe({
      racine: null,
      enfant: "racine",
      amont: "boucle-a",
      "boucle-a": "boucle-b",
      "boucle-b": "boucle-a",
    })
    const horsArbre = new Set(marche.horsArbre())

    const atteints: string[] = []
    const pile = [...marche.racines()]
    while (pile.length > 0) {
      const id = pile.pop()!
      atteints.push(id)
      for (const enfant of marche.enfantsDe(id)) pile.push(enfant)
    }

    expect(new Set(atteints).size).toBe(atteints.length)
    expect(atteints).toEqual(["racine", "enfant"])
    expect(horsArbre).toEqual(new Set(["amont", "boucle-a", "boucle-b"]))
  })

  it("rend une copie à chaque question : la réponse n'appartient qu'à elle", () => {
    const noms = {
      racine: "Racine",
      "enfant-a": "Enfant A",
      "enfant-b": "Enfant B",
      isolee: "Isolée",
    }
    const marche = marcheDe(LIENS, noms)
    expect(marche.racines()).toEqual(["isolee", "racine"])

    const racines = marche.racines()
    racines.reverse()
    racines.pop()
    expect(marche.racines()).toEqual(["isolee", "racine"])

    const enfants = marche.enfantsDe("racine")
    enfants.length = 0
    expect(marche.enfantsDe("racine")).toEqual(["enfant-a", "enfant-b"])
  })
})

describe("marcheStructure — sur un cycle", () => {
  /**
   * Un cycle de trois, plus une descendante accrochée à l'un des maillons :
   * la marche doit l'atteindre **au passage**, sans repasser par la boucle.
   *
   *     a → b → c → a
   *     a ─── accrochee
   */
  const CYCLE = {
    a: "b",
    b: "c",
    c: "a",
    accrochee: "a",
  } as const

  it("remonte les ancêtres et s'arrête : chaque Structure au plus une fois", () => {
    const marche = marcheDe(CYCLE)

    const chaine = marche.ancetres("a")
    expect(new Set(chaine).size).toBe(chaine.length)
    expect(new Set(chaine)).toEqual(new Set(["a", "b", "c"]))
    // La Structure courante reste la dernière : la marche s'arrête sur la
    // revisite de `a`, et n'ajoute donc pas une seconde fois celle par qui la
    // boucle se referme.
    expect(chaine.at(-1)).toBe("a")
  })

  it("descend les descendantes et s'arrête : chacune au plus une fois", () => {
    const marche = marcheDe(CYCLE)

    const descendance = marche.descendance("a")
    expect(new Set(descendance).size).toBe(descendance.length)
    expect(new Set(descendance)).toEqual(new Set(["a", "b", "c", "accrochee"]))
  })

  it("s'arrête depuis n'importe quel maillon du cycle", () => {
    const marche = marcheDe(CYCLE)

    // Aucun maillon n'est privilégié : entrer par `b` ou par `c` rend le même
    // ensemble, et chacune des trois entrées se termine.
    for (const depart of ["a", "b", "c"]) {
      const chaine = marche.ancetres(depart)
      const descendance = marche.descendance(depart)
      expect(new Set(chaine).size, depart).toBe(chaine.length)
      expect(new Set(descendance).size, depart).toBe(descendance.length)
      expect(chaine.at(-1), depart).toBe(depart)
    }
  })

  it("ne laisse aucune exception passer : toute revisite arrête la marche", () => {
    const marche = marcheDe(CYCLE)

    // Une Structure qui se nomme elle-même pour parente — le cycle le plus
    // court, et celui qu'une exception « tolérante » laisserait filer.
    const boucleCourte = marcheDe({ seule: "seule" })
    expect(boucleCourte.ancetres("seule")).toEqual(["seule"])
    expect(boucleCourte.descendance("seule")).toEqual(["seule"])

    // Une Structure accrochée à un cycle n'est pas dans le cycle : sa
    // descendance est la sienne, et elle ne remonte pas la boucle.
    expect(marche.descendance("accrochee")).toEqual(["accrochee"])
  })

  it("nomme les Structures hors arbre : le cycle, et ce qui y mène", () => {
    const marche = marcheDe({
      ...CYCLE,
      // Une chaîne saine qui mène dans le cycle : ses Structures ne sont pas
      // dans la boucle, mais aucune racine ne les atteint non plus.
      amont: "a",
      "amont-loin": "amont",
    })

    expect(new Set(marche.horsArbre())).toEqual(
      new Set(["a", "b", "c", "accrochee", "amont", "amont-loin"])
    )
  })

  it("journalise le cycle une fois, en nommant les Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const marche = marcheDe(CYCLE, {
        a: "Boucle A",
        b: "Boucle B",
        c: "Boucle C",
      })

      // Trois surfaces d'une même requête atteignent le même cycle : la
      // marche journalise **une** fois, pas une fois par surface (#544).
      marche.ancetres("a")
      marche.descendance("b")
      marche.horsArbre()

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      for (const nom of ["Boucle A", "Boucle B", "Boucle C"]) {
        expect(ligne).toContain(nom)
      }
    } finally {
      warn.mockRestore()
    }
  })

  it("journalise une fois par cycle, non une fois pour tous les cycles", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const marche = marcheDe({
        a: "b",
        b: "a",
        x: "y",
        y: "x",
      })

      marche.ancetres("a")
      marche.ancetres("x")

      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
    }
  })

  it("se passe de noms : le journal nomme alors les identifiants", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const marche = marcheDe({ a: "b", b: "a" })
      marche.ancetres("a")

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("a")
      expect(ligne).toContain("b")
    } finally {
      warn.mockRestore()
    }
  })
})

describe("marcheStructure — une longueur n'est jamais un refus", () => {
  it("traverse une chaîne profonde et acyclique entière", () => {
    // Aucune profondeur maximale n'est une règle de ce dépôt : le garde rejette
    // les revisites, pas la longueur (ADR-0027). La chaîne est construite
    // jusqu'à une taille qu'aucune borne implicite ne couvrirait par hasard.
    const PROFONDEUR = 5_000
    const parents: Record<string, string | null> = { s0: null }
    for (let i = 1; i < PROFONDEUR; i += 1) {
      parents[`s${i}`] = `s${i - 1}`
    }
    const marche = marcheDe(parents)

    const chaine = marche.ancetres(`s${PROFONDEUR - 1}`)
    expect(chaine).toHaveLength(PROFONDEUR)
    expect(chaine[0]).toBe("s0")
    expect(chaine.at(-1)).toBe(`s${PROFONDEUR - 1}`)

    const descendance = marche.descendance("s0")
    expect(descendance).toHaveLength(PROFONDEUR)
    expect(new Set(descendance).size).toBe(PROFONDEUR)
    expect(marche.horsArbre()).toEqual([])
  })

  it("descend une chaîne profonde par ses racines et ses enfants, et s'arrête", () => {
    const PROFONDEUR = 5_000
    const parents: Record<string, string | null> = { s0: null }
    for (let i = 1; i < PROFONDEUR; i += 1) {
      parents[`s${i}`] = `s${i - 1}`
    }
    parents[`s${PROFONDEUR - 1}`] = "boucle-a"
    parents["boucle-a"] = "boucle-b"
    parents["boucle-b"] = "boucle-a"

    const marche = marcheDe(parents)
    const atteints: string[] = []
    const pile = [...marche.racines()]
    while (pile.length > 0) {
      const id = pile.pop()!
      atteints.push(id)
      for (const enfant of marche.enfantsDe(id)) pile.push(enfant)
    }

    expect(atteints).toHaveLength(PROFONDEUR - 1)
    expect(new Set(atteints).size).toBe(PROFONDEUR - 1)
    expect(atteints).toContain(`s${PROFONDEUR - 2}`)
    expect(marche.horsArbre()).toEqual([
      `s${PROFONDEUR - 1}`,
      "boucle-a",
      "boucle-b",
    ])
  })

  it("ne remonte pas une longue chaîne corrompue une fois par Structure", () => {
    // La détection des Structures hors arbre est en une passe : une longue
    // chaîne qui mène dans un cycle est remontée une fois en tout, pas une fois
    // par Structure. Sans cela, le coût serait quadratique — et la marche est
    // appelée sur chaque lecture (#544, ADR-0030).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const PROFONDEUR = 20_000
      const parents: Record<string, string | null> = {}
      for (let i = 0; i < PROFONDEUR; i += 1) {
        parents[`c${i}`] = i === 0 ? `c${PROFONDEUR - 1}` : `c${i - 1}`
      }
      const marche = marcheDe(parents)

      const debut = Date.now()
      const horsArbre = marche.horsArbre()
      const duree = Date.now() - debut

      expect(horsArbre).toHaveLength(PROFONDEUR)
      // Un cycle de vingt mille maillons ne s'énumère pas : le journal le
      // résume, et la ligne reste une ligne.
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]!.join(" ")).toContain("20000 Structures")
      // Une borne large : elle ne mesure pas la performance, elle refuse le
      // quadratique — 400 millions de pas ne tiennent dans aucune borne.
      expect(duree).toBeLessThan(2_000)
    } finally {
      warn.mockRestore()
    }
  })
})

/**
 * **L'index inverse appartient à la marche, et non à chacune de ses méthodes
 * (#584).**
 *
 * Le module bâtit un index des liens — chaque parente et ses enfants, les
 * racines que les liens déclarent — pour descendre. Ce n'est qu'**un** fait, et
 * l'en-tête du module promet depuis le début que la marche est « construite une
 * fois par requête et interrogée autant de fois qu'un écran en a besoin ». Le
 * code disait le contraire : `descendance` et `horsArbre` bâtissaient chacune
 * leur index, et l'écran d'Administration — qui demande la partition de chaque
 * ligne — en bâtissait un par ligne, donc N+1 sur N lignes, à O(N) chacun.
 *
 * **Comment cette suite compte, sans regarder à l'intérieur.** Une preuve de
 * coût qui se contente de mesurer une durée ne dit pas *ce qui* a été refait, et
 * une preuve qui atteint une fonction privée n'éprouve plus rien dès que la
 * fonction change de nom. Le compte est donc pris **là où la construction est
 * visible** : `LiensStructure.parentParId` est une carte **que l'appelant
 * fournit**, et bâtir l'index, c'est énumérer ses paires. Un `Proxy` autour de
 * cette carte compte donc les lectures qui énumèrent — `Symbol.iterator`,
 * `entries`, `values`, `forEach` — et ignore les autres. C'est la seule couture
 * qui honore les deux exigences : la marche est observée par son interface,
 * aucune fonction privée n'est nommée, et l'observation est un **compte**, pas
 * une forme de structure interne.
 *
 * **`keys()` et `get()` ne comptent pas, et c'est ce qui rend le compte
 * parlant.** `horsArbre` parcourt légitimement `parentParId.keys()` pour
 * savoir quelles Structures existent, et la remontée fait légitimement `get()` :
 * aucune des deux ne bâtit l'index. Les compter ferait porter la preuve par un
 * fait qui n'est pas le sien — un décompte croissant qui pourrait être la
 * remontée elle-même. L'épreuve voisine s'assure que la couture voit bien une
 * énumération quand il y en a une.
 */
describe("marcheStructure — l'index inverse est un fait de la marche (#584)", () => {
  /**
   * La fratrie que la fixture donne à une Structure : quatre frères, donc
   * quatre enfants — et **aucun** pour une Structure du dernier niveau, que
   * rien n'engendre.
   */
  const FRATRIE = 4

  /**
   * Un arbre sain de `niveaux` **niveaux** — une racine, puis `FRATRIE`
   * descendants pour chaque Structure du niveau précédent, le dernier niveau
   * restant sans enfant. Deux niveaux font 5 Structures, cinq en font 341 :
   * l'ordre de grandeur où la différence se voit dans un écran, et non le
   * nombre d'une table de test.
   *
   * C'est la forme ordinaire de la **table des Structures** que liste
   * l'Administration, et cette liste interroge la marche une fois par ligne :
   * la fixture est là pour ressembler à cette question, pas pour être un arbre
   * quelconque.
   */
  function arbreSain(niveaux: number): Record<string, string | null> {
    const liens: Record<string, string | null> = { s0: null }
    let frontier = ["s0"]
    for (let niveau = 1, rang = 1; niveau < niveaux; niveau += 1) {
      const suivants: string[] = []
      for (const parente of frontier) {
        for (let f = 0; f < FRATRIE; f += 1) {
          liens[`s${rang}`] = parente
          suivants.push(`s${rang}`)
          rang += 1
        }
      }
      frontier = suivants
    }
    return liens
  }

  /**
   * La couture qui compte : les mêmes liens, plus le compte de leurs lectures
   * **en entier**.
   *
   * Le `Proxy` ne fait qu'une chose : il note les méthodes qui énumèrent les
   * paires et laisse passer les autres, `this` rattaché à la carte réelle pour
   * qu'aucune méthode native ne voie un `Proxy` au lieu d'une carte. Un compte,
   * pas une forme observée : la preuve ne tient à aucun contenu, donc elle tient
   * à toute réécriture du cœur.
   */
  function coutureQuiCompte(parents: Record<string, string | null>): {
    liens: LiensStructure
    lectures: () => number
  } {
    const reels = new Map(Object.entries(parents))
    let lectures = 0

    /** Une lecture qui énumère : elle se compte, puis elle se délègue. */
    const enumere =
      (propriete: PropertyKey) =>
      (...args: unknown[]) => {
        lectures += 1
        const methode = Reflect.get(reels, propriete) as (
          ...params: unknown[]
        ) => unknown
        return methode.apply(reels, args)
      }

    const parentParId: ReadonlyMap<string, string | null> = new Proxy(reels, {
      get(cible, propriete) {
        // Les quatre lectures qui **énumèrent les paires**, donc les seules qui
        // peuvent bâtir l'index. `keys()` et `get()` tombent plus bas : ils
        // cherchent un lien, ils ne listent pas la table.
        if (
          propriete === Symbol.iterator ||
          propriete === "entries" ||
          propriete === "values" ||
          propriete === "forEach"
        ) {
          return enumere(propriete)
        }
        const valeur = Reflect.get(cible, propriete)
        return typeof valeur === "function" ? valeur.bind(cible) : valeur
      },
    })

    return { liens: { parentParId }, lectures: () => lectures }
  }

  it("bâtit son index une fois, et une seule, quel que soit le nombre de questions", () => {
    const parents = arbreSain(5)
    const { liens, lectures } = coutureQuiCompte(parents)
    const marche = marcheStructure(liens)

    // Le compte est non nul dès la construction : c'est là que l'index se bâtit,
    // et non à la première question. Sans cette attente, `toBe(1)` passerait
    // aussi bien sur une couture qui ne compte rien du tout.
    expect(lectures()).toBeGreaterThan(0)
    expect(lectures()).toBe(1)

    // Le hors arbre — une fois, comme toute lecture — puis la descendance de
    // **chaque** Structure : c'est exactement ce que fait l'écran
    // d'Administration, ligne par ligne.
    expect(marche.horsArbre()).toEqual([])
    expect(lectures()).toBe(1)

    for (const id of Object.keys(parents)) {
      marche.descendance(id)
      // Une Structure interrogée de plus, et toujours le même index. Avant #584,
      // ce compte valait N+1 sur N lignes, et la liste d'Administration
      // bâtissait son index au carré du nombre de Structures.
      expect(lectures(), id).toBe(1)
    }
  })

  it("les deux questions de topologie lisent le même index (#585)", () => {
    const parents = arbreSain(5)
    const { liens, lectures } = coutureQuiCompte(parents)
    const marche = marcheStructure(liens)
    expect(lectures()).toBe(1)

    for (const id of Object.keys(parents)) {
      marche.racines()
      marche.enfantsDe(id)
      expect(lectures(), id).toBe(1)
    }
  })

  it("lit les liens autant de fois sur un petit arbre que sur un grand", () => {
    const petit = arbreSain(2)
    const grand = arbreSain(5)
    const liensDuPetit = coutureQuiCompte(petit)
    const liensDuGrand = coutureQuiCompte(grand)
    const marcheDuPetit = marcheStructure(liensDuPetit.liens)
    const marcheDuGrand = marcheStructure(liensDuGrand.liens)

    // Deux tables, soixante-huit fois plus de Structures de l'une à l'autre, le
    // même compte : ce qui est bâti une fois l'est **pour toutes**, et non par
    // ligne. Un compte croissant avec la taille de la table serait la preuve
    // qu'il reste un index bâti quelque part dans le parcours, à chaque
    // question posée.
    expect(Object.keys(petit)).toHaveLength(5)
    expect(Object.keys(grand)).toHaveLength(341)
    expect(liensDuPetit.lectures()).toBe(1)
    expect(liensDuGrand.lectures()).toBe(1)

    for (const id of Object.keys(grand)) marcheDuGrand.descendance(id)
    for (const id of Object.keys(petit)) marcheDuPetit.descendance(id)

    expect(liensDuPetit.lectures()).toBe(1)
    expect(liensDuGrand.lectures()).toBe(1)
  })

  it("ne compte que les lectures qui énumèrent, et il en voit une", () => {
    // Le témoin de la couture, sans lequel le compte ne prouverait rien : il
    // faut qu'il **voie** une énumération, et il faut qu'il ne confonde pas une
    // remontée avec un bâti. `horsArbre` parcourt `keys()`, `ancetres` fait des
    // `get()` — ni l'un ni l'autre ne bâtit d'index, donc le compte ne bouge
    // pas ; une énumération faite d'ici, si, parce que c'est celle d'un index.
    const { liens, lectures } = coutureQuiCompte(arbreSain(2))
    const marche = marcheStructure(liens)
    const apresConstruction = lectures()

    marche.ancetres("s3")
    marche.horsArbre()
    expect(lectures()).toBe(apresConstruction)

    // Et l'énumération, cette fois, est vue : le compte est vivant.
    expect([...liens.parentParId]).toHaveLength(5)
    expect(lectures()).toBe(apresConstruction + 1)
  })
})
