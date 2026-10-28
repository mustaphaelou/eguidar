import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

vi.mock("@/components/admin/delete-category-button", () => ({
  DeleteCategoryButton: ({
    categoryId,
    ciblesProduits,
    ciblesSousCategories,
    nomsStructures,
  }: {
    categoryId: string
    ciblesProduits: readonly string[]
    ciblesSousCategories: readonly string[]
    nomsStructures: Record<string, string>
  }) => (
    <span
      data-testid="bouton-suppression"
      data-structure={categoryId}
      data-cibles-produits={JSON.stringify(ciblesProduits)}
      data-cibles-sous-categories={JSON.stringify(ciblesSousCategories)}
      data-noms={JSON.stringify(nomsStructures)}
    />
  ),
}))

import AdminCategoriesPage from "./page"
import { prisma } from "@/lib/db"
import { compterLesLecturesDeLaStructure } from "@/test/lecture-structure-recette"
import {
  creerArbrePropre,
  creerStructure,
  planterUnCycleEnBase,
  type StructureCreee,
} from "@/test/structure-fixtures"

let arbre: Record<string, StructureCreee>
let cycle: StructureCreee[]
let accrocheeAuCycle: StructureCreee

const PREFIXE = `liste-550-${randomUUID().slice(0, 8)}-`

async function rendreLaListe(): Promise<{ html: string; journal: string[] }> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const stream = await renderToReadableStream(<AdminCategoriesPage />)
    const html = await new Response(stream).text()
    return {
      html,
      journal: warn.mock.calls
        .map((appel) => appel.join(" "))
        .filter((ligne) => ligne.includes("[marche-structure]")),
    }
  } finally {
    warn.mockRestore()
  }
}

interface LigneRendue {
  nom: string
  premiereCellule: string
  cellules: string[]
  ciblesProduits: string[]
  ciblesSousCategories: string[]
  nomsStructures: Record<string, string>
}

function jsonDe(html: string, attribut: string): string[] {
  const brut = new RegExp(`${attribut}="([^"]*)"`).exec(html)?.[1] ?? "[]"
  return JSON.parse(brut.replaceAll("&quot;", '"')) as string[]
}

function objetDe(html: string, attribut: string): Record<string, string> {
  const brut = new RegExp(`${attribut}="([^"]*)"`).exec(html)?.[1] ?? "{}"
  return JSON.parse(brut.replaceAll("&quot;", '"')) as Record<string, string>
}

