import { describe, expect, expectTypeOf, it } from "vitest"

import type { Product as LigneProduitPrisma } from "@/lib/generated/prisma/client"
import type {
  getAdminProduct,
  listAdminCategories,
  listAdminProducts,
} from "@/lib/use-cases/admin-catalog"
import {
  atteignables,
  importeDe,
  lire,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/* ------------------------------------------------------------------ *
 * Garde 1 — le module neutre qui parle le langage du formulaire Produit.
 * ------------------------------------------------------------------ */

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
    // Le transport tire son `randomUUID` de `globalThis.crypto` et jamais de
    // `node:crypto`, qu'un bundle navigateur ne pourrait pas résoudre.
    expect(source).toContain("globalThis.crypto.randomUUID()")
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

/* ------------------------------------------------------------------ *
 * Garde 2 — plus aucun module de rendu d'Administration ne réinterprète
 * une colonne JSON stockée.
 * ------------------------------------------------------------------ */

/**
 * Les deux modules dont l'Administration ne doit pas dépendre, parce qu'ils
 * possèdent la donnée brute ou son interprétation : `lib/db` est la base, et
 * `@/lib/product-metrics` porte à la fois la normalisation partagée des deux
 * colonnes stockées (`urlsImagesProduit`, `specificationsProduit`) et les faits
 * canoniques que les lectures composent (`totalVariantStock`,
 * `minVariantPrice`, `prixVariante`). Les atteindre serait redevenir
 * l'interprète — ou le calculateur — que ce travail a déplacé dans la lecture.
 */
const MODULES_BRUTS = ["lib/db", "lib/product-metrics"] as const

/**
 * `Array.isArray` sur une colonne stockée : l'ancien « est-ce une liste ? »
 * d'une galerie, refait sur place. La colonne doit être atteinte par une
 * propriété — `produit.images` — pour que le motif morde ; un `Array.isArray`
 * sur autre chose (le filtre de la liste des Commandes) et un `Array.from` de
 * fichiers téléversés restent hors de portée.
 */
const GARDE_IS_ARRAY =
  /Array\.isArray\(\s*!?\s*[\w$]+\s*\??\.\s*(?:images|specs)\b/g

/**
 * Un cast dont l'opérande nomme une colonne stockée : `produit.specs as
 * Record<string, string>`, `fait.images as unknown as string[]`. La fenêtre
 * entre la colonne et le `as` ne franchit ni un `;` ni une `)` — donc pas une
 * autre expression — mais elle peut franchir un retour à la ligne, que le
 * formateur insère entre un opérande et son cast.
 */
const GARDE_CAST =
  /[\w$]+\s*\??\.\s*(?:images|specs)\b(?:[^;)\n]|\n[^;)\n])*?\bas\s+/g

/** Les réinterprétations d'une colonne stockée trouvées dans une source. */
function reinterpretations(source: string): string[] {
  return [...source.matchAll(GARDE_IS_ARRAY), ...source.matchAll(GARDE_CAST)]
    .map((match) => match[0].replace(/\n/g, " "))
    .sort()
}

const SOURCES_ADMIN = sourcesDeProduction(
  import.meta.url,
  "../app/admin",
  "../components/admin"
)

