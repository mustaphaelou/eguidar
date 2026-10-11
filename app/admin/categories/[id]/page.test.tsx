import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/components/admin/category-form", () => ({
  CategoryForm: ({
    categories,
    excludedParentIds,
  }: {
    categories: { id: string; name: string }[]
    excludedParentIds: string[]
  }) => {
    const exclus = new Set(excludedParentIds)
    return (
      <div
        data-testid="formulaire-structure"
        data-exclus={excludedParentIds.join("|")}
        data-offertes={categories
          .filter((candidate) => !exclus.has(candidate.id))
          .map((candidate) => candidate.name)
          .join("|")}
      />
    )
  },
}))

import EditCategoryPage from "./page"
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

const PREFIXE = `edition-546-${randomUUID().slice(0, 8)}-`

async function rendreLEcran(
  id: string
): Promise<{ html: string; journal: string[] }> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const stream = await renderToReadableStream(
      <EditCategoryPage params={Promise.resolve({ id })} />
    )
    return {
      html: await new Response(stream).text(),
      journal: warn.mock.calls
        .map((appel) => appel.join(" "))
        .filter((ligne) => ligne.includes("[marche-structure]")),
    }
  } finally {
    warn.mockRestore()
  }
}

function exclusDuRendu(html: string): string[] {
  const attribut = /data-exclus="([^"]*)"/.exec(html)?.[1] ?? ""
  return attribut ? attribut.split("|") : []
}

function offertesDuRendu(html: string): string[] {
  const attribut = /data-offertes="([^"]*)"/.exec(html)?.[1] ?? ""
  return attribut ? attribut.split("|") : []
}

function texteDuRendu(html: string): string {
  return html.replace(/<!--.*?-->/g, "")
}

beforeAll(async () => {
  arbre = await creerArbrePropre(
    {
      racine: { name: "Arbre A" },
      enfantA: { name: "Arbre B", parent: "racine" },
      enfantB: { name: "Arbre C", parent: "racine" },
      petitA: { name: "Arbre D", parent: "enfantA" },
      petitB: { name: "Arbre E", parent: "enfantB" },
      autre: { name: "Arbre F" },
    },
    PREFIXE
  )

  cycle = [
    await creerStructure({ name: "Boucle A", prefix: PREFIXE }),
    await creerStructure({ name: "Boucle B", prefix: PREFIXE }),
    await creerStructure({ name: "Boucle C", prefix: PREFIXE }),
  ]
  accrocheeAuCycle = await creerStructure({
    name: "Boucle D",
    parentId: cycle[0].id,
    prefix: PREFIXE,
  })
  await planterUnCycleEnBase(cycle.map((structure) => structure.id))
})

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("EditCategoryPage — le prix de la lecture", () => {
  it("lit la Structure une fois par rendu, pour la fiche, les options et la branche", async () => {
    const { lectures } = await compterLesLecturesDeLaStructure(() =>
      rendreLEcran(arbre.racine.id)
    )

    expect(lectures).toBe(1)
  })
})

describe("EditCategoryPage — sur un arbre propre", () => {
  it("exclut la Structure et ses descendantes, chacune une fois", async () => {
    const { html } = await rendreLEcran(arbre.racine.id)

    expect(html).toContain('data-testid="formulaire-structure"')
    expect(texteDuRendu(html)).toContain(`Modifier — ${arbre.racine.name}`)
    const exclus = exclusDuRendu(html)
    expect(new Set(exclus)).toEqual(
      new Set([
        arbre.racine.id,
        arbre.enfantA.id,
        arbre.enfantB.id,
        arbre.petitA.id,
        arbre.petitB.id,
      ])
    )
    expect(exclus).toHaveLength(5)
    const idsDuCycle = new Set(cycle.map((structure) => structure.id))
    expect(exclus.filter((id) => idsDuCycle.has(id))).toEqual([])
  })

  it("n'exclut pas les ancêtres : une Structure garde sa parente actuelle", async () => {
    const { html } = await rendreLEcran(arbre.enfantA.id)

    expect(new Set(exclusDuRendu(html))).toEqual(
      new Set([arbre.enfantA.id, arbre.petitA.id])
    )
    expect(exclusDuRendu(html)).not.toContain(arbre.racine.id)
    expect(offertesDuRendu(html)).toContain(arbre.racine.name)
    expect(offertesDuRendu(html)).toContain(arbre.autre.name)
    expect(offertesDuRendu(html)).not.toContain(arbre.petitA.name)
  })
})

describe("EditCategoryPage — sur une Structure cyclique", () => {
  it("rend l'écran sur une Structure prise dans le cycle", async () => {
    const { html } = await rendreLEcran(cycle[0].id)

    expect(texteDuRendu(html)).toContain(`Modifier — ${cycle[0].name}`)
    const exclus = exclusDuRendu(html)
    expect(new Set(exclus)).toEqual(
      new Set([cycle[0].id, cycle[1].id, cycle[2].id, accrocheeAuCycle.id])
    )
    expect(exclus).toHaveLength(4)
  })

  it("signale le cycle une fois, en nommant ses Structures", async () => {
    const { journal } = await rendreLEcran(cycle[0].id)

    expect(journal).toHaveLength(1)
    for (const structure of cycle) {
      expect(journal[0]).toContain(structure.name)
    }
  })
})
