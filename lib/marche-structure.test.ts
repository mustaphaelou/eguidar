import { describe, expect, it, vi } from "vitest"

import { marcheStructure, type LiensStructure } from "@/lib/marche-structure"

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
  parents: Record<string, string | null>,
  noms?: Record<string, string>
) {
  const liens: LiensStructure = {
    parents: new Map(Object.entries(parents)),
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