function sansBalises(fragment: string): string {
  return fragment
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function lignesDuRendu(html: string): LigneRendue[] {
  const corps = /<tbody[^>]*>([\s\S]*)<\/tbody>/.exec(html)?.[1] ?? ""
  return corps
    .split("<tr")
    .slice(1)
    .map((ligne) => ({
      nom: /<span class="font-medium">([^<]*)<\/span>/.exec(ligne)?.[1] ?? "",
      premiereCellule: sansBalises(ligne.split("</td>")[0] ?? ""),
      cellules: ligne
        .split("</td>")
        .slice(0, 6)
        .map((cellule) => sansBalises(cellule)),
      ciblesProduits: jsonDe(ligne, "data-cibles-produits"),
      ciblesSousCategories: jsonDe(ligne, "data-cibles-sous-categories"),
      nomsStructures: objetDe(ligne, "data-noms"),
    }))
}

beforeAll(async () => {
  arbre = await creerArbrePropre(
    {
      racine: { name: "Liste 550 A" },
      enfantA: { name: "Liste 550 B", parent: "racine" },
      enfantB: { name: "Liste 550 C", parent: "racine" },
      petitA: { name: "Liste 550 D", parent: "enfantA" },
      petitB: { name: "Liste 550 E", parent: "enfantB" },
      autre: { name: "Liste 550 F" },
    },
    PREFIXE
  )

  cycle = [
    await creerStructure({ name: "Hors 550 A", prefix: PREFIXE }),
    await creerStructure({ name: "Hors 550 B", prefix: PREFIXE }),
    await creerStructure({ name: "Hors 550 C", prefix: PREFIXE }),
  ]
  accrocheeAuCycle = await creerStructure({
    name: "Hors 550 D",
    parentId: cycle[0].id,
    prefix: PREFIXE,
  })
  await planterUnCycleEnBase(cycle.map((structure) => structure.id))
})

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("AdminCategoriesPage — Structures hors arbre", () => {
  it("affiche les Structures qu'aucune branche n'atteint, après l'arbre ordinaire", async () => {
    const { html } = await rendreLaListe()
    const noms = lignesDuRendu(html).map((ligne) => ligne.nom)

    const horsArbre = [...cycle, accrocheeAuCycle]
    for (const structure of horsArbre) {
      expect(noms).toContain(structure.name)
    }

    const derniereDeLArbre = Math.max(
      ...Object.values(arbre).map((structure) => noms.indexOf(structure.name))
    )
    const premiereHorsArbre = Math.min(
      ...horsArbre.map((structure) => noms.indexOf(structure.name))
    )
    expect(premiereHorsArbre).toBeGreaterThan(derniereDeLArbre)
  })

  it("marque une Structure hors arbre, sans lui prêter de parente ni de racine", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)

    for (const structure of [...cycle, accrocheeAuCycle]) {
      const ligne = lignes.find((candidate) => candidate.nom === structure.name)
      expect(ligne, `ligne de « ${structure.name} »`).toBeDefined()
      const cellule = ligne?.premiereCellule ?? ""

      expect(cellule).toContain("hors arbre")
      expect(cellule).not.toContain("Catégorie racine")
      expect(cellule).not.toContain("sous ")
    }
  })

  it("signale le cycle une fois, en nommant ses Structures", async () => {
    const { journal } = await rendreLaListe()

    expect(journal).toHaveLength(1)
    for (const structure of cycle) {
      expect(journal[0]).toContain(structure.name)
    }
  })

  it("donne à chaque boîte deux listes de cibles, et rien d'appelable", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const enBase = await prisma.category.findMany({
      select: { id: true, name: true },
    })
    const tousLesIds = enBase.map((structure) => structure.id)

    expect(lignes.length).toBeGreaterThan(0)
    for (const ligne of lignes) {
      for (const liste of [ligne.ciblesProduits, ligne.ciblesSousCategories]) {
        for (const valeur of liste) expect(typeof valeur).toBe("string")
      }
      for (const nom of Object.values(ligne.nomsStructures)) {
        expect(typeof nom).toBe("string")
      }

      const lignesRendues = lignes.length
      expect(ligne.ciblesProduits, `produits de « ${ligne.nom} »`).toHaveLength(
        tousLesIds.length - 1
      )

      for (const cible of ligne.ciblesSousCategories) {
        expect(ligne.ciblesProduits, cible).toContain(cible)
      }

      for (const structure of enBase) {
        expect(ligne.nomsStructures[structure.id], structure.id).toBe(
          structure.name
        )
      }
      expect(Object.keys(ligne.nomsStructures)).toHaveLength(tousLesIds.length)
      expect(lignesRendues).toBe(tousLesIds.length)
    }
  })

  it("écarte de la liste des sous-catégories ce qui descend de la Structure de la ligne", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const parNom = new Map(lignes.map((ligne) => [ligne.nom, ligne]))

    const ligneB = parNom.get(arbre.enfantA.name)!
    expect(ligneB.ciblesSousCategories).not.toContain(arbre.petitA.id)
    expect(ligneB.ciblesProduits).toContain(arbre.petitA.id)
  })

  it("propose une Structure du cycle comme Structure d'accueil des sous-catégories", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)

    const horsArbreEtLeCycle = new Set([
      ...cycle.map((structure) => structure.id),
      accrocheeAuCycle.id,
    ])
    for (const structure of cycle) {
      const ligne = lignes.find(
        (candidate) => candidate.nom === structure.name
      )!
      for (const id of horsArbreEtLeCycle) {
        expect(
          ligne.ciblesSousCategories,
          `${structure.name} → ${id}`
        ).not.toContain(id)
      }
      for (const structure of Object.values(arbre)) {
        expect(
          ligne.ciblesSousCategories,
          `${structure.name} → ${structure.name}`
        ).toContain(structure.id)
        expect(
          ligne.ciblesProduits,
          `${structure.name} → ${structure.name}`
        ).toContain(structure.id)
      }
    }

    for (const structure of Object.values(arbre)) {
      const ligne = lignes.find(
        (candidate) => candidate.nom === structure.name
      )!
      for (const maillon of cycle) {
        expect(
          ligne.ciblesSousCategories,
          `${structure.name} → ${maillon.name}`
        ).toContain(maillon.id)
        expect(
          ligne.ciblesProduits,
          `${structure.name} → ${maillon.name}`
        ).toContain(maillon.id)
      }
    }
  })
})

