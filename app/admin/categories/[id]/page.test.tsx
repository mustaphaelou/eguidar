/**
 * Écran d'édition d'une Structure — test de rendu : fixtures réelles en base,
 * `CategoryForm` remplacé par un stub qui dit ce qu'on lui a donné à exclure,
 * rendu via `renderToReadableStream`, assertions sur le HTML.
 *
 * C'est la première suite de cet écran, et elle garde le fait qui portait le
 * bug : la liste des parentes interdites est la Structure et ses descendantes,
 * et l'écran doit se rendre même quand la Structure est prise dans un cycle
 * (#546). Le formulaire, lui, reste sa propre affaire : il n'est ici qu'un
 * témoin de la liste qu'on lui passe — sa sélection vit dans sa suite.
 */
import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/components/admin/category-form", () => ({
  // Le vrai formulaire rend ses options dans un portail qui ne s'ouvre qu'au
  // clic : son HTML serveur ne porte donc jamais la liste des parentes
  // offertes. Le stub dit ce qu'il a reçu — les identifiants exclus, et les
  // noms qu'il offrirait — sans rien décider lui-même.
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
import {
  creerArbrePropre,
  creerStructure,
  planterUnCycleEnBase,
  type StructureCreee,
} from "@/test/structure-fixtures"

/**
 * L'arbre propre de cette suite. Ses noms sont choisis pour que l'ordre
 * alphabétique de la base soit celui qu'on lit ici : la liste d'exclusions
 * suit l'ordre des enfants tel que la lecture le rend (nom croissant), et une
 * attente qui dépendrait de la collation de PostgreSQL serait un piège.
 *
 *   Arbre A ─┬─ Arbre B ─── Arbre D
 *            └─ Arbre C ─── Arbre E
 *   Arbre F
 */
let arbre: Record<string, StructureCreee>
/** Le cycle planté à côté, pour qu'un arbre propre le côtoie sans le voir. */
let cycle: StructureCreee[]
/** La descendante accrochée à un maillon du cycle : la marche doit l'atteindre
 *  une fois, sans repasser par la boucle. */
let accrocheeAuCycle: StructureCreee

const idsCrees: string[] = []

async function rendreLEcran(id: string): Promise<string> {
  const stream = await renderToReadableStream(
    <EditCategoryPage params={Promise.resolve({ id })} />
  )
  return new Response(stream).text()
}

/** La liste que l'écran a passée au formulaire, dans l'ordre reçu. */
function exclusDuRendu(html: string): string[] {
  const attribut = /data-exclus="([^"]*)"/.exec(html)?.[1] ?? ""
  return attribut ? attribut.split("|") : []
}

/** Les noms que le formulaire offrirait comme parente. */
function offertesDuRendu(html: string): string[] {
  const attribut = /data-offertes="([^"]*)"/.exec(html)?.[1] ?? ""
  return attribut ? attribut.split("|") : []
}

/** Le HTML sans les commentaires que React sème entre un texte et une
 *  expression — « Modifier — <!-- -->Arbre A » se lit mal dans une attente. */
function texteDuRendu(html: string): string {
  return html.replace(/<!--.*?-->/g, "")
}

beforeAll(async () => {
  arbre = await creerArbrePropre({
    racine: { name: "Arbre A" },
    enfantA: { name: "Arbre B", parent: "racine" },
    enfantB: { name: "Arbre C", parent: "racine" },
    petitA: { name: "Arbre D", parent: "enfantA" },
    petitB: { name: "Arbre E", parent: "enfantB" },
    autre: { name: "Arbre F" },
  })

  // Le cycle arrive comme il arrive en vrai : une Tierce partie le referme en
  // base, hors de toute mutation de Structure (ADR-0027). Il est planté **à
  // côté** de l'arbre propre, et l'épreuve de l'arbre propre vérifie que sa
  // présence ne change rien à l'écran d'une Structure saine.
  cycle = [
    await creerStructure({ name: "Boucle A" }),
    await creerStructure({ name: "Boucle B" }),
    await creerStructure({ name: "Boucle C" }),
  ]
  accrocheeAuCycle = await creerStructure({
    name: "Boucle D",
    parentId: cycle[0].id,
  })
  await planterUnCycleEnBase(cycle.map((structure) => structure.id))

  idsCrees.push(
    ...Object.values(arbre).map((structure) => structure.id),
    ...cycle.map((structure) => structure.id),
    accrocheeAuCycle.id
  )
})

afterAll(async () => {
  // `ON DELETE SET NULL` défait le cycle au passage ; l'ordre n'importe donc
  // pas, et une seule instruction suffit.
  await prisma.category.deleteMany({ where: { id: { in: idsCrees } } })
  await prisma.$disconnect()
})

describe("EditCategoryPage — sur un arbre propre", () => {
  it("exclut la Structure et ses descendantes, dans l'ordre d'aujourd'hui", async () => {
    const html = await rendreLEcran(arbre.racine.id)

    expect(html).toContain('data-testid="formulaire-structure"')
    expect(texteDuRendu(html)).toContain(`Modifier — ${arbre.racine.name}`)
    // La liste est celle d'avant le garde, à l'ordre près : la marche empile
    // les enfants dans l'ordre de la lecture (nom croissant) puis dépile le
    // dernier — « Arbre C » et sa descendante passent donc avant « Arbre B »
    // et la sienne. C'est cette liste-là que le formulaire filtre, et
    // « byte-for-byte » est le critère (#546).
    expect(exclusDuRendu(html)).toEqual([
      arbre.racine.id,
      arbre.enfantA.id,
      arbre.enfantB.id,
      arbre.petitB.id,
      arbre.petitA.id,
    ])
    // Le cycle est déjà en base et ne paraît pas dans les exclusions d'une
    // Structure qu'il ne touche pas : ses descendantes sont les seules
    // interdites, et un cycle ailleurs ne change rien à l'écran (#546).
    const idsDuCycle = new Set(cycle.map((structure) => structure.id))
    expect(exclusDuRendu(html).filter((id) => idsDuCycle.has(id))).toEqual([])
  })

  it("n'exclut pas les ancêtres : une Structure garde sa parente actuelle", async () => {
    const html = await rendreLEcran(arbre.enfantA.id)

    // « Arbre B » et sa descendante « Arbre D » : la parente actuelle
    // (« Arbre A ») reste offerte, sinon l'éditeur ne pourrait plus garder la
    // place de sa Structure sans la déplacer.
    expect(exclusDuRendu(html)).toEqual([arbre.enfantA.id, arbre.petitA.id])
    expect(offertesDuRendu(html)).toContain(arbre.racine.name)
    expect(offertesDuRendu(html)).toContain(arbre.autre.name)
    expect(offertesDuRendu(html)).not.toContain(arbre.petitA.name)
  })
})

describe("EditCategoryPage — sur une Structure cyclique", () => {
  it("rend l'écran sur une Structure prise dans le cycle", async () => {
    const html = await rendreLEcran(cycle[0].id)

    // L'épreuve entière est là : avant le garde, cette marche ne s'arrêtait
    // pas, et le rendu serveur ne rendait jamais la main (#546).
    expect(texteDuRendu(html)).toContain(`Modifier — ${cycle[0].name}`)
    // Chaque maillon du cycle est une descendante, chacune **une fois** : la
    // marche s'arrête sur la revisite de la Structure éditée, et la
    // descendante accrochée au cycle est atteinte au passage.
    expect(exclusDuRendu(html).sort()).toEqual(
      [cycle[0].id, cycle[1].id, cycle[2].id, accrocheeAuCycle.id].sort()
    )
  })
})
