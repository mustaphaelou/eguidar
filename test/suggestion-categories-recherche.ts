import { expect } from "vitest"

import type { IndexableProduct } from "@/lib/index-projection"
import type { MoteurRecherche, ReponseMoteur } from "@/lib/moteur-recherche"
import {
  searchSuggestions,
  type SearchSuggestionCategory,
  type SearchSuggestionsData,
} from "@/lib/use-cases/search"

/**
 * Le scénario de l'ordre des catégories que le Bandeau de navigation propose,
 * et la seule attente qu'il ait à tenir (#533).
 *
 * Le défaut qu'il épingle : les suggestions prenaient les **premières entrées**
 * d'une répartition, et un moteur rend ses valeurs de facette dans l'ordre
 * alphabétique des slugs — `#531` l'a mesuré et l'a épinglé en littéral
 * (`sortFacetValuesBy: { "*": "alpha" }`). Une recherche pour « tv » proposait
 * donc ce qui commence par A. La suite d'avant ne le voyait pas, parce que ses
 * sept fixtures se classaient **de la même façon dans les deux ordres** : le
 * premier par compte était aussi le premier alphabétique, et l'implémentation
 * qu'elle décrivait passait pour la bonne.
 *
 * Ce module existe donc pour rendre la désaccusation possible, et il vit dans
 * `test/` plutôt que dans une suite pour la raison que le contrat du Stockage
 * d'Image produit a déjà donnée : les assertions réellement identiques
 * méritent un seul endroit, et chaque suite garde ensuite ses propres
 * invariants — l'index réel, la base réelle — dans son propre fichier. Un module
 * de test ne doit pas être à la fois la spécification et sa propre preuve.
 *
 * **Ce module ne juge pas un moteur, et n'écrit aucun contrat entre les deux.**
 * ADR-0023 a refusé un contrat partagé : les deux moteurs divergent
 * réellement sur le classement et sur la faute de frappe, et un contrat
 * n'affirmerait que leur intersection. Ce que les deux suites font ici est plus
 * étroit et plus utile : chacune rejoue **le même jeu** et exige **la même
 * réponse écrite ici**. C'est la Recherche qui est affirmée, pas un moteur.
 */

/**
 * Les sept catégories du jeu, et le nombre de Documents que chacune porte.
 *
 * Les comptes sont **écrits**, et les Documents en sont dérivés — jamais
 * l'inverse. Un jeu dont les Documents seraient semés au hasard laisserait sa
 * répartition dépendre d'un ordre d'écriture, et l'attente ci-dessous aurait
 * deux vérités à tenir.
 *
 * Les comptes sont choisis pour que les deux ordres ne puissent pas coïncider :
 * la catégorie la plus jamais demandée est celle que l'alphabet place en
 * premier, et il y a une égalité à la limite du cinquième siège — deux
 * catégories à 2, puis trois à 1 pour un seul siège restant. Un jeu sans
 * égalité ne prouverait rien du départage, et un jeu sans inversion des deux
 * ordres ne prouverait rien du tout.
 */
const CATEGORIES_DECLAREES: readonly {
  cle: string
  nom: string
  documents: number
}[] = [
  { cle: "a", nom: "Audio & Hi-Fi", documents: 1 },
  { cle: "b", nom: "Bureautique", documents: 2 },
  { cle: "c", nom: "Cuisine", documents: 3 },
  { cle: "d", nom: "Douche & Bain", documents: 3 },
  { cle: "e", nom: "Éclairage", documents: 2 },
  { cle: "f", nom: "Fournitures", documents: 1 },
  { cle: "g", nom: "Garde-meuble", documents: 1 },
]

/** Un préfixe commun : il ne départage rien, et c'est le `cle` qui classe. */
const PREFIXE = "suggestion-categories"

export interface IdentiteSuggestionCategories {
  readonly id: string
  readonly token: string
  readonly categories: readonly SearchSuggestionCategory[]
  /** Non figé : le moteur en mémoire indexe le tableau qu'il reçoit. */
  readonly documents: IndexableProduct[]
  /** Les comptes déclarés, par slug — le témoin d'atterrissage des suites. */
  readonly comptes: Readonly<Record<string, number>>
}

function slugDe(identite: string, cle: string): string {
  return `${PREFIXE}-${identite}-${cle}`
}

function nomDe(cle: string): string {
  const declaree = CATEGORIES_DECLAREES.find(
    (categorie) => categorie.cle === cle
  )
  if (!declaree) throw new Error(`La catégorie « ${cle} » n'est pas déclarée`)
  return declaree.nom
}

