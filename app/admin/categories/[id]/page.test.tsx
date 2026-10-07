/**
 * Écran d'édition d'une Structure — test de rendu : fixtures réelles en base,
 * `CategoryForm` remplacé par un stub qui dit ce qu'on lui a donné à exclure,
 * rendu via `renderToReadableStream`, assertions sur le HTML.
 *
 * C'est la première suite de cet écran, et elle garde le fait qui portait le
 * bug : la liste des parentes interdites est la Structure et ses descendantes,
 * et l'écran doit se rendre même quand la Structure est prise dans un cycle
 * (#546). Le formulaire, lui, reste sa propre affaire : il n'est ici qu'un
 * témoin de la liste qu'on lui passe — sa sélection, et le `Set` qu'il en
 * bâtit, vivent dans sa suite.
 *
 * Depuis #549 cette liste vient du cœur de la Marche, et depuis #572 de la
 * **Lecture** elle-même, qui la rend par sa porte de lecture avec les deux
 * autres faits de l'écran. La suite garde donc son **identité** — quelles
 * Structures, et une fois chacune — plutôt que son ordre : le formulaire range
 * la liste dans un `Set` et n'en montre jamais la séquence, et l'ordre d'une
 * liste est une promesse de la Lecture, prouvée sur des faits dans
 * `lib/use-cases/lecture-structure.test.ts` (US 49).
 *
 * **Ce qui reste ici est ce que cette suite seule peut prouver** : que la page
 * rend depuis une base réelle, que la liste d'exclusions est la branche, que la
 * parente actuelle reste offerte, et qu'un cycle est dit **une** fois. Ce
 * dernier point est une preuve de structure, pas de contenu — la retenue qui
 * tait un cycle vit dans la marche, donc le nombre de lignes est le nombre de
 * marches que la page a bâties (ADR-0030).
 */
import { randomUUID } from "node:crypto"

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

/**
 * Le préfixe des Structures de cette suite, remis à la fixture partagée : le
 * nettoyage se fait par `startsWith`, sans liste d'identifiants à tenir à jour
 * (#546). Il porte un jeton par exécution, comme les slugs des autres suites.
 */
const PREFIXE = `edition-546-${randomUUID().slice(0, 8)}-`

