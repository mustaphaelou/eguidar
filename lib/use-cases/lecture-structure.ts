/**
 * La Lecture de la Structure — le module serveur qui possède la lecture de la
 * Structure. Il lit la table `Category` **une fois par exécution**, en déduit
 * une Marche, et répond de ce qu'une surface demande ; la page d'accueil passe
 * par lui pour son arbre, la liste d'Administration pour ses lignes (#567), le
 * sélecteur des formulaires Produit pour ses options (#568), et l'écran d'édition
 * pour la Structure qu'il édite et les parentes qu'il peut proposer (#572). Les
 * autres surfaces y viendront une par une (#564).
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
 * **Cette dérivation est ce qui laisse l'Administration hors arbre payer juste
 * ce qu'elle demande** (#567). La liste de l'Administration a besoin d'un nom de
 * parente et d'un nombre de sous-catégories ; la boutique n'a besoin ni de l'un
 * ni de l'autre. Les lire — un `parent: { select }` et un `_count.children` —
 * les ferait payer à *toute* surface, sur la requête qu'elle fait déjà, et la
 * boutique verrait son coût monter pour une preuve qu'elle n'a pas demandée.
 * Dérivés, ils valent exactement ce que la base aurait rendu — la lecture prend
 * la table entière, sans `where`, donc `_count.children` et « les Structures dont
 * le lien est cette rangée » sont le même nombre, et `parent.name` et la carte
 * des noms sont le même texte — et personne ne paie un fait qu'il n'a pas
 * demandé. Le surensemble reste donc à six faits, et chaque projection rend la
 * forme **étroite** que sa surface consomme : une surface ne reçoit pas plus
 * qu'elle ne l'a demandé (US 32).
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
 *
 * **La primitive et son complément sont ici, et vivent en dessous.** Une
 * Structure et sa descendance, puis la partition qui en tire les deux listes
 * d'une page, sont des projections pures : aucune lecture, aucune promesse, aucun
 * état. Elles sont écrites dans `lib/marche-structure.ts` — le cœur neutre — et
 * réexportées ici, comme `devis.ts` réexporte `devis-coeur.ts`, pour qu'une
 * surface qui cherche « quelle projection répond à ma question » trouve une
 * seule adresse (US 54). Le cœur est leur domicile et non le hasard : ADR-0028
 * décide qu'une valeur partagée par le serveur et par le client habite un module
 * qu'aucun des deux ne réclame — et ce module lit la base, donc un composant
 * `"use client"` ne peut pas l'atteindre (ADR-0030).
 *
 * **Elles n'ont pas de porte de lecture, et c'est délibéré.** Une porte de
 * lecture par question relirait la table, et surtout rebâtirait une marche —
 * or la retenue qui tait un cycle **vit dans la marche** : une seconde marche
 * sur les mêmes faits dirait le même cycle une seconde fois. La règle n'est donc
 * pas « une porte par question », c'est **une porte par écran**, et elle
 * répond à tout ce que l'écran rend : c'est ainsi que `projeterEcranEdition`
 * (#572) rend d'une seule marche la Structure qu'un écran édite *et* la
 * branche qu'il lui exclut.
 *
 * **La liste d'Administration est l'exemple du piège, et c'est #573 qui l'a
 * fait tomber.** Elle a deux questions à poser aux mêmes faits — sous quoi est
 * cette Structure, où va un Produit, où va une sous-catégorie — et les prendre à
 * deux portes aurait relu la table et rebâti une marche par ligne. Une marche par
 * ligne ne se paie pas seulement en temps : la retenue qui tait un cycle meurt
 * avec elle, donc chaque ligne aurait dit le cycle **à son tour**, et
 * l'avertissement aurait annoncé à un éditeur autant de corruptions à réparer
 * qu'il y a de lignes sur son écran (ADR-0030, US 34). D'où `complementDepuis`,
 * qui prend la marche et les liens que la projection a déjà bâtis, au lieu de
 * `complementDe` qui en bâtit une nouvelle : les cibles de chaque ligne sortent
 * de la marche des lignes. `complementDe` reste la porte de qui n'a qu'une
 * partition à demander et rien d'autre à demander à la table — c'est
 * `lib/marche-structure-partition.test.ts` qui l'éprouve, sur les mêmes littéraux.
 */
