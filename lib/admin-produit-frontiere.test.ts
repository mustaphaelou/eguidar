import { describe, expect, expectTypeOf, it } from "vitest"

import type { Product as LigneProduitPrisma } from "@/lib/generated/prisma/client"
import type {
  getAdminProduct,
  listAdminCategories,
  listAdminProducts,
} from "@/lib/use-cases/admin-catalog"
import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière de l'Administration Produit : plus aucun module de rendu ne
 * réinterprète une colonne JSON stockée (ADR-0026).
 *
 * Ce que ce travail a retiré du chemin de lecture de l'Administration, ce sont
 * des **copies** : une colonne `images` devenait une galerie à sept endroits et
 * une colonne `specs` devenait un enregistrement à quatre, deux d'un `as` non
 * vérifié. `lib/formulaire-produit-frontiere.test.ts` garde la moitié de ce
 * verrou qui concerne le module neutre — la neutralité client/serveur, qui est
 * la même question pour tout le dépôt. Ici, la question est celle des
 * **surfaces** : une page ou un module de rendu d'Administration peut-il encore
 * toucher à la donnée stockée ? Le nom du fichier dit le sujet — l'Administration
 * Produit, à côté de `lib/use-cases/admin-catalog.ts`, dont il garde la couture.
 */

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
 * entre la colonne et le `as` ne franchit que du **blanc** — un espace, ou un
 * saut de ligne et l'indentation qui le suit, que le formateur insère entre un
 * opérande et son cast. Elle ne franchit donc ni une virgule, ni un `;`, ni une
 * `)`, ni aucune autre expression. C'est cette restriction qui compte : une
 * fenêtre plus large franchissait la virgule et atteignait le cast suivant du
 * même objet, donc attrapait à tort `{ specs: produit.specs, totalStock: n as
 * number }` — où le cast appartient à `n`, pas à la colonne.
 */
const GARDE_CAST = /[\w$]+\s*\??\.\s*(?:images|specs)\b(?:\s|\n\s*)*?\bas\s+/g

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

    // Les paraphrases que le motif doit aussi attraper — dont la seule dont le
    // formateur change la forme, le `as` passant à la ligne d'après.
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
    // spécifications — et les deux casts **suivants** une colonne stockée dans
    // le même objet. Ce sont eux qui ont fait élargir la fenêtre par erreur :
    // elle franchissait la virgule et attrapait le cast d'une autre valeur.
    for (const source of [
      "  const statuses = Array.isArray(entry?.value)",
      "  const body = (await response.json().catch(() => null)) as ReponsePresign | null",
      "  const global = globalThis as unknown as { prisma?: PrismaClient }",
      '      product.totalStock === 0 ? "text-destructive" : undefined',
      'import Image from "next/image"',
      '      defaultValue={product ? texteSpecifications(product.specs) : ""}',
      "    return { specs: produit.specs, totalStock: n as number }",
      "    const t = { images: produit.images, count: liste.length as number }",
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
