/**
 * La Lecture de la Structure — le module serveur qui possède la lecture de la
 * Structure. Il lit la table `Category` **une fois par exécution**, en déduit
 * une Marche, et répond de ce qu'une surface demande ; la page d'accueil passe
 * par lui pour son arbre, la liste d'Administration pour ses lignes (#567), le
 * sélecteur des formulaires Produit pour ses options (#568), l'écran d'édition
 * pour la Structure qu'il édite et les parentes qu'il peut proposer (#572), la
 * page de catégorie pour la rangée qu'elle a demandée, son fil, ses
 * sous-catégories et le filtre de ses Produits (#570), et la fiche Produit pour
 * son seul fil d'Ariane (#571). **Aucune page de la boutique n'atteint plus la
 * table `Category` par ses propres moyens** : l'accueil, la catégorie et la fiche
 * passent toutes les trois par ici. Hors de ce module, il ne reste que les
 * lectures nommées plus bas — deux en production, une dans l'outillage — et
 * aucune n'est une page. Les autres surfaces y viendront une par une (#564).
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
 * **Une projection bâtit donc sa marche, et elle ne la partage avec personne.**
 * Cinq des six projections de ce module en bâtissent une — cinq `projeter…`,
 * chacun avec sa porte `lire…` qui ne fait que la lire : quatre en bâtissent
 * une elles-mêmes, la cinquième passe par la primitive du cœur. La sixième, le
 * sélecteur d'un formulaire, n'en bâtit aucune **et c'est délibéré** : un
 * sélecteur ne classe rien, donc un cycle ne l'atteint pas, et un éditeur doit
 * pouvoir choisir une rangée corrompue pour la réparer ; c'est la liste
 * d'Administration qui nomme le cycle, sur la surface faite pour le lire. Elles
 * ne sont pas appelées ensemble, mais par six écrans différents, et une marche partagée
 * supposerait une portée plus large que l'exécution — c'est-à-dire un état de
 * module, que ce module refuse par la règle ci-dessus. Le prix en est mesuré :
 * une ligne de journal par cycle et par écran qui le traverse, ce qui est
 * exactement ce que l'avertissement promet de dire.
 *
 * **La règle « une porte par écran » est gardée, pas seulement écrite.**
 * `lib/use-cases/lecture-structure-frontiere.test.ts` dérive les portes de la
 * source de ce module — les `export async function lire…` — et exige qu'aucune
 * page du dépôt n'en appelle deux, avec une contre-épreuve écrite dans un vrai
 * fichier ; les écrans d'Administration mesurent en plus leurs lectures au rendu
 * (US 23, US 29).
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
 * demandé.
 *
 * **Chaque projection rend la forme **étroite** que sa surface consomme, et une
 * porte peut en rendre plus d'une.** Le surensemble reste donc à six faits, et la
 * liste d'Administration le montre mieux que personne : ses lignes portent le nom
 * de la parente, les compteurs, la profondeur et la marque hors arbre, et **rien
 * d'autre**. Les deux listes que la boîte de suppression de chaque rangée propose
 * sont un fait d'une autre nature — des identifiants, et deux fois plus longs que
 * la ligne qui les reçoit — et elles ont donc leur **propre forme**,
 * `CiblesSuppression`, rendue par la même marche dans le même retour. Les porter
 * sur la ligne aurait fait porter à chaque rangée les cibles de toutes les autres :
 * une surface ne reçoit pas plus qu'elle n'a demandé (US 32).
 *
 * **Ce que cela ne fait pas, c'est supprimer le coût en props**, qui reste au
 * carré du nombre de Structures : une boîte par ligne, une liste de cibles par
 * boîte. Le spec l'a **consigné sans le traiter** — « une liste par Structure,
 * donc des props au carré […] consigné, pas décidé » (ADR-0030, § Further Notes,
 * « le coût, énoncé ») — et cette forme est **le lieu où il est énoncé** : passé
 * deux cents Structures, la partition devrait être hissée dans un module client
 * unique qui rendrait toutes les boîtes. Ce jour-là la forme se décide ici, dans
 * ce module, et non dans une page.
 *
 * **L'ordre est une promesse du module, et il est tenu en JavaScript.** Le
 * déploiement n'épingle aucune collation, donc un `orderBy` de la base n'est pas
 * un ordre que le module puisse garder : deux serveurs de base versions
 * différentes rendraient deux catalogues. Le tri se fait donc ici, avec le
 * comparateur que le **cœur** exporte — le nom en français, départagé par
 * l'identifiant, écrit une fois dans `lib/marche-structure.ts` — et non dans la
 * requête. Deux Structures de même nom se départagent donc par leur identifiant,
 * qui est unique : sans cela l'ordre total n'existerait pas, et la page se
 * réordonnerait d'une lecture à l'autre. Le comparateur est **repris tel quel**
 * plutôt que recopié ici : le cœur est le seul module qui ait à classer des
 * identifiants, et une promesse d'ordre qui se réécrit par projection est une
 * promesse que rien ne tient (US 5, US 31). Il est réexporté plus bas pour la même
 * raison que la primitive.
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
 * n'est une marche.
 *
 * **Une troisième lecture existe, et elle n'est pas une surface.** Le seed
 * (`prisma/seed.ts`) écrit les Structures, puis relit par slug la rangée qu'il
 * vient d'écrire pour y rattacher les Produits du jeu d'essai : c'est un outil
 * d'exploitation, lancé par un opérateur et jamais par une page, et ce qu'il
 * relit est une clé qu'il vient de poser, non un fait de catalogue. Elle est
 * nommée ici pour que « toute autre lecture de la Structure est une faute »
 * reste vrai sur tout l'arbre, `prisma/` compris — un seuil qui se tait sur un
 * fichier qu'il a sous les yeux est un seuil qui ne sait pas ce qu'il couvre.
 *
 * **Un seuil garde cette liste, et il dit aussi ce qu'il ne voit pas.** Les
 * lectures transactionnelles des mutations (`tx.category.findUnique`,
 * `client.category.findUnique` — `lib/use-cases/admin-structure.ts`) ne sont pas
 * des exceptions : ADR-0027 les laisse sous le verrou grossier, sur des faits
 * engagés. La forme du seuil les épargne donc — il reconnaît le délégué du client
 * partagé, pas le modèle — et c'est ce qui décide de sa forme : une expression
 * `/category\.findUnique/` les aurait attrapées, et la garde aurait été **fausse**
 * au lieu d'être verte. `lib/use-cases/lecture-structure-frontiere.test.ts` est ce
 * seuil, avec sa contre-épreuve : y ajouter un lecteur est un acte, et non un
 * oubli que l'on constate en CI.
 *
 * Volontairement sans `import "server-only"` : ce garde-fou lève sous vitest
 * (condition d'export `default`) et casserait la suite de ce module comme il a
 * cassé `devis.test.ts` et `orders.test.ts` (précédent :
 * `lib/use-cases/devis.ts`, `lib/panier.ts`). La barrière est une garde de
 * frontière, pas une directive : ce module atteint la base et aucun module
 * client ne doit l'atteindre — `lib/use-cases/lecture-structure-frontiere.test.ts`
 * le prouve sur l'ensemble des modules clients du dépôt, déduits de leur
 * directive et non d'une liste de noms (ADR-0028).
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
 * branche qu'il lui exclut, et que `projeterPageCategorie` (#570) rend d'une
 * seule marche le fil d'Ariane qu'une page montre *et* la descendance qui
 * décide de ses Produits — les deux en sens opposé, donc deux marches si on les
 * séparait, et deux lignes de journal pour une seule boucle. **La porte n'est
 * donc pas toujours la primitive réexportée** : quand une projection a déjà une
 * marche, elle lui demande `descendance()`, et la garantie « chaque Structure au
 * plus une fois » est celle de la Marche, transmise telle quelle. À l'autre bout
 * de la règle, `lireFilAriane` (#571) est bien **une question** : la fiche Produit
 * n'en pose qu'une, donc sa porte est une question, et la marche qu'elle bâtit ne
 * sert à rien d'autre qu'à son fil. Ce qui la distingue des deux projections
 * ci-dessus, en revanche, c'est qu'elle ne sert qu'à un écran qui n'existe
 * qu'avec une Structure — voir sa section.
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
 * de la marche des lignes. `complementDe` reste sans porte de lecture, et ce
 * n'est pas un oubli : aucune surface ne le réclame encore, et la première qui le
 * fera partage son écran avec une projection qui a déjà lu. C'est la porte de qui
 * n'a qu'une partition à demander, et c'est
 * `lib/marche-structure-partition.test.ts` qui l'éprouve, sur les mêmes littéraux.
 */
