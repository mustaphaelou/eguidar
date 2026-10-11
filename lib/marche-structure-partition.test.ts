import { describe, expect, it, vi } from "vitest"

import {
  complementDepuis,
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

function difference(a: readonly string[], b: readonly string[]): Set<string> {
  return new Set(a.filter((id) => !b.includes(id)))
}

function seCroisent(a: readonly string[], b: readonly string[]): boolean {
  return a.some((id) => b.includes(id))
}

/**
 * Les liens et la marche qu'une surface bâtit une fois, avant de demander la
 * partition de Structures à l'une après l'autre.
 */
function partitionDepuisLesLiens(
  faits: readonly StructureLue[]
): (id: string) => PartitionStructure {
  const liens: LiensStructure = {
    parentParId: new Map(faits.map((fait) => [fait.id, fait.parentId])),
    noms: new Map(faits.map((fait) => [fait.id, fait.name])),
  }
  const marche = marcheStructure(liens)
  return (id) => complementDepuis(marche, liens, id)
}

eprouverLOrdreDuModule({
  nom: "la partition — le complément d'une Structure",
  projeter: (faits) => partitionDepuisLesLiens(faits)("racine").horsSoi,
})

describe("la partition — les trois listes qui partagent toute la table", () => {
  it("rend la Structure et sa branche, tout sauf elle, et tout hors de sa branche", () => {
    const partition = partitionDepuisLesLiens(ARBRE_SAIN)("enfant-a")

    expect(partition).toEqual({
      descendance: ["enfant-a", "petit-a"],
      horsSoi: ["alpha-petit", "enfant-b", "isolee", "petit-a", "racine"],
      horsDescendance: ["alpha-petit", "enfant-b", "isolee", "racine"],
    } satisfies PartitionStructure)
  })

  it("rend des cibles, jamais un choix déjà validé", () => {
    const partition = partitionDepuisLesLiens(CYCLE)("boucle-a")

    expect(partition.descendance).toContain("boucle-b")
    expect(partition.horsSoi).toContain("boucle-b")
    expect(partition.horsDescendance).not.toContain("boucle-b")
    expect(partition.horsDescendance).toContain("racine")
  })

  it("ne rend que des chaînes : rien d'appelable ne franchit la couture", () => {
    const partition = partitionDepuisLesLiens(ARBRE_SAIN)("enfant-a")
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

describe("la partition — les deux listes du complément ne diffèrent que par la branche", () => {
  it("diffère de la première exactement des descendantes, sur toute la fixture", () => {
    const tous = ARBRE_SAIN.map((fait) => fait.id)
    const partition = partitionDepuisLesLiens(ARBRE_SAIN)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = partition(id)
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
    const partition = partitionDepuisLesLiens(ARBRE_SAIN)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = partition(id)

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
    const partition = partitionDepuisLesLiens(CYCLE)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = partition(id)
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

describe("complementDepuis — la partition d'une marche que l'appelant a déjà bâtie", () => {
  it("rend la même partition à qui la demande après toutes les autres", () => {
    const surLaMarchePartagee = partitionDepuisLesLiens(CYCLE)

    for (const fait of CYCLE) {
      const seule = partitionDepuisLesLiens(CYCLE)(fait.id)

      expect(seule, fait.id).toEqual(surLaMarchePartagee(fait.id))
    }
  })

  it("journalise un cycle une fois, pour toutes les Structures qu'on lui demande", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const partition = partitionDepuisLesLiens(CYCLE)
      for (const fait of CYCLE) partition(fait.id)

      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
    } finally {
      warn.mockRestore()
    }
  })

  it("dégrade en une branche à elle seule une Structure que les liens ne portent pas", () => {
    expect(partitionDepuisLesLiens(ARBRE_SAIN)("inconnue")).toEqual({
      descendance: ["inconnue"],
      horsSoi: [
        "alpha-petit",
        "enfant-a",
        "enfant-b",
        "isolee",
        "petit-a",
        "racine",
      ],
      horsDescendance: [
        "alpha-petit",
        "enfant-a",
        "enfant-b",
        "isolee",
        "petit-a",
        "racine",
      ],
    })

    expect(partitionDepuisLesLiens([])("inconnue")).toEqual({
      descendance: ["inconnue"],
      horsSoi: [],
      horsDescendance: [],
    })
  })
})