describe("AdminCategoriesPage — le prix de la lecture", () => {
  it("lit la Structure une fois par rendu, pour les lignes et pour les cibles", async () => {
    const { lectures } = await compterLesLecturesDeLaStructure(rendreLaListe)

    expect(lectures).toBe(1)
  })
})

describe("AdminCategoriesPage — arbre propre", () => {
  it("rend une ligne par Structure de la base", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)

    const enBase = await prisma.category.findMany({ select: { name: true } })
    expect([...lignes.map((ligne) => ligne.nom)].sort()).toEqual(
      enBase.map((categorie) => categorie.name).sort()
    )
  })

  it("montre le chemin de la Structure saine : sa racine, ou son fil d'Ariane", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const celluleDe = (structure: StructureCreee) =>
      lignes.find((candidate) => candidate.nom === structure.name)
        ?.premiereCellule ?? ""

    expect(celluleDe(arbre.enfantA)).toContain(
      `${arbre.racine.name} / ${arbre.enfantA.name}`
    )
    expect(celluleDe(arbre.petitA)).toContain(
      `${arbre.racine.name} / ${arbre.enfantA.name} / ${arbre.petitA.name}`
    )
    expect(celluleDe(arbre.racine)).toContain("Catégorie racine")
    for (const structure of Object.values(arbre)) {
      expect(celluleDe(structure)).not.toContain("hors arbre")
    }
  })

  it("montre la position parmi les sœurs, et leur nombre", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const cellulesDe = (structure: StructureCreee) =>
      lignes.find((candidate) => candidate.nom === structure.name)?.cellules ??
      []

    expect(cellulesDe(arbre.racine)[4]).toBe("1 sur 2")
    expect(cellulesDe(arbre.autre)[4]).toBe("2 sur 2")
    expect(cellulesDe(arbre.enfantA)[4]).toBe("1 sur 2")
    expect(cellulesDe(arbre.enfantB)[4]).toBe("2 sur 2")
    expect(cellulesDe(arbre.petitA)[4]).toBe("1 sur 1")
  })

  it("montre les Produits directs et le cumul de la branche", async () => {
    const produit = await prisma.product.create({
      data: {
        name: "Produit du cumul",
        slug: `${PREFIXE}cumul`,
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: arbre.petitA.id,
      },
    })
    try {
      const { html } = await rendreLaListe()
      const lignes = lignesDuRendu(html)
      const cellulesDe = (structure: StructureCreee) =>
        lignes.find((candidate) => candidate.nom === structure.name)
          ?.cellules ?? []

      expect(cellulesDe(arbre.petitA)[2]).toContain("1 direct")
      expect(cellulesDe(arbre.petitA)[2]).toContain("1 au total")
      expect(cellulesDe(arbre.enfantA)[2]).toContain("0 direct")
      expect(cellulesDe(arbre.enfantA)[2]).toContain("1 au total")
      expect(cellulesDe(arbre.racine)[2]).toContain("0 direct")
      expect(cellulesDe(arbre.racine)[2]).toContain("1 au total")
    } finally {
      await prisma.product.delete({ where: { id: produit.id } })
    }
  })

  it("garde une seule région polie, et n'invente ni treegrid ni glisser-déposer", async () => {
    const { html } = await rendreLaListe()

    expect(html.match(/role="status"/g) ?? []).toHaveLength(1)
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('role="treegrid"')
    expect(html).not.toContain('draggable="true"')
  })

  it("offre « Rattacher… » sur une Structure hors arbre, et « Déplacer sous… » sur une saine", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const horsArbre = lignes.find(
      (ligne) => ligne.nom === cycle[0]!.name
    )!.premiereCellule

    expect(horsArbre).toContain("hors arbre")
    expect(html).toContain(`Rattacher ${cycle[0]!.name}`)
    expect(html).toContain(`Rattacher ${accrocheeAuCycle.name}`)
    expect(html).toContain(
      `Déplacer ${arbre.racine.name} sous une autre Structure`
    )
    expect(html).toContain("Rattacher…")
    expect(html).toContain("Déplacer sous…")
  })
})
