import { describe, expect, it } from "vitest"

import type { FaitStructure } from "@/lib/use-cases/lecture-structure"

/**
 * L'ordre que le module promet, éprouvé par **chaque** projection qui range des
 * Structures.
 *
 * Une assertion sur un classement répétée dans chaque suite a deux défauts, et ils
 * se tiennent. Le premier est l'oubli : une projection écrite après les autres
 * sort son propre comparateur, et rien ne la relie à celles qui existent — la règle
 * est alors vraie dans trois suites et fausse dans la quatrième, sans qu'aucune
 * des trois ne le dise. Le second est la **copie** : tant que deux classements
 * différents ne se contredisent que sur une liste dont les noms se répètent, une
 * fixture de noms distincts les donne tous deux pour bons. Une liste de Structures
 * de même nom est donc la seule fixture qui rende les deux règles visibles, et
 * c'est celle qui manque le plus souvent.
 *
 * D'où ce module : la fixture et **l'ordre attendu** sont écrits **une fois**, et
 * chaque projection est tenue de les rendre. Une quatrième projection qui classe
 * autrement ne peut plus le cacher — elle échoue sur la même fixture que les
 * autres, et le message nomme la projection.
 *
 * Il vit dans `test/` pour la raison que `test/mutation-squelette-recette.ts` et
 * `test/contrat-registre-brouillon.ts` le font : les assertions **réellement
 * identiques** méritent un seul endroit, et chaque suite garde ensuite ses propres
 * invariants dans son propre fichier. Rien ici n'est une règle de projection —
 * c'est la règle du module, rejouée par celles qui la rendent.
 */

/** Les quatre Structures dont l'ordre est éprouvé, et l'ordre qu'elles doivent
 *  rendre. La suite est **écrite d'avance** : elle n'est pas recalculée depuis le
 *  comparateur, car une attente tirée de la règle qu'elle éprouve ne peut pas la
 *  contredire. */
export const ORDRE_ATTENDU = ["ecran", "jumeau-a", "jumeau-b", "zebre"] as const

