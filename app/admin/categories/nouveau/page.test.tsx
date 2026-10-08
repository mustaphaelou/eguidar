/**
 * Écran de création d'une Structure — test de rendu : fixtures réelles en base,
 * `CategoryForm` remplacé par un stub qui dit ce qu'on lui a donné, rendu via
 * `renderToReadableStream`, assertions sur le HTML.
 *
 * **Ce que cette suite peut prouver, et elle seule.** L'écran ne pose qu'une
 * question — « quelles Structures puis-je proposer comme parente ? » — et elle
 * traverse donc le seul chemin qui reste à éprouver : une **base réelle** jusqu'au
 * formulaire. Ce qu'elle épingle tient dans quatre faits : le formulaire reçoit
 * une option par Structure de la table, chaque option ne porte que l'identifiant
 * et le nom, une Structure qu'aucune branche n'atteint reste **offerte**, et
 * l'écran ne lit la table qu'une fois. Aucun ne se verrait d'ailleurs : tous les
 * quatre sont des accidents d'interface, et ils ne se voient qu'en traversant
 * l'interface.
 *
 * **L'ordre n'est pas asservé ici.** C'est une promesse du module, prouvée sur
 * des faits dans `lib/use-cases/lecture-structure.test.ts` (US 31) ; l'épingler à
 * travers un formulaire client dirait « le sélecteur rend ce classement », ce qui
 * n'est pas le fait qu'un module promet (US 49). Le formulaire range d'ailleurs
 * sa liste dans un `Set` et n'en montre jamais la séquence.
 *
 * `CategoryForm` est un stub, comme dans la suite de l'écran d'édition : le vrai
 * formulaire rend ses options dans un portail qui ne s'ouvre qu'au clic, donc son
 * HTML serveur ne porte jamais la liste des parentes offertes. Le stub ne décide
 * rien — il **dit** ce qu'il a reçu, et c'est de là que la suite tire ses
 * attentes. La forme des options reste donc celle que l'écran a passée, non
 * celle que le formulaire aurait pu en faire.
 */
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
import {
  creerArbrePropre,
  creerStructure,
  planterUnCycleEnBase,
  type StructureCreee,
} from "@/test/structure-fixtures"

/**
 * L'arbre propre de cette suite, à côté d'un cycle. La forme est ce qu'elle
 * est — une descendante de profondeur deux, une racine à côté — mais elle est
 * choisie pour une raison : **ses liens sont desjoints et ses enfants existent**,
 * donc une lecture à compteurs aurait rendu pour chaque option des faits que le
 * formulaire ne lit pas. C'est ce qui rend la forme étroite prouvable ici plutôt
 * que déclarative : l'arbre offre les deux occasions de la désobéir.
 *
 *   Création A ─┬─ Création B ─── Création D
 *               └─ Création C ─── Création E
 *   Création F
 */
let arbre: Record<string, StructureCreee>
/** Le cycle planté à côté, pour qu'un arbre propre le côtoie sans le voir. */
let cycle: StructureCreee[]

/**
 * Le préfixe des Structures de cette suite, remis à la fixture partagée : le
 * nettoyage se fait par `startsWith`, sans liste d'identifiants à tenir à jour
 * (#546). Il porte un jeton par exécution, comme les slugs des autres suites.
 */
const PREFIXE = `creation-576-${randomUUID().slice(0, 8)}-`

async function rendreLEcran(): Promise<{ html: string; journal: string[] }> {
  // Le cycle est en base : chaque rendu le traverse. L'épreuve qui écoute ce
  // journal le reçoit ; les autres le taisent pour ne pas déborder dans la
  // sortie de la suite.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const stream = await renderToReadableStream(<NewCategoryPage />)
    const html = await new Response(stream).text()
    return {
      html,
      // Le filtre sur le littéral est ce qui rend l'attente exacte : une autre
      // alerte ne la ferait pas tomber.
      journal: warn.mock.calls
        .map((appel) => appel.join(" "))
        .filter((ligne) => ligne.includes("[marche-structure]")),
    }
  } finally {
    warn.mockRestore()
  }
}

/** Les options que l'écran a passées au formulaire, dans l'ordre reçu. */
function optionsDuRendu(html: string): { id: string; name: string }[] {
  const attribut = /data-offertes="([^"]*)"/.exec(html)?.[1] ?? ""
  // Le séparateur `~` ne figure dans aucun nom de Structure de cette suite :
  // c'est ce qui permet de relire une option sans l'analyser.
  return attribut
    ? attribut.split("|").map((entree) => {
        const [id, nom] = entree.split("~")
        return { id: id ?? "", name: nom ?? "" }
      })
    : []
}

