import { describe, expect, it } from "vitest"

import {
  atteignables,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur du module neutre qui parle le langage du
 * formulaire Produit.
 *
 * `lib/formulaire-produit.ts` est le seul module neuf de ce travail, et il est
 * atteint des deux côtés de la couture — par le composant client qui rend le
 * formulaire (`components/admin/product-form.tsx`) comme par l'action serveur
 * qui le reçoit (`app/admin/produits/actions.ts`). Un import serveur ici tirerait
 * `pg` (`require('dns')`) dans le bundle navigateur et casserait `next build`
 * (Turbopack). Ce fichier verrouille donc, module par module et par transit, ce
 * que ce graphe de valeur n'atteint pas.
 *
 * La moitié du même verrou qui concerne les **surfaces** d'Administration —
 * aucune page ne réinterprète plus une colonne JSON stockée — vit dans
 * `lib/admin-produit-frontiere.test.ts`, sous le nom de son sujet. Une garde
 * d'un module et une garde d'un arbre de fichiers n'ont ni le même champ ni la
 * même contre-épreuve : les tenir dans un seul fichier les obligeait à
 * s'adresser à deux sujets sous un seul nom.
 */

const MODULE_NEUTRE = "lib/formulaire-produit.ts"
const BASE = "lib/db.ts"
const CATALOGUE = "lib/use-cases/admin-catalog.ts"

/**
 * Les trois fichiers — la graine et ses deux voisins — que le graphe de valeur
 * du module neutre doit contenir, et rien d'autre : l'aide d'argent partagée
 * (zéro import) et le schéma zod de la galerie (zod est une bibliothèque
 * client ordinaire : ni base, ni module serveur, ni directive). Le module
 * énonce cet invariant dans son propre en-tête ; cette suite l'énonce aussi,
 * donc ajouter une troisième arête de valeur devient un acte délibéré — il faut
 * rouvrir ce fichier et l'ADR-0026, pas glisser un import.
 */
const GRAPHE_ATTENDU = [
  "lib/formulaire-produit.ts",
  "lib/galerie-image-produit.ts",
  "lib/money.ts",
]

/**
 * Les modules que le module neutre ne doit atteindre ni par lui-même ni par un
 * voisin : `lib/db` est la base, qui tire `pg` et donc `require('dns')` ;
 * `session-courante` et `mutation-actions` sont serveur (`server-only`,
 * `next/headers`, `next/navigation`) ; `r2` et le cycle de vie des Images
 * produit sont le port de stockage ; `react` tire un runtime client ; un
 * `node:` est insoluble dans un bundle navigateur.
 *
 * `@/lib/use-cases/admin-catalog` n'est pas dans cette liste, et c'est
 * délibéré : le module l'atteint par type, et `importeDe` voit les imports de
 * type. Le signaler ici ferait échouer le garde sur une arête légitime ;
 * c'est l'ensemble **atteint** qui le déclare absent, plus bas.
 */
const MODULES_INTERDITS = [
  "lib/db",
  "lib/use-cases/session-courante",
  "lib/use-cases/mutation-actions",
  "lib/r2",
  "lib/cycle-vie-image-produit",
  "next/headers",
  "next/navigation",
  "next/cache",
  "next/server",
  "server-only",
  "react",
  "react-dom",
  "node:crypto",
  "node:fs",
  "node:path",
] as const

/**
 * Les fichiers du dépôt que le module neutre ne doit pas atteindre, vérifiés
 * sur l'ensemble atteint et non sur un nom de paquet : `atteignables` ignore
 * les spécifieurs de paquet, faute de source dans le dépôt, mais il résout
 * `@/` et les chemins relatifs — donc ces voisins-là sont bien visibles.
 */
const CHEMINS_INTERDITS = [
  BASE,
  CATALOGUE,
  "lib/use-cases/session-courante.ts",
  "lib/use-cases/mutation-actions.ts",
  "lib/use-cases/storefront.ts",
  "lib/r2.ts",
  "lib/cycle-vie-image-produit.ts",
  "lib/generated/prisma/client.ts",
] as const

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "./"
)
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))
const ATTEINTS = atteignables(MODULE_NEUTRE, PAR_CHEMIN)

