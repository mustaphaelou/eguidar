import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import {
  lireArbreAccueil,
  lireEcranAdmin,
  lireEcranEdition,
  lireFilAriane,
  lireOptionsSelecteur,
  lirePageCategorie,
  projeterArbreAccueil,
  projeterEcranAdmin,
  projeterEcranEdition,
  projeterFilAriane,
  projeterOptionsSelecteur,
  projeterPageCategorie,
  type CiblesSuppression,
  type EcranAdminStructure,
  type FaitStructure,
} from "@/lib/use-cases/lecture-structure"
import {
  avecSource,
  sourceDuCorpus,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"
import { structure, tousLesNoeuds } from "@/test/lecture-structure-recette"
import { MODULE_LECTURE, SYMBOLES } from "@/test/lecture-structure-outils"
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

const PORTE_DE_LECTURE = /export\s+async\s+function\s+(lire[A-Za-z0-9_$]*)/g

function portesEmpruntees(source: string, portes: readonly string[]): string[] {
  return [
    ...source.matchAll(
      /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']@\/lib\/use-cases\/lecture-structure["']/g
    ),
  ]
    .flatMap(([, typeOnly, noms]) =>
      typeOnly
        ? []
        : (noms ?? "").split(",").map((nom) => nom.split(/\s+as\s+/)[0]!.trim())
    )
    .filter((nom) => portes.includes(nom))
}

function estUnePage(chemin: string): boolean {
  return chemin.startsWith("app/") && /\/page\.tsx$/.test(chemin)
}

function ecransDeDeuxPortes(
  sources: readonly { chemin: string; source: string }[],
  portes: readonly string[]
): { chemin: string; portes: string[] }[] {
  return sources
    .filter(({ chemin }) => estUnePage(chemin))
    .flatMap(({ chemin, source }) => {
      const emprustees = portesEmpruntees(source, portes)
      return emprustees.length > 1 ? [{ chemin, portes: emprustees }] : []
    })
}

