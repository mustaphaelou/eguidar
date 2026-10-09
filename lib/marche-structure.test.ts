import { describe, expect, it, vi } from "vitest"

import {
  marcheDesStructures,
  marcheStructure,
  type LiensStructure,
  type StructureLue,
} from "@/lib/marche-structure"

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

    expect(new Set(parRangees.ancetres("a"))).toEqual(
      new Set(parCartes.ancetres("a"))
    )
    expect(new Set(parRangees.descendance("a"))).toEqual(
      new Set(parCartes.descendance("a"))
    )
    expect(new Set(parRangees.horsArbre())).toEqual(
      new Set(parCartes.horsArbre())
    )
    expect(parRangees.horsArbre()).toHaveLength(5)
  })

  it("nomme le journal par les noms des rangées", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      marcheDesStructures(RANGEES).ancetres("a")

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

    const boucleCourte = marcheDe({ seule: "seule" })
    expect(boucleCourte.ancetres("seule")).toEqual(["seule"])
    expect(boucleCourte.descendance("seule")).toEqual(["seule"])

    expect(marche.descendance("accrochee")).toEqual(["accrochee"])
  })

  it("nomme les Structures hors arbre : le cycle, et ce qui y mène", () => {
    const marche = marcheDe({
      ...CYCLE,
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
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]!.join(" ")).toContain("20000 Structures")
      expect(duree).toBeLessThan(2_000)
    } finally {
      warn.mockRestore()
    }
  })
})

describe("marcheStructure — l'index inverse est un fait de la marche (#584)", () => {
  const FRATRIE = 4

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

  function coutureQuiCompte(parents: Record<string, string | null>): {
    liens: LiensStructure
    lectures: () => number
  } {
    const reels = new Map(Object.entries(parents))
    let lectures = 0

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

    expect(lectures()).toBeGreaterThan(0)
    expect(lectures()).toBe(1)

    expect(marche.horsArbre()).toEqual([])
    expect(lectures()).toBe(1)

    for (const id of Object.keys(parents)) {
      marche.descendance(id)
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
    const { liens, lectures } = coutureQuiCompte(arbreSain(2))
    const marche = marcheStructure(liens)
    const apresConstruction = lectures()

    marche.ancetres("s3")
    marche.horsArbre()
    expect(lectures()).toBe(apresConstruction)

    expect([...liens.parentParId]).toHaveLength(5)
    expect(lectures()).toBe(apresConstruction + 1)
  })
})
