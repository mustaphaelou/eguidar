/**
 * Liste des catégories — test de rendu : fixtures réelles en base, rendu via
 * `renderToReadableStream`, assertions sur le HTML.
 *
 * **Ce qui reste ici est ce que cette suite seule peut prouver** (#564, US 49) :
 * que la page rend **toutes** les Structures d'une base réelle, et qu'elle les
 * rend comme le veut le glossaire — « hors arbre » pour ce qu'aucune branche
 * n'atteint, « sous … » et « Catégorie racine » pour le reste. L'ordre des lignes
 * et la profondeur d'une ligne ne sont plus asserts ici : ils sont devenus des
 * faits que le module promet, et leur preuve est dans
 * `lib/use-cases/lecture-structure.test.ts`, sur des littéraux et sans base. Une
 * assertion qui lisait le retrait d'une ligne disait « ce retrait vaut 1,5 »
 * plutôt que « cette Structure est à deux niveaux » — donc elle épousait la mise
 * en page au lieu d'éprouver un fait de Structure (US 42).
 *
 * C'est aussi la seule place où le journal de la page s'écoute de bout en bout :
 * une seule ligne pour le cycle, parce qu'une seule marche a été bâtie, et parce
 * que la projection en bâtit une seule pour toutes ses questions (ADR-0030).
 *
 * `DeleteCategoryButton` est remplacé par un stub : la boîte a sa propre suite,
 * et une suite de rendu de composant ne prouve pas ce qu'une suite de composant
 * prouve déjà. Le stub dit ce que la page lui donne à voir — **les deux listes de
 * cibles et la table des noms**, cycle compris — sans quoi une cible qui refermerait
 * la boucle lui resterait offerte, et sans quoi la couture client/serveur
 * (#573, ADR-0028) n'aurait ici aucun témoin.
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

/**
 * Le stub de la boîte : il rend **les props telles qu'elles sont reçues**, en JSON
 * dans un attribut, et rien d'autre.
 *
 * **Pourquoi du JSON dans le HTML.** C'est le seul endroit du dépôt où la couture
 * client/serveur de la boîte est observée de bout en bout : la page est un
 * composant serveur, la boîte est un composant client, et ce qui passe entre les
 * deux est sérialisé. Écrire les props telles quelles permet à l'épreuve de
 * reparcourir ce qui a **effectivement** franchi — et d'y voir qu'une liste
 * d'identifiants et une table de noms, jamais une fonction, jamais une marche,
 * jamais un `Set` (ADR-0028, US 40).
 */
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

/**
 * L'arbre propre de cette suite. Ses noms sont choisis pour que la collation
 * française de l'écran soit celle qu'on lit ici — « Liste 550 A » … « Liste
 * 550 F » — et pour qu'aucune autre suite ne les plante :
 *
 *   Liste 550 A ─┬─ Liste 550 B ─── Liste 550 D
 *                └─ Liste 550 C ─── Liste 550 E
 *   Liste 550 F
 *
 * La forme est ce qu'elle est — une profondeur d'enfant égale à celle de sa
 * parente plus un, une racine à zéro — mais cette suite ne l'assert plus : elle
 * rend un HTML, et un HTML ne dit pas la profondeur d'une Structure, seulement
 * le retrait que l'écran lui donne. La forme est prouvée sur des faits, dans la
 * suite du module.
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
  /** La première cellule, texte seul : le nom et ce que la ligne dit de sa
   *  place — « sous … », « Catégorie racine », ou la marque hors arbre. */
  premiereCellule: string
  /** Les deux listes de cibles que la boîte de la ligne a reçues, relues depuis
   *  le JSON qu'elle a reçu — donc depuis ce qui a réellement franchi la couture. */
  ciblesProduits: string[]
  ciblesSousCategories: string[]
  /** La table des noms, relue de la même façon. */
  nomsStructures: Record<string, string>
}

