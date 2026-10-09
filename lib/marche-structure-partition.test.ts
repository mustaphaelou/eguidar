import { describe, expect, it, vi } from "vitest"

import {
  complementDe,
  complementDepuis,
  descendanceDe,
  marcheStructure,
  type LiensStructure,
  type PartitionStructure,
  type StructureLue,
} from "@/lib/marche-structure"
import { eprouverLOrdreDuModule } from "@/test/ordre-structures-recette"

function structure(id: string, name: string, parentId: string | null) {
  return { id, name, parentId }
}

const ARBRE_SAIN: StructureLue[] = [
  structure("racine", "Racine", null),
  structure("enfant-a", "Enfant A", "racine"),
  structure("enfant-b", "Enfant B", "racine"),
  structure("petit-a", "Petit A", "enfant-a"),
  structure("alpha-petit", "Alpha Petit", "enfant-b"),
  structure("isolee", "Isolée", null),
]

const CYCLE: StructureLue[] = [
  structure("racine", "Racine", null),
  structure("enfant", "Enfant", "racine"),
  structure("amont-1", "Amont 1", "boucle-a"),
  structure("amont-2", "Amont 2", "boucle-a"),
  structure("boucle-a", "Boucle A", "boucle-b"),
  structure("boucle-b", "Boucle B", "boucle-a"),
]

function enEnsemble(ids: readonly string[]): Set<string> {
  return new Set(ids)
}

function faitsPretes(structures: readonly StructureLue[]): {
  liens: LiensStructure
  partitionDepuis: (id: string) => PartitionStructure
} {
  const liens: LiensStructure = {
    parentParId: new Map(structures.map((fait) => [fait.id, fait.parentId])),
    noms: new Map(structures.map((fait) => [fait.id, fait.name])),
  }
  const marche = marcheStructure(liens)
  return {
    liens,
    partitionDepuis: (id) => complementDepuis(marche, liens, id),
  }
}

eprouverLOrdreDuModule({
  nom: "descendanceDe — la primitive",
  projeter: (faits) => descendanceDe(faits, "racine"),
})

eprouverLOrdreDuModule({
  nom: "complementDe — les cibles",
  projeter: (faits) => complementDe(faits, "absente-des-faits").horsSoi,
})

function difference(a: readonly string[], b: readonly string[]): Set<string> {
  return new Set(a.filter((id) => !b.includes(id)))
}

function seCroisent(a: readonly string[], b: readonly string[]): boolean {
  return a.some((id) => b.includes(id))
}

describe("descendanceDe — la primitive", () => {
  it("rend la Structure d'abord, puis ses descendantes dans l'ordre du module", () => {
    const descendance = descendanceDe(ARBRE_SAIN, "racine")

    expect(descendance).toEqual([
      "racine",
      "alpha-petit",
      "enfant-a",
      "enfant-b",
      "petit-a",
    ])
  })

  it("rend une Structure sans descendante elle seule", () => {
    expect(descendanceDe(ARBRE_SAIN, "isolee")).toEqual(["isolee"])
    expect(descendanceDe(ARBRE_SAIN, "petit-a")).toEqual(["petit-a"])
  })

  it("rend une Structure absente des faits sans lever", () => {
    expect(descendanceDe(ARBRE_SAIN, "inconnue")).toEqual(["inconnue"])
    expect(descendanceDe([], "inconnue")).toEqual(["inconnue"])
  })

  it("ne rend jamais deux fois la même Structure", () => {
    const descendance = descendanceDe(ARBRE_SAIN, "racine")

    expect(new Set(descendance).size).toBe(descendance.length)
  })
})

describe("descendanceDe — sur une Structure déjà cyclique", () => {
  it("rend le cycle et ce qui y mène, chacun une fois", () => {
    const descendance = descendanceDe(CYCLE, "boucle-a")

    expect(descendance).toEqual(["boucle-a", "amont-1", "amont-2", "boucle-b"])
    expect(new Set(descendance).size).toBe(descendance.length)
  })

  it("rend le même ensemble par chacun des deux maillons du cycle", () => {
    expect(enEnsemble(descendanceDe(CYCLE, "boucle-b"))).toEqual(
      enEnsemble(descendanceDe(CYCLE, "boucle-a"))
    )
  })

  it("rend une Structure qu'aucune racine n'atteint, sans lever", () => {
    expect(descendanceDe(CYCLE, "amont-1")).toEqual(["amont-1"])
    expect(descendanceDe(CYCLE, "amont-2")).toEqual(["amont-2"])
  })

  it("journalise le cycle une fois, en nommant les Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      descendanceDe(CYCLE, "boucle-a")

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
    } finally {
      warn.mockRestore()
    }
  })
})