import { prisma } from "@/lib/db"
import {
  complementDepuis,
  comparerParNom,
  descendanceDe,
  liensDesStructures,
  marcheDesStructures,
  marcheStructure,
} from "@/lib/marche-structure"

export {
  complementDe,
  comparerParNom,
  descendanceDe,
  type PartitionStructure,
  type StructureOrdonnee,
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
 * Les faits groupés par parente, et les racines à côté : les frères **déjà
 * classés**, dans l'ordre du module.
 *
 * **L'ordre du module est celui du cœur, repris tel quel** : le nom en français,
 * puis l'identifiant. `comparerParNom` est écrit une fois, dans
 * `lib/marche-structure.ts`, et **ce n'est pas une commodité** — voir son
 * commentaire, et l'accord que la suite éprouve entre les **six** formes qu'elle
 * fait rendre côte à côte — arbre, lignes, cibles, puces, options, candidates,
 * soit les six projections qui classent, et pas le fil d'Ariane qui rend un
 * chemin (US 31). C'est ici que le module classe pour la première fois, et c'est donc
 * ici que la promesse se prend ; les tris des projections le reprennent, ils ne
 * le réécrivent pas.
 *
 * Deux projections en ont besoin — l'arbre d'accueil, qui range ses nœuds, et les
 * lignes de l'Administration, qui les parcourt — et les deux le faisaient chacune
 * de leur côté : deux regroupements, deux tris, donc deux occasions de diverger
 * sans qu'aucune épreuve ne s'en aperçoive. C'est ici qu'il est écrit une fois,
 * et il ne fait **rien d'autre** que regrouper et classer : le tri des hors arbre,
 * le placement et la profondeur restent aux projections, qui ne se ressemblent pas
 * sur ces trois points.
 *
 * **Une Structure dont le lien ne nomme aucune autre rangée est rendue comme une
 * racine**, et non perdue : elle est présente en base, et c'est à l'écran de dire
 * comment elle l'annonce. La clé étrangère garantit qu'une telle rangée n'existe
 * pas côté base ; le cas ne vient que de la porte pure, où l'appelant peut ne pas
 * couvrir toute la table.
 */
function regrouperParParente(structures: readonly FaitStructure[]): {
  parId: Map<string, FaitStructure>
  racines: FaitStructure[]
  groupes: Map<string, FaitStructure[]>
} {
  const parId = new Map(structures.map((fait) => [fait.id, fait]))
  const groupes = new Map<string, FaitStructure[]>()
  const racines: FaitStructure[] = []
  for (const fait of structures) {
    const parente =
      fait.parentId === null ? undefined : parId.get(fait.parentId)
    if (parente === undefined) {
      racines.push(fait)
      continue
    }
    const groupe = groupes.get(parente.id)
    if (groupe) groupe.push(fait)
    else groupes.set(parente.id, [fait])
  }
  racines.sort(comparerParNom)
  for (const groupe of groupes.values()) groupe.sort(comparerParNom)
  return { parId, racines, groupes }
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

  // Les faits regroupés par parente, les frères déjà classés, et rien de plus :
  // l'arbre d'accueil et la liste de l'Administration ont cette étape en commun, et
  // elle est écrite une fois.
  const { groupes, racines: faitsRacines } = regrouperParParente(
    structures.filter((fait) => !horsArbre.has(fait.id))
  )
  const noeudDe = (fait: FaitStructure): NoeudAccueil => noeuds.get(fait.id)!

  const racines = faitsRacines.map(noeudDe)
  for (const groupe of groupes.values()) {
    // Tous les enfants d'un groupe partagent la même parente — c'est ce qui fait
    // qu'un groupe est un groupe — donc le lien du premier les nomme tous.
    const fait = groupe[0]!
    const parente =
      fait.parentId === null ? undefined : noeuds.get(fait.parentId)
    const enfants = groupe.map(noeudDe)
    if (parente) parente.children.push(...enfants)
    else racines.push(...enfants)
  }

  // Les racines sont déjà classées — `regrouperParParente` les classe — sauf
  // celles que le cas dégradé vient d'y ajouter à la suite : le tri final les
  // remet dans l'ordre du module quoi qu'il arrive, pour que la promesse ne
  // dépende pas du cas que l'appelant a passé.
  racines.sort(comparerParNom)
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
 * L'écran de la liste des Structures (#567, #573)                            *
 * ======================================================================== *
 *
 * La liste d'Administration était la **seconde** implementation de la descente :
 * son propre bâtisseur d'arbre, sa propre profondeur, son propre compagnon pour
 * les Structures hors arbre, et deux tris — l'un qui portait l'ordre, l'autre qui
 * ne compensait rien. Elle est ici, dans la projection pure, à côté de l'arbre
 * d'accueil : même matière, même ordre, même règle de terminaison, et une seule
 * ligne de journal pour un cycle quel que soit le nombre de surfaces qui le
 * traverse.
 *
 * **L'écran rend deux formes, et c'est ce que la porte rend.** Les lignes d'une
 * part — ce qu'une rangée affiche —, les cibles de suppression d'autre part — ce
 * que la boîte de chaque rangée propose. Les deux sortent de la même lecture et de
 * la même marche, donc l'écran ne paie qu'une porte ; mais elles ne se mélangent
 * pas dans une forme large, parce qu'une ligne n'a rien à faire des cibles de sa
 * voisine et qu'une projection qui rend le tout à chacun ferait porter au carré
 * du nombre de Structures un fait que la rangée n'affiche pas (US 32). La
 * frontière est donc dans **le retour**, pas dans le nombre de portes.
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
 * **Ce que la ligne ne porte pas, et pourquoi.** Les deux listes de cibles que la
 * boîte de suppression propose n'y sont pas : elles sont deux fois plus longues
 * que la ligne, et ce sont des identifiants, pas des faits de la Structure. Une
 * ligne qui les portait ferait porter à chaque rangée d'une page les cibles de
 * toutes les autres — un fait qu'elle n'affiche pas et qu'aucun composant de
 * ligne n'a à lire. Elles ont donc **leur propre forme**, `CiblesSuppression`, que
 * la même projection rend au même endroit. L'écran les.range lui-même ; il rend
 * des faits, et il ne décide de rien.
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
}

/**
 * Les deux listes que la boîte de suppression d'une rangée propose, et rien
 * d'autre : l'identifiant de la rangée, puis ses deux listes.
 *
 * Ce sont les deux moitiés d'une **partition**, celle que le cœur pur calcule :
 * la première accueille un Produit et vaut **toute** Structure autre que
 * celle-ci — une descendante comprise, sans quoi déplacer un Produit serait plus
 * astreint que déplacer une sous-catégorie (US 16) ; la seconde accueille une
 * sous-catégorie et vaut ce qui ne descend pas d'elle, parce que l'y rattacher
 * refermerait la boucle sur elle-même (US 15).
 *
 * **Trois faits, et c'est tout ce qui franchit la couture** : deux tableaux de
 * chaînes, plus l'identifiant qui dit de quelle ligne ils sont. Aucune fonction,
 * aucun prédicat, aucune marche — la règle vit dans le cœur, qui se prouve sans
 * base, et la page n'a plus qu'à les nommer (ADR-0028, US 39, US 40).
 */
export interface CiblesSuppression {
  /** La Structure de la ligne dont ces cibles sont les deux listes. */
  id: string
  /** Où peut aller un Produit : toute Structure sauf celle-ci. */
  produits: string[]
  /** Où peut aller une sous-catégorie : ce qui ne descend pas d'elle. */
  sousCategories: string[]
}

/**
 * Ce que la liste d'Administration rend à son écran : **les lignes qu'il affiche,
 * et les cibles qu'il passe à chaque boîte**. Deux formes étroites, une seule
 * lecture, une seule marche, une seule ligne de journal par cycle.
 *
 * Les cibles viennent dans l'**ordre de la lecture**, c'est-à-dire dans celui de la
 * table comme elle a été lue — pas dans celui des lignes, qui est un pré-ordre et
 * n'a pas la même place pour chaque Structure. Ce n'est donc **pas** une
 * convention de jointure : la projection tient qu'il y a une cible par Structure,
 * jamais deux, jamais aucune, et l'écran les joint par identifiant. Lui garderait
 * l'ordre des lignes s'il le voulait, et rien dans la forme ne prétend le
 * contraire.
 *
 * **Le prix en props reste au carré du nombre de Structures**, et il est
 * énoncé plutôt que subi : une liste de cibles par ligne, sur une page qui a une
 * ligne par Structure. Un catalogue de quelques centaines de Structures rend cela
 * indifférent ; passé deux cents, il faudrait hisser la partition dans un module
 * client unique qui rendrait toutes les boîtes. C'est consigné dans ADR-0030
 * (§ Further Notes, « le coût, énoncé ») et **repris tel quel ici** : la forme
 * étroite rend le prix lisible là où il se paie, et non dispersé sur chaque ligne.
 */
export interface EcranAdminStructure {
  lignes: LigneStructureAdmin[]
  cibles: CiblesSuppression[]
}
/**
 * Ce que la liste d'Administration rend, projeté sur des faits déjà en mémoire —
 * la porte pure. C'est elle qui porte l'ordre de la page, le placement des
 * Structures hors arbre, et les deux listes de cibles que la boîte de suppression
 * de chaque ligne reçoit ; leur preuve ne coûte donc plus de base de données.
 *
 * **L'ordre est ici, et il est pré-ordre.** Les frères sont triés par le nom en
 * français puis par l'identifiant — l'ordre du module, repris du cœur tel quel —
 * et une Structure est rendue avant ses descendantes, dont elle est le repère de
 * lecture : un `flatMap` récursif sur des rangées que la base rend dans **l'ordre
 * de sa collation** ne produit un ordre que si les frères sont triés au préalable.
 * C'est ce tri-là qui doit survivre au déplacement, contrairement à celui du
 * compagnon hors arbre, qui n'existait que pour rattraper ce que la collation de la
 * base n'ordonnait pas comme la comparaison française. Les deux vivent désormais
 * ici, et ils sont un seul ordre.
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
 * fois — par `liensDesStructures`, la porte du cœur, et non par une carte
 * reécrite ici —, la marche bâtie une fois, et la retenue qui tait le cycle sert à
 * la fois au sous-ensemble hors arbre, à la ligne de journal et à toutes les
 * partitions.
 */
export function projeterEcranAdmin(
  structures: readonly FaitStructure[]
): EcranAdminStructure {
  // **Les faits déjà séparés, une seule fois, et par le cœur.** Les liens portent
  // les deux listes de cibles — `parentParId` toutes les Structures à offrir,
  // `noms` leur nom et leur ordre —, donc la marche les lit, et `complementDepuis`
  // s'en sert pour la même question sans rien relire. Les réécrire ici donnerait
  // deux cartes des liens et deux cartes des noms : deux sources de vérité pour le
  // même lien (ADR-0022).
  const liens = liensDesStructures(structures)
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
  ): LigneStructureAdmin => ({
    id: fait.id,
    name: fait.name,
    slug: fait.slug,
    image: fait.image,
    parentId: fait.parentId,
    nomParente:
      fait.parentId === null ? null : (liens.noms?.get(fait.parentId) ?? null),
    nombreProduits: fait.produitsDirects,
    nombreEnfants: enfantsParParente.get(fait.id) ?? 0,
    profondeur,
    horsArbre: hors,
  })

  // Les cibles, dans l'ordre de la **lecture** — pas dans celui des lignes, qui
  // est un pré-ordre et n'a pas la même place pour chaque Structure ; c'est
  // pourquoi la projection en tient une par Structure, et l'écran les joint par
  // identifiant. La partition est lue sur **la** marche de la projection : c'est
  // la même règle que celle que la boîte se calculait à chaque rendu dans un
  // composant client (#551, #573), et elle n'est écrite qu'ici et dans le cœur —
  // la structure du formulaire ne la réécrira pas.
  const cibles: CiblesSuppression[] = structures.map((fait) => {
    const partition = complementDepuis(marche, liens, fait.id)
    return {
      id: fait.id,
      produits: partition.horsSoi,
      sousCategories: partition.horsDescendance,
    }
  })

  // Les faits groupés par parente, les frères déjà classés, une fois — voir
  // `regrouperParParente`, que l'arbre d'accueil consomme aussi. La marche a
  // classé avant : hors arbre, une Structure n'appartient à aucune branche et se
  // rend à la suite, une fois.
  const { groupes, racines } = regrouperParParente(
    structures.filter((fait) => !horsArbre.has(fait.id))
  )

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
    .sort(comparerParNom)
    .map((fait) => ligneDe(fait, 0, true))

  return { lignes: [...lignes, ...horsLignes], cibles }
}

