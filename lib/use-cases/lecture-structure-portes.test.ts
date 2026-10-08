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

const PORTES = [
  {
    nom: "l'arbre d'accueil",
    lire: lireArbreAccueil,
    projeter: (faits: FaitStructure[]) => projeterArbreAccueil(faits),
  },
  {
    nom: "l'écran d'Administration",
    lire: lireEcranAdmin,
    projeter: (faits: FaitStructure[]) => projeterEcranAdmin(faits),
  },
  {
    nom: "les options du sélecteur",
    lire: lireOptionsSelecteur,
    projeter: (faits: FaitStructure[]) => projeterOptionsSelecteur(faits),
  },
  {
    nom: "l'écran d'édition",
    lire: () => lireEcranEdition("enfant-a"),
    projeter: (faits: FaitStructure[]) =>
      projeterEcranEdition(faits, "enfant-a"),
  },
  {
    nom: "la page de catégorie",
    lire: () => lirePageCategorie("racine"),
    projeter: (faits: FaitStructure[]) =>
      projeterPageCategorie(faits, "racine"),
  },
  {
    nom: "le fil d'Ariane",
    lire: () => lireFilAriane("petit-a"),
    projeter: (faits: FaitStructure[]) => projeterFilAriane(faits, "petit-a"),
  },
] as const

const RANGEES = [
  {
    id: "racine",
    name: "Racine",
    slug: "racine",
    image: null,
    parentId: null,
    _count: { products: 3 },
  },
  {
    id: "enfant-a",
    name: "Zèbre",
    slug: "enfant-a",
    image: "/zebre.png",
    parentId: "racine",
    _count: { products: 1 },
  },
  {
    id: "enfant-b",
    name: "Écran",
    slug: "enfant-b",
    image: null,
    parentId: "racine",
    _count: { products: 0 },
  },
  {
    id: "petit-a",
    name: "Écran",
    slug: "petit-a",
    image: null,
    parentId: "enfant-a",
    _count: { products: 7 },
  },
  {
    id: "isolee",
    name: "Isolée",
    slug: "isolee",
    image: null,
    parentId: null,
    _count: { products: 0 },
  },
]

const FAITS: FaitStructure[] = [
  {
    id: "racine",
    name: "Racine",
    slug: "racine",
    image: null,
    parentId: null,
    produitsDirects: 3,
  },
  {
    id: "enfant-a",
    name: "Zèbre",
    slug: "enfant-a",
    image: "/zebre.png",
    parentId: "racine",
    produitsDirects: 1,
  },
  {
    id: "enfant-b",
    name: "Écran",
    slug: "enfant-b",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
  {
    id: "petit-a",
    name: "Écran",
    slug: "petit-a",
    image: null,
    parentId: "enfant-a",
    produitsDirects: 7,
  },
  {
    id: "isolee",
    name: "Isolée",
    slug: "isolee",
    image: null,
    parentId: null,
    produitsDirects: 0,
  },
]

function tableSimulee(): () => void {
  const espion = vi
    .spyOn(prisma.category, "findMany")
    .mockResolvedValue(RANGEES as never)
  return () => espion.mockRestore()
}

describe("Lecture de la Structure — la lecture et sa jumelle pure rendent la même chose (#585)", () => {
  for (const porte of PORTES) {
    it(`${porte.nom}`, async () => {
      const restaurer = tableSimulee()
      try {
        await expect(porte.lire()).resolves.toEqual(porte.projeter(FAITS))
      } finally {
        restaurer()
      }
    })
  }

  it("la comparaison mord : les deux côtés sont pleins, et elle voit une divergence", async () => {
    const restaurer = tableSimulee()
    try {
      const lu = await lireEcranAdmin()
      const projete = projeterEcranAdmin(FAITS)

      expect(lu.lignes).toHaveLength(FAITS.length)
      expect(lu.cibles).toHaveLength(FAITS.length)
      expect(lu).toEqual(projete)

      expect({ ...lu, lignes: lu.lignes.slice(1) }).not.toEqual(projete)
    } finally {
      restaurer()
    }
  })
})