describe("Lecture de la Structure — une porte par écran", () => {
  const source = sourceDuCorpus(SOURCES, MODULE_LECTURE).source
  const portes = [...source.matchAll(PORTE_DE_LECTURE)].map(([, nom]) => nom!)

  it("le module déclare ses portes de lecture, et la garde sait les lire", () => {
    expect(portes.length).toBeGreaterThanOrEqual(6)
    expect(new Set(portes).size).toBe(portes.length)
    for (const symbole of SYMBOLES) {
      if (symbole.startsWith("lire")) expect(portes, symbole).toContain(symbole)
    }
  })

  it("aucune page du dépôt n'appelle deux portes de lecture", () => {
    const pages = SOURCES.filter(({ chemin }) => estUnePage(chemin))
    expect(pages.length).toBeGreaterThan(10)

    const appelantes = pages
      .map(({ chemin, source }) => ({
        chemin,
        portes: portesEmpruntees(source, portes),
      }))
      .filter(({ portes }) => portes.length > 0)
    expect(appelantes.length).toBeGreaterThan(0)
    expect(appelantes.map(({ chemin }) => chemin)).toContain(
      "app/admin/categories/page.tsx"
    )
    expect(appelantes.flatMap(({ portes }) => portes).sort()).toContain(
      "lireEcranAdmin"
    )

    expect(ecransDeDeuxPortes(SOURCES, portes)).toEqual([])
  })

  it("la garde tombe sur un écran qui appelle deux portes, écrit dans un vrai fichier", () => {
    const PAGE = "app/admin/categories/page.tsx"
    const reel = sourceDuCorpus(SOURCES, PAGE).source
    expect(portesEmpruntees(reel, portes)).toEqual(["lireEcranAdmin"])

    const enViolation = reel.replace(
      'import { lireEcranAdmin } from "@/lib/use-cases/lecture-structure"',
      'import {\n  lireEcranAdmin,\n  lireOptionsSelecteur,\n} from "@/lib/use-cases/lecture-structure"'
    )
    expect(enViolation).not.toBe(reel)
    expect(
      ecransDeDeuxPortes(avecSource(SOURCES, PAGE, enViolation), portes)
    ).toEqual([
      {
        chemin: PAGE,
        portes: ["lireEcranAdmin", "lireOptionsSelecteur"],
      },
    ])

    expect(ecransDeDeuxPortes(avecSource(SOURCES, PAGE, reel), portes)).toEqual(
      []
    )

    const enType = reel.replace(
      "import { lireEcranAdmin }",
      'import type { CiblesSuppression } from "@/lib/use-cases/lecture-structure"\nimport { lireEcranAdmin }'
    )
    expect(portesEmpruntees(enType, portes)).toEqual(["lireEcranAdmin"])
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
}

interface Porte {
  lire: () => Promise<unknown>
  projeter: (faits: readonly FaitStructure[]) => unknown
  comparable: (issue: unknown) => unknown
}

type FabriqueDePortes = (cibles: Cibles) => Porte

const RENDU_TEL_QUEL: Porte["comparable"] = (issue) => issue

function parIdentifiant(
  une: CiblesSuppression,
  autre: CiblesSuppression
): number {
  return une.id < autre.id ? -1 : une.id > autre.id ? 1 : 0
}

const CIBLES_PAR_IDENTIFIANT: Porte["comparable"] = (issue) => {
  const ecran = issue as EcranAdminStructure
  return { ...ecran, cibles: [...ecran.cibles].sort(parIdentifiant) }
}

const FABRIQUES: readonly (readonly [
  nom: string,
  fabrique: FabriqueDePortes,
])[] = [
  [
    "l'arbre d'accueil",
    () => ({
      lire: lireArbreAccueil,
      projeter: projeterArbreAccueil,
      comparable: RENDU_TEL_QUEL,
    }),
  ],
  [
    "l'écran d'Administration",
    () => ({
      lire: lireEcranAdmin,
      projeter: projeterEcranAdmin,
      comparable: CIBLES_PAR_IDENTIFIANT,
    }),
  ],
  [
    "les options du sélecteur",
    () => ({
      lire: lireOptionsSelecteur,
      projeter: projeterOptionsSelecteur,
      comparable: RENDU_TEL_QUEL,
    }),
  ],
  [
    "l'écran d'édition",
    ({ idEdition }) => ({
      lire: () => lireEcranEdition(idEdition),
      projeter: (faits) => projeterEcranEdition(faits, idEdition),
      comparable: RENDU_TEL_QUEL,
    }),
  ],
  [
    "la page de catégorie",
    ({ slugCategorie }) => ({
      lire: () => lirePageCategorie(slugCategorie),
      projeter: (faits) => projeterPageCategorie(faits, slugCategorie),
      comparable: RENDU_TEL_QUEL,
    }),
  ],
  [
    "le fil d'Ariane",
    ({ idFil }) => ({
      lire: () => lireFilAriane(idFil),
      projeter: (faits) => projeterFilAriane(faits, idFil),
      comparable: RENDU_TEL_QUEL,
    }),
  ],
]

const CIBLES_LITTALES: Cibles = {
  idEdition: "petit-a",
  slugCategorie: "racine",
  idFil: "boucle-a",
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

describe("Lecture de la Structure — la porte de lecture et sa porte jumelle pure rendent la même chose", () => {
  it("le jeu de faits porte bien les deux corruptions : un cycle, et une parente qui ne nomme aucune rangée", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { lignes } = projeterEcranAdmin(CORROMPUES)
      const presents = tousLesNoeuds(projeterArbreAccueil(CORROMPUES)).map(
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

  for (const [nom, fabrique] of FABRIQUES) {
    it(`${nom} — les deux portes rendent la même sortie des mêmes faits`, async () => {
      const porte = fabrique(CIBLES_LITTALES)

      const lu = await surLaTable(porte.lire)
      const projete = await enSilence(() => porte.projeter(CORROMPUES))

      exigerPlein(lu, `${nom} — la porte de lecture`)
      exigerPlein(projete, `${nom} — la porte pure`)
      expect(porte.comparable(lu)).toEqual(porte.comparable(projete))
    })
  }

  it("la comparaison mord : elle voit une divergence dès qu'il y en a une", async () => {
    const lu = await surLaTable(lireEcranAdmin)
    const projete = await enSilence(() => projeterEcranAdmin(CORROMPUES))

    expect(lu.lignes).toHaveLength(CORROMPUES.length)
    expect(lu.cibles).toHaveLength(CORROMPUES.length)
    expect(lu).toEqual(projete)

    const amputee = await surLaTable(
      lireEcranAdmin,
      rangeesDe(CORROMPUES.filter((fait) => fait.id !== "boucle-b"))
    )
    expect(amputee).not.toEqual(projete)
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
  }
  idDeLaRacineImagee = arbre.racine.id
})

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("Lecture de la Structure — la porte de lecture lit la table, et sa porte jumelle pure rend les mêmes faits", () => {
  it("la table ne porte que les rangées plantées : la porte de lecture la lit entière", async () => {
    const dansLaTable = await prisma.category.findMany({ select: { id: true } })

    expect(
      new Set(dansLaTable.map((rangee) => rangee.id)),
      "une suite a laissé une rangée, et la porte de lecture la rendrait aussi"
    ).toEqual(new Set(base.map((fait) => fait.id)))
  })

  it("le jeu planté porte bien un cycle, que la marche dégrade et nomme", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { lignes } = await lireEcranAdmin()
      const presents = tousLesNoeuds(await lireArbreAccueil()).map(
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

      expect(journal).toHaveLength(2)
      for (const ligne of journal) {
        for (const maillon of ["Portes E", "Portes F", "Portes G"]) {
          expect(ligne).toContain(maillon)
        }
      }
    } finally {
      warn.mockRestore()
    }
  })

  for (const [nom, fabrique] of FABRIQUES) {
    it(`${nom} — les deux portes rendent la même sortie des mêmes faits`, async () => {
      const porte = fabrique(ciblesDeLaBase)

      const lu = await enSilence(porte.lire)
      const projete = await enSilence(() => porte.projeter(base))

      exigerPlein(lu, `${nom} — la porte de lecture`)
      exigerPlein(projete, `${nom} — la porte pure`)
      expect(porte.comparable(lu)).toEqual(porte.comparable(projete))
    })
  }

  it("la comparaison mord sur la vraie table : une rangée de plus la fait tomber", async () => {
    const projete = await enSilence(() => projeterEcranAdmin(base))
    const enPlus = await creerStructure({ name: "Portes I", prefix: PREFIXE })
    try {
      const lu = await enSilence(() => lireEcranAdmin())

      expect(lu.lignes.map((ligne) => ligne.id)).toContain(enPlus.id)
      expect(lu.lignes).toHaveLength(base.length + 1)
      expect(CIBLES_PAR_IDENTIFIANT(lu)).not.toEqual(
        CIBLES_PAR_IDENTIFIANT(projete)
      )
    } finally {
      await prisma.category.delete({ where: { id: enPlus.id } })
    }
  })
})
