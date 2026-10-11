import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import {
  lectureDesStructures,
  lireStructure,
  type FaitStructure,
  type LectureStructure,
} from "@/lib/use-cases/lecture-structure"
import {
  sourceDuCorpus,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"
import { structure, tousLesNoeuds } from "@/test/lecture-structure-recette"
import {
  MODULE_LECTURE,
  NOMS_EMPRUNTES,
  NOMS_EXPORTES,
  QUESTIONS,
  SYMBOLES,
  exportsDuModule,
  importsEmpruntes,
  membresDeLaValeur,
} from "@/test/lecture-structure-outils"
import {
  creerArbrePropre,
  creerStructure,
  planterUnCycleEnBase,
  type StructureCreee,
} from "@/test/structure-fixtures"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
)

const SOURCE_DU_MODULE = sourceDuCorpus(SOURCES, MODULE_LECTURE).source

describe("Lecture de la Structure — la liste figée, comparée par égalité dans les deux sens", () => {
  it("la liste figée compte dix-huit entrées : cinq exports, neuf questions, quatre emprunts", () => {
    expect(SYMBOLES).toHaveLength(NOMS_EXPORTES.length + 9 + 4)
  })

  it("les exports sont ceux que la source déclare : ni un de plus, ni un de moins", () => {
    expect(exportsDuModule(SOURCE_DU_MODULE)).toEqual([...NOMS_EXPORTES].sort())
  })

  it("les emprunts sont les imports que la source déclare : ni un de plus, ni un de moins", () => {
    expect(importsEmpruntes(SOURCE_DU_MODULE)).toEqual(
      [...NOMS_EMPRUNTES].sort()
    )
  })

  it("les questions sont les membres que la valeur déclare : ni une de plus, ni une de moins", () => {
    expect(membresDeLaValeur(SOURCE_DU_MODULE)).toEqual([...QUESTIONS].sort())
  })

  it("l'égalité mord : un export de plus, une question de plus, ou un emprunt de moins, la font tomber", () => {
    const avecUnExport = SOURCE_DU_MODULE.replace(
      "function uneFois<T>",
      "export function uneFois<T>"
    )
    expect(avecUnExport).not.toBe(SOURCE_DU_MODULE)
    expect(exportsDuModule(avecUnExport)).not.toEqual([...NOMS_EXPORTES].sort())

    const avecUneDixieme = SOURCE_DU_MODULE.replace(
      "  branche(id: string): string[]",
      "  branche(id: string): string[]\n  dixieme(): string[]"
    )
    expect(avecUneDixieme).not.toBe(SOURCE_DU_MODULE)
    expect(membresDeLaValeur(avecUneDixieme)).not.toEqual([...QUESTIONS].sort())

    const sansEmprunt = SOURCE_DU_MODULE.replace("  comparerParNom,\n", "")
    expect(sansEmprunt).not.toBe(SOURCE_DU_MODULE)
    expect(importsEmpruntes(sansEmprunt)).not.toEqual(
      [...NOMS_EMPRUNTES].sort()
    )
  })
})

type RangéeLue = Awaited<ReturnType<typeof prisma.category.findMany>>

type RangeeStructure = Omit<FaitStructure, "produitsDirects"> & {
  _count: { products: number }
}

function rangeesDe(faits: readonly FaitStructure[]): RangeeStructure[] {
  return faits.map(({ produitsDirects, ...rangée }) => ({
    ...rangée,
    _count: { products: produitsDirects },
  }))
}

const CORROMPUES: FaitStructure[] = [
  structure("racine", "Racine", null, 3),
  structure("enfant-a", "Zèbre", "racine", 1, "/zebre.png"),
  structure("enfant-b", "Écran", "racine", 0),
  structure("enfant-c", "Écran", "racine", 2),
  structure("petit-a", "Petit A", "enfant-a", 7),
  structure("isolee", "Isolée", null, 0),
  structure("hors-arbre", "Hors arbre", "parente-absente", 5),
  structure("enfant-hors-arbre", "Enfant hors arbre", "hors-arbre", 1),
  structure("boucle-a", "Boucle A", "boucle-b", 2),
  structure("boucle-b", "Boucle B", "boucle-a", 4),
]