function sourceDe(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source de production absente : ${chemin}`)
  return trouvee
}

function aucuneDependance(source: string, chemin: string): void {
  for (const nom of MODULES_INTERDITS) {
    expect(importeDe(source, nom), `${chemin} → ${nom}`).toBe(false)
  }
}

/**
 * Un pont pour les tests de discrimination : une carte de sources réduite à ce
 * qu'un cas de figure demande. `atteignables` ne lit que la source qu'on lui
 * donne ; la carte n'a pas besoin d'être le dépôt.
 */
function carteDe(...paires: [string, string][]): Map<string, SourceProduction> {
  return new Map(paires.map(([chemin, source]) => [chemin, { chemin, source }]))
}

/**
 * Frontière client/serveur du langage du formulaire Produit (ADR-0026).
 *
 * `lib/formulaire-produit.ts` est le module neutre que ce travail a ajouté : il
 * parle le format du champ Spécifications, l'écart de prix et le câble du
 * formulaire, et il est atteint des deux côtés de la couture — par le composant
 * client qui rend le formulaire (`components/admin/product-form.tsx`) comme par
 * l'action serveur qui le reçoit (`app/admin/produits/actions.ts`). La couture
 * n'est donc pas hypothétique : un import serveur ici tirerait `pg`
 * (`require('dns')`) dans le bundle navigateur et casserait `next build`
 * (Turbopack) — la panne documentée par `carte-produit-frontiere.test.ts` et
 * `devis-frontiere.test.ts`.
 *
 * **Pourquoi `atteignables` est le bon instrument, et `importeDe` non.**
 * `importeDe` voit les imports de type : une garde fondée dessus se
 * déclencherait donc à tort sur les deux imports de type légitimes du module —
 * les types de `@/lib/galerie-image-produit` et `ProductInput` de
 * `@/lib/use-cases/admin-catalog` — et elle serait fausse au lieu d'être verte.
 * `atteignables` suit les imports **de valeur** : c'est la sémantique du
 * bundler, et elle est ici un fait, non une convention. Un `import type` est
 * effacé à la compilation ; il ne peut donc pas glisser quoi que ce soit dans
 * un bundle navigateur, quelle que soit la façon dont il est écrit. La
 * neutralité du module est inconditionnelle, pas conventionnelle.
 *
 * La même sémantique arrête la marche sur un module `"use server"`, que le
 * bundler remplace côté client par une référence d'action : son graphe reste
 * serveur. « N'atteint aucun module serveur » se vérifie donc sur l'ensemble
 * atteint lui-même, sans rien supposer d'autre.
 *
 * Le parcours part de la graine et suit module par module, comme
 * `session-courante-frontiere.test.ts` ; chaque fichier atteint est ensuite
 * contrôlé à son tour — ni directive `"use client"` ni `"use server"`, et
 * aucune des dépendances interdites. Le reste est anti-vacuant : un garde qui
 * passe parce qu'un fichier a disparu ne vaut rien.
 */
describe("Formulaire Produit — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni crochet, ni module serveur", () => {
    const { source } = sourceDe(MODULE_NEUTRE)

    // Anti-vidage : un fichier vidé, ou réduit à une signature, passerait
    // sinon pour neutre. Les six symboles que le module doit porter sont
    // énoncés un par un.
    for (const symbole of [
      "soumissionDepuisFormData",
      "specificationsDepuisTexte",
      "texteSpecifications",
      "texteEcartPrix",
      "ecartPrixDepuisTexte",
      "MESSAGE_FORMULAIRE_INVALIDE",
    ]) {
      expect(source, symbole).toContain(symbole)
    }

    expect(source).not.toMatch(/^["']use client["']/m)
    expect(source).not.toMatch(/^["']use server["']/m)
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/)
    // L'invariant est l'interdiction, pas l'appel : **aucun** `node:` ne se
    // résout dans un bundle navigateur, donc `node:crypto`, `node:fs` et
    // `node:path` sont dans la liste interdite ci-dessus et c'est elle qui
    // l'applique. Elle vaut pour tout ce que le module contiendrait, aujourd'hui
    // comme demain : épingler l'expression d'aujourd'hui la confondrait avec
    // elle.
    expect(source).not.toMatch(/from\s*["']node:/)
    aucuneDependance(source, MODULE_NEUTRE)
  })

  it("le graphe de valeur n'atteint ni la base ni un module serveur, même par un voisin", () => {
    // Parcours non vacuant, d'abord : la graine est bien dans la carte, et
    // elle est un fichier de `lib/`, donc la carte a été remplie.
    expect(PAR_CHEMIN.has(MODULE_NEUTRE)).toBe(true)
    expect(PAR_CHEMIN.has("lib/carte-produit.ts")).toBe(true)
    // Le parcours descend : il atteint plus que sa seule graine, et il
    // atterrit quelque part de connu.
    expect(ATTEINTS.size).toBeGreaterThan(1)
    expect(ATTEINTS.has("lib/money.ts")).toBe(true)
    expect(ATTEINTS.has("lib/galerie-image-produit.ts")).toBe(true)

    for (const chemin of CHEMINS_INTERDITS) {
      expect(ATTEINTS.has(chemin), chemin).toBe(false)
    }
    for (const chemin of ATTEINTS) {
      const { source } = sourceDe(chemin)
      expect(source, chemin).not.toMatch(/^["']use client["']/m)
      expect(source, chemin).not.toMatch(/^["']use server["']/m)
      aucuneDependance(source, chemin)
    }
  })

  it("le graphe de valeur du module est exactement ses deux voisins annoncés", () => {
    // La forme positive de l'interdit : le Catalogue est atteint par type
    // seulement, il est donc absent de l'ensemble atteint, et le graphe se
    // réduit aux deux modules que l'en-tête du module annonce.
    expect([...ATTEINTS].sort()).toEqual(GRAPHE_ATTENDU)
  })

  it("le parcours est non vacuant : les trois arbres sont visités, et la base se laisse trouver", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/(boutique)/page.tsx",
        "app/admin/produits/page.tsx",
        "components/storefront/carte-produit.tsx",
        "components/admin/product-form.tsx",
        MODULE_NEUTRE,
      ])
    )
    // Témoin positif : le même parcours, depuis une page qui doit atteindre la
    // base, la trouve. Sans ce témoin, `ATTEINTS.has("lib/db.ts")` pourrait
    // être faux pour la seule raison que le parcours ne suit aucune arête.
    expect(
      atteignables("app/admin/produits/page.tsx", PAR_CHEMIN).has(BASE)
    ).toBe(true)
  })

  it("la garde distingue un import de type d'un import de valeur, sur le cas exact", () => {
    const reel = sourceDe(MODULE_NEUTRE).source

    // L'instrument fautif, énoncé : `importeDe` voit l'import de type et se
    // déclencherait à tort. C'est pourquoi la neutralité ci-dessus ne s'appuie
    // pas sur lui.
    expect(importeDe(reel, CATALOGUE)).toBe(true)

    // Un module fictif qui ne fait qu'importer le Catalogue : par type il
    // n'atteint rien, par valeur il atteint le Catalogue.
    const fictifType = carteDe(
      [
        "lib/fictif.ts",
        'import type { ProductInput } from "@/lib/use-cases/admin-catalog"\n',
      ],
      [CATALOGUE, ""]
    )
    const fictifValeur = carteDe(
      [
        "lib/fictif.ts",
        'import { listAdminProducts } from "@/lib/use-cases/admin-catalog"\n',
      ],
      [CATALOGUE, ""]
    )
    expect(atteignables("lib/fictif.ts", fictifType).has(CATALOGUE)).toBe(false)
    expect(atteignables("lib/fictif.ts", fictifValeur).has(CATALOGUE)).toBe(
      true
    )

    // Le même cas, sur le module réel : son arête vers le Catalogue, rendue
    // valeur au lieu de type, fait tomber le garde. C'est la régression que ce
    // garde existe pour attraper ; elle est donc rejouée à chaque exécution.
    const enValeur = reel.replace(
      'import type { ProductInput } from "@/lib/use-cases/admin-catalog"',
      'import { listAdminProducts } from "@/lib/use-cases/admin-catalog"'
    )
    expect(enValeur).not.toBe(reel)
    expect(atteignables(MODULE_NEUTRE, PAR_CHEMIN).has(BASE)).toBe(false)
    expect(
      atteignables(
        MODULE_NEUTRE,
        new Map(PAR_CHEMIN).set(MODULE_NEUTRE, {
          chemin: MODULE_NEUTRE,
          source: enValeur,
        })
      ).has(BASE)
    ).toBe(true)
  })
})