import { prisma } from "@/lib/db"
import {
  complementDepuis,
  descendanceDe,
  marcheDesStructures,
  marcheStructure,
  type LiensStructure,
} from "@/lib/marche-structure"

export {
  complementDe,
  descendanceDe,
  type PartitionStructure,
} from "@/lib/marche-structure"

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
 * Ce que l'ordre du module classe : le nom d'une Structure et son slug. Les
 * projections qui rendent une liste ordonnée — l'arbre d'accueil, les lignes de
 * l'Administration, le sélecteur d'un formulaire et l'écran d'édition — comparent
 * donc **la même promesse**, écrite une fois, et non quatre comparateurs qui
 * pourraient diverger sans qu'aucune épreuve ne s'en aperçoive.
 */
interface StructureOrdonnee {
  name: string
  slug: string
}

/**
 * L'ordre que le module promet : le nom en français, puis le slug — unique, donc
 * total. Le tri est ici et non dans la requête, et le commentaire de l'en-tête
 * dit pourquoi.
 */
function comparerDesFreres(a: StructureOrdonnee, b: StructureOrdonnee): number {
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

/* ======================================================================== *
 * Les lignes de l'Administration (#567)                                     *
 * ======================================================================== *
 *
 * La liste d'Administration était la **seconde** implementation de la descente :
 * son propre bâtisseur d'arbre, sa propre profondeur, son propre compagnon pour
 * les Structures hors arbre, et deux tris — l'un qui portait l'ordre, l'autre qui
 * ne compensait rien. Elle est ici, dans la projection pure, à côté de l'arbre
 * d'accueil : même matière, même ordre, même règle de terminaison, et une seule
 * ligne de journal pour un cycle quel que soit le nombre de surfaces qui le
 * traverse.
 */

/**
 * Une ligne de la liste d'Administration : les faits qu'une rangée de Structure
 * porte, plus les **questions que la ligne pose sur sa propre place et sur ce
 * qu'elle pèse**.
 *
 * `profondeur` est le niveau dans l'arbre — une racine vaut zéro — et c'est un
 * fait, pas une mesure : l'écran en fait un retrait, cette interface ne promet
 * qu'un entier. `horsArbre` est la seule chose qu'une ligne doit à sa
 * provenance : une Structure qu'aucune racine n'atteint ne se range dans aucune
 * branche, donc elle ne se lit pas comme les autres (ADR-0030). `nomParente` est
 * le nom que `parentId` désigne, et `null` pour une racine comme pour un lien
 * que rien ne nomme — l'écran décide alors de ce qu'il en dit.
 *
 * Les deux compteurs sont **dérivés**, jamais lus : voir l'en-tête. Le lien, lui,
 * reste dans la ligne : c'est lui qui décide si elle annonce une parente ou une
 * racine, et une surface qui s'en passerait la devinerait.
 *
 * **Les deux listes de cibles sont la troisième question de l'écran**, et elles
 * ne sont pas ses lignes : ce sont les deux listes que la boîte de suppression de
 * la ligne propose, en identifiants, sans nom. La première accueille un Produit
 * et vaut **toute** Structure autre que celle-ci — une descendante comprise, sans
 * quoi déplacer un Produit serait plus astreint que déplacer une sous-catégorie ;
 * la seconde accueille une sous-catégorie et vaut ce qui ne descend pas d'elle,
 * parce que l'y rattacher refermerait la boucle sur elle-même. Elles sont donc le
 * complément de la primitive, rendu par ligne.
 *
 * **Le prix, énoncé au lieu d'être subi** : une liste par Structure, donc des
 * props au carré du nombre de Structures sur une page d'Administration. Un
 * catalogue de quelques centaines de Structures rend cela indifférent ; passé deux
 * cents, il faudrait hisser la partition dans un module client unique qui rendrait
 * toutes les boîtes. C'est consigné, pas décidé (ADR-0030, #564).
 */
export interface LigneStructureAdmin {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
  /** Le nom que `parentId` désigne, ou `null` — racine, ou lien non nommé. */
  nomParente: string | null
  /** Les **Produits directs** : le même fait que l'arbre d'accueil cumule. */
  nombreProduits: number
  /** Les sous-catégories directes : les Structures dont le lien est cette rangée. */
  nombreEnfants: number
  profondeur: number
  horsArbre: boolean
  /** Où peut aller un Produit : toute Structure sauf celle-ci. */
  ciblesProduits: string[]
  /** Où peut aller une sous-catégorie : ce qui ne descend pas d'elle. */
  ciblesSousCategories: string[]
}

/**
 * Les lignes de la liste d'Administration, projetées sur des faits déjà en
 * mémoire — la porte pure. C'est elle qui porte l'ordre de la page, le
 * placement des Structures hors arbre, et les deux listes de cibles que la boîte
 * de suppression de chaque ligne reçoit ; leur preuve ne coûte donc plus de base
 * de données.
 *
 * **L'ordre est ici, et il est pré-ordre.** Les frères sont triés par le nom en
 * français puis par le slug, et une Structure est rendue avant ses descendantes,
 * dont elle est le repère de lecture : un `flatMap` récursif sur des rangées que
 * la base rend dans **l'ordre de sa collation** ne produit un ordre que si les
 * frères sont triés au préalable — c'est ce tri-là qui doit survivre au
 * déplacement, contrairement à celui du compagnon hors arbre, qui n'existait que
 * pour rattraper ce que la collation de la base n'ordonnait pas comme la
 * comparaison française. Les deux vivent désormais ici, et ils sont un seul
 * ordre.
 *
 * **Rien ne se perd, et c'est un changement de règle.** Une Structure dont le
 * `parentId` ne nomme aucune autre rangée n'est plus **oubliée** : elle est
 * rendue, comme hors arbre, parce que c'est ce qu'elle est — présente en base,
 * absente de toute branche. Le bâtisseur d'arbre de l'écran ne la rendait pas du
 * tout, et rien dans son rendu ne disait qu'une rangée manquante.
 *
 * **Une seule marche répond à toutes ces questions, et c'est une contrainte, pas
 * une économie.** Les cibles de chaque ligne sont le complément de la primitive, et
 * le complément se calcule sur une marche : le calcul par la porte des rangées en
 * bâtirait une par ligne, donc autant de retenues, donc **autant de lignes de
 * journal pour le même cycle** — un avertissement qui annoncerait un cycle par
 * ligne alors qu'il n'y en a qu'un à réparer. Les liens sont donc séparés une
 * fois, la marche bâtie une fois, et la retenue qui tait le cycle sert à la fois
 * au sous-ensemble hors arbre, à la ligne de journal et à toutes les partitions.
 */
export function projeterLignesAdmin(
  structures: readonly FaitStructure[]
): LigneStructureAdmin[] {
  // **Les faits déjà séparés, une seule fois.** Les liens portent les deux listes
  // de cibles — `parentParId` toutes les Structures à offrir, `noms` leur ordre —,
  // donc la marche les lit, et `complementDepuis` s'en sert pour la même question
  // sans rien relire.
  const noms = new Map(structures.map((fait) => [fait.id, fait.name]))
  const liens: LiensStructure = {
    parentParId: new Map(structures.map((fait) => [fait.id, fait.parentId])),
    noms,
  }
  const marche = marcheStructure(liens)
  const horsArbre = new Set(marche.horsArbre())

  // Les deux noms que la ligne annonce, dérivés des faits qu'elle a déjà : le nom
  // de la parente par le lien, et le nombre de sous-catégories par le lien
  // inverse. Une lecture de plus — une jointure, un `COUNT` — coûterait à toutes
  // les surfaces alors que la table entière est déjà en mémoire.
  const enfantsParParente = new Map<string, number>()
  for (const fait of structures) {
    if (fait.parentId === null) continue
    enfantsParParente.set(
      fait.parentId,
      (enfantsParParente.get(fait.parentId) ?? 0) + 1
    )
  }

  const ligneDe = (
    fait: FaitStructure,
    profondeur: number,
    hors: boolean
  ): LigneStructureAdmin => {
    // **Une seule descendance par ligne, prise sur la marche de la projection.**
    // C'est la même règle que celle que la boîte se calculait à chaque rendu dans
    // un composant client (#551, #573), et elle n'est écrite qu'ici et dans le
    // cœur : la structure du formulaire ne la réécrira pas.
    const partition = complementDepuis(marche, liens, fait.id)
    return {
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
      parentId: fait.parentId,
      nomParente:
        fait.parentId === null ? null : (noms.get(fait.parentId) ?? null),
      nombreProduits: fait.produitsDirects,
      nombreEnfants: enfantsParParente.get(fait.id) ?? 0,
      profondeur,
      horsArbre: hors,
      ciblesProduits: partition.horsSoi,
      ciblesSousCategories: partition.horsDescendance,
    }
  }

  // Les faits groupés par parente, puis les frères triés une fois. Un `flatMap`
  // qui recursait sur les faits tels que la base les rendait — donc dans l'ordre de
  // sa collation — produirait une descente dont les frères sont dans cet ordre ;
  // les trier ici est ce qui fait du regroupement l'ordre promis.
  const faits = new Map(structures.map((fait) => [fait.id, fait]))
  const groupes = new Map<string, FaitStructure[]>()
  const racines: FaitStructure[] = []
  for (const fait of structures) {
    // La marche a déjà classé : hors arbre, une Structure n'appartient à aucune
    // branche et se rend à la suite, une fois.
    if (horsArbre.has(fait.id)) continue
    const parente =
      fait.parentId === null ? undefined : faits.get(fait.parentId)
    if (parente === undefined) {
      racines.push(fait)
      continue
    }
    const groupe = groupes.get(parente.id)
    if (groupe) groupe.push(fait)
    else groupes.set(parente.id, [fait])
  }
  racines.sort(comparerDesFreres)
  for (const groupe of groupes.values()) groupe.sort(comparerDesFreres)

  // La descente, sur une pile explicite : une chaîne de plusieurs milliers de
  // maillons est une forme ordinaire ici, et une descente récursive — celle que
  // portait le bâtisseur d'arbre de cet écran — la ferait tomber. La profondeur voyage
  // dans la pile, donc le coût de la récursion disparaît avec elle.
  const lignes: LigneStructureAdmin[] = []
  const pile: { fait: FaitStructure; profondeur: number }[] = []
  for (let rang = racines.length - 1; rang >= 0; rang -= 1) {
    pile.push({ fait: racines[rang]!, profondeur: 0 })
  }
  while (pile.length > 0) {
    const { fait, profondeur } = pile.pop()!
    lignes.push(ligneDe(fait, profondeur, false))
    const groupe = groupes.get(fait.id) ?? []
    for (let rang = groupe.length - 1; rang >= 0; rang -= 1) {
      pile.push({ fait: groupe[rang]!, profondeur: profondeur + 1 })
    }
  }

  // Et les Structures hors arbre, après l'arbre et à la racine : le même ordre
  // que lui, sans retrait, parce qu'aucune branche ne les porte. Le tri est ici
  // pour la même raison qu'au-dessus — la base ne l'ordonne pas comme la
  // comparaison française — et il ne double pas la descente : ces rangées ne sont
  // dans aucun groupe.
  const horsLignes = structures
    .filter((fait) => horsArbre.has(fait.id))
    .sort(comparerDesFreres)
    .map((fait) => ligneDe(fait, 0, true))

  return [...lignes, ...horsLignes]
}

/**
 * Les lignes de la liste d'Administration — la porte de lecture.
 *
 * Une exécution, une lecture, une marche, une ligne par cycle : c'est la
 * surface qui rend la corruption visible à un être humain, donc celle dont le
 * journal doit dire juste. L'écran appelle cette méthode une fois et ne construit
 * plus de marche — il ne lui reste qu'à rendre les lignes.
 */
export async function lireLignesAdmin(): Promise<LigneStructureAdmin[]> {
  return projeterLignesAdmin(await lireToutesLesStructures())
}

/* ======================================================================== *
 * Le sélecteur de Structure d'un formulaire (#568)                        *
 * ======================================================================== *
 *
 * La troisième forme rendue, et la plus étroite : un sélecteur affiche un nom
 * et renvoie un identifiant. Ce sont ses deux seuls faits, donc les deux seuls
 * qu'il a le droit de recevoir.
 *
 * **Elle ne vient pas de la liste d'Administration, et c'est un choix.** Réduire
 * `LigneStructureAdmin` aurait été la voie courte — la liste existe déjà, et
 * `{ id, name }` s'en extrait en deux properties. Ce serait une faute, et pas
 * seulement une maladresse : le formulaire payerait alors deux compteurs et un
 * nom de parente qu'il n'affiche pas, et surtout **chaque appelant devrait
 * réduire la liste lui-même**, donc la forme étroite à sa guise — et l'exigence
 * « pas un fait de plus » deviendrait une convention plutôt qu'un accord. Une
 * surface ne reçoit pas plus qu'elle ne l'a demandé (US 32) : la réduction est
 * ici, une fois, et la forme qu'elle rend est celle que le sélecteur consomme.
 *
 * **Elle n'est pas une marche, et c'est ce qui la distingue des deux autres.**
 * Un sélecteur ne classe rien : il n'a donc aucun cycle à dégrader, et aucune
 * raison de construire une marche qui en signalerait un. Une Structure dont le
 * lien ne mène nulle part — un cycle, une rangée orpheline — y garde sa place
 * comme les autres, parce qu'un éditeur doit pouvoir la **choisir pour la
 * réparer**. La boutique dégrade, le formulaire propose, et le serveur seul
 * refuse (ADR-0030) ; retirer la rangée d'un sélecteur reviendrait à la faire
 * disparaître de l'Administration alors qu'elle est précisément ce qu'un éditeur
 * vient réparer. Le cycle reste nommé une fois, par la liste d'Administration —
 * la surface faite pour le rendre lisible.
 */

/**
 * Une option de sélecteur : **l'identifiant et le nom d'une Structure**, et rien
 * d'autre. Ce n'est pas un fait abrégé de `FaitStructure` ni une ligne de
 * base : c'est la forme que le sélecteur rend, déclarée ici pour qu'un
 * formulaire et la page qui l'alimente n'aient plus à la déclarer entre eux
 * (ADR-0026, amendement).
 */
export interface OptionStructure {
  id: string
  name: string
}

/**
 * Les options d'un sélecteur de Structure, projetées sur des faits déjà en
 * mémoire — la porte pure.
 *
 * **Le tri passe avant la réduction, et non après.** Le départage par le slug
 * n'a plus de champ où se voir dans la forme rendue, donc le réduire d'abord
 * reviendrait à le jeter avec le reste : deux Structures de même nom sortiraient
 * alors dans l'ordre du tri instable du moteur, et l'ordre total que le module
 * promet aux deux autres projections disparaîtrait ici sans qu'on le voie. On
 * classe donc sur les faits, qui portent le nom et le slug, puis on rend la
 * forme étroite.
 *
 * Une copie avant le tri, parce que les faits appartiennent à la lecture qui
 * les a reçus : les classer sur place les classerait pour la projection qui les
 * utiliserait ensuite dans la même exécution.
 */
export function projeterOptionsSelecteur(
  structures: readonly FaitStructure[]
): OptionStructure[] {
  return [...structures].sort(comparerDesFreres).map((fait) => ({
    id: fait.id,
    name: fait.name,
  }))
}

/**
 * Les options du sélecteur de Structure d'un formulaire — la porte de lecture.
 *
 * La table entière, comme toute porte de ce module : elle lit le surensemble et
 * n'en garde que la forme étroite. Une `select: { id, name }` supplémentaire
 * serait une lecture de la Structure **de plus**, dans un module qui ne le serait
 * pas — donc un second propriétaire de cette lecture, exactement ce que le
 * déplacement vient de supprimer. Le prix de cet échange est énoncé dans
 * l'amendement d'ADR-0026 : deux agrégats et une jointure que ce sélecteur ne
 * regarde pas, contre une lecture de moins pour la table entière.
 *
 * **Cette porte n'est pas cachée, et c'est ce qui tient l'exigence de fraîcheur
 * qu'un formulaire pose.** Les écrans Produit de l'Administration sont dynamiques
 * — leur gabarit lit les cookies — et rien ici ne porte de directive de cache :
 * la lecture est faite à chaque exécution, donc une Structure créée dans
 * l'Administration est dans le sélecteur de l'autre formulaire dès la
 * navigation suivante. Une entrée `"use cache: remote"` autour changerait ce
 * contrat : elle ne serait plus fraîche que par invalidation d'étiquette, et
 * `invalidateStructure()` ne purge pas le chemin `/admin/produits`. Ce module
 * s'en tient donc à lire, et laisse à chaque page le soin de dire si elle veut
 * être cachée — une page ne le dit jamais par accident.
 */
export async function lireOptionsSelecteur(): Promise<OptionStructure[]> {
  return projeterOptionsSelecteur(await lireToutesLesStructures())
}

/* ======================================================================== *
 * L'écran d'édition d'une Structure (#572)                                  *
 * ======================================================================== *
 *
 * La quatrième forme que la Lecture rend, et la première qui ne soit ni une liste
 * à regarder ni un simple choix de parente : ce qu'un **formulaire** propose pour
 * une Structure. Les lignes d'Administration se parcourent, l'arbre d'accueil se
 * descend, le sélecteur d'un formulaire se parcourt ; ici la projection répond à
 * trois questions d'un formulaire — quelle Structure j'édite, quelles Structures
 * puis-je lui proposer comme parente, et lesquelles ne puis-je pas.
 *
 * **Une porte pour les trois, et c'est le fait central.** L'écran avait deux
 * questions, donc deux lectures possibles : la rangée qu'il édite, et la
 * branche qu'il exclut. Les prendre séparément aurait relu la table et aurait
 * surtout rebâti **deux marches** — donc deux lignes de journal pour un seul
 * cycle, et un avertissement qui aurait compté deux fois une boucle à réparer
 * une fois. Une porte, une lecture, une marche, une ligne par cycle : c'est
 * l'invariant que le module protège, et le formulaire reçoit sa liste sans rien
 * savoir de la marche qui l'a produite (ADR-0030).
 */

/**
 * La Structure qu'un écran édite, dans la forme **étroite** que le formulaire
 * rend : ni compte de Produits, ni profondeur, ni nom de parente — il ne les
 * montre pas, donc les lui faire porter serait lui payer une preuve qu'il n'a
 * pas demandée (US 32).
 */
export interface StructureEditable {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
}

/**
 * Ce que l'écran d'édition rend : la Structure qu'il édite, les candidates
 * qu'il propose, et les parentes qu'il ne peut pas proposer.
 *
 * **Les deux listes ne se rencontrent pas dans le module : la première est la
 * table entière, la seconde la branche.** C'est le formulaire qui construit son
 * `Set` et qui soustrait, donc la projection ne décide pas qui est écarté — elle
 * rend ce que la marche a parcouru et laisse la couture se fermer côté client,
 * comme ADR-0028 l'a décidé. Soustraire ici la branche serait décider la même
 * règle à deux endroits qu'aucune épreuve ne relierait, et une surface cliente
 * qui n'aurait pas ce module-ci devrait la réécrire (US 39, US 40).
 */
export interface EcranEditionStructure {
  /** La Structure éditée, dans la forme que le formulaire rend. */
  structureEditee: StructureEditable
  /** Toutes les Structures, par identifiant et nom, dans l'ordre du module. */
  candidates: { id: string; name: string }[]
  /** La Structure et ses descendantes : ce qu'un éditeur ne peut pas choisir. */
  parentesExclues: string[]
}

/**
 * Ce que l'écran d'édition rend, projeté sur des faits déjà en mémoire — la
 * porte pure, où la règle se prouve sans PostgreSQL.
 *
 * **La liste des parentes exclues est la primitive, exactement comme elle est.**
 * Elle est la Structure nommée **et** ses descendantes, chacune au plus une
 * fois : l'écran ajoutait la Structure à la main, et le module ne le fait plus,
 * donc le « elle-même comprise » ne peut pas s'oublier en chemin. Le retirer
 * rendrait l'écran capable de se proposer comme propre parente, donc de
 * refermer une boucle par un simple enregistrement.
 *
 * **Ce sont les seules questions de cette projection, et une seule marche y
 * répond.** Les candidates n'ont besoin que d'un tri, et la rangée éditée
 * d'une recherche ; les construire sur une marche leur aussi donnerait deux
 * lignes de journal pour un cycle, donc un avertissement qui ne dirait plus
 * combien de Structures toucher.
 */
export function projeterEcranEdition(
  structures: readonly FaitStructure[],
  id: string
): EcranEditionStructure | null {
  const fait = structures.find((structure) => structure.id === id)
  // Une rangée que la table ne porte plus — une suppression entre la lecture et
  // le rendu — ne devient pas une Structure imaginaire : la Lecture dégrade,
  // rend une absence, et c'est l'écran qui décide alors ce qu'il en dit
  // (ADR-0030). Elle ne lève donc pas, et ne demande même pas la branche : une
  // Structure absente n'a pas de descendance à exclure.
  if (!fait) return null

  return {
    structureEditee: {
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
      parentId: fait.parentId,
    },
    // La table entière, dans l'ordre que le module promet — le même comparateur
    // que pour l'arbre d'accueil, la liste d'Administration et le sélecteur d'un
    // formulaire, donc une seule promesse d'ordre pour quatre surfaces. Elle
    // n'est pas diminuée de la branche : c'est le formulaire qui soustrait, et le
    // module rend donc des faits, pas un verdict.
    candidates: [...structures]
      .sort(comparerDesFreres)
      .map((candidat) => ({ id: candidat.id, name: candidat.name })),
    parentesExclues: descendanceDe(structures, id),
  }
}

/**
 * L'écran d'édition d'une Structure — la porte de lecture.
 *
 * Une exécution, une lecture, une marche, une ligne par cycle. L'écran appelle
 * cette méthode **une fois** : il ne construit plus de marche, ne relit plus la
 * table, et ne porte plus en prose la promesse que le module tient ici
 * (ADR-0030).
 */
export async function lireEcranEdition(
  id: string
): Promise<EcranEditionStructure | null> {
  return projeterEcranEdition(await lireToutesLesStructures(), id)
}
