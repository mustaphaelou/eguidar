/**
 * Liste des catégories — test de rendu : fixtures réelles en base, rendu via
 * `renderToReadableStream`, assertions sur le HTML.
 *
 * C'est la première suite de cet écran, et elle garde le fait qui porte #550 :
 * la liste descend de la racine, donc une Structure cyclique ne la fait pas
 * échouer — elle en **disparaît**, et la liste est courte en silence. Depuis
 * ADR-0030 l'écran nomme ce qu'aucune branche n'atteint : les **Structures
 * hors arbre** du glossaire, appendues après l'arbre ordinaire et marquées
 * comme telles. C'est le seul endroit du dépôt où un cycle devient visible d'un
 * être humain, donc le seul d'où on peut le réparer ; la boutique, elle, ne
 * gagne aucune surface (ADR-0030).
 *
 * L'écran rend **toutes** les Structures de la base : les épreuves de l'arbre
 * propre n'asserteront donc que l'ordre et la profondeur des leurs, jamais un
 * tableau complet, et celles du cycle que la place des leurs — après l'arbre,
 * et marquées.
 *
 * `DeleteCategoryButton` est remplacé par un stub : la boîte a sa propre suite
 * et #551 la migre en parallèle. Le stub dit ce que la page lui donne à voir —
 * la Structure entière, cycle compris, sans quoi une cible fermant la boucle
 * lui resterait offerte.
 */
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
    categories,
  }: {
    categoryId: string
    categories: { id: string }[]
  }) => (
    <span
      data-testid="bouton-suppression"
      data-structure={categoryId}
      data-candidats={categories.length}
    />
  ),
}))

import AdminCategoriesPage from "./page"
import { prisma } from "@/lib/db"
import {
  creerArbrePropre,
  creerStructure,
  planterUnCycleEnBase,
  type StructureCreee,
} from "@/test/structure-fixtures"

/**
 * L'arbre propre de cette suite. Ses noms sont choisis pour que la collation
 * française de l'écran soit celle qu'on lit ici — « Liste 550 A » … « Liste
 * 550 F » — et pour qu'aucune autre suite ne les plante :
 *
 *   Liste 550 A ─┬─ Liste 550 B ─── Liste 550 D
 *                └─ Liste 550 C ─── Liste 550 E
 *   Liste 550 F
 *
 * La descente rend donc A, B, D, C, E, F — la profondeur d'un enfant est celle
 * de sa parente plus un, et une racine est à zéro.
 */
let arbre: Record<string, StructureCreee>
/** Le cycle planté à côté : trois maillons, et une descendante accrochée au
 *  premier — quatre Structures qu'aucune racine n'atteint. */
let cycle: StructureCreee[]
let accrocheeAuCycle: StructureCreee

/**
 * Le préfixe des Structures de cette suite, remis à la fixture partagée : le
 * nettoyage se fait par `startsWith`, sans liste d'identifiants à tenir à jour
 * (#546). Il porte un jeton par exécution, comme les slugs des autres suites.
 */
const PREFIXE = `liste-550-${randomUUID().slice(0, 8)}-`

async function rendreLaListe(): Promise<{ html: string; journal: string[] }> {
  // Le cycle est en base : chaque rendu le traverse et la marche le
  // journalise. L'épreuve qui écoute ce journal le reçoit ; les autres le
  // taisent pour ne pas déborder dans la sortie de la suite.
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
  profondeur: number
  /** La première cellule, texte seul : le nom et ce que la ligne dit de sa
   *  place — « sous … », « Catégorie racine », ou la marque hors arbre. */
  premiereCellule: string
  /** Le nombre de Structures que la boîte de suppression de la ligne a
   *  reçues : la page lui donne la lecture entière, jamais la seule branche. */
  candidats: number
}

/** Le retrait qu'un niveau de profondeur vaut à l'écran. */
const RETRAIT_PAR_NIVEAU = 1.5

