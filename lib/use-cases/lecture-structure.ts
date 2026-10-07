/**
 * La Lecture de la Structure — le module serveur qui possède la lecture de la
 * Structure. Il lit la table `Category` **une fois par exécution**, en déduit
 * une Marche, et répond de ce qu'une surface demande ; la page d'accueil passe
 * par lui pour son arbre, et les autres surfaces y viendront une par une
 * (#564).
 *
 * **C'est un module serveur, et il ne prétend pas être neutre : il lit la base.**
 * Ce qui est neutre est en dessous, dans `lib/marche-structure.ts` (ADR-0030).
 * La forme est celle que le dépôt connaît déjà — un cœur pur, une entrée
 * serveur au-dessus, comme `devis.ts` au-dessus de `devis-coeur.ts`.
 *
 * **Deux portes, et la seconde est celle qui se prouve.** Une question a deux
 * entrées : `lireArbreAccueil` lit et rend, `projeterArbreAccueil` ne fait que
 * dériver des faits déjà en mémoire. La lecture ignore donc comment les faits
 * sont arrivés, et la projection ignore d'où ils viennent — c'est ce qui rend
 * l'arbre prouvable sans PostgreSQL, un privilège qu'ADR-0030 revendiquait et
 * que la boutique ne livrait pas : la dégradation d'un cycle n'atteignait
 * jusqu'ici qu'à travers une lecture, donc qu'avec une base.
 *
 * **Une lecture, une marche, une ligne par cycle.** La marche porte la mémoire
 * des cycles qu'*elle* a signalés, donc une seule projection — une seule
 * instance — donne une seule ligne par cycle pour toute la lecture. C'est
 * l'invariant que le module doit protéger : une seconde marche sur les mêmes
 * faits, ou une seconde exécution de `lireArbreAccueil`, en dirait une seconde,
 * et l'avertissement cesserait de dire combien de Sections toucher. Le module ne
 * déduplique donc rien par lui-même — ni `Map` au niveau module, ni promesse
 * gardée, ni `AsyncLocalStorage`, que la documentation range parmi les causes de
 * blocage de build dans une portée cachée
 * (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md:697`).
 * Les faits vivent dans l'exécution qui les a lus et meurent avec elle ; la
 * déduplication d'une requête à l'autre est celle de l'entrée `"use cache"`
 * qui l'appelle, pas la sienne (#564, § hors périmètre).
 *
 * **Le surensemble porte six faits, et c'est tout ce dont les projections ont
 * besoin.** L'identité, le nom, le slug, l'image, le lien vers la parente, et
 * le nombre de **Produits directs**. Le nom n'y est pas pour l'affichage : c'est
 * lui que le journal nomme, et un avertissement qui n'énumère que des `cuid`
 * oblige à ouvrir une console de base pour être lu. Le compte direct non plus
 * ne sert pas l'affichage : l'arbre d'accueil annonce les Produits d'une
 * branche entière, donc il part du direct et cumule. Le nom de la parente et le
 * nombre de ses enfants, en revanche, **ne sont pas lus** : ils se dérivent en
 * mémoire de `parentId` et du nom, comme le fil d'Ariane le fait déjà, et une
 * jointure de plus serait une seconde manière de lire la Structure.
 *
 * **L'ordre est une promesse du module, et il est tenu en JavaScript.** Le
 * déploiement n'épingle aucune collation, donc un `orderBy` de la base n'est pas
 * un ordre que le module puisse garder : deux serveurs de base versions
 * différentes rendraient deux catalogues. Le tri se fait donc ici, avec la
 * comparaison que le dépôt écrit déjà en deux endroits
 * (`app/admin/categories/page.tsx`, `lib/options-de-filtre.ts`). Deux
 * Structures de même nom se départagent par leur slug, qui est unique : sans
 * cela l'ordre total n'existerait pas, et la page se réordonnerait d'une
 * lecture à l'autre.
 *
 * **Une boucle ne pend pas à une racine, et c'est ce qui rend le filtre
 * suffisant.** Chaque maillon d'un cycle a sa parente *dans* le cycle ; aucune
 * racine n'y mène donc, et le cycle avec ce qui y mène est exactement ce que
 * `horsArbre` rend. Un arbre d'accueil n'a donc pas besoin de savoir où il
 * s'arrête, ni d'une borne de profondeur : aucune profondeur maximale n'est une
 * règle de ce dépôt (ADR-0027). Pour la même raison le cumul des Produits ne
 * remonte pas : il verse chaque nœud dans sa parente en une passe, au lieu de
 * remonter chaque branche jusqu'à sa racine — un cumul qui remonterait coûterait
 * le carré de la profondeur, et la chaîne profonde est une forme ordinaire.
 *
 * **Ce module ne lit jamais dans une transaction, et ne rend jamais un fait
 * qu'une mutation ait à juger** (ADR-0027). Les lectures que les mutations
 * jugent sur des faits engagés — le verrou grossier, l'unicité du slug, le
 * contrôle de la parente, la chaîne d'ancêtres, les rangées de `create`,
 * `update` et `delete` — restent dans `lib/use-cases/admin-structure.ts`, sous
 * le verrou, et le verrou n'a de sens que dans une transaction : une lecture
 * faite hors transaction rend un fait committé, que le verrou garantit déjà.
 *
 * **Deux lectures de la Structure restent hors d'ici, et sont nommées ici pour
 * que la prochaine se lise comme une décision.** Ce sont les noms de Structure
 * d'une facette, lus par slug pour une distribution de résultats de recherche
 * (`lib/use-cases/search.ts` — la lecture traverse la couture du moteur et rend
 * une entrée qui n'est pas en base, ADR-0029), et le compte de Structures du
 * tableau de bord d'Administration (`lib/use-cases/admin-dashboard.ts`). Aucune
 * n'est une marche. Toute autre lecture de la Structure est une faute.
 *
 * Volontairement sans `import "server-only"` : ce garde-fou lève sous vitest
 * (condition d'export `default`) et casserait la suite de ce module comme il a
 * cassé `devis.test.ts` et `orders.test.ts` (précédent :
 * `lib/use-cases/devis.ts`, `lib/panier.ts`). La barrière est une garde de
 * frontière, pas une directive : ce module atteint la base et aucun module
 * client ne doit l'atteindre.
 */
