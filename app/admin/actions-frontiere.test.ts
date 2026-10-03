import { describe, expect, it } from "vitest"

import {
  directive,
  empruntsDeValeur,
  importeDe,
  lire,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur des actions d'Administration.
 *
 * Le défaut que #517 a décrit ne pouvait pas être attrapé par une suite :
 * vitest n'applique pas la transformation RSC, donc `NO_PARENT_VALUE` y
 * restait la vraie chaîne `"none"` pendant que le bundle serveur n'en voyait
 * qu'un mandataire appelable. Les deux verdicts coexistent, et le faux est
 * celui qui part en production. Une suite verte ne dit rien de ce qu'un
 * module serveur voit réellement d'un module client — la seule observation
 * qui tranche est l'analyse statique de la source.
 *
 * Règle (ADR-0028) : la frontière ne se traverse qu'en types. Un `import
 * type` est effacé à la compilation, il ne produit aucun code, donc aucune
 * valeur ne peut s'y remplacer par une autre. Tout le reste s'y remplace :
 * la transformation RSC réécrit les exportations d'un module `"use client"`
 * en mandataires gardés côté client, et une comparaison de valeur contre un
 * mandataire est toujours fausse. Une valeur réellement partagée habite un
 * module neutre, que les deux côtés importent comme une bibliothèque.
 *
 * **La règle se lit sur la directive, jamais sur « tout fichier qui n'est pas
 * client ».** Un composant serveur rend volontairement des composants
 * clients — `app/admin/categories/page.tsx` importe `DeleteCategoryButton`
 * et le rend — et une garde écrite sur l'absence de `"use client"`
 * s'allumerait sur ces imports-là, qui sont justes. Seuls les modules qui
 * *réclament* le côté client subissent la réécriture ; `directive` est donc
 * le seul fait qui décide du rôle de chaque module.
 *
 * **La portée est celle d'aujourd'hui** : les modules `"use server"` dont le
 * chemin est `app/admin/<un dossier>/actions.ts`, la surface où le défaut est
 * né. Les trois actions de la boutique portent aussi la directive et sont
 * hors de ce périmètre ; l'élargissement est la suite naturelle de la règle
 * ESLint `no-restricted-imports` que #520 a laissée en suivi.
 *
 * Le parcours lit `app/`, `components/` et `lib/` entiers, production seule,
 * parce qu'il faut résoudre les spécifieurs pour savoir où ils mènent. C'est
 * le seul endroit où la largeur du parcours se voie : la règle, elle, ne
 * s'applique qu'aux cinq actions.
 */
const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib"
)

/** Les cinq actions serveur que la portée de la garde énumère. */
const ACTIONS_SURVEILLEES = [
  "app/admin/categories/actions.ts",
  "app/admin/commandes/actions.ts",
  "app/admin/livraison/actions.ts",
  "app/admin/produits/actions.ts",
  "app/admin/villes/actions.ts",
]

/**
 * La ligne qu'`app/admin/categories/actions.ts` importait avant #518 — voir
 * `git show 53eb10b^:app/admin/categories/actions.ts`. Une constante `string`
 * empruntée par un module `"use server"` à un module `"use client"` :
 * réécrite en mandataire côté serveur, et la comparaison qu'elle portait
 * (`parentIdRaw !== NO_PARENT_VALUE`) devenait donc toujours vraie.
 */
const EMPRUNT_AVANT_518 =
  'import { NO_PARENT_VALUE } from "@/components/admin/category-form"'

/** Le même emprunt par type — la seule forme que la frontière autorise. */
const EMPRUNT_AVANT_518_TYPE =
  'import type { NO_PARENT_VALUE } from "@/components/admin/category-form"'

/** Les modules clients que la garde surveille, chemins de dépôt. */
function modulesClients(sources: SourceProduction[]): Set<string> {
  return new Set(
    sources
      .filter(({ source }) => directive(source) === "use client")
      .map(({ chemin }) => chemin)
  )
}

/**
 * Les actions serveur que la garde surveille. La liste est **écrite**, pas
 * déduite : `ACTIONS_SURVEILLEES` énumère les cinq actions que la règle énonce,
 * et le témoin de non-vacuité compare les deux. C'est délibéré — un parcours
 * qui déduirait la liste de la source verrait une action neuve entrer dans la
 * règle sans que personne ne l'y ait mise, alors que ce qui est gardé doit être
 * une décision lisible, pas un effet de bord du balayage. Le prix se paie ici :
 * une action neuve fait échouer ce témoin jusqu'à ce qu'on la nomme, et c'est
 * le but — la règle ne s'élargit pas dans le dos du lecteur.
 */
function actionsServeures(sources: SourceProduction[]): SourceProduction[] {
  return sources.filter(
    ({ chemin, source }) =>
      /^app\/admin\/.+\/actions\.ts$/.test(chemin) &&
      directive(source) === "use server"
  )
}

/** Les sources du dépôt indexées par leur chemin, comme les gardes les lisent. */
function indexe(sources: SourceProduction[]): Map<string, SourceProduction> {
  return new Map(
    sources.map(({ chemin, source }) => [chemin, { chemin, source }])
  )
}

/**
 * Les emprunts de valeur qui franchissent la frontière : un module
 * `"use server"` qui tire autre chose qu'un type d'un module `"use client"`.
 * Un emprunt par ligne, écrit `« émetteur -> spécifieur »`.
 */
function empruntsClients(sources: SourceProduction[]): string[] {
  const parChemin = indexe(sources)
  const clients = modulesClients(sources)
  return actionsServeures(sources).flatMap(({ chemin, source }) =>
    empruntsDeValeur(chemin, source, parChemin)
      .filter((emprunt) => clients.has(emprunt.chemin))
      .map((emprunt) => `${chemin} -> ${emprunt.specifieur}`)
  )
}

/**
 * La source d'un fichier de l'Administration, une ligne insérée après l'ancre
 * donnée. L'ancre doit exister : une ancre disparue laisserait le `replace`
 * ne rien faire, et la suite se tairait sans le dire — le seul moyen qu'elle
 * ait de mentir.
 */
function sourceApres(
  cheminFichier: string,
  ancre: string,
  ligne: string
): string {
  const source = lire(import.meta.url, cheminFichier)
  if (!source.includes(ancre)) {
    throw new Error(`Ancre absente de ${cheminFichier} : ${ancre}`)
  }
  return source.replace(ancre, `${ancre}\n${ligne}\n`)
}

/**
 * Les sources de la garde, celles des chemins donnés remplacées par d'autres.
 * Le remplacement se fait *en place*, sur le chemin réel du fichier : la suite
 * n'invente ni chemin ni module, elle fait varier la source d'un fichier qui
 * existe, ce qui laisse au cas ses voisins — dont la cible client — dans leur
 * état véritable.
 */
function avecSources(...remplacements: SourceProduction[]): SourceProduction[] {
  const remplaces = new Map(
    remplacements.map(({ chemin, source }) => [chemin, source])
  )
  return SOURCES.map((entree) => {
    const source = remplaces.get(entree.chemin)
    return source === undefined ? entree : { chemin: entree.chemin, source }
  })
}

/** Une seule source remplacée — la forme la plus courante. */
function avecSource(chemin: string, source: string): SourceProduction[] {
  return avecSources({ chemin, source })
}

describe("Administration — frontière client/serveur des actions", () => {
  it("aucune action n'emprunte de valeur à un module client", () => {
    expect(empruntsClients(SOURCES)).toEqual([])
  })

  it("le parcours est non vacuant : il voit les actions et leurs cibles client", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(actionsServeures(SOURCES).map(({ chemin }) => chemin)).toEqual(
      ACTIONS_SURVEILLEES
    )
    // La cible du défaut est bien reconnue comme client : sans ce témoin, le
    // cas rejoué plus bas pourrait être vert parce que la cible manque à
    // l'instrument, et non parce que l'emprunt par type est permis.
    expect(modulesClients(SOURCES)).toContain(
      "components/admin/category-form.tsx"
    )
    // Témoin positif, dans l'autre sens : les actions empruntent bien des
    // valeurs — la garde ne passe pas parce qu'elle ne voit rien.
    expect(
      empruntsDeValeur(
        "app/admin/categories/actions.ts",
        lire(import.meta.url, "./categories/actions.ts"),
        indexe(SOURCES)
      ).length
    ).toBeGreaterThan(0)
  })
})

describe("Administration — la garde sait nommer l'emprunt interdit", () => {
  it("signale l'import que #518 a retiré des actions Structure", () => {
    const avant518 = avecSource(
      "app/admin/categories/actions.ts",
      sourceApres(
        "./categories/actions.ts",
        'import { redirect } from "next/navigation"\n',
        EMPRUNT_AVANT_518
      )
    )

    // Témoin : la ligne a bien été remise dans le fichier réel, pas dans une
    // source fabriquée à côté.
    expect(
      avant518.find(
        ({ chemin }) => chemin === "app/admin/categories/actions.ts"
      )?.source
    ).toContain(EMPRUNT_AVANT_518)

    expect(empruntsClients(avant518)).toEqual([
      "app/admin/categories/actions.ts -> @/components/admin/category-form",
    ])
  })

  it("le voit par l'alias, le relatif et le réexport", () => {
    // Trois écritures, un seul verdict : ce qui est interdit l'est aussi par
    // le chemin relatif, et un réexport est un emprunt comme un autre.
    for (const specifieur of [
      "@/components/admin/category-form",
      "../../../components/admin/category-form",
    ]) {
      expect(
        empruntsClients([
          ...SOURCES,
          {
            chemin: "app/admin/fictif/actions.ts",
            source: `"use server"\n\nimport { CategoryForm } from "${specifieur}"\n`,
          },
        ]),
        specifieur
      ).toEqual([`app/admin/fictif/actions.ts -> ${specifieur}`])
    }

    expect(
      empruntsClients([
        ...SOURCES,
        {
          chemin: "app/admin/fictif/actions.ts",
          source:
            '"use server"\n\nexport { CategoryForm } from "@/components/admin/category-form"\n',
        },
      ])
    ).toEqual([
      "app/admin/fictif/actions.ts -> @/components/admin/category-form",
    ])
  })

  it("nomme l'un et se tait sur l'autre, sur deux actions du dépôt", () => {
    // Les deux mêmes gestes, faits sur deux fichiers qui existent : une
    // valeur empruntée au formulaire client, et le même emprunt par type dans
    // une autre action. Un seul appel de la garde, sur le même parcours : il
    // doit nommer la première et ne rien dire de la seconde. C'est le cas le
    // plus fort de la suite — ni source fabriquée, ni chemin inventé, et les
    // deux verdicts tombent ensemble.
    expect(
      empruntsClients(
        avecSources(
          {
            chemin: "app/admin/categories/actions.ts",
            source: sourceApres(
              "./categories/actions.ts",
              'import { redirect } from "next/navigation"\n',
              'import { CategoryForm } from "@/components/admin/category-form"'
            ),
          },
          {
            chemin: "app/admin/produits/actions.ts",
            source: sourceApres(
              "./produits/actions.ts",
              '"use server"\n',
              'import type { CategoryFormProps } from "@/components/admin/category-form"'
            ),
          }
        )
      )
    ).toEqual([
      "app/admin/categories/actions.ts -> @/components/admin/category-form",
    ])
  })
})

describe("Administration — ce que la frontière autorise", () => {
  it("laisse passer le même emprunt, importé par type", () => {
    // Le seul écart avec le cas de #518 est le mot `type`, et c'est lui qui
    // décide : effacé à la compilation, l'emprunt ne produit aucun code, donc
    // la transformation RSC n'a rien à réécrire.
    expect(
      empruntsClients(
        avecSource(
          "app/admin/categories/actions.ts",
          sourceApres(
            "./categories/actions.ts",
            'import { redirect } from "next/navigation"\n',
            EMPRUNT_AVANT_518_TYPE
          )
        )
      )
    ).toEqual([])
  })

  it("laisse passer une valeur venue d'un module neutre", () => {
    // Les actions Produits empruntent `@/lib/formulaire-produit` pour sa
    // valeur, et c'est juste : ce module ne porte aucune directive, donc rien
    // ne le réécrit. Une garde confuse confondrait les deux cas.
    expect(lire(import.meta.url, "./produits/actions.ts")).toContain(
      '"@/lib/formulaire-produit"'
    )
    expect(
      directive(lire(import.meta.url, "../../lib/formulaire-produit.ts"))
    ).toBeNull()
    expect(empruntsClients(SOURCES)).toEqual([])
  })

  it("ne s'allume pas sur un composant serveur qui rend un composant client", () => {
    // Le piège nommé d'ADR-0028 : une garde sur « les fichiers qui ne sont
    // pas clients » verrait cet import, qui est le plus légitime du dépôt.
    const page = lire(import.meta.url, "./categories/page.tsx")
    expect(directive(page)).toBeNull()
    expect(importeDe(page, "components/admin/delete-category-button")).toBe(
      true
    )
    expect(empruntsClients(SOURCES)).toEqual([])
  })

  it("ne confond pas un prologue de directives et la même chaîne écrite plus bas", () => {
    // Une directive est une réclamation, pas une chaîne : elle ne vaut que
    // parce qu'elle ouvre le fichier. Le module ci-dessous porte la chaîne
    // deux fois — une fois en tête, une fois dans une comparaison, en pleine
    // ligne — et n'est un module client que par sa première ligne. L'inverse
    // compte autant : un module qui n'écrit la chaîne qu'au milieu ne réclame
    // aucun côté, et une garde qui le lisait client le rangerait à tort du
    // côté des réécritures RSC.
    expect(
      directive('"use client"\n\nexport const cote = "use client"\n')
    ).toBe("use client")
    expect(
      directive('export const cote = "use client"\n"use client"\n')
    ).toBeNull()
    // Les commentaires précèdent la réclamation sans l'annuler : un module qui
    // s'auto-exclut de Biome, ou qui se présente, garde bien sa place.
    expect(
      directive('// @ts-check\n/* istanbul ignore */\n"use server"\n')
    ).toBe("use server")
    expect(directive('"use server"\n// "use client"\n')).toBe("use server")
  })

  it("ne confond pas l'emprunt de type des actions Commande avec une valeur", () => {
    // `importeDe` voit les imports de type comme les autres — il jette le
    // `typeOnly` que `referencesDeSource` calcule — et une garde bâtie sur lui
    // seul signalerait cette ligne. `empruntsDeValeur` la laisse passer, et la
    // cible est de surcroît neutre : le client Prisma généré ne porte aucune
    // directive, donc ce silence est doublement justifié.
    const commandes = lire(import.meta.url, "./commandes/actions.ts")
    expect(importeDe(commandes, "lib/generated/prisma/client")).toBe(true)
    expect(
      empruntsDeValeur(
        "app/admin/commandes/actions.ts",
        commandes,
        indexe(SOURCES)
      ).map(({ chemin }) => chemin)
    ).not.toContain("lib/generated/prisma/client.ts")
    expect(
      directive(lire(import.meta.url, "../../lib/generated/prisma/client.ts"))
    ).toBeNull()
  })
})
