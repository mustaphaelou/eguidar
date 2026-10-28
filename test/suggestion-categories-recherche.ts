import { expect } from "vitest"

import type { IndexableProduct } from "@/lib/index-projection"
import {
  lectureDesStructures,
  type FaitStructure,
  type LectureStructure,
} from "@/lib/use-cases/lecture-structure"
import type { MoteurRecherche, ReponseMoteur } from "@/lib/moteur-recherche"
import {
  searchSuggestions,
  type SearchSuggestionCategory,
  type SearchSuggestionsData,
} from "@/lib/use-cases/search"

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

const PREFIXE = "suggestion-categories"

interface IdentiteSuggestionCategories {
  readonly id: string
  readonly token: string
  readonly categories: readonly SearchSuggestionCategory[]
  readonly documents: IndexableProduct[]
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
  for (const { cle, documents: nombre } of [
    ...CATEGORIES_DECLAREES,
  ].reverse()) {
    for (let rang = 1; rang <= nombre; rang += 1) {
      documents.push(documentDe(id, token, cle, rang))
    }
    comptes[slugDe(id, cle)] = nombre
  }

  const jeu = { id, token, categories, documents, comptes }
  exigerQueLesDeuxOrdresDifferent(jeu)
  return jeu
}

export function faitsSuggestionCategories(
  identite: IdentiteSuggestionCategories
): FaitStructure[] {
  return identite.categories.map(({ slug, name }) => ({
    id: `structure-${slug}`,
    name,
    slug,
    image: null,
    parentId: null,
    produitsDirects: 0,
    position: 0,
  }))
}

export function lectureSuggestionCategories(
  identite: IdentiteSuggestionCategories
): LectureStructure {
  return lectureDesStructures(faitsSuggestionCategories(identite))
}

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

export function categoriesAttendues(
  identite: IdentiteSuggestionCategories
): SearchSuggestionCategory[] {
  return ["c", "d", "b", "e", "a"].map((cle) => ({
    slug: slugDe(identite.id, cle),
    name: nomDe(cle),
  }))
}

function exigerQueLesDeuxOrdresDifferent(
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

export async function exigerCategoriesSuggestion(
  identite: IdentiteSuggestionCategories,
  moteur: MoteurRecherche,
  structure: LectureStructure = lectureSuggestionCategories(identite)
): Promise<SearchSuggestionsData> {
  const suggestions = await searchSuggestions(identite.token, moteur, structure)
  expect(
    suggestions.categories,
    "les suggestions ouvrent sur les catégories que la requête concerne le plus"
  ).toEqual(categoriesAttendues(identite))
  return suggestions
}

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
