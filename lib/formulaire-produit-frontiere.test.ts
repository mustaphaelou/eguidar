import { describe, expect, it } from "vitest"

import {
  atteignables,
  carteDe,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE_NEUTRE = "lib/formulaire-produit.ts"
const BASE = "lib/db.ts"
const CATALOGUE = "lib/use-cases/admin-catalog.ts"

const GRAPHE_ATTENDU = [
  "lib/formulaire-produit.ts",
  "lib/galerie-image-produit.ts",
  "lib/money.ts",
]

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

describe("Formulaire Produit — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni crochet, ni module serveur", () => {
    const { source } = sourceDe(MODULE_NEUTRE)

    for (const symbole of [
      "soumissionDepuisFormData",
      "specificationsDepuisTexte",
      "texteSpecifications",
      "texteEcartPrix",
      "ecartPrixDepuisTexte",
      "galerieSoumiseHorsSuppressionsEnAttente",
      "MESSAGE_FORMULAIRE_INVALIDE",
      "CHAMPS_FORMULAIRE_PRODUIT",
    ]) {
      expect(source, symbole).toContain(symbole)
    }

    expect(source).not.toMatch(/^["']use client["']/m)
    expect(source).not.toMatch(/^["']use server["']/m)
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/)
    expect(source).not.toMatch(/from\s*["']node:/)
    aucuneDependance(source, MODULE_NEUTRE)
  })

  it("le graphe de valeur n'atteint ni la base ni un module serveur, même par un voisin", () => {
    expect(PAR_CHEMIN.has(MODULE_NEUTRE)).toBe(true)
    expect(PAR_CHEMIN.has("lib/carte-produit.ts")).toBe(true)
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
    expect(
      atteignables("app/admin/produits/page.tsx", PAR_CHEMIN).has(BASE)
    ).toBe(true)
  })

  it("la garde distingue un import de type d'un import de valeur, sur le cas exact", () => {
    const reel = sourceDe(MODULE_NEUTRE).source

    expect(importeDe(reel, CATALOGUE)).toBe(true)

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
