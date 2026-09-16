import { describe, expect, it, vi } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

type OptionsDeSuggestion = { attributesToRetrieve?: string[] }

const { requetesDeSuggestion } = vi.hoisted(() => ({
  requetesDeSuggestion: [] as OptionsDeSuggestion[],
}))

vi.mock("@/lib/meili", async (importOriginal) => {
  const meili = await importOriginal<typeof import("@/lib/meili")>()
  return {
    ...meili,
    getMeiliSearch: () => ({
      index: () => ({
        search: async (_query: string, options: OptionsDeSuggestion) => {
          requetesDeSuggestion.push(options)
          return { hits: [], facetDistribution: undefined }
        },
      }),
    }),
  }
})

/**
 * Frontière client/serveur de la Carte produit.
 *
 * `carte-produit.ts` est partagé des deux côtés de la couture : les
 * composants clients qui rendent une Carte produit l'importent (Produit lié,
 * Carte produit partagée, Recherche/Catalogue, suggestions de Recherche), et
 * les modules de lecture serveur l'importent déjà (`@/lib/use-cases/blog`).
 * Un import de `@/lib/db` y réintroduirait `pg` (`require('dns')`) dans le
 * bundle navigateur et casserait `next build` (Turbopack) — la panne
 * documentée dans `devis-frontiere.test.ts` et `ville-url-frontiere.test.ts`.
 * La directive `"use client"`, un crochet, `next/headers` ou `server-only` le
 * rendraient de même inutilisable d'un des deux côtés.
 *
 * Second verrou : le module reste le propriétaire unique de la projection —
 * la lecture serveur du Produit lié passe par lui au lieu de réassembler les
 * huit faits (première image comprise) sur place.
 *
 * Troisième verrou : chaque surface cliente atteint la Carte produit par le
 * module neutre — directement, ou par la Carte produit partagée pour le
 * Produit lié, qui lui délègue son lien — et la Carte produit rendue reste
 * sans directive.
 *
 * Quatrième verrou : la requête de suggestion garde les six faits de la
 * Suggestion de produit ; `search.test.ts` ne vérifie que le slug, le nom et
 * le Prix courant, donc une liste d'attributs amputée y passerait inaperçue.
 */
describe("Carte produit — frontière client/serveur", () => {
  /**
   * Chaque surface cliente et le module par lequel elle atteint la Carte
   * produit : le Produit lié par la Carte produit partagée, qui porte le lien
   * vers la page Produit ; les autres par le module neutre directement.
   */
  const SURFACES_CLIENTES: Record<string, string> = {
    "produit-lie-carte.tsx": "home-product-card",
    "home-product-card.tsx": "carte-produit",
    "product-card.tsx": "carte-produit",
    "search-suggestions.tsx": "carte-produit",
  }

  it("le module est neutre : ni use client, ni crochet, ni base", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/useState/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le module n'importe ni next/headers ni server-only", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
  })

  it("la lecture serveur du Produit lié projette par le module neutre", () => {
    const blog = lire(import.meta.url, "./use-cases/blog.ts")
    expect(importeDe(blog, "carte-produit")).toBe(true)
    expect(blog).not.toMatch(/image:\s*images\[0\]/)
  })

  it("chaque surface cliente atteint la Carte produit par le module neutre", () => {
    for (const [fichier, module] of Object.entries(SURFACES_CLIENTES)) {
      const source = lire(
        import.meta.url,
        `../components/storefront/${fichier}`
      )
      expect(importeDe(source, module), fichier).toBe(true)
      expect(importeDe(source, "lib/db"), fichier).toBe(false)
    }
  })

  it("la Carte produit rendue reste sans directive", () => {
    const source = lire(
      import.meta.url,
      "../components/storefront/home-product-card.tsx"
    )
    expect(source).not.toMatch(/^"use client"/m)
  })
})

/**
 * La Suggestion de produit demande ses six faits au Document d'index :
 * `id`, `name`, `slug`, `brand`, `images` (dont la première devient l'image)
 * et `minPrice`. Ni le stock total ni la Livraison offerte n'y figurent
 * (CONTEXT.md) ; la requête ne doit donc pas se remettre à les demander.
 */
describe("Suggestion de produit — la requête garde ses six faits", () => {
  it("ne demande à Meili que les six attributs de la Suggestion de produit", async () => {
    const { searchSuggestions } = await import("@/lib/use-cases/search")

    await searchSuggestions("theiere")

    expect(requetesDeSuggestion).toHaveLength(1)
    const attributs = requetesDeSuggestion[0]?.attributesToRetrieve ?? []
    expect(attributs).toHaveLength(6)
    expect(attributs).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "slug",
        "brand",
        "images",
        "minPrice",
      ])
    )
  })
})