/** L'attribut `data-*` d'une valeur JSON, reparsée ; `[]` s'il est absent. */
function jsonDe(html: string, attribut: string): string[] {
  const brut = new RegExp(`${attribut}="([^"]*)"`).exec(html)?.[1] ?? "[]"
  // Le HTML échappe les guillemets d'un attribut : `renderToReadableStream` rend
  // le JSON avec `&quot;`, qu'il faut rétablir avant de reparcourir.
  return JSON.parse(brut.replaceAll("&quot;", '"')) as string[]
}

/** L'attribut `data-*` d'un objet JSON, reparsé ; `{}` s'il est absent. */
function objetDe(html: string, attribut: string): Record<string, string> {
  const brut = new RegExp(`${attribut}="([^"]*)"`).exec(html)?.[1] ?? "{}"
  return JSON.parse(brut.replaceAll("&quot;", '"')) as Record<string, string>
}

/** Le texte d'un fragment de HTML, balises et commentaires React en moins. */
function sansBalises(fragment: string): string {
  return fragment
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Les lignes du corps du tableau, dans l'ordre rendu. Le nom et la première
 * cellule se lisent dans le HTML : le premier est la seule `span` en
 * `font-medium` de la ligne, la seconde tout ce qu'elle dit de sa place.
 *
 * **La profondeur ne se lit plus ici.** Elle se lit dans le `padding-left` que
 * l'écran applique, et une assertion sur ce retrait affirmerait « ce retrait vaut
 * 1,5 » — ce qu'elle n'affirme pas. Elle disait « cette Structure est à deux
 * niveaux », ce qui est un fait de Structure : sa preuve est désormais dans la
 * suite du module, sur des littéraux et sans base (#567, US 42).
 */
function lignesDuRendu(html: string): LigneRendue[] {
  const corps = /<tbody[^>]*>([\s\S]*)<\/tbody>/.exec(html)?.[1] ?? ""
  return corps
    .split("<tr")
    .slice(1)
    .map((ligne) => ({
      nom: /<span class="font-medium">([^<]*)<\/span>/.exec(ligne)?.[1] ?? "",
      premiereCellule: sansBalises(ligne.split("</td>")[0] ?? ""),
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

  it("donne à chaque boîte deux listes de cibles, et rien d'appelable", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)
    const enBase = await prisma.category.findMany({
      select: { id: true, name: true },
    })
    const tousLesIds = enBase.map((structure) => structure.id)

    expect(lignes.length).toBeGreaterThan(0)
    for (const ligne of lignes) {
      // **Ce qui a franchi la couture, reparcouru.** La boîte est un composant
      // client : ce qu'elle reçoit est sérialisé. La reparsir depuis le JSON qu'elle
      // a reçu est donc le seul moyen de voir la couture de bout en bout — et ce
      // qu'elle dit tient en une ligne : des tableaux de chaînes et une table de
      // chaînes (ADR-0028, US 40). Une fonction, une marche ou un `Set` n'aurait pas
      // pu s'écrire dans ce HTML, et c'est ce que la suite du composant affirme de
      // son côté sur ses props.
      for (const liste of [ligne.ciblesProduits, ligne.ciblesSousCategories]) {
        for (const valeur of liste) expect(typeof valeur).toBe("string")
      }
      for (const nom of Object.values(ligne.nomsStructures)) {
        expect(typeof nom).toBe("string")
      }

      // Un Produit part vers **toute** Structure autre que celle-ci, descendantes
      // comprises : c'est ce qui distingue sa liste de celle des sous-catégories,
      // et une liste qui les confondrait ferait porter à un Produit une règle qui
      // n'est que celle des sous-catégories (US 16). Le compte est donc le nombre
      // de Structures de la base moins une — la ligne elle-même.
      const lignesRendues = lignes.length
      expect(ligne.ciblesProduits, `produits de « ${ligne.nom} »`).toHaveLength(
        tousLesIds.length - 1
      )

      // La liste des sous-catégories est un sous-ensemble de celle-là : elle s'y
      // retrouve par appartenance, pas par soustraction — l'écart entre les deux
      // est la branche, et sa règle est prouvée dans
      // `lib/marche-structure-partition.test.ts`, sans rendu.
      for (const cible of ligne.ciblesSousCategories) {
        expect(ligne.ciblesProduits, cible).toContain(cible)
      }

      // Et la table des noms porte toute la table : c'est elle qui rend chaque
      // cible lisible, donc une cible sans nom serait un `cuid` dans un sélecteur
      // (US 18).
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

    // L'écart se voit sur l'arbre propre, où la descendance est connue sans avoir
    // à la recalculer : `Liste 550 D` est enfant de `Liste 550 B`, donc la boîte de
    // `Liste 550 B` ne peut pas l'accueillir — elle le proposerait pour recevoir la
    // sous-catégorie qu'elle est elle-même.
    const ligneB = parNom.get(arbre.enfantA.name)!
    expect(ligneB.ciblesSousCategories).not.toContain(arbre.petitA.id)
    // Et il reste bien une cible de Produit : les deux listes ne se ressemblent
    // pas, et c'est la règle de la spec (US 16).
    expect(ligneB.ciblesProduits).toContain(arbre.petitA.id)
  })

  it("propose une Structure du cycle comme Structure d'accueil des sous-catégories", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)

    // **La divergence d'ADR-0030, à la couture.** Les maillons d'un cycle sont les
    // descendants les uns des autres — la règle de terminaison de la marche les
    // atteint chacun une fois — donc aucun d'eux ne peut accueillir les
    // sous-catégories d'un autre : c'est un **fait**, la seule raison pour laquelle
    // ils disparaissent de ces listes, et la partition s'arrête là.
    //
    // Une Structure **saine**, elle, garde le cycle dans les deux listes : elle
    // n'a aucun maillon de boucle dans sa branche, donc rien à écarter. La page ne
    // filtre donc pas le cycle d'elle-même, elle rend ce qu'elle a calculé. Le
    // serveur refusera une cible dont la chaîne referme la boucle — lui seul le
    // sait, et lui seul lève `CategoryAncestorCycleError` — mais la cible reste
    // **proposée** (ADR-0030, US 17). Une page qui écartait le cycle d'elle-même
    // rendrait les deux surfaces identiques, et c'est ce que la décision exclut.
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
      // Ce qui reste, en revanche, est bien proposé : ce n'est pas un refus, c'est
      // une liste de cibles qui n'a simplement personne à nommer de sa branche.
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

    // **Une lecture pour deux formes rendues.** C'est l'écran le plus lourd du
    // dépôt sur cette table — une ligne par Structure, et deux listes de cibles
    // par ligne — donc c'est lui qui rend la règle coûteuse : si les cibles
    // avaient leur propre porte, ce compte serait deux. Les prendre séparément
    // aurait relu la table et rebâti une marche par ligne, donc dit le cycle
    // autant de fois qu'il y a de lignes sur l'écran (US 23, ADR-0030).
    expect(lectures).toBe(1)
  })
})

describe("AdminCategoriesPage — arbre propre", () => {
  it("rend une ligne par Structure de la base", async () => {
    const { html } = await rendreLaListe()
    const lignes = lignesDuRendu(html)

    // Une ligne par Structure de la base, ni plus ni moins : la liste rend
    // **toutes** les Structures, et le hors arbre s'ajoute à l'arbre au lieu
    // d'en doubler une ligne. C'est la garde du critère « une ligne par
    // Structure » (#550) — et celle du doublon, qu'un `flatMap` trop généreux
    // produirait sans que rien d'autre ne le voie. Elle ne peut le dire que
    // d'ici : elle relit la base, et c'est le seul endroit où les deux listes se
    // rencontrent.
    const enBase = await prisma.category.findMany({ select: { name: true } })
    expect([...lignes.map((ligne) => ligne.nom)].sort()).toEqual(
      enBase.map((categorie) => categorie.name).sort()
    )
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