import { prisma } from "@/lib/db"
import { marcheDesStructures } from "@/lib/marche-structure"

/**
 * Les faits d'une Structure tels que la Lecture les rend à ses projections :
 * ce que la table porte, plus le nombre de ses **Produits directs**. Le nom de
 * la projection est en français et le sien est `_count.products` — la trace
 * reste visible dans la lecture, la forme d'après ne l'est plus, et c'est le
 * module qui décide de la forme que ses projections reçoivent.
 */
export interface FaitStructure {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
  produitsDirects: number
}

/**
 * Un nœud de l'arbre d'accueil : une Structure, ses enfants, et le nombre de
 * Produits de **toute** sa branche — les siens et ceux de ses descendantes.
 *
 * `productCount` garde le nom que la page attendait : la projection a changé de
 * maison, pas le contrat que la page lit.
 */
export interface NoeudAccueil {
  id: string
  name: string
  slug: string
  image: string | null
  productCount: number
  children: NoeudAccueil[]
}

/**
 * L'ordre que le module promet : le nom en français, puis le slug — unique, donc
 * total. Le tri est ici et non dans la requête, et le commentaire de l'en-tête
 * dit pourquoi.
 */
function comparerDesFreres(a: NoeudAccueil, b: NoeudAccueil): number {
  return (
    a.name.localeCompare(b.name, "fr") || a.slug.localeCompare(b.slug, "fr")
  )
}

function trierLesFreres(noeuds: NoeudAccueil[]): void {
  noeuds.sort(comparerDesFreres)
}

/**
 * Le compte de Produits d'une branche entière, en une passe et sans remonter.
 *
 * Les nœuds sont empilés, visités par un parent avant ses enfants, puis lus à
 * l'envers : chaque nœud verse son compte dans celui de sa parente une fois que
 * ses enfants ont versé le leur. Le parcours va donc du plus petit au plus
 * grand, comme la récursion qu'il remplace — sans le tas qu'elle consommerait
 * sur une chaîne de plusieurs milliers de maillons.
 */