/** Les six Structures de la fixture : une racine, et ses quatre enfants. */
const FAITS: readonly FaitStructure[] = [
  {
    id: "racine",
    name: "Racine",
    slug: "racine",
    image: null,
    parentId: null,
    produitsDirects: 0,
  },
  // Les quatre sont écrits dans l'ordre **inverse** de celui que le module promet,
  // et le slug des deux jumeaux est rangé à l'opposé de leur identifiant : rien ne
  // tient donc par l'ordre d'arrivée des faits, et un classement par slug — la
  // règle que le module a refusée — donnerait une suite différente, donc rouge.
  {
    id: "zebre",
    name: "Zèbre",
    slug: "zebre",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
  {
    id: "ecran",
    name: "Écran",
    slug: "ecran",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
  {
    id: "jumeau-b",
    name: "Jumeau",
    slug: "aaa-jumeau",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
  {
    id: "jumeau-a",
    name: "Jumeau",
    slug: "zzz-jumeau",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
]

/**
 * Ce qu'une projection rend, réduit aux quatre Structures épinglées.
 *
 * **La réduction est le point.** Les projections ne rendent pas toutes la même
 * chose : les lignes de l'Administration rendent un pré-ordre où la racine est
 * entre ses enfants, le sélecteur d'un formulaire rend la table entière, les puces
 * d'une page rendent les enfants seuls. Ce qui leur est commun n'est pas leur liste
 * mais **l'ordre dans lequel elles rangent les mêmes Structures** — donc c'est cet
 * ordre-là que la recette compare, et la réduction le rend lisible sans que chaque
 * projection ait à dire la même chose sur une liste qu'elle ne rend pas.
 */
export function dansLOrdreEprouve(ids: readonly string[]): string[] {
  return ids.filter((id) => (ORDRE_ATTENDU as readonly string[]).includes(id))
}

/**
 * Ce qu'une projection rend pour que la recette puisse comparer : les
 * identifiants, **dans l'ordre reçu**. Elle reçoit la fixture entière — la racine
 * comprise — parce que chaque projection a besoin de savoir par quoi commencer :
 * l'écran d'édition par un identifiant, la page de catégorie par un slug, la boîte
 * de suppression par la Structure dont elle est la cible.
 */
export type ProjeterDansLOrdre = (
  faits: readonly FaitStructure[]
) => readonly string[]

export interface RecetteOrdre {
  /**
   * Le nom de la projection, tel qu'on le parle dans le dépôt : il ouvre le
   * `describe`, donc un échec nomme la projection sans qu'on aille le chercher.
   */
  nom: string
  /** Ce que la projection rend, dans l'ordre où elle le rend. */
  projeter: ProjeterDansLOrdre
}

/**
 * Rejoue l'ordre du module sur une projection.
 *
 * **L'assertion est ici, et nulle part ailleurs.** Une projection qui garde la
 * sienne a deux vérités à tenir, dont une que rien ne vérifie — et une projection
 * qui en retirerait une n'aurait plus d'épreuve du tout. Le prix de la recette est
 * donc explicite : une projection ne peut plus affirmer *sa* façon de classer, elle
 * peut seulement dire ce qu'elle rend de plus.
 *
 * **Un seul `it`, et deux faits dans son nom.** La fixture croise les deux règles —
 * deux Structures de même nom, deux noms dont la collation française inverse l'ordre
 * des octets — et une seule suite attendue répond aux deux. Deux épreuves
 * identiques sous deux noms seraient deux occasions de se contredire ; un nom qui
 * dit les deux faits en dit autant, et un échec se lit sans le message.
 */
export function eprouverLOrdreDuModule({ nom, projeter }: RecetteOrdre): void {
  describe(`${nom} — l'ordre que le module promet`, () => {
    it("départage les Structures de même nom par leur identifiant, et lit les accents en français", () => {
      // « Écran » avant « Zèbre » : la comparaison française que le dépôt écrit
      // déjà, qu'aucun déploiement n'épingle (US 30). Et « Jumeau » avant « Jumeau »
      // par l'identifiant — la seule clé que le cœur et le module ont tous les deux
      // sous la main ; leurs slugs sont rangés à l'opposé, donc un classement par
      // slug donnerait l'inverse et tomberait ici (US 31).
      expect(dansLOrdreEprouve(projeter(FAITS))).toEqual([...ORDRE_ATTENDU])
    })
  })
}

/**
 * Deux formes rendues par deux projections, lues côte à côte.
 *
 * Le champ est l'identifiant de la projection — son nom dans le dépôt — parce que
 * le message d'un échec doit dire **qui** classe autrement : une attente qui se
 * contente de comparer deux listes ne dit pas laquelle des deux a tort.
 */
export interface OrdreRendu {
  nom: string
  /** Les identifiants que la projection rend, dans l'ordre qu'elle les rend. */
  ids: readonly string[]
}

/**
 * Exige que **toutes** les formes listées portent les mêmes identifiants dans le
 * même ordre, et que la liste ne soit pas vide par hasard.
 *
 * C'est le second volet de la promesse, et il est distinct du premier : la recette
 * ci-dessus tient chaque projection à un ordre **écrit**, celle-ci tient les
 * projections à **elles-mêmes**. Les deux ensemble disent ce qu'aucune des deux ne
 * dit — un ordre écrit peut être faux et être reproduit fidèlement partout, et un
 * accord sans référence peut être faux d'un commun accord.
 *
 * **La comparaison se fait sur la première forme**, jamais sur un classement
 * recalculé : recalculer ce serait écrire la règle une troisième fois, dans la
 * preuve même.
 */
export function exigerLeMemeOrdre(parties: readonly OrdreRendu[]): void {
  const [reference, ...autres] = parties
  expect(
    reference?.ids.length ?? 0,
    reference?.nom ?? "aucune forme"
  ).toBeGreaterThan(0)
  for (const autre of autres) {
    expect(
      autre.ids,
      `${autre.nom} — même ordre que ${reference?.nom}`
    ).toEqual([...(reference?.ids ?? [])])
  }
}