async function rendreLEcran(
  id: string
): Promise<{ html: string; journal: string[] }> {
  // Le cycle est en base : chaque rendu le traverse et la Marche le journalise.
  // L'épreuve qui écoute ce journal le reçoit ; les autres le taisent pour ne
  // pas déborder dans la sortie de la suite.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const stream = await renderToReadableStream(
      <EditCategoryPage params={Promise.resolve({ id })} />
    )
    return {
      html: await new Response(stream).text(),
      // Le filtre sur le littéral est ce qui rend l'attente exacte : une autre
      // alerte ne la ferait pas tomber, et une seconde marche la ferait.
      journal: warn.mock.calls
        .map((appel) => appel.join(" "))
        .filter((ligne) => ligne.includes("[marche-structure]")),
    }
  } finally {
    warn.mockRestore()
  }
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

  // Le cycle arrive comme il arrive en vrai : une Tierce partie le referme en
  // base, hors de toute mutation de Structure (ADR-0027). Il est planté **à
  // côté** de l'arbre propre, et l'épreuve de l'arbre propre vérifie que sa
  // présence ne change rien à l'écran d'une Structure saine.
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
  // `ON DELETE SET NULL` défait le cycle au passage ; l'ordre n'importe donc
  // pas, et une seule instruction suffit. Toutes les Structures de la suite
  // portent son préfixe — la fixture l'a reçu — donc aucune liste
  // d'identifiants n'est à tenir (#546).
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("EditCategoryPage — sur un arbre propre", () => {
  it("exclut la Structure et ses descendantes, chacune une fois", async () => {
    const { html } = await rendreLEcran(arbre.racine.id)

    expect(html).toContain('data-testid="formulaire-structure"')
    expect(texteDuRendu(html)).toContain(`Modifier — ${arbre.racine.name}`)
    // L'identité, pas la forme. L'ordre de cette liste a changé avec #549 : la
    // marche descend en largeur là où la pile écrite ici descendait en
    // profondeur — « Arbre D » et « Arbre E » s'inversent. Ce n'est pas un
    // comportement de l'écran : `category-form.tsx` range la liste dans un
    // `Set` et n'offre que les Structures qu'il ne contient pas, dans l'ordre
    // de sa propre lecture (nom croissant) ; la séquence des exclusions ne se
    // voit nulle part. La pinner, ce serait épingler un ordre que ni la marche ni
    // la Lecture ne promet ici — et l'ordre qu'elles promettent, elles, est
    // prouvé sur des faits dans la suite du module (US 49).
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
    // Chacune au plus une fois : c'est l'invariant de la marche, et le seul
    // qu'un cycle pourrait rompre.
    expect(exclus).toHaveLength(5)
    // Le cycle est déjà en base et ne paraît pas dans les exclusions d'une
    // Structure qu'il ne touche pas : ses descendantes sont les seules
    // interdites, et un cycle ailleurs ne change rien à l'écran (#546).
    const idsDuCycle = new Set(cycle.map((structure) => structure.id))
    expect(exclus.filter((id) => idsDuCycle.has(id))).toEqual([])
  })

  it("n'exclut pas les ancêtres : une Structure garde sa parente actuelle", async () => {
    const { html } = await rendreLEcran(arbre.enfantA.id)

    // « Arbre B » et sa descendante « Arbre D » : la parente actuelle
    // (« Arbre A ») reste offerte, sinon l'éditeur ne pourrait plus garder la
    // place de sa Structure sans la déplacer.
    expect(new Set(exclusDuRendu(html))).toEqual(
      new Set([arbre.enfantA.id, arbre.petitA.id])
    )
    // L'exclusion de la parente, nommément : c'est le garde de #572. Une
    // exclusion « pour être sûr » — la parente avec le reste de la branche —
    // ferait tomber ces deux attentes, et le formulaire obligerait alors un
    // éditeur qui renomme à re-pick la place de sa Structure. Elle tient parce
    // qu'une parente est un **ancêtre** : la branche exclue descend, elle ne
    // remonte pas.
    expect(exclusDuRendu(html)).not.toContain(arbre.racine.id)
    expect(offertesDuRendu(html)).toContain(arbre.racine.name)
    expect(offertesDuRendu(html)).toContain(arbre.autre.name)
    expect(offertesDuRendu(html)).not.toContain(arbre.petitA.name)
  })
})

describe("EditCategoryPage — sur une Structure cyclique", () => {
  it("rend l'écran sur une Structure prise dans le cycle", async () => {
    const { html } = await rendreLEcran(cycle[0].id)

    // L'épreuve entière est là : avant le garde, cette marche ne s'arrêtait
    // pas, et le rendu serveur ne rendait jamais la main (#546).
    expect(texteDuRendu(html)).toContain(`Modifier — ${cycle[0].name}`)
    // Chaque maillon du cycle est une descendante, chacune **une fois** : la
    // marche s'arrête sur la revisite de la Structure éditée, et la
    // descendante accrochée au cycle est atteinte au passage.
    const exclus = exclusDuRendu(html)
    expect(new Set(exclus)).toEqual(
      new Set([cycle[0].id, cycle[1].id, cycle[2].id, accrocheeAuCycle.id])
    )
    expect(exclus).toHaveLength(4)
  })

  it("signale le cycle une fois, en nommant ses Structures", async () => {
    const { journal } = await rendreLEcran(cycle[0].id)

    // **Une ligne, et c'est une preuve de structure.** La retenue qui tait un
    // cycle vit dans la marche, donc le nombre de lignes est le nombre de
    // marches que l'écran a bâties : une page qui relirait la table, ou qui
    // appellerait une seconde projection, en bâtirait une de plus et
    // dirait le même cycle une seconde fois — et cette attente tomberait. Une
    // ligne de plus se lirait « deux cycles », alors qu'il n'y en a qu'un à
    // réparer, et c'est le nombre de Structures à réparer que l'avertissement
    // doit dire (ADR-0030).
    expect(journal).toHaveLength(1)
    // Et la ligne nomme les Structures de la lecture, pour qu'elle se lise sans
    // console de base : c'est ce que les noms du surensemble achètent.
    for (const structure of cycle) {
      expect(journal[0]).toContain(structure.name)
    }
  })
})