describe("descendanceDe — une longueur n'est jamais un refus", () => {
  const PROFONDEUR = 5_000

  function chaineSousUnCycle(): StructureLue[] {
    const chaine: StructureLue[] = [structure("racine", "Racine", "boucle-a")]
    for (let rang = 1; rang < PROFONDEUR; rang += 1) {
      chaine.push(
        structure(
          `c${rang}`,
          `Maillon ${rang}`,
          rang === 1 ? "racine" : `c${rang - 1}`
        )
      )
    }
    return [
      ...chaine,
      structure("boucle-a", "Boucle A", "boucle-b"),
      structure("boucle-b", "Boucle B", "boucle-a"),
    ]
  }

  it("descend une chaîne qui mène à un cycle, et s'arrête", () => {
    const debut = Date.now()
    const descendance = descendanceDe(chaineSousUnCycle(), "racine")
    const duree = Date.now() - debut

    expect(descendance).toHaveLength(PROFONDEUR)
    expect(descendance[0]).toBe("racine")
    expect(enEnsemble(descendance)).toContain(`c${PROFONDEUR - 1}`)
    expect(new Set(descendance).size).toBe(descendance.length)

    expect(duree).toBeLessThan(2_000)
  })

  it("descend depuis une Structure qu'aucune racine n'atteint, et s'arrête", () => {
    const debut = Date.now()
    const descendance = descendanceDe(chaineSousUnCycle(), "boucle-a")
    const duree = Date.now() - debut

    expect(descendance).toHaveLength(PROFONDEUR + 2)
    expect(descendance[0]).toBe("boucle-a")
    expect(enEnsemble(descendance)).toContain("boucle-b")
    expect(enEnsemble(descendance)).toContain(`c${PROFONDEUR - 1}`)
    expect(new Set(descendance).size).toBe(descendance.length)

    expect(duree).toBeLessThan(2_000)
  })
})

describe("complementDe — les deux listes de la boîte", () => {
  it("rend tout sauf la Structure, et tout sauf elle et sa descendance", () => {
    const partition = complementDe(ARBRE_SAIN, "enfant-a")

    expect(partition).toEqual({
      descendance: ["enfant-a", "petit-a"],
      horsSoi: ["alpha-petit", "enfant-b", "isolee", "petit-a", "racine"],
      horsDescendance: ["alpha-petit", "enfant-b", "isolee", "racine"],
    } satisfies PartitionStructure)
  })

  it("rend des cibles, jamais un choix déjà validé", () => {
    const partition = complementDe(CYCLE, "boucle-a")

    expect(partition.descendance).toContain("boucle-b")
    expect(partition.horsSoi).toContain("boucle-b")
    expect(partition.horsDescendance).not.toContain("boucle-b")
    expect(partition.horsDescendance).toContain("racine")
  })

  it("ne rend que des chaînes : rien d'appelable ne franchit la couture", () => {
    const partition = complementDe(ARBRE_SAIN, "enfant-a")
    for (const liste of [
      partition.descendance,
      partition.horsSoi,
      partition.horsDescendance,
    ]) {
      expect(liste.length).toBeGreaterThan(0)
      for (const valeur of liste) {
        expect(typeof valeur).toBe("string")
      }
    }
  })
})

describe("complementDe — les deux listes ne diffèrent que par la descendance", () => {
  it("diffère de la première exactement des descendantes, sur toute la fixture", () => {
    const tous = ARBRE_SAIN.map((fait) => fait.id)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = complementDe(
        ARBRE_SAIN,
        id
      )
      const attendues = descendance.filter((atteint) => atteint !== id)

      expect(difference(horsSoi, horsDescendance), id).toEqual(
        enEnsemble(attendues)
      )
      expect(difference(horsDescendance, horsSoi), id).toEqual(new Set())
      expect(horsSoi.length - horsDescendance.length, id).toBe(attendues.length)
    }
  })

  it("partage toute la table en deux, sans rien perdre ni répéter", () => {
    const tous = ARBRE_SAIN.map((fait) => fait.id)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = complementDe(
        ARBRE_SAIN,
        id
      )

      expect(seCroisent(descendance, horsDescendance), id).toBe(false)
      expect(new Set([...descendance, ...horsDescendance]), id).toEqual(
        enEnsemble(tous)
      )

      expect(horsSoi.includes(id), id).toBe(false)
      expect(new Set([...horsSoi, id]), id).toEqual(enEnsemble(tous))

      for (const liste of [descendance, horsSoi, horsDescendance]) {
        expect(new Set(liste).size, id).toBe(liste.length)
      }
    }
  })

  it("tient la même identité sur une table déjà cyclique", () => {
    const tous = CYCLE.map((fait) => fait.id)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = complementDe(CYCLE, id)
      const attendues = descendance.filter((atteint) => atteint !== id)

      expect(difference(horsSoi, horsDescendance), id).toEqual(
        enEnsemble(attendues)
      )
      expect(new Set([...descendance, ...horsSoi]), id).toEqual(
        enEnsemble(tous)
      )
    }
  })
})

describe("complementDepuis — la même partition, sur la marche que la surface a déjà", () => {
  it("rend ce que complementDe rend, pour toute la fixture", () => {
    const { partitionDepuis } = faitsPretes(ARBRE_SAIN)

    for (const fait of ARBRE_SAIN) {
      expect(partitionDepuis(fait.id), fait.id).toEqual(
        complementDe(ARBRE_SAIN, fait.id)
      )
    }
  })

  it("journalise une seule fois pour toutes les Structures qu'on lui demande", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { partitionDepuis } = faitsPretes(CYCLE)
      for (const fait of CYCLE) partitionDepuis(fait.id)

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
    } finally {
      warn.mockRestore()
    }
  })

  it("dégrade comme la porte des rangées une Structure que les faits ne portent pas", () => {
    const surLesRangees = complementDe(ARBRE_SAIN, "inconnue")
    const surLesFaits = faitsPretes(ARBRE_SAIN).partitionDepuis("inconnue")

    expect(surLesFaits).toEqual(surLesRangees)
    expect(surLesFaits.descendance).toEqual(["inconnue"])

    const surVides = faitsPretes([]).partitionDepuis("inconnue")
    expect(surVides).toEqual({
      descendance: ["inconnue"],
      horsSoi: [],
      horsDescendance: [],
    })
  })
})
