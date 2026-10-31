import { describe, expect, it } from "vitest"

import {
  directive,
  empruntsDeValeur,
  importeDe,
  lire,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib"
)

const ACTIONS_SURVEILLEES = [
  "app/admin/automatisations/actions.ts",
  "app/admin/categories/actions.ts",
  "app/admin/commandes/actions.ts",
  "app/admin/livraison/actions.ts",
  "app/admin/medias/actions.ts",
  "app/admin/produits/actions.ts",
  "app/admin/villes/actions.ts",
]

const EMPRUNT_AVANT_518 =
  'import { NO_PARENT_VALUE } from "@/components/admin/category-form"'

const EMPRUNT_AVANT_518_TYPE =
  'import type { NO_PARENT_VALUE } from "@/components/admin/category-form"'

function modulesClients(sources: SourceProduction[]): Set<string> {
  return new Set(
    sources
      .filter(({ source }) => directive(source) === "use client")
      .map(({ chemin }) => chemin)
  )
}

function actionsServeures(sources: SourceProduction[]): SourceProduction[] {
  return sources.filter(
    ({ chemin, source }) =>
      /^app\/admin\/.+\/actions\.ts$/.test(chemin) &&
      directive(source) === "use server"
  )
}

function indexe(sources: SourceProduction[]): Map<string, SourceProduction> {
  return new Map(
    sources.map(({ chemin, source }) => [chemin, { chemin, source }])
  )
}

function empruntsClients(sources: SourceProduction[]): string[] {
  const parChemin = indexe(sources)
  const clients = modulesClients(sources)
  return actionsServeures(sources).flatMap(({ chemin, source }) =>
    empruntsDeValeur(chemin, source, parChemin)
      .filter((emprunt) => clients.has(emprunt.chemin))
      .map((emprunt) => `${chemin} -> ${emprunt.specifieur}`)
  )
}

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

function avecSources(...remplacements: SourceProduction[]): SourceProduction[] {
  const remplaces = new Map(
    remplacements.map(({ chemin, source }) => [chemin, source])
  )
  return SOURCES.map((entree) => {
    const source = remplaces.get(entree.chemin)
    return source === undefined ? entree : { chemin: entree.chemin, source }
  })
}

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
    expect(modulesClients(SOURCES)).toContain(
      "components/admin/category-form.tsx"
    )
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
    expect(lire(import.meta.url, "./produits/actions.ts")).toContain(
      '"@/lib/formulaire-produit"'
    )
    expect(
      directive(lire(import.meta.url, "../../lib/formulaire-produit.ts"))
    ).toBeNull()
    expect(empruntsClients(SOURCES)).toEqual([])
  })

  it("ne s'allume pas sur un composant serveur qui rend un composant client", () => {
    const page = lire(import.meta.url, "./categories/page.tsx")
    expect(directive(page)).toBeNull()
    expect(importeDe(page, "components/admin/tableau-structure")).toBe(true)
    expect(
      directive(
        lire(import.meta.url, "../../components/admin/tableau-structure.tsx")
      )
    ).toBe("use client")
    expect(empruntsClients(SOURCES)).toEqual([])
  })

  it("ne confond pas un prologue de directives et la même chaîne écrite plus bas", () => {
    expect(
      directive('"use client"\n\nexport const cote = "use client"\n')
    ).toBe("use client")
    expect(
      directive('export const cote = "use client"\n"use client"\n')
    ).toBeNull()
    expect(
      directive('// @ts-check\n/* istanbul ignore */\n"use server"\n')
    ).toBe("use server")
    expect(directive('"use server"\n// "use client"\n')).toBe("use server")
  })

  it("ne confond pas l'emprunt de type des actions Commande avec une valeur", () => {
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