const RANGEES = rangeesDe(CORROMPUES)

const HORS_ARBRE = ["boucle-a", "boucle-b", "enfant-hors-arbre", "hors-arbre"]

interface Cibles {
  idEdition: string
  slugCategorie: string
  idFil: string
  idEnfants: string
  idBranche: string
}

interface Comparaison {
  nom: string
  repondre: (lecture: LectureStructure) => unknown
  comparable?: (issue: unknown) => unknown
}

type FabriqueDeComparaisons = (cibles: Cibles) => readonly Comparaison[]

const RENDU_TEL_QUEL = (issue: unknown): unknown => issue

function parIdentifiant(une: { id: string }, autre: { id: string }): number {
  return une.id < autre.id ? -1 : une.id > autre.id ? 1 : 0
}

const CIBLES_PAR_IDENTIFIANT = (issue: unknown): unknown => {
  const cibles = issue as { id: string }[]
  return [...cibles].sort(parIdentifiant)
}

const NEUF_QUESTIONS: FabriqueDeComparaisons = ({
  idEdition,
  slugCategorie,
  idFil,
  idEnfants,
  idBranche,
}) => [
  { nom: "l'arbre d'accueil", repondre: (l) => l.arbreAccueil() },
  { nom: "les lignes de l'Administration", repondre: (l) => l.lignesAdmin() },
  {
    nom: "les cibles de suppression",
    repondre: (l) => l.ciblesSuppression(),
    comparable: CIBLES_PAR_IDENTIFIANT,
  },
  { nom: "les options du sélecteur", repondre: (l) => l.options() },
  {
    nom: "la fiche d'une Structure par son identifiant",
    repondre: (l) => l.structure(idEdition),
  },
  {
    nom: "la fiche d'une Structure par son slug",
    repondre: (l) => l.structureParSlug(slugCategorie),
  },
  { nom: "le fil d'Ariane", repondre: (l) => l.filAriane(idFil) },
  { nom: "les enfants d'une Structure", repondre: (l) => l.enfants(idEnfants) },
  { nom: "la branche d'une Structure", repondre: (l) => l.branche(idBranche) },
]

const CIBLES_LITTALES: Cibles = {
  idEdition: "petit-a",
  slugCategorie: "racine",
  idFil: "boucle-a",
  idEnfants: "racine",
  idBranche: "racine",
}

async function surLaTable<T>(
  rendre: () => Promise<T>,
  rangees: readonly RangeeStructure[] = RANGEES
): Promise<T> {
  const table = vi
    .spyOn(prisma.category, "findMany")
    .mockResolvedValue(rangees as unknown as RangéeLue)
  try {
    return await enSilence(rendre)
  } finally {
    table.mockRestore()
  }
}

async function enSilence<T>(rendre: () => T | Promise<T>): Promise<T> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    return await rendre()
  } finally {
    warn.mockRestore()
  }
}

function exigerPlein(issue: unknown, porte: string): void {
  expect(JSON.stringify(issue), `${porte} — rend quelque chose`).not.toMatch(
    /^(null|\[\]|\{\})$/
  )
}

