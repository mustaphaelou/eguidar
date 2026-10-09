import { describe, expect, it, vi } from "vitest"

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
  type FaitStructure,
} from "@/lib/use-cases/lecture-structure"
import {
  avecSource,
  sourceDuCorpus,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"
import { structure, tousLesNoeuds } from "@/test/lecture-structure-recette"
import { MODULE_LECTURE, SYMBOLES } from "@/test/lecture-structure-outils"

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

// Cette suite franchit volontairement la couture que le reste du dépôt franchit
// sans y regarder : elle fait lire la table par la porte de lecture, projette
// les mêmes rangées par sa porte jumelle pure, et compare les deux sorties. Les
// portes pures sont éprouvées ailleurs, sur des faits écrits à la main ; les
// portes de lecture le sont par les pages qui les appellent, contre une vraie
// base. Chacune des deux familles disait vrai de son côté, et l'accord des deux
// n'était regardé nulle part — c'est sous ce jeu de faits, une boucle et une
// parente qui ne nomme aucune rangée, que la divergence s'était logée.

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
  // Une parente qui ne nomme aucune rangée : la marche classe cette Structure
  // hors arbre, et c'est sous ce fait que le regroupement dupliqué de la Lecture
  // la promouvait en racine. #585 a supprimé ce regroupement et rendu la marche
  // seule propriétaire de la topologie : les deux portes s'accordent donc
  // aujourd'hui, et la Structure reste au jeu de faits pour que l'accord ne
  // puisse pas se rompre.
  structure("hors-arbre", "Hors arbre", "parente-absente", 5),
  structure("enfant-hors-arbre", "Enfant hors arbre", "hors-arbre", 1),
  structure("boucle-a", "Boucle A", "boucle-b", 2),
  structure("boucle-b", "Boucle B", "boucle-a", 4),
]

const RANGEES = rangeesDe(CORROMPUES)

const HORS_ARBRE = ["boucle-a", "boucle-b", "enfant-hors-arbre", "hors-arbre"]

interface Porte {
  nom: string
  lire: () => Promise<unknown>
  projeter: (faits: readonly FaitStructure[]) => unknown
}

const PORTES: readonly Porte[] = [
  {
    nom: "l'arbre d'accueil",
    lire: lireArbreAccueil,
    projeter: (faits) => projeterArbreAccueil(faits),
  },
  {
    nom: "l'écran d'Administration",
    lire: lireEcranAdmin,
    projeter: (faits) => projeterEcranAdmin(faits),
  },
  {
    nom: "les options du sélecteur",
    lire: lireOptionsSelecteur,
    projeter: (faits) => projeterOptionsSelecteur(faits),
  },
  {
    nom: "l'écran d'édition",
    lire: () => lireEcranEdition("petit-a"),
    projeter: (faits) => projeterEcranEdition(faits, "petit-a"),
  },
  {
    nom: "la page de catégorie",
    lire: () => lirePageCategorie("racine"),
    projeter: (faits) => projeterPageCategorie(faits, "racine"),
  },
  {
    nom: "le fil d'Ariane",
    lire: () => lireFilAriane("boucle-a"),
    projeter: (faits) => projeterFilAriane(faits, "boucle-a"),
  },
]

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

function enSilence<T>(rendre: () => T): T {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    return rendre()
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

  for (const porte of PORTES) {
    it(`${porte.nom} — les deux portes rendent la même sortie des mêmes faits`, async () => {
      const lu = await surLaTable(porte.lire)
      const projete = enSilence(() => porte.projeter(CORROMPUES))

      exigerPlein(lu, `${porte.nom} — la porte de lecture`)
      exigerPlein(projete, `${porte.nom} — la porte pure`)
      expect(lu).toEqual(projete)
    })
  }

  it("la comparaison mord : elle voit une divergence dès qu'il y en a une", async () => {
    const lu = await surLaTable(lireEcranAdmin)
    const projete = enSilence(() => projeterEcranAdmin(CORROMPUES))

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