/** Le texte d'un fragment de HTML, balises et commentaires React en moins. */
function sansBalises(fragment: string): string {
  return fragment
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Les lignes du corps du tableau, dans l'ordre rendu. Le nom et la profondeur
 * se lisent dans le HTML : le premier est la seule `span` en `font-medium` de
 * la ligne, la seconde le retrait que l'écran applique — React omet l'unité
 * d'un zéro, d'où le `px` facultatif.
 */
function lignesDuRendu(html: string): LigneRendue[] {
  const corps = /<tbody[^>]*>([\s\S]*)<\/tbody>/.exec(html)?.[1] ?? ""
  return corps
    .split("<tr")
    .slice(1)
    .map((ligne) => ({
      nom: /<span class="font-medium">([^<]*)<\/span>/.exec(ligne)?.[1] ?? "",
      profondeur:
        Number(
          /padding-left:\s*([\d.]+)(?:px)?/.exec(ligne)?.[1] ?? Number.NaN
        ) / RETRAIT_PAR_NIVEAU,
      premiereCellule: sansBalises(ligne.split("</td>")[0] ?? ""),
      candidats: Number(
        /data-candidats="(\d+)"/.exec(ligne)?.[1] ?? Number.NaN
      ),
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

  // Le cycle arrive comme il arrive en vrai : une Tierce partie le referme en
  // base, hors de toute mutation de Structure (ADR-0027).
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
  // `ON DELETE SET NULL` défait le cycle au passage ; l'ordre n'importe donc
  // pas, et une seule instruction suffit. Toutes les Structures de la suite
  // portent son préfixe — la fixture l'a reçu — donc aucune liste
  // d'identifiants n'est à tenir (#546).
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

    // L'arbre ordinaire d'abord, le hors arbre ensuite : la dernière ligne de
    // l'arbre passe avant la première ligne hors arbre.
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

      // Le terme du glossaire, et rien qui la range dans une branche : elle a
      // une parente en base, mais aucune racine ne mène à elle, donc ni
      // « sous … » ni « Catégorie racine » ne diraient la vérité.
      expect(cellule).toContain("hors arbre")
      expect(cellule).not.toContain("Catégorie racine")
      expect(cellule).not.toContain("sous ")
    }
  })

  it("signale le cycle une fois, en nommant ses Structures", async () => {
    const { journal } = await rendreLaListe()

    // Une marche par page : le cycle n'est atteint que par la surface qui le
    // détecte ici — `horsArbre()` — et il ne produit donc qu'une ligne. Deux
    // marches pour la même page en produiraient deux, chacune ayant sa propre
    // retenue (ADR-0030). La ligne nomme les maillons, pas leurs `cuid` :
    // c'est ce que `noms` achète, et sans lui le journal serait illisible sans
    // une console de base.
    expect(journal).toHaveLength(1)
    for (const structure of cycle) {
      expect(journal[0]).toContain(structure.name)
    }
  })

  it("donne à chaque ligne la Structure entière, hors arbre comprise", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const total = await prisma.category.count()

    // La boîte de suppression reçoit la lecture entière, et non la seule
    // branche : c'est ce qui lui permet de ne pas offrir une cible qui
    // refermerait la boucle — encore faut-il qu'elle voie le cycle (#550).
    expect(lignes.length).toBeGreaterThan(0)
    for (const ligne of lignes) {
      expect(ligne.candidats, `candidats de « ${ligne.nom} »`).toBe(total)
    }
  })
})

describe("AdminCategoriesPage — arbre propre", () => {
  it("rend une ligne par Structure, dans l'ordre et à la profondeur de l'arbre", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const noms = lignes.map((ligne) => ligne.nom)

    // Une ligne par Structure de la base, ni plus ni moins : la liste rend
    // **toutes** les Structures, et le hors arbre s'ajoute à l'arbre au lieu
    // d'en doubler une ligne. C'est la garde du critère « une ligne par
    // Structure » (#550) — et celle du doublon, qu'un `flatMap` trop généreux
    // produirait sans que rien d'autre ne le voie.
    const enBase = await prisma.category.findMany({ select: { name: true } })
    expect([...noms].sort()).toEqual(enBase.map((c) => c.name).sort())

    // L'ordre de la descente, et la profondeur de chaque ligne : la collation
    // française range les enfants, et la profondeur d'un enfant est celle de sa
    // parente plus un — une racine est à zéro.
    const arbreAttendu: [StructureCreee, number][] = [
      [arbre.racine, 0],
      [arbre.enfantA, 1],
      [arbre.petitA, 2],
      [arbre.enfantB, 1],
      [arbre.petitB, 2],
      [arbre.autre, 0],
    ]
    const mesNoms = new Set(arbreAttendu.map(([structure]) => structure.name))
    expect(noms.filter((nom) => mesNoms.has(nom))).toEqual(
      arbreAttendu.map(([structure]) => structure.name)
    )
    for (const [structure, profondeur] of arbreAttendu) {
      const ligne = lignes.find((candidate) => candidate.nom === structure.name)
      expect(ligne?.profondeur, `profondeur de « ${structure.name} »`).toBe(
        profondeur
      )
    }
  })

  it("garde le sous-titre d'une Structure saine : sa parente, ou sa racine", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const celluleDe = (structure: StructureCreee) =>
      lignes.find((candidate) => candidate.nom === structure.name)
        ?.premiereCellule ?? ""

    // Rien de ce que #550 ajoute ne doit changer une ligne saine : une
    // descendante nomme toujours sa parente, une racine reste une racine.
    expect(celluleDe(arbre.enfantA)).toContain(`sous ${arbre.racine.name}`)
    expect(celluleDe(arbre.racine)).toContain("Catégorie racine")
    for (const structure of Object.values(arbre)) {
      expect(celluleDe(structure)).not.toContain("hors arbre")
    }
  })
})