/**
 * L'écran de la liste des Structures — la porte de lecture.
 *
 * Une exécution, une lecture, une marche, une ligne par cycle : c'est la
 * surface qui rend la corruption visible à un être humain, donc celle dont le
 * journal doit dire juste. L'écran appelle cette méthode **une fois** et ne
 * construit plus de marche — il ne lui reste qu'à rendre les lignes, et à passer
 * à chaque boîte les deux listes que cette même lecture a calculées. Deux portes
 * auraient relu la table et dit le cycle deux fois (ADR-0030).
 */
export async function lireEcranAdmin(): Promise<EcranAdminStructure> {
  return projeterEcranAdmin(await lireToutesLesStructures())
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
 * `{ id, name }` s'en extrait en deux propriétés. Ce serait une faute, et pas
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
 * **Le tri passe avant la réduction, et non après.** Le départage des Structures de
 * même nom n'a plus de champ où se voir dans la forme rendue, donc le réduire
 * d'abord reviendrait à le jeter avec le reste : deux Structures de même nom
 * sortiraient alors dans l'ordre du tri instable du moteur, et l'ordre total que
 * le module promet aux autres projections disparaîtrait ici sans qu'on le voie. On
 * classe donc sur les faits — qui portent le nom et l'identifiant que le
 * comparateur regarde — puis on rend la forme étroite.
 *
 * Une copie avant le tri, parce que les faits appartiennent à la lecture qui
 * les a reçus : les classer sur place les classerait pour la projection qui les
 * utiliserait ensuite dans la même exécution.
 */
export function projeterOptionsSelecteur(
  structures: readonly FaitStructure[]
): OptionStructure[] {
  return [...structures].sort(comparerParNom).map((fait) => ({
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
  /**
   * Toutes les Structures, par identifiant et nom, dans l'ordre du module. La
   * forme est celle d'une option de sélecteur — les deux seuls faits qu'un
   * formulaire sait afficher — et non un type déclaré ici : deux listes de
   * `{ id, name }` écrites à deux endroits seraient deux copies d'un même fait.
   */
  candidates: OptionStructure[]
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
    // formulaire, donc une seule promesse d'ordre pour toutes les surfaces. Elle
    // n'est pas diminuée de la branche : c'est le formulaire qui soustrait, et le
    // module rend donc des faits, pas un verdict.
    candidates: [...structures].sort(comparerParNom).map((candidat) => ({
      id: candidat.id,
      name: candidat.name,
    })),
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

/* ======================================================================== *
 * La page de catégorie (#570)                                              *
 * ======================================================================== *
 *
 * La cinquième forme rendue, et la première qu'on appelle par une **adresse** :
 * la page de catégorie est jointe par son slug, et la Structure qu'elle rend
 * est un fait que le surensemble porte déjà. Elle était donc la seule des
 * surfaces à payer une rangée **de plus** pour se reconnaître — un
 * `findUnique({ where: { slug } })` — et c'est celle que le déplacement
 * supprime. C'est le seul gain visible de toute l'opération : il ne se voit pas
 * dans la page, il se voit dans le nombre de requêtes (#564).
 *
 * **Trois réponses, une seule marche, une seule ligne par cycle.** La page rend
 * la Structure qu'elle a demandée, le fil qui y mène, les sous-catégories qu'elle
 * propose en puces, et l'ensemble d'identifiants qui décide de ses Produits. Les
 * deux dernières réponses sont deux traversées **de sens opposé** — la remontée et
 * la descente — et c'est ce qui décide qu'elles ne sont pas deux projections :
 * chacune bâtirait sa marche, et une boucle déjà en base serait dite deux fois
 * dans une exécution qui n'a qu'une seule boucle à réparer (ADR-0030). D'où une
 * porte, comme pour l'écran d'édition (#572) : une porte par écran, qui répond à
 * tout ce que l'écran rend.
 *
 * **Le filtre des Produits n'est pas la primitive réexportée, et c'est
 * délibéré.** `descendanceDe` est bien le fait que le module expose — et c'est
 * ce qu'un écran d'édition exclut, où il n'y a rien d'autre à traverser. Ici la
 * même liste se poserait sur une marche déjà bâtie pour le fil d'Ariane : la
 * prendre par `descendanceDe` serait **une seconde marche**, donc une seconde
 * ligne de journal pour une seule boucle. Elle est donc lue par `descendance()`
 * sur **la** marche du fil, et la garantie que la primitive promet — chaque
 * Structure au plus une fois — voyage ainsi jusqu'à la requête, au lieu de
 * mourir avec la Marche qui l'a calculée.
 *
 * **Le fil est `ancetres`, pas `descendanceDe`, et l'ordre en est la
 * raison d'être.** Le cœur promet deux choses : la Structure et ses ancêtres, la
 * Structure courante **en dernier**, d'un côté ; la Structure et ses
 * descendantes, de l'autre. Un fil d'Ariane n'est pas une branche retournée :
 * c'est une chaîne **remontée**, et la remonter à l'envers donnerait les
 * descendantes triées par nom puis la Structure — un fil où l'on commence par
 * le bas et se retrouve au sommet. `ancetres` rend déjà l'ordre que la boutique
 * rendait à la main, donc l'appeler ne change rien à une page et ne touche pas
 * au cœur : la promesse est celle qui existait, elle a juste changé de maison
 * (US 3).
 *
 * **Les sous-catégories ne sont pas filtrées, et c'est la dégradation de la
 * boutique.** Elles viennent du lien — les Structures dont `parentId` est cette
 * rangée — sans le passage de `horsArbre` que l'arbre d'accueil fait. Une
 * Structure corrompue reste donc une puce de lien : elle est dans le fil
 * d'Ariane, elle est dans le filtre des Produits, et elle a sa place dans les
 * puces. La retirer serait une seconde façon de l'effacer de l'écran, pour une
 * surface qui n'a pas d'éditeur à qui nommer la faute — c'est la liste
 * d'Administration qui la rend lisible (#567).
 */

/**
 * **Un maillon de fil d'Ariane : le nom et le slug d'une Structure, rien
 * d'autre.** C'est la forme du seul lien de navigation de la boutique, et elle
 * est **nommée une fois** pour les deux surfaces qui rendent un fil — la page de
 * catégorie (#570) et la fiche Produit (#571). Deux listes de `{ name, slug }`
 * écrites à deux endroits seraient deux copies d'un même fait, donc deux
 * occasions de divergir sans qu'une épreuve ne s'en aperçoive (ADR-0022) ; et
 * `slug` y est indispensable, puisqu'il est l'adresse que le lien suit.
 */
export interface MaillonAriane {
  name: string
  slug: string
}

/**
 * **Une Structure telle qu'un lien la rend** : l'identifiant, le nom, le slug —
 * l'adresse que le lien suit — et l'image. C'est la forme des deux seules réponses
 * de la page qui sont des liens : la Structure demandée et chacune de ses
 * sous-catégories. La **déclarer une fois** n'est pas une décoration : deux types
 * `{ id, name, slug, image }` écrits à deux endroits seraient deux copies d'un
 * même fait, donc deux occasions de divergir sans qu'une épreuve ne s'en aperçoive
 * (ADR-0022).
 */
export interface StructureLiee {
  id: string
  name: string
  slug: string
  image: string | null
}

export interface PageCategorie {
  /** La Structure demandée, dans la forme **étroite** que la page rend. */
  categorie: StructureLiee
  /**
   * Le fil d'Ariane : la racine d'abord, la Structure demandée **en dernier**,
   * et chaque maillon une fois. C'est l'ordre que la Marche promet déjà, rendu
   * par `ancetres` — la boutique le rendait à la main, il le reçoit.
   */
  filAriane: MaillonAriane[]
  /** Les sous-catégories **directes**, dans l'ordre que le module promet. */
  enfants: StructureLiee[]
  /**
   * Les identifiants du filtre `categoryId: { in: … }` : la Structure et chacune
   * de ses descendantes, **chacune une fois** — la garantie de la règle de
   * terminaison, transmise telle quelle jusqu'à la requête.
   *
   * L'ordre n'en est pas un, et c'est délibéré : une liste passée à `in` ne se
   * compare à rien, et l'ordre de la traverse dépend de l'ordre dans lequel la
   * lecture a reçu les faits. Une surface qui la veut lisible triera les
   * Structure qu'elle rend, avec le comparateur du module.
   */
  idsProduits: string[]
}

/**
 * Les faits indexés par identifiant, bâtis une fois pour toute la projection.
 *
 * C'est ainsi que le lien de parenté se parcourt — et c'est aussi ainsi qu'une page
 * remonte son fil : `ancetres` rend des identifiants, et il faut leur nom et leur
 * slug. Les deux projections qui remontent un chemin partagent donc cet index, et
 * il ne sert à rien d'autre.
 *
 * **L'autre index, celui par slug, n'existe plus.** Il ne servait qu'à reconnaître
 * la Structure demandée, une fois par projection : le workbook d'identifiants le
 * ferait aussi bien en une passe, sur une table déjà en mémoire, et le construire
 * pour un seul usage était payer un index entier pour une lecture. C'est
 * `projeterPageCategorie` qui le cherche, et il le cherche une fois.
 */
function indexerParId(
  structures: readonly FaitStructure[]
): Map<string, FaitStructure> {
  return new Map(structures.map((fait) => [fait.id, fait]))
}

/**
 * Ce que rend la page de catégorie, projeté sur des faits déjà en mémoire — la
 * porte pure, où la règle se prouve sans PostgreSQL.
 *
 * **Ce qu'elle dégrade, et comment.** Un slug que les faits ne portent pas rend
 * une absence, pas une page : la Lecture dégrade et ne lève pas, et c'est la
 * page qui en fait un `notFound()` (ADR-0030). Un cycle, lui, ne rend pas
 * d'absence — la page reste rendable, son fil s'arrête sur la revisite, ses
 * sous-catégories restent là, et le journal nomme la boucle une fois.
 */
export function projeterPageCategorie(
  structures: readonly FaitStructure[],
  slug: string
): PageCategorie | null {
  // La Structure demandée est **trouvée**, pas lue : elle est un fait que la
  // Lecture a déjà en mémoire, et une requête de plus ferait de la page un second
  // propriétaire d'un même fait — celui que le déplacement vient de supprimer
  // (#570). La recherche est linéaire et le reste du parcours aussi, donc elle ne
  // coûte rien de plus que l'index qu'elle remplace.
  const fait = structures.find((candidat) => candidat.slug === slug)
  if (!fait) return null
  const parId = indexerParId(structures)

  // Une seule marche pour les deux traversées de sens opposé, donc une seule
  // ligne par cycle : la mémoire des cycles signalés vit dans la marche, et elle
  // meurt avec elle.
  const marche = marcheDesStructures(structures)

  return {
    categorie: {
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
    },
    // La remontée rend déjà la Structure courante en dernier. Chaque maillon
    // vient d'un fait en mémoire : la clé étrangère garantit qu'une parente
    // nommée existe en base, donc qu'elle est dans le surensemble, et la Marche
    // ne remonte qu'à travers des identifiants que les faits portent. La
    // projection ne transformerait donc pas une absence en nom inventé.
    filAriane: marche.ancetres(fait.id).map((id) => {
      const maillon = parId.get(id)!
      return { name: maillon.name, slug: maillon.slug }
    }),
    // Les enfants **directs**, dérivés du lien comme l'est le nombre de
    // sous-catégories d'une ligne d'Administration : la requête
    // `where: { parentId }` que la page faisait est un fait que les faits
    // portent déjà, et une lecture de plus serait une seconde manière de lire la
    // Structure. Le tri est celui du module — le nom en français puis
    // l'identifiant — donc les puces se lisent comme le reste de la boutique, et
    // non dans la collation d'un serveur de base qu'aucun déploiement n'épingle.
    // `filter` rend une copie : les faits appartiennent à la lecture, et les
    // classer sur place les classerait pour la projection qui les utiliserait
    // ensuite.
    enfants: structures
      .filter((candidat) => candidat.parentId === fait.id)
      .sort(comparerParNom)
      .map((enfant) => ({
        id: enfant.id,
        name: enfant.name,
        slug: enfant.slug,
        image: enfant.image,
      })),
    // La primitive, lue sur la marche du fil : la Structure et chacune de ses
    // descendantes, chacune une fois. C'est le même fait que rend
    // `descendanceDe`, pris sur une marche qui existe déjà — donc sans une
    // seconde ligne de journal pour une seule boucle.
    idsProduits: marche.descendance(fait.id),
  }
}

/**
 * La page de catégorie — la porte de lecture.
 *
 * Une exécution, une lecture, une marche, une ligne par cycle. La page appelle
 * cette méthode **une fois**, et ne construit plus de marche, ne relit plus la
 * table, ne tient plus en prose ni l'ordre du fil ni l'appartenance des
 * descendants (ADR-0030).
 */
export async function lirePageCategorie(
  slug: string
): Promise<PageCategorie | null> {
  return projeterPageCategorie(await lireToutesLesStructures(), slug)
}

/* ======================================================================== *
 * La fiche Produit (#571)                                                  *
 * ======================================================================== *
 *
 * La sixième forme rendue, et la plus étroite de toutes : un **fil
 * d'Ariane**. Elle ne demande qu'une chose à la Structure, et c'est ce qui
 * décide qu'elle a sa propre porte plutôt qu'un morceau de celle de la page de
 * catégorie — « une porte par écran », pas « une porte par projection » (voir
 * l'en-tête). Cette porte est donc **la porte de l'écran**, et non une question
 * de plus posée à une projection qui en porte trois.
 *
 * **Le fil est le même fait que celui de la page de catégorie, et il est rendu
 * de la même manière.** `ancetres` promet la racine d'abord et la Structure
 * courante en dernier ; `MaillonAriane` nomme la forme ; les deux surfaces
 * lisent donc une seule promesse, écrite une fois. Rien n'est réinventé ici : ce
 * qui change, c'est que la boutique ne bâtit plus sa marche, et que le fil
 * d'Ariane qu'elle rendait à la main vient de là où la page de catégorie prend
 * le sien (US 3).
 *
 * **Un Produit sans Structure ne demande rien, et c'est ce qui se décide hors
 * d'ici.** Une porte de lecture lit la table entière avant de savoir ce qu'elle
 * vient chercher : si elle acceptait l'absence, elle paierait sa lecture pour
 * rien, et le cas commun de la fiche Produit — le Produit dont la Structure a
 * été supprimée, qui est **vendu normalement** (ADR-0029) — deviendrait le cas
 * le plus cher de la page. Le court-circuit est donc **chez l'appelant**, sur le
 * fait qu'il tient déjà — le Produit a ou n'a pas de Structure — et la preuve
 * qu'il tient est une mesure, pas une phrase : `storefront.test.ts` compte les
 * lectures de la table et en attend **zéro** pour un Produit sans Structure.
 * Le module ne dégrade donc rien ici : il ne rend un fil vide que pour une
 * Structure que les faits ne portent pas.
 */
export function projeterFilAriane(
  structures: readonly FaitStructure[],
  idStructure: string
): MaillonAriane[] {
  // Une seule marche pour la seule traversée de cette projection : la retenue
  // qui tait un cycle vit dans la marche, et elle meurt avec elle. Une ligne
  // par cycle, donc, comme pour les cinq autres formes.
  const marche = marcheDesStructures(structures)
  // Les faits par identifiant, parce que c'est le lien de parenté qu'on remonte
  // et non une adresse qu'on cherche : c'est le seul index que cette projection
  // ait besoin de bâtir, et elle le partage avec la page de catégorie.
  const parId = indexerParId(structures)

  const maillons: MaillonAriane[] = []
  for (const id of marche.ancetres(idStructure)) {
    const fait = parId.get(id)
    // Une rangée que la table ne porte plus — une suppression entre la lecture
    // du Produit et celle-ci — rend une **absence**, pas un nom inventé : la
    // Lecture dégrade et ne lève pas (ADR-0030). Un `!` aurait fait de ce trou
    // une page cassée, pour une fenêtre de quelques millisecondes entre deux
    // requêtes. Le fil rendu est alors celui d'un Produit sans Structure, que la
    // page sait déjà déduire sans changer de code (ADR-0029) ; et il ne peut pas
    // être à moitié rempli : sans l'identifiant de départ, la remontée s'arrête
    // à lui, donc rien d'autre ne manque.
    if (fait === undefined) continue
    maillons.push({ name: fait.name, slug: fait.slug })
  }
  return maillons
}

/**
 * Le fil d'Ariane d'une fiche Produit — la porte de lecture.
 *
 * Une exécution, une lecture, une marche, une ligne par cycle : la fiche Produit
 * ne pose qu'une question à la Structure, donc elle n'a qu'une marche, donc un
 * cycle déjà en base ne dit qu'une ligne pour toute la page — comme pour les six
 * surfaces qui l'ont déjà fait (#566, #567, #568, #570, #572, #576).
 *
 * **Ce qu'elle ne fait pas, c'est décider.** Une Structure que les faits ne
 * portent pas rend un fil vide, et un Produit **sans** Structure ne doit rien
 * demander du tout. Le court-circuit est à l'appelant, sur un fait qu'il tient
 * déjà (ADR-0029, ci-dessus), et `storefront.test.ts` en mesure l'effet.
 */
export async function lireFilAriane(
  idStructure: string
): Promise<MaillonAriane[]> {
  return projeterFilAriane(await lireToutesLesStructures(), idStructure)
}
