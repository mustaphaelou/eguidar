import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/components/admin/category-form", () => ({
  CategoryForm: ({ categories }: { categories: Record<string, string>[] }) => (
    <div
      data-testid="formulaire-structure"
      data-offertes={categories
        .map((option) => `${option.id}~${option.name}`)
        .join("|")}
      data-champs={[
        ...new Set(categories.flatMap((option) => Object.keys(option))),
      ]
        .sort()
        .join(",")}
    />
  ),
}))

import NewCategoryPage from "./page"
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

const PREFIXE = `creation-576-${randomUUID().slice(0, 8)}-`

async function rendreLEcran(): Promise<{ html: string; journal: string[] }> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const stream = await renderToReadableStream(<NewCategoryPage />)
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

function optionsDuRendu(html: string): { id: string; name: string }[] {
  const attribut = /data-offertes="([^"]*)"/.exec(html)?.[1] ?? ""
  return attribut
    ? attribut.split("|").map((entree) => {
        const [id, nom] = entree.split("~")
        return { id: id ?? "", name: nom ?? "" }
      })
    : []
}

beforeAll(async () => {
  arbre = await creerArbrePropre(
    {
      racine: { name: "Création A" },
      enfantA: { name: "Création B", parent: "racine" },
      enfantB: { name: "Création C", parent: "racine" },
      petitA: { name: "Création D", parent: "enfantA" },
      petitB: { name: "Création E", parent: "enfantB" },
      autre: { name: "Création F" },
    },
    PREFIXE
  )

  cycle = [
    await creerStructure({ name: "Création boucle A", prefix: PREFIXE }),
    await creerStructure({ name: "Création boucle B", prefix: PREFIXE }),
    await creerStructure({ name: "Création boucle C", prefix: PREFIXE }),
  ]
  await planterUnCycleEnBase(cycle.map((structure) => structure.id))
})

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("NewCategoryPage — le sélecteur de parente", () => {
  it("offre une option par Structure de la base, par son identifiant et son nom", async () => {
    const { html } = await rendreLEcran()

    expect(html).toContain('data-testid="formulaire-structure"')
    const options = optionsDuRendu(html)
    const enBase = await prisma.category.findMany({
      select: { id: true, name: true },
    })
    expect([...options].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...enBase].sort((a, b) => a.id.localeCompare(b.id))
    )
    for (const structure of Object.values(arbre)) {
      expect(options).toContainEqual({
        id: structure.id,
        name: structure.name,
      })
    }
  })

  it("ne donne au formulaire que l'identifiant et le nom : ni compteur, ni nom de parente", async () => {
    const { html } = await rendreLEcran()

    expect(/data-champs="([^"]*)"/.exec(html)?.[1]).toBe("id,name")
    expect(optionsDuRendu(html).length).toBeGreaterThan(0)
  })

  it("offre une Structure qu'aucune branche n'atteint, et ne dit rien du cycle", async () => {
    const { html, journal } = await rendreLEcran()

    const options = optionsDuRendu(html)
    for (const structure of cycle) {
      expect(options, structure.name).toContainEqual({
        id: structure.id,
        name: structure.name,
      })
    }

    expect(journal).toEqual([])
  })

  it("lit la Structure une fois par rendu", async () => {
    const { lectures } = await compterLesLecturesDeLaStructure(rendreLEcran)

    expect(lectures).toBe(1)
  })
})
