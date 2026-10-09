import { describe, expect, expectTypeOf, it } from "vitest"

import type { Product as LigneProduitPrisma } from "@/lib/generated/prisma/client"
import type {
  getAdminProduct,
  listAdminProducts,
} from "@/lib/use-cases/admin-catalog"
import type { lireOptionsSelecteur } from "@/lib/use-cases/lecture-structure"
import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULES_BRUTS = ["lib/db", "lib/product-metrics"] as const

const GARDE_IS_ARRAY =
  /Array\.isArray\(\s*!?\s*[\w$]+\s*\??\.\s*(?:images|specs)\b/g

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

    for (const source of [
      "  specs: produit.specs as unknown as Record<string, string>",
      "  const g = fait.images as unknown as string[]",
      "  specs: JSON.parse(produit.specs as string)",
      "  images: Array.from(produit.images as string[])",
      "  specs: produit.specs\n    as Record<string, string>",
    ]) {
      expect(reinterpretations(source).length, source).toBeGreaterThan(0)
    }

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

  it("les lectures de l'Administration répondent en faits, pas en lignes Prisma", () => {
    expectTypeOf<
      NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>
    >().not.toExtend<LigneProduitPrisma>()
    expectTypeOf<Awaited<ReturnType<typeof listAdminProducts>>>().not.toExtend<
      LigneProduitPrisma[]
    >()
    expectTypeOf<
      Awaited<ReturnType<typeof lireOptionsSelecteur>>
    >().toEqualTypeOf<{ id: string; name: string }[]>()
  })
})
