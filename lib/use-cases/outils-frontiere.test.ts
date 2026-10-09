import { describe, expect, it } from "vitest"

import {
  atteignables,
  directive,
  empruntsDeValeur,
  importeDe,
  lire,
  sourcesDeProduction,
  sourcesToutes,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const AIDE = "lib/use-cases/outils-frontiere.ts"

function carteDe(...paires: [string, string][]): Map<string, SourceProduction> {
  return new Map(paires.map(([chemin, source]) => [chemin, { chemin, source }]))
}

describe("outils de frontière — la directive qu'une source réclame", () => {
  it("lit la réclamation du prologue entier, et non sa première entrée", () => {
    expect(directive('"use client"')).toBe("use client")
    expect(directive('"use server"')).toBe("use server")
    expect(directive('"use strict";\n"use client"')).toBe("use client")
    expect(directive('"use strict";\n"use server"\n')).toBe("use server")
    expect(directive('// @ts-check\n"use client"\n')).toBe("use client")
    expect(directive('"use client"\n"use server"\n')).toBe("use client")
    expect(directive('"use strict";\n\n\n"use client"\n\n')).toBe("use client")
  })

  it("ne prend pas pour une réclamation une chaîne qui se trouve dans le fichier", () => {
    expect(directive('export const cote = "use client"\n')).toBeNull()
    expect(directive('const x = 1\n"use client"\n')).toBeNull()
    expect(directive("/* use client */\nexport const x = 1\n")).toBeNull()
    expect(directive('"use client"\n// un commentaire\n"use server"\n')).toBe(
      "use client"
    )
    expect(directive("")).toBeNull()
    expect(directive("export const x = 1\n")).toBeNull()
  })
})

describe("outils de frontière — la limite assumée du prologue", () => {
  it("reconnaît une réclamation précédée d'un commentaire, mais pas d'un commentaire intercalé", () => {
    expect(directive('// un commentaire\n"use client"\n')).toBe("use client")
    expect(directive('/* un commentaire */\n"use client"\n')).toBe("use client")
    expect(
      directive('"use strict";\n// un commentaire\n"use client"\n')
    ).toBeNull()
  })
})

describe("outils de frontière — ce qu'un import est", () => {
  it("voit un import de type, un réexport et un import dynamique", () => {
    const source = [
      'import { a } from "@/lib/voisin"',
      'import type { B } from "@/lib/voisin"',
      'export { c } from "@/lib/voisin"',
      'import "@/lib/voisin/effet"',
      'const d = await import("@/lib/voisin/dynamique")',
    ].join("\n")

    expect(importeDe(source, "lib/voisin")).toBe(true)
    expect(importeDe(source, "lib/voisin/effet")).toBe(true)
    expect(importeDe(source, "lib/voisin/dynamique")).toBe(true)
    expect(importeDe(source, "lib/autre")).toBe(false)
    expect(importeDe("export const x = 1\n", "lib/voisin")).toBe(false)
  })

  it("résout un chemin relatif par son dernier segment", () => {
    expect(importeDe('import { meili } from "./meili"\n', "lib/meili")).toBe(
      true
    )
    expect(
      importeDe('import { meili } from "../lib/meili"\n', "lib/meili")
    ).toBe(true)
    expect(importeDe('import { x } from "./autre"\n', "lib/meili")).toBe(false)
  })

  it("ne laisse passer un emprunt de valeur que pour ce qu'il en est", () => {
    const carte = carteDe(
      ["lib/emprunteur.ts", 'import type { Base } from "@/lib/base"'],
      ["lib/base.ts", "export interface Base {}\n"]
    )
    expect(
      empruntsDeValeur(
        "lib/emprunteur.ts",
        carte.get("lib/emprunteur.ts")!.source,
        carte
      )
    ).toEqual([])
    expect(atteignables("lib/emprunteur.ts", carte).has("lib/base.ts")).toBe(
      false
    )

    const enValeur = carteDe(
      ["lib/emprunteur.ts", 'import { base } from "@/lib/base"'],
      ["lib/base.ts", "export const base = 1\n"]
    )
    expect(
      empruntsDeValeur(
        "lib/emprunteur.ts",
        enValeur.get("lib/emprunteur.ts")!.source,
        enValeur
      )
    ).toEqual([{ chemin: "lib/base.ts", specifieur: "@/lib/base" }])
    expect(atteignables("lib/emprunteur.ts", enValeur).has("lib/base.ts")).toBe(
      true
    )
  })
})

describe("outils de frontière — le parcours", () => {
  it('s\'arrête sur un module "use server", et ne franchit pas son graphe', () => {
    const carte = carteDe(
      [
        "lib/appelant.ts",
        'import { agir } from "@/lib/action"\nimport { base } from "@/lib/base"',
      ],
      ["lib/action.ts", '"use server"\nimport { base } from "@/lib/base"'],
      ["lib/base.ts", "export const base = 1\n"]
    )
    const atteints = atteignables("lib/appelant.ts", carte)

    expect(atteints.has("lib/action.ts")).toBe(true)
    expect(atteints.has("lib/base.ts")).toBe(true)
    const sansArret = carteDe(
      ["lib/appelant.ts", 'import { base } from "@/lib/base"'],
      ["lib/base.ts", "export const base = 1\n"]
    )
    expect(atteignables("lib/appelant.ts", sansArret).has("lib/base.ts")).toBe(
      true
    )
  })

  it("ignore un spécifier de paquet, faute de source dans le dépôt", () => {
    const carte = carteDe([
      "lib/appelant.ts",
      'import { x } from "meilisearch"\n',
    ])
    expect(
      empruntsDeValeur(
        "lib/appelant.ts",
        carte.get("lib/appelant.ts")!.source,
        carte
      )
    ).toEqual([])
    expect([...atteignables("lib/appelant.ts", carte)]).toEqual([
      "lib/appelant.ts",
    ])
  })

  it("ne se compte pas elle-même : les aides sont hors du graphe de la graine", () => {
    const carte = carteDe(["lib/neutre.ts", "export const x = 1\n"])
    expect([...atteignables("lib/neutre.ts", carte)]).toEqual(["lib/neutre.ts"])
    expect(atteignables("lib/neutre.ts", carte).has(AIDE)).toBe(false)
  })
})

describe("outils de frontière — le corpus", () => {
  const production = sourcesDeProduction(import.meta.url, "..")
  const toutes = sourcesToutes(import.meta.url, ".")

  it("parcourt un arbre entier et se prouve non vacant", () => {
    expect(production.length).toBeGreaterThan(50)
    expect(production.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        AIDE,
        "lib/marche-structure.ts",
        "lib/use-cases/lecture-structure.ts",
      ])
    )
    expect(production.some(({ chemin }) => chemin.endsWith(".test.ts"))).toBe(
      false
    )
    expect(toutes.map(({ chemin }) => chemin)).toContain(
      AIDE.replace(".ts", ".test.ts")
    )
  })

  it("lit un fichier par rapport au `import.meta.url` de la suite appelante", () => {
    const source = lire(import.meta.url, "./outils-frontiere.ts")
    expect(source).toContain("export function directive")
    expect(source).toContain("export function atteignables")
  })
})
