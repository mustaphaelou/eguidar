import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesToutes,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur du Devis.
 *
 * Régression de la panne /panier « This page couldn't load » : l'entrée
 * serveur (`devis.ts`, via `chargerDevis`) et la page serveur du Panier
 * appelaient `selectionnerDevis` / `lignesDevis` importées depuis le module
 * client `devis-selection.ts` (« use client »). Appeler une fonction cliente
 * depuis le serveur lève en production (« Attempted to call
 * selectionnerDevis() from the server… ») — vitest, lui, ignore la
 * directive et reste vert, donc seule une garde sur le graphe d'imports
 * verrouille le bug.
 *
 * Règle : le pur partagé vit dans `devis-coeur.ts` (neutre, sans
 * directive), consommé des deux côtés ; `devis-selection.ts` ne porte que
 * le crochet client ; aucun module serveur n'importe `devis-selection`.
 *
 * La couture interne verrouille l'autre sens : `devis-coeur.ts` n'a que
 * deux auteurs — `devis.ts` (la porte serveur) et `devis-selection.ts`
 * (le crochet client). Un troisième import, production comme recette,
 * échoue la suite : c'est ce qui fait du cœur une couture interne et non
 * une troisième porte d'entrée, car rien n'empêche sinon un test ou une
 * page de puiser dedans en direct. Le parcours prend les quatre arbres où
 * une source du Devis peut naître — `app/`, `components/`, `lib/` et
 * `test/`, suites de test comprises (`sourcesToutes`) — la recette ne
 * doit pas passer autour de la porte — moins cette suite elle-même, dont
 * les fixtures énoncent mot pour mot l'import qu'elles cherchent.
 */
const SERVEUR_SANS_CLIENT = [
  "./devis.ts",
  "./orders.ts",
  "../../app/(boutique)/panier/page.tsx",
  "../../app/(boutique)/checkout/page.tsx",
]

/**
 * Les deux seuls modules autorisés à importer le cœur pur : la porte
 * serveur qui le recharge et le crochet qui le re-projecte derrière la
 * couture. Chemins relatifs à la racine du dépôt, comme
 * `SourceProduction.chemin`.
 */
const AUTEURS_DU_COEUR = [
  "lib/use-cases/devis-selection.ts",
  "lib/use-cases/devis.ts",
] as const

/** Cette suite : ses fixtures nomment l'import qu'elle cherche. */
const CETTE_SUITE = "lib/use-cases/devis-frontiere.test.ts"

const SOURCES = sourcesToutes(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../test"
)

/** Les sources qui importent le cœur pur — cette suite exclue —, triées. */
function auteursDuCoeur(sources: SourceProduction[]): string[] {
  return sources
    .filter(({ chemin }) => chemin !== CETTE_SUITE)
    .filter(({ source }) => importeDe(source, "devis-coeur"))
    .map(({ chemin }) => chemin)
    .sort()
}

describe("Devis — frontière client/serveur", () => {
  it("aucun module serveur n'importe le module client devis-selection", () => {
    for (const fichier of SERVEUR_SANS_CLIENT) {
      expect(
        importeDe(lire(import.meta.url, fichier), "devis-selection"),
        fichier
      ).toBe(false)
    }
  })

  it("le cœur pur est neutre : ni use client, ni crochet, ni accès base", () => {
    const coeur = lire(import.meta.url, "./devis-coeur.ts")
    expect(coeur).not.toMatch(/^"use client"/m)
    expect(coeur).not.toMatch(/useState/)
    expect(importeDe(coeur, "lib/db")).toBe(false)
  })

  it("l'entrée cliente garde use client et réexporte le pur depuis le cœur", () => {
    const selection = lire(import.meta.url, "./devis-selection.ts")
    expect(selection).toMatch(/^"use client"/m)
    expect(importeDe(selection, "devis-coeur")).toBe(true)
    expect(importeDe(selection, "lib/db")).toBe(false)
  })
})

describe("Devis — couture interne du cœur pur", () => {
  it("le cœur pur n'a que la porte serveur et le crochet client pour auteurs", () => {
    expect(auteursDuCoeur(SOURCES)).toEqual([...AUTEURS_DU_COEUR])
  })

  it("le parcours est non vacuant : les quatre arbres sont visités, tests compris", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/(boutique)/panier/page.tsx",
        "components/storefront/checkout-form.tsx",
        "lib/use-cases/devis.ts",
        "lib/use-cases/devis-selection.ts",
        // Les suites de test sont dans le parcours : c'est ce qui bloquait
        // la garde tant que `devis.test.ts` puisait dans le cœur en direct.
        "lib/use-cases/devis.test.ts",
        // `test/` aussi : une fixture y puiserait dans le cœur en direct.
        "test/navigation-mocks.ts",
      ])
    )
    // Témoin positif : l'instrument voit bien les deux auteurs autorisés.
    // Sans lui, l'égalité du premier cas ne serait verte que si le parcours
    // était muet — un garde silencieux passe aussi.
    expect(auteursDuCoeur(SOURCES)).toEqual([...AUTEURS_DU_COEUR])
  })

  it("la garde distingue l'auteur autorisé de l'auteur interdit", () => {
    // Un module fictif qui importe le cœur — par l'alias, par le relatif,
    // par un réexport : dans les trois cas il devient le troisième auteur et
    // le verrou du premier cas tombe.
    const fictifs = [
      'import { projeterDevis } from "@/lib/use-cases/devis-coeur"\n',
      'import { projeterDevis } from "./devis-coeur"\n',
      'export { projeterDevis } from "@/lib/use-cases/devis-coeur"\n',
    ]
    for (const source of fictifs) {
      expect(
        auteursDuCoeur([
          ...SOURCES,
          { chemin: "lib/use-cases/fictif.ts", source },
        ]),
        source
      ).toEqual([...AUTEURS_DU_COEUR, "lib/use-cases/fictif.ts"])
    }

    // La forme que la garde doit laisser passer : un module qui puise dans la
    // porte, comme tout le monde. L'importateur interdit est bien celui du
    // cœur, pas n'importe quel import Devis.
    expect(
      auteursDuCoeur([
        ...SOURCES,
        {
          chemin: "lib/use-cases/fictif.ts",
          source: 'import { chargerDevis } from "@/lib/use-cases/devis"\n',
        },
      ])
    ).toEqual([...AUTEURS_DU_COEUR])

    // Le cas réel, rejoué : un consommateur du crochet qu'on dote d'un
    // import direct du cœur — la régression même que ce verrou existe pour
    // attraper — devient le troisième auteur à chaque exécution.
    const reel = lire(
      import.meta.url,
      "../../components/storefront/checkout-form.tsx"
    )
    const avecCoeur =
      reel + '\nimport { projeterDevis } from "@/lib/use-cases/devis-coeur"\n'
    expect(avecCoeur).not.toBe(reel)
    expect(
      auteursDuCoeur([
        ...SOURCES,
        {
          chemin: "components/storefront/checkout-form.tsx",
          source: avecCoeur,
        },
      ])
    ).toEqual(["components/storefront/checkout-form.tsx", ...AUTEURS_DU_COEUR])
  })
})