function cumulerLesProduits(racines: NoeudAccueil[]): void {
  const noeuds = new Map<string, NoeudAccueil>()
  const parenteDe = new Map<string, string>()
  const ordre: NoeudAccueil[] = []
  const pile: { noeud: NoeudAccueil; parente: string | null }[] = racines.map(
    (noeud) => ({ noeud, parente: null })
  )
  while (pile.length > 0) {
    const { noeud, parente } = pile.pop()!
    // Le filtre des Structures hors arbre rend l'arbre fini — une boucle ne peut
    // pas pendre à une racine — donc ce cas n'arrive pas. Il reste parce qu'une
    // boucle qui ne s'arrête pas sur une page d'accueil ne se débogue pas : elle
    // rend une page cassée, sans laisser de trace.
    if (noeuds.has(noeud.id)) continue
    noeuds.set(noeud.id, noeud)
    if (parente !== null) parenteDe.set(noeud.id, parente)
    ordre.push(noeud)
    for (const enfant of noeud.children) {
      pile.push({ noeud: enfant, parente: noeud.id })
    }
  }
  for (let i = ordre.length - 1; i >= 0; i -= 1) {
    const noeud = ordre[i]!
    const parente = parenteDe.get(noeud.id)
    if (parente !== undefined) {
      noeuds.get(parente)!.productCount += noeud.productCount
    }
  }
}

/**
 * L'arbre d'accueil, projeté sur des faits déjà en mémoire — la porte pure.
 *
 * **Ce qu'elle dégrade, et comment.** Une Structure qu'aucune racine n'atteint
 * n'a pas de place dans un arbre qui descend depuis les racines : elle en était
 * écartée avant que la Marche n'existe, et elle en est écartée maintenant pour
 * la même raison, avec une différence — elle est **nommée**. `horsArbre()`
 * journalise le cycle, une fois pour tout l'arbre, en nommant ses Structures
 * (ADR-0030). La boutique dégrade et rend sa page ; la mutation refuse, et
 * elle seule a un éditeur à qui rendre une faute.
 *
 * **Ce qu'elle ne fait pas.** Elle ne lit rien, ne trie rien que par le nom,
 * et ne promet aucun verdict : un cycle est ici une Structure hors arbre, pas
 * une donnée fautive.
 */
export function projeterArbreAccueil(
  structures: readonly FaitStructure[]
): NoeudAccueil[] {
  // Une seule marche pour toute la projection, donc une seule ligne par cycle :
  // la mémoire des cycles signalés vit dans la marche, et elle meurt avec elle.
  const marche = marcheDesStructures(structures)
  const horsArbre = new Set(marche.horsArbre())

  const noeuds = new Map<string, NoeudAccueil>()
  for (const fait of structures) {
    noeuds.set(fait.id, {
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
      // Le point de départ du cumul : les Produits de la Structure elle-même.
      productCount: fait.produitsDirects,
      children: [],
    })
  }

  const racines: NoeudAccueil[] = []
  for (const fait of structures) {
    if (horsArbre.has(fait.id)) continue
    const noeud = noeuds.get(fait.id)!
    // La clé étrangère garantit que la parente existe en base, donc qu'elle est
    // dans le surensemble : une parente absente ne se présente pas. Elle ne
    // peut pas non plus être hors arbre quand la Structure ne l'est pas —
    // l'absence d'un parent dans l'implique l'absence de l'enfant — donc un
    // nœud à qui il en manque ne se rencontre pas davantage.
    const parente =
      fait.parentId === null ? undefined : noeuds.get(fait.parentId)
    if (parente) parente.children.push(noeud)
    else racines.push(noeud)
  }

  trierLesFreres(racines)
  for (const noeud of noeuds.values()) trierLesFreres(noeud.children)
  cumulerLesProduits(racines)
  return racines
}

/**
 * La lecture complète de la Structure : six faits par Structure, en une seule
 * requête, et **sans `orderBy`**. L'ordre n'est pas laissé à la base parce
 * qu'aucune collation n'est épinglée au déploiement — c'est la projection qui
 * le promet, en JavaScript, et le dire ici évite qu'un `orderBy` paraisse être
 * un raccourci alors qu'il serait une promesse que le module ne peut pas tenir.
 */
async function lireToutesLesStructures(): Promise<FaitStructure[]> {
  const rangees = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  })
  return rangees.map((rangee) => ({
    id: rangee.id,
    name: rangee.name,
    slug: rangee.slug,
    image: rangee.image,
    parentId: rangee.parentId,
    produitsDirects: rangee._count.products,
  }))
}

/**
 * L'arbre d'accueil de la page d'accueil — la porte de lecture.
 *
 * Une exécution, une lecture, une marche, une ligne par cycle. C'est le seul
 * endroit où la table est lue pour cette question : la page appelle cette
 * méthode une fois, derrière son entrée `"use cache: remote"`, et la
 * déduplication d'une requête à l'autre est celle de cette entrée.
 */
export async function lireArbreAccueil(): Promise<NoeudAccueil[]> {
  return projeterArbreAccueil(await lireToutesLesStructures())
}
