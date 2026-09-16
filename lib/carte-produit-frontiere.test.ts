import { describe, expect, it, vi } from "vitest"

import type { Meilisearch } from "meilisearch"

import type { RequeteMoteur } from "@/lib/moteur-recherche"
import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

type OptionsDeSuggestion = { attributesToRetrieve?: string[] }

const { requetesDeSuggestion } = vi.hoisted(() => ({
  requetesDeSuggestion: [] as OptionsDeSuggestion[],
}))

vi.mock("@/lib/meili", async (importOriginal) => {
  const meili = await importOriginal<typeof import("@/lib/meili")>()
  const client = {
    index: () => ({
      search: async (_query: string, options: OptionsDeSuggestion) => {
        requetesDeSuggestion.push(options)
        return { hits: [], facetDistribution: undefined }
      },
    }),
  }
  return {
    ...meili,
    getMeiliSearch: () => client,
    // #364 : la Recherche atteint Meili par la couture — `searchSuggestions`
    // passe par `moteurMeili()`, jamais par `getMeiliSearch()` directement.
    // Le moteur de substitution est donc bâti sur le client enregistreur,
    // sans quoi l'adaptateur réel serait court-circuité et la garde
    // n'observerait plus la requête que Meili reçoit vraiment.
    moteurMeili: () => ({
      chercher: (requete: RequeteMoteur) =>
        meili.chercherAvecMeili(client as unknown as Meilisearch, requete),
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
 * Premier verrou : le module n'importe **rien du tout** — son graphe
 * transitif est vide, donc sa neutralité ne dépend d'aucun voisin et
 * « un import imprudent ne peut jamais tirer la base dans le bundle
 * navigateur » est inconditionnel.
 *
 * Deuxième verrou : le module reste le propriétaire unique de la projection —
 * la lecture serveur du Produit lié passe par lui au lieu de réassembler les
 * huit faits (première image comprise) sur place.
 *
 * Troisième verrou : chaque surface cliente atteint la Carte produit par le
 * module neutre — directement, ou par la Carte produit partagée pour le
 * Produit lié, qui lui délègue son lien.
 *
 * Quatrième verrou : aucun composant qui importe la Carte produit n'importe
 * la base — parcours de tout `components/`, pas une liste de quatre noms.
 *
 * Cinquième verrou : `/produit/<slug>` n'est écrit que par `urlProduit`
 * (ADR-0022) — parcours de `app/`, `components/` et `lib/`, donc une surface
 * neuve ne peut pas se remettre à écrire le chemin à la main.
 *
 * Sixième verrou : la requête de suggestion garde les six faits de la
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
    "produit-lie-carte.tsx": "./carte-produit",
    "carte-produit.tsx": "@/lib/carte-produit",
    "product-card.tsx": "@/lib/carte-produit",
    "search-suggestions.tsx": "@/lib/carte-produit",
  }

  it("le module est neutre : ni use client, ni crochet, ni base", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/useState/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le module n'importe rien : sa neutralité est inconditionnelle", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
  })

  it("la lecture serveur du Produit lié projette par le module neutre", () => {
    const blog = lire(import.meta.url, "./use-cases/blog.ts")
    expect(importeDe(blog, "carte-produit")).toBe(true)
    expect(blog).toContain("projeterCarteProduit")
    expect(blog).not.toMatch(/images\[0\]/)
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

  it("aucun composant qui importe la Carte produit n'importe la base", () => {
    const sources = sourcesDeProduction(import.meta.url, "../components")
    // Parcours non vacuant : chaque source de `components/` est visitée.
    expect(sources.length).toBeGreaterThan(50)

    const importateurs = sources.filter(({ source }) =>
      importeDe(source, "carte-produit")
    )
    expect(importateurs.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "components/storefront/carte-produit.tsx",
        "components/storefront/product-card.tsx",
        "components/storefront/produit-lie-carte.tsx",
        "components/storefront/search-suggestions.tsx",
      ])
    )
    for (const { chemin, source } of importateurs) {
      expect(importeDe(source, "lib/db"), chemin).toBe(false)
    }
  })

  it("`/produit/` n'est écrit que par `urlProduit`", () => {
    const sources = sourcesDeProduction(
      import.meta.url,
      "../app",
      "../components",
      "../lib"
    )
    // Parcours non vacuant : les trois arborescences sont visitées, `app/`
    // compris, donc une page neuve ne peut pas échapper au verrou.
    expect(sources.length).toBeGreaterThan(100)
    expect(sources.map(({ chemin }) => chemin)).toContain(
      "app/(boutique)/page.tsx"
    )

    const ecrivains = sources
      .filter(({ source }) => source.includes("/produit/"))
      .map(({ chemin }) => chemin)
    expect(ecrivains).toEqual(["lib/carte-produit.ts"])

    const proprietaire = sources.find(
      ({ chemin }) => chemin === "lib/carte-produit.ts"
    )
    expect(proprietaire?.source.match(/\/produit\//g)).toHaveLength(2)
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

    // La couture interroge le moteur en deux temps pour une suggestion : la
    // page demandée — les six faits — puis le décompte de `categorySlug`
    // (`limit: 0`, sans projection). Seule la page porte la projection.
    const pages = requetesDeSuggestion.filter(
      (options) => options.attributesToRetrieve !== undefined
    )
    expect(pages).toHaveLength(1)
    const attributs = pages[0]?.attributesToRetrieve ?? []
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