function documentDe(
  identite: string,
  token: string,
  cle: string,
  rang: number
): IndexableProduct {
  return {
    id: `suggestion-${identite}-${cle}-${rang}`,
    name: `Suggestion ${identite} ${cle} ${rang}`,
    slug: `${PREFIXE}-${identite}-doc-${cle}-${rang}`,
    description: `${token} catégories de suggestion`,
    brand: "Marque Suggestions",
    price: 100000 + rang * 10,
    minPrice: 100000 + rang * 10,
    totalStock: 5,
    images: [],
    categoryId: `categorie-${cle}`,
    categorySlug: slugDe(identite, cle),
    categoryName: nomDe(cle),
    specsText: "",
    variantNames: [],
    skus: [],
    isFeatured: false,
    freeShipping: false,
    priceBucket: "1000-2500",
    updatedAt: Date.now(),
  }
}

/**
 * Le jeu du scénario, pour une exécution : les sept catégories à semer en base,
 * les treize Documents à indexer, et le jeton qui les désigne tous.
 *
 * **Les Documents sont émis dans l'ordre des slugs à l'envers.** Ce n'est pas
 * un détail d'écriture : le moteur en mémoire construit sa répartition dans
 * l'ordre où il rencontre les Documents, et Meilisearch la rend dans l'ordre
 * des slugs. Les deux moteurs remettent donc **le même décompte, dans deux
 * ordres différents** — `g, f, e, d, c, b, a` d'un côté, `a, b, c, d, e, f, g`
 * de l'autre — et la réponse doit être la même chez les deux.
 *
 * Aucun des deux ordres n'est l'ordre attendu, donc une implémentation qui
 * prendrait les cinq premières entrées échouerait sur l'un comme sur l'autre :
 * c'est le défaut, rendu visible. Mais un seul des deux ne prouverait pas que
 * le choix est fait **au-dessus** de la couture : il faudrait alors croire que
 * le moteur en mémoire se trouve rendre par hasard les clés dans l'ordre que
 * la règle exige. Les deux ensemble n'ont plus de place où se loger : ni
 * l'ordre alphabétique, ni l'ordre des Documents, ni aucun mélange des deux ne
 * donne les cinq attendues.
 */
export function jeuSuggestionCategories(
  id: string
): IdentiteSuggestionCategories {
  const categories = CATEGORIES_DECLAREES.map(({ cle, nom }) => ({
    slug: slugDe(id, cle),
    name: nom,
  }))
  const comptes: Record<string, number> = {}
  const documents: IndexableProduct[] = []
  const token = `${PREFIXE}${id}`
  // L'ordre d'émission est l'inverse de celui de la déclaration, qui est
  // alphabétique : le moteur en mémoire rendra donc ses clés de `g` à `a`.
  for (const { cle, documents: nombre } of [
    ...CATEGORIES_DECLAREES,
  ].reverse()) {
    for (let rang = 1; rang <= nombre; rang += 1) {
      documents.push(documentDe(id, token, cle, rang))
    }
    comptes[slugDe(id, cle)] = nombre
  }

  const jeu = { id, token, categories, documents, comptes }
  exigerQueLesDeuxOrdresDisent(jeu)
  return jeu
}

/**
 * L'ordre dans lequel les slugs se classent, et l'ordre dans lequel les
 * catégories se classent par nombre de Documents. Les deux sont calculés sur la
 * **table déclarée** — un fait de la suite — et non sur ce qu'un moteur a
 * répondu : le témoin porte sur le jeu, jamais sur une observation.
 */
export function lesDeuxOrdres(identite: IdentiteSuggestionCategories): {
  parAlphabet: readonly string[]
  parComptes: readonly string[]
} {
  const parAlphabet = [...identite.categories]
    .map((categorie) => categorie.slug)
    .sort((gauche, droite) => (gauche < droite ? -1 : gauche > droite ? 1 : 0))
  const parComptes = CATEGORIES_DECLAREES.slice()
    .sort(
      (gauche, droite) =>
        droite.documents - gauche.documents ||
        (gauche.cle < droite.cle ? -1 : gauche.cle > droite.cle ? 1 : 0)
    )
    .map(({ cle }) => slugDe(identite.id, cle))
  return { parAlphabet, parComptes }
}

/**
 * **Ce que la Recherche doit répondre, écrit à l'avance.**
 *
 * Cinq sièges, remplis par les comptes décroissants : `c` et `d` à 3, puis `b`
 * et `e` à 2, puis le cinquième — le premier des trois à 1, dans l'ordre des
 * slugs. Les deux dernières catégories, `f` et `g`, n'y sont pas : c'est le
 * plafond de cinq, et ce plafond mord ici parce que le jeu en compte sept.
 *
 * Cette liste est écrite, pas dérivée : une attente recalculée par la règle
 * qu'elle contrôle passerait par construction, et ne pourrait jamais être en
 * désaccord avec le code.
 */