describe("Lecture de la Structure — la porte de lecture et la construction pure rendent la même chose", () => {
  it("le jeu de faits porte bien les deux corruptions : un cycle, et une parente qui ne nomme aucune rangée", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const lecture = lectureDesStructures(CORROMPUES)
      const lignes = lecture.lignesAdmin()
      const presents = tousLesNoeuds(lecture.arbreAccueil()).map(
        (noeud) => noeud.id
      )

      const rendues = lignes.map((ligne) => ligne.id)
      expect(new Set(rendues).size, "une ligne par Structure").toBe(
        CORROMPUES.length
      )
      expect(new Set(rendues)).toEqual(
        new Set(CORROMPUES.map((fait) => fait.id))
      )
      expect(
        new Set(
          lignes.filter((ligne) => ligne.horsArbre).map((ligne) => ligne.id)
        )
      ).toEqual(new Set(HORS_ARBRE))
      expect(new Set(presents)).toEqual(
        new Set(
          CORROMPUES.map((fait) => fait.id).filter(
            (id) => !HORS_ARBRE.includes(id)
          )
        )
      )

      expect(warn).toHaveBeenCalled()
      for (const ligne of warn.mock.calls.map((morceaux) =>
        morceaux.join(" ")
      )) {
        expect(ligne).toContain("Boucle A")
        expect(ligne).toContain("Boucle B")
      }
    } finally {
      warn.mockRestore()
    }
  })

  it("les neuf questions rendent la même sortie par la porte et par la construction", async () => {
    const lu = await surLaTable(lireStructure)

    for (const question of NEUF_QUESTIONS(CIBLES_LITTALES)) {
      const luQuestion = question.repondre(lu)
      const purQuestion = await enSilence(() =>
        question.repondre(lectureDesStructures(CORROMPUES))
      )

      exigerPlein(luQuestion, `${question.nom} — par la porte`)
      exigerPlein(purQuestion, `${question.nom} — par la construction`)
      const comparer = question.comparable ?? RENDU_TEL_QUEL
      expect(comparer(luQuestion), question.nom).toEqual(comparer(purQuestion))
    }
  })

  it("la comparaison mord : elle voit une divergence dès qu'il y en a une", async () => {
    const lu = await surLaTable(lireStructure)
    const pur = lectureDesStructures(CORROMPUES)

    expect(lu.lignesAdmin()).toHaveLength(CORROMPUES.length)
    expect(lu.ciblesSuppression()).toHaveLength(CORROMPUES.length)
    expect(lu.lignesAdmin()).toEqual(pur.lignesAdmin())
    expect(lu.ciblesSuppression()).toEqual(pur.ciblesSuppression())

    const amputee = await surLaTable(
      lireStructure,
      rangeesDe(CORROMPUES.filter((fait) => fait.id !== "boucle-b"))
    )
    expect(amputee.lignesAdmin()).not.toEqual(pur.lignesAdmin())
  })
})

const PREFIXE = `portes-${randomUUID().slice(0, 8)}-`

let base: FaitStructure[]
let horsArbreDeLaBase: string[]
let ciblesDeLaBase: Cibles
let idDeLaRacineImagee: string

function faitDe(
  plantee: StructureCreee,
  parentId: string | null = plantee.parentId
): FaitStructure {
  return {
    id: plantee.id,
    name: plantee.name,
    slug: plantee.slug,
    image: plantee.image,
    parentId,
    produitsDirects: 0,
  }
}

