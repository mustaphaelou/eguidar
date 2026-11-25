import { describe, expect, it } from "vitest"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const SURFACES = [
  "components/storefront/global-nav-bar.tsx",
  "components/storefront/apercu-du-panier-surface.tsx",
  "components/storefront/footer.tsx",
  "components/storefront/apple-breadcrumb.tsx",
  "components/storefront/bande-categories.tsx",
  "components/storefront/barre-d-achat.tsx",
] as const

describe("Conteneur de la boutique — une seule mesure", () => {
  it("tient la largeur de la page et sa gouttière", () => {
    expect(CONTENEUR_BOUTIQUE.split(" ")).toEqual([
      "mx-auto",
      "w-full",
      "max-w-[980px]",
      "px-4",
      "sm:px-6",
    ])
  })

  it.each(SURFACES)("%s lit la mesure, il ne l'écrit pas", (fichier) => {
    const source = lire(import.meta.url, `../${fichier}`)

    expect(importeDe(source, "lib/conteneur-boutique"), fichier).toBe(true)
    expect(source, fichier).not.toMatch(/max-w-\[/m)
    expect(source, fichier).not.toMatch(/\bp[xlr]-\[/m)
  })

  it("aucune surface de la boutique ne réintroduit sa propre largeur", () => {
    const sources = [
      ...sourcesDeProduction(import.meta.url, "../components/storefront"),
      ...sourcesDeProduction(import.meta.url, "../app/(boutique)"),
    ]

    expect(sources.length).toBeGreaterThan(50)

    const coupables = sources
      .filter(
        ({ source }) =>
          source.includes("max-w-[1024px]") || source.includes("sm:px-[22px]")
      )
      .map(({ chemin }) => chemin)

    expect(coupables).toEqual([])
  })
})