/**
 * Une **lecture complète** : le `findMany` que rien ne borne, celui qui parcourt
 * la table entière. Ce qui borne une lecture, c'est son `where` — un `where`
 * vide, lui, vaut « toutes les rangées » chez Prisma et compte donc.
 */
function estUneLectureComplete(args: { where?: object } | undefined): boolean {
  if (!args?.where) return true
  return Object.keys(args.where).length === 0
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

  // Le cycle arrive comme il arrive en vrai : une Tierce partie le referme en
  // base, hors de toute mutation de Structure (ADR-0027). Il est planté **à
  // côté** de l'arbre propre, et l'épreuve de l'arbre propre vérifie que sa
  // présence ne change rien à l'offre d'un arbre sain.
  cycle = [
    await creerStructure({ name: "Création boucle A", prefix: PREFIXE }),
    await creerStructure({ name: "Création boucle B", prefix: PREFIXE }),
    await creerStructure({ name: "Création boucle C", prefix: PREFIXE }),
  ]
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

describe("NewCategoryPage — le sélecteur de parente", () => {
  it("offre une option par Structure de la base, par son identifiant et son nom", async () => {
    const { html } = await rendreLEcran()

    expect(html).toContain('data-testid="formulaire-structure"')
    // L'identité des options, pas leur ordre : l'ordre est la promesse du module
    // et se prouve sur des faits, sans base.
    const options = optionsDuRendu(html)
    const enBase = await prisma.category.findMany({
      select: { id: true, name: true },
    })
    expect([...options].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...enBase].sort((a, b) => a.id.localeCompare(b.id))
    )
    // L'arbre entier est offert, y compris ses feuilles : une Structure sans
    // descendante est une parente aussi valide qu'une autre, et c'est à
    // l'éditeur qu'il appartient de choisir où une Structure neuve s'accroche.
    for (const structure of Object.values(arbre)) {
      expect(options).toContainEqual({
        id: structure.id,
        name: structure.name,
      })
    }
  })

  it("ne donne au formulaire que l'identifiant et le nom : ni compteur, ni nom de parente", async () => {
    const { html } = await rendreLEcran()

    // **La forme étroite, vérifiée sur ce qu'un composant a reçu.** Une option
    // est une `SelectItem` : elle affiche un nom et renvoie un identifiant,
    // donc ce sont les deux seuls faits qu'elle a le droit de porter. L'écran
    // lisait la rangée entière — deux agrégats, une jointure de parente — et la
    // passait telle quelle : le formulaire payait trois faits qu'il ne lit pas,
    // et rien dans le dépôt ne l'aurait su, puisque ses props déclarent la forme
    // étroite. `data-champs` est l'union des clés de toutes les options : un
    // fait de plus, sur une seule option, y apparaît.
    expect(/data-champs="([^"]*)"/.exec(html)?.[1]).toBe("id,name")
    // Et l'union n'est pas vide par hasard : l'écran a bien proposé des
    // options, sans quoi cette attente tiendrait sur une suite qui n'offre rien.
    expect(optionsDuRendu(html).length).toBeGreaterThan(0)
  })

  it("offre une Structure qu'aucune branche n'atteint, et ne dit rien du cycle", async () => {
    const { html, journal } = await rendreLEcran()

    // Un sélecteur **propose**, il ne dégrade pas : une Structure prise dans un
    // cycle garde sa place parmi les options, parce qu'elle est précisément ce
    // qu'un éditeur doit pouvoir choisir pour la réparer. La retirer du sélecteur
    // la ferait disparaître de l'Administration — la boutique efface un cycle,
    // le formulaire le propose, et le serveur seul refuse (ADR-0030).
    const options = optionsDuRendu(html)
    for (const structure of cycle) {
      expect(options, structure.name).toContainEqual({
        id: structure.id,
        name: structure.name,
      })
    }

    // Et l'écran ne **journalise** rien : il ne classe rien, donc il ne bâtit
    // aucune marche, donc il n'a aucun cycle à signaler. Le cycle se dit une
    // fois, par la liste d'Administration — la surface faite pour le rendre
    // lisible. Une ligne ici ajouterait une seconde ligne pour le même cycle, et
    // l'avertissement cesserait de dire combien de Structures à réparer.
    expect(journal).toEqual([])
  })

  it("lit la Structure une fois par rendu", async () => {
    const espion = vi.spyOn(prisma.category, "findMany")
    try {
      await rendreLEcran()

      // Une lecture, pas deux : l'écran a une question, donc une porte. Une
      // seconde lecture de la table serait un second propriétaire du même fait —
      // exactement ce que la Lecture de la Structure existe pour supprimer
      // (US 23, #564).
      expect(
        espion.mock.calls.filter(([args]) => estUneLectureComplete(args))
      ).toHaveLength(1)
    } finally {
      espion.mockRestore()
    }
  })
})