/**
 * Plus aucune page ni aucun module de rendu d'Administration ne réinterprète
 * une colonne JSON stockée. Le champ est `app/admin/` et `components/admin/`,
 * parcourus en entier — jamais une liste de noms, pour qu'une page neuve
 * n'échappe pas au verrou.
 *
 * **Les quatre verrous, et la forme refusée à chacun.** « Réinterpréter » ne
 * veut pas dire « écrire un `as` » : cela veut dire toucher à la donnée stockée
 * dans une page. Un garde trop large hurle sur du code sain et on l'arrache ;
 * un garde trop étroit se laisse passer par la porte de côté. Les deux risques
 * sont ici assumés, et nommés.
 *
 * 1. *Par ses propriétaires.* Une page qui atteint `lib/db` ou
 *    `@/lib/product-metrics` détient la donnée brute ou son interprétation. Or
 *    aucune n'a de raison de le faire, et l'une des deux l'a fait : la liste
 *    sommait le stock des Variantes en ligne, alors que le fait canonique
 *    existait déjà dans le même dépôt.
 *    **Forme refusée :** chercher `Array.isArray`, `as `, `as Record` ou
 *    `as string[]` sans dire de quelle colonne il s'agit. Le corpus
 *    d'aujourd'hui contient des `as` parfaitement légitimes dans ces deux
 *    arbres — `import * as React`, `(updater as (old: T) => T)`, et le cast de
 *    la réponse HTTP du presign dans `image-gallery-upload.tsx` — dont aucun
 *    n'a de rapport avec une colonne stockée.
 *
 * 2. *Par la colonne nommée.* Un garde sur la seule syntaxe est esclave de
 *    l'implémentation : `JSON.parse(produit.images)` passerait. Le motif ancre
 *    donc sur `produit.images` ou `fait.specs`, et demande un `as` ou un
 *    `Array.isArray` sur cette colonne-là.
 *    **Forme refusée :** le garde purement syntaxique, d'une part parce qu'il
 *    est evadeur par accident et non par conception, d'autre part parce
 *    qu'un fichier qui ne nomme ni `images` ni `specs` n'a, par construction,
 *    rien à réinterpréter — c'est une propriété du code, pas un trou du
 *    garde.
 *
 * 3. *Par la lecture, en compilation.* Les deux premiers verrous disent qu'une
 *    page ne réinterprète pas ; ils ne disent pas qu'une page n'a rien à
 *    réinterpréter, et c'est la moitié sérieuse : une page qui n'atteint ni la
 *    base ni le propriétaire de l'interprétation peut encore recevoir une
 *    ligne si la lecture en répond une. Aucun parcours de fichiers ne voit
 *    cela ; un verrou de compilation, lui, si.
 *
 * 4. *Par la contre-épreuve.* Un garde que l'on n'a jamais vu échouer n'est
 *    pas digne de confiance. Les deux derniers tests rejouent donc, à chaque
 *    exécution, la forme historique et ses paraphrases, puis les formes
 *    légitimes qu'il doit laisser passer.
 *
 * **Ce que ce garde ne couvre pas, dit franchement :** la réinterprétation
 * déguisée en un saut — une page qui passe la colonne à une fonction locale
 * nommée, ou un module de `lib/` neuf qui rendrait une ligne brute à une page.
 * Le troisième verrou ferme cette porte par le haut ; le premier la referme par
 * le bas, une page n'ayant plus de fournisseur de donnée brute.
 */
