import { describe, expect, it } from "vitest"

import {
  atteignables,
  carteDe,
  directive,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE_NEUTRE = "lib/marche-structure.ts"
const BASE = "lib/db.ts"
const AIDE_FRONTIERE = "lib/use-cases/outils-frontiere.ts"

const SYMBOLES = [
  "marcheStructure",
  "marcheDesStructures",
  "liensDesStructures",
  "LiensStructure",
  "StructureLue",
  "MarcheStructure",
  "ancetres",
  "descendance",
  "horsArbre",
  "racines",
  "enfantsDe",
  "StructureOrdonnee",
  "comparerParNom",
  "complementDepuis",
] as const

const MODULES_INTERDITS = [
  "lib/db",
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

const CHEMINS_INTERDITS = [
  BASE,
  "lib/use-cases/storefront.ts",
  "lib/use-cases/admin-structure.ts",
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

describe("Marche de la Structure — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni crochet, ni module serveur", () => {
    const { source } = sourceDe(MODULE_NEUTRE)

    for (const symbole of SYMBOLES) {
      expect(source, symbole).toContain(symbole)
    }

    expect(source).not.toMatch(/^["']use client["']/m)
    expect(source).not.toMatch(/^["']use server["']/m)
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/)
    expect(source).not.toMatch(/from\s*["']node:/)
    aucuneDependance(source, MODULE_NEUTRE)
  })

  it("le graphe de valeur n'atteint ni la base ni un module serveur", () => {
    expect(PAR_CHEMIN.has(MODULE_NEUTRE)).toBe(true)
    expect(PAR_CHEMIN.has("lib/carte-produit.ts")).toBe(true)
    expect(ATTEINTS.size).toBeGreaterThan(0)
    expect(ATTEINTS.has(MODULE_NEUTRE)).toBe(true)

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

  it("aucun module client n'atteint la Marche, et le composant de suppression ne l'importe plus", () => {
    const CLIENT = "components/admin/delete-category-button.tsx"
    expect(PAR_CHEMIN.has(CLIENT)).toBe(true)
    expect(directive(sourceDe(CLIENT).source)).toBe("use client")

    const atteints = atteignables(CLIENT, PAR_CHEMIN)
    expect(atteints.has(MODULE_NEUTRE)).toBe(false)

    for (const interdit of [
      BASE,
      "lib/use-cases/storefront.ts",
      "lib/use-cases/admin-structure.ts",
      "lib/use-cases/lecture-structure.ts",
      "lib/generated/prisma/client.ts",
    ]) {
      expect(atteints.has(interdit), interdit).toBe(false)
    }

    for (const chemin of atteints) {
      const { source } = sourceDe(chemin)
      expect(source, chemin).not.toMatch(/^["']use server["']/m)
      for (const nom of [
        "lib/db",
        "server-only",
        "next/headers",
        "next/cache",
      ]) {
        expect(importeDe(source, nom), `${chemin} → ${nom}`).toBe(false)
      }
    }

    const clients = SOURCES.filter(
      ({ source }) => directive(source) === "use client"
    )
    expect(clients.length).toBeGreaterThan(0)
    expect(clients.map(({ chemin }) => chemin)).toContain(CLIENT)
    for (const { chemin } of clients) {
      expect(
        atteignables(chemin, PAR_CHEMIN).has(MODULE_NEUTRE),
        `${chemin} → ${MODULE_NEUTRE}`
      ).toBe(false)
    }
  })

  it("le parcours est non vacuant : les arbres sont visités, et la base se laisse trouver", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/(boutique)/page.tsx",
        "app/admin/categories/page.tsx",
        "components/admin/delete-category-button.tsx",
        MODULE_NEUTRE,
      ])
    )
    expect(
      atteignables("app/admin/categories/page.tsx", PAR_CHEMIN).has(BASE)
    ).toBe(true)
  })

  it("la garde tombe sur une violation synthétique, écrite dans le module réel", () => {
    const reel = sourceDe(MODULE_NEUTRE).source
    const premiereLigne = reel.split("\n")[0]!
    const enViolation = `${premiereLigne}\nimport { prisma } from "@/lib/db"\n${reel.slice(premiereLigne.length)}`

    expect(enViolation).not.toBe(reel)
    expect(importeDe(enViolation, BASE)).toBe(true)
    expect(
      atteignables(
        MODULE_NEUTRE,
        new Map(PAR_CHEMIN).set(MODULE_NEUTRE, {
          chemin: MODULE_NEUTRE,
          source: enViolation,
        })
      ).has(BASE)
    ).toBe(true)

    const enType = `${premiereLigne}\nimport type { PrismaClient } from "@/lib/db"\n${reel.slice(premiereLigne.length)}`
    expect(
      atteignables(
        MODULE_NEUTRE,
        new Map(PAR_CHEMIN).set(MODULE_NEUTRE, {
          chemin: MODULE_NEUTRE,
          source: enType,
        })
      ).has(BASE)
    ).toBe(false)
  })

  it("la garde suit un voisin, pas seulement la graine", () => {
    const voisin = carteDe(
      [MODULE_NEUTRE, 'import { aider } from "@/lib/voisin"\n'],
      ["lib/voisin.ts", 'import { prisma } from "@/lib/db"\n'],
      [BASE, ""]
    )
    expect(atteignables(MODULE_NEUTRE, voisin).has(BASE)).toBe(true)

    const voisinNeutre = carteDe(
      [MODULE_NEUTRE, 'import { aider } from "@/lib/voisin"\n'],
      ["lib/voisin.ts", "export const aider = 1\n"],
      [BASE, ""]
    )
    expect(atteignables(MODULE_NEUTRE, voisinNeutre).has(BASE)).toBe(false)
  })

  it("les aides de frontière ne sont pas dans le graphe du module", () => {
    expect(ATTEINTS.has(AIDE_FRONTIERE)).toBe(false)
    expect([...ATTEINTS]).toEqual([MODULE_NEUTRE])
  })
})