export function categoriesAttendues(
  identite: IdentiteSuggestionCategories
): SearchSuggestionCategory[] {
  return ["c", "d", "b", "e", "a"].map((cle) => ({
    slug: slugDe(identite.id, cle),
    name: nomDe(cle),
  }))
}

/**
 * Le témoin de non-vacuité du jeu, et ce qui rend le test **impossible** à
 * écrire dans le sens qui ne prouve rien.
 *
 * Un jeu dont l'ordre alphabétique et l'ordre des comptes se ressembleraient
 * laisserait passer l'implémentation d'aujourd'hui : les cinq premières
 * entrées de la répartition seraient les cinq attendues, et la suite au vert
 * ne dirait rien du défaut qu'elle prétend éprouver. `#533` demande que ce jeu
 * soit impossible, pas seulement improbable.
 *
 * Le garde est ici, dans la fabrique du jeu, et non dans une assertion : il
 * échoue **avant** que quoi que ce soit ne soit semé ou indexé, avec un
 * message qui nomme le remède. Une assertion de suite dirait la même chose en
 * plus lisible, mais ne l'empêcherait pas — elle laisserait le jeu se
 * construire, se semer, s'indexer, puis échouer quelque part plus loin.
 */
function exigerQueLesDeuxOrdresDisent(
  identite: IdentiteSuggestionCategories
): void {
  const { parAlphabet, parComptes } = lesDeuxOrdres(identite)
  if (parAlphabet.join() !== parComptes.join()) return
  throw new Error(
    "Le jeu de suggestion se classe pareil dans les deux ordres : les " +
      "cinq premières entrées de la répartition seraient les cinq attendues, " +
      "et la suite ne prouverait plus rien. Déplacez les comptes déclarés de " +
      "« " +
      CATEGORIES_DECLAREES.map(({ cle }) => cle).join(" ") +
      " » pour que l'ordre des comptes et l'ordre des slugs se contredisent."
  )
}

/**
 * Le témoin d'atterrissage, à jouer **avant** toute affirmation sur ce qui
 * revient : un jeu qui n'a pas atterri ne répond rien, et une attente passe
 * alors au vert sur le vide.
 *
 * Ce qu'il affirme est une répartition du moteur — les sept catégories et
 * leurs comptes — et rien d'autre : ni le filtre, ni le tri, ni le nom de
 * l'index. C'est la réponse de la couture, donc la seule chose qui soit
 * comparable entre les deux moteurs.
 */
export async function exigerCategoriesSemees(
  identite: IdentiteSuggestionCategories,
  moteur: MoteurRecherche
): Promise<void> {
  const reponse: ReponseMoteur = await moteur.chercher({
    query: identite.token,
    taille: 0,
    facettes: ["categorySlug"],
  })
  expect(
    reponse.statut,
    "le moteur doit répondre pour que les fixtures comptent"
  ).toBe("ok")
  if (reponse.statut !== "ok") return
  expect(
    reponse.repartitions.categorySlug,
    "les sept catégories ont atterri, avec les comptes qu'elles déclarent"
  ).toEqual(identite.comptes)
}

/**
 * L'affirmation centrale : les suggestions ouvrent sur les catégories que la
 * requête concerne le plus.
 *
 * Elle vit ici, une fois, et les deux suites la rejouent. Le message est écrit
 * parce qu'un contrôle négatif doit pouvoir nommer **la règle refusée** plutôt
 * qu'une pile d'erreurs qui dirait « quelque chose ne va pas » : c'est ce
 * message que la suite cherche quand elle fabrique un moteur qui dérouge.
 */
export async function exigerCategoriesSuggestion(
  identite: IdentiteSuggestionCategories,
  moteur: MoteurRecherche
): Promise<SearchSuggestionsData> {
  const suggestions = await searchSuggestions(identite.token, moteur)
  expect(
    suggestions.categories,
    "les suggestions ouvrent sur les catégories que la requête concerne le plus"
  ).toEqual(categoriesAttendues(identite))
  return suggestions
}

/**
 * Le plafond de cinq reste un plafond de cinq : les catégories proposées sont
 * cinq, et cinq catégories **distinctes**. Une répartition qui rendrait deux
 * fois la même catégorie — un adaptateur qui prête deux clés à une valeur —
 * ferait passer le compte et trahirait la bande de navigation, qui proposerait
 * deux fois le même lien.
 */
export async function exigerCinqCategoriesDistinctes(
  suggestions: SearchSuggestionsData
): Promise<void> {
  expect(
    suggestions.categories,
    "les suggestions proposent cinq catégories"
  ).toHaveLength(5)
  expect(
    new Set(suggestions.categories.map((categorie) => categorie.slug)).size,
    "les cinq catégories proposées sont cinq catégories différentes"
  ).toBe(5)
}