beforeAll(async () => {
  const arbre = await creerArbrePropre(
    {
      racine: { name: "Portes A", image: "/portes-a.png" },
      enfant: { name: "Portes B", parent: "racine" },
      petit: { name: "Portes C", parent: "enfant" },
      isolee: { name: "Portes D" },
    },
    PREFIXE
  )
  const boucle = [
    await creerStructure({ name: "Portes E", prefix: PREFIXE }),
    await creerStructure({ name: "Portes F", prefix: PREFIXE }),
    await creerStructure({ name: "Portes G", prefix: PREFIXE }),
  ]
  const accrocheeAuCycle = await creerStructure({
    name: "Portes H",
    parentId: boucle[0].id,
    prefix: PREFIXE,
  })
  await planterUnCycleEnBase(boucle.map((entree) => entree.id))

  base = [
    ...Object.values(arbre).map((entree) => faitDe(entree)),
    ...boucle.map((entree, rang) =>
      faitDe(entree, boucle[(rang + 1) % boucle.length].id)
    ),
    faitDe(accrocheeAuCycle),
  ]
  horsArbreDeLaBase = [
    ...boucle.map((entree) => entree.id),
    accrocheeAuCycle.id,
  ]
  ciblesDeLaBase = {
    idEdition: arbre.petit.id,
    slugCategorie: arbre.racine.slug,
    idFil: boucle[0].id,
    idEnfants: arbre.racine.id,
    idBranche: arbre.racine.id,
  }
  idDeLaRacineImagee = arbre.racine.id
})

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("Lecture de la Structure — la porte de lecture lit la table, et la construction pure rend les mêmes faits", () => {
  it("la table ne porte que les rangées plantées : la porte de lecture la lit entière", async () => {
    const dansLaTable = await prisma.category.findMany({ select: { id: true } })

    expect(
      new Set(dansLaTable.map((rangee) => rangee.id)),
      "une suite a laissé une rangée, et la porte de lecture la rendrait aussi"
    ).toEqual(new Set(base.map((fait) => fait.id)))
  })

  it("le jeu planté porte bien un cycle, que la marche dégrade et nomme une fois", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const lecture = await lireStructure()
      const lignes = lecture.lignesAdmin()
      const presents = tousLesNoeuds(lecture.arbreAccueil()).map(
        (noeud) => noeud.id
      )
      const journal = warn.mock.calls.map((morceaux) => morceaux.join(" "))

      expect(new Set(lignes.map((ligne) => ligne.id))).toEqual(
        new Set(base.map((fait) => fait.id))
      )
      expect(
        new Set(lignes.filter((ligne) => ligne.horsArbre).map((l) => l.id))
      ).toEqual(new Set(horsArbreDeLaBase))
      expect(new Set(presents)).toEqual(
        new Set(
          base
            .map((fait) => fait.id)
            .filter((id) => !horsArbreDeLaBase.includes(id))
        )
      )

      expect(
        lignes.find((ligne) => ligne.id === idDeLaRacineImagee)?.image
      ).toBe("/portes-a.png")

      expect(journal).toHaveLength(1)
      for (const ligne of journal) {
        for (const maillon of ["Portes E", "Portes F", "Portes G"]) {
          expect(ligne).toContain(maillon)
        }
      }
    } finally {
      warn.mockRestore()
    }
  })

  it("les neuf questions rendent la même sortie sur la vraie table", async () => {
    const lu = await enSilence(lireStructure)
    const pur = lectureDesStructures(base)

    for (const question of NEUF_QUESTIONS(ciblesDeLaBase)) {
      const luQuestion = question.repondre(lu)
      const purQuestion = await enSilence(() => question.repondre(pur))

      exigerPlein(luQuestion, `${question.nom} — par la porte`)
      exigerPlein(purQuestion, `${question.nom} — par la construction`)
      const comparer = question.comparable ?? RENDU_TEL_QUEL
      expect(comparer(luQuestion), question.nom).toEqual(comparer(purQuestion))
    }
  })

  it("la comparaison mord sur la vraie table : une rangée de plus la fait tomber", async () => {
    const pur = lectureDesStructures(base)
    const enPlus = await creerStructure({ name: "Portes I", prefix: PREFIXE })
    try {
      const lu = await enSilence(lireStructure)

      expect(lu.lignesAdmin().map((ligne) => ligne.id)).toContain(enPlus.id)
      expect(lu.lignesAdmin()).toHaveLength(base.length + 1)
      expect(CIBLES_PAR_IDENTIFIANT(lu.ciblesSuppression())).not.toEqual(
        CIBLES_PAR_IDENTIFIANT(pur.ciblesSuppression())
      )
    } finally {
      await prisma.category.delete({ where: { id: enPlus.id } })
    }
  })
})