describe("Administration Produit — plus aucun cast de colonne stockée", () => {
  it("le parcours est non vacuant : les deux arbres d'Administration sont visités", () => {
    expect(SOURCES_ADMIN.length).toBeGreaterThan(25)
    expect(SOURCES_ADMIN.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/admin/produits/page.tsx",
        "app/admin/produits/[id]/page.tsx",
        "app/admin/produits/nouveau/page.tsx",
        "app/admin/produits/actions.ts",
        "components/admin/product-form.tsx",
        "components/admin/image-gallery-upload.tsx",
        "components/admin/order-status-actions.tsx",
      ])
    )
  })

  it("aucune page ni aucun module de rendu n'atteint la donnée brute ni son interprétation", () => {
    for (const { chemin, source } of SOURCES_ADMIN) {
      for (const brut of MODULES_BRUTS) {
        expect(importeDe(source, brut), `${chemin} → ${brut}`).toBe(false)
      }
    }
    // Témoins positifs : l'instrument voit bien ces deux modules quand ils sont
    // atteints, ailleurs dans le dépôt. Sans eux, les lignes ci-dessus
    // seraient satisfaites par un regard muet.
    expect(
      importeDe(
        lire(import.meta.url, "./use-cases/storefront.ts"),
        "lib/product-metrics"
      )
    ).toBe(true)
    expect(
      importeDe(lire(import.meta.url, "./use-cases/admin-catalog.ts"), "lib/db")
    ).toBe(true)
  })

  it("aucune page ni aucun module de rendu ne réinterprète une colonne stockée", () => {
    for (const { chemin, source } of SOURCES_ADMIN) {
      expect(reinterpretations(source), chemin).toEqual([])
    }
  })

  it("la garde reconnaît le cast d'une colonne stockée, et épargne le reste", () => {
    // La forme historique, mot pour mot.
    expect(
      reinterpretations(
        "    specs: (product.specs as Record<string, string>) ?? {},\n" +
          "    images: Array.isArray(product.images) ? (product.images as string[]) : [],\n"
      )
    ).toEqual([
      "Array.isArray(product.images",
      "product.images as ",
      "product.specs as ",
    ])

    // Les paraphrases que le motif doit aussi attraper.
    for (const source of [
      "  specs: produit.specs as unknown as Record<string, string>",
      "  const g = fait.images as unknown as string[]",
      "  specs: JSON.parse(produit.specs as string)",
      "  images: Array.from(produit.images as string[])",
      "  specs: produit.specs\n    as Record<string, string>",
    ]) {
      expect(reinterpretations(source).length, source).toBeGreaterThan(0)
    }

    // Et ce qu'il doit laisser passer : un `Array.isArray` sur autre chose, un
    // cast sans rapport avec une colonne, la comparaison d'un fait, l'import
    // de `next/image` que fait la liste, la lecture d'un fait de
    // spécifications.
    for (const source of [
      "  const statuses = Array.isArray(entry?.value)",
      "  const body = (await response.json().catch(() => null)) as ReponsePresign | null",
      "  const global = globalThis as unknown as { prisma?: PrismaClient }",
      '      product.totalStock === 0 ? "text-destructive" : undefined',
      'import Image from "next/image"',
      '      defaultValue={product ? texteSpecifications(product.specs) : ""}',
    ]) {
      expect(reinterpretations(source), source).toEqual([])
    }
  })

  /**
   * Verrou de compilation : les trois lectures que l'Administration appelle ne
   * répondent pas par une ligne Prisma. C'est le maillon qu'aucun parcours de
   * fichiers ne peut voir — une page qui n'atteint ni la base ni le
   * propriétaire de l'interprétation peut encore recevoir une ligne si la
   * lecture en répond une. Ces trois énoncés sont vérifiés par
   * `npm run typecheck`, et par rien d'autre : `expectTypeOf` est un no-op
   * d'exécution.
   *
   * Portée déclarée : ils attrapent une lecture redevenue **une ligne**. Ils
   * n'attrapent pas une `select` partielle qui rendrait une colonne brute sous
   * un nom de fait — la forme serait alors indistinguable d'un fait, un
   * `Record<string, string>` étant lui-même un `Json` valide. C'est là que les
   * deux garde-fous textuels reprennent la main : une page ne peut pas nommer
   * la colonne qu'elle réinterprète, et elle n'atteint pas le propriétaire de
   * l'interprétation.
   */
  it("les lectures de l'Administration répondent en faits, pas en lignes Prisma", () => {
    expectTypeOf<
      NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>
    >().not.toExtend<LigneProduitPrisma>()
    expectTypeOf<Awaited<ReturnType<typeof listAdminProducts>>>().not.toExtend<
      LigneProduitPrisma[]
    >()
    // La lecture des catégories répond en exactement les deux faits que le
    // sélecteur affiche — pas la ligne, pas un `Category` déguisé.
    expectTypeOf<
      Awaited<ReturnType<typeof listAdminCategories>>
    >().toEqualTypeOf<{ id: string; name: string }[]>()
  })
})
