// @vitest-environment happy-dom

import { describe, expect, it } from "vitest"

import { hrefDeSuggestion } from "@/components/storefront/search-suggestions"
import { SLUG_SANS_STRUCTURE } from "@/lib/index-projection"
import { parseSearchParams } from "@/lib/search-params"

describe("la destination d'une suggestion de catégorie", () => {
  it("mène une Structure réelle à sa page", () => {
    expect(hrefDeSuggestion("smartphones")).toBe("/categorie/smartphones")
  })

  it("mène la valeur réservée au Catalogue filtré, et à nulle page de catégorie", () => {
    // `/categorie/_sans-structure` rendrait un `notFound()` : aucune Structure
    // ne porte ce slug, et c'est exactement ce que son caractère réservé
    // garantit. La destination doit donc être ailleurs.
    const href = hrefDeSuggestion(SLUG_SANS_STRUCTURE)

    expect(href.startsWith("/categorie/")).toBe(false)
    expect(href.startsWith("/produits?")).toBe(true)
  })

  it("donne au Catalogue une destination que sa propre lecture reconnaît", () => {
    // La promesse n'est pas « l'URL a l'air juste » : c'est que le filtre
    // survit au voyage. Une sentinelle en chaîne vide se perdrait ici — donc
    // l'épreuve est le voyage.
    const href = hrefDeSuggestion(SLUG_SANS_STRUCTURE)
    const params: Record<string, string> = {}
    for (const [cle, valeur] of new URL(href, "http://localhost").searchParams)
      params[cle] = valeur
    const { filters } = parseSearchParams(params, "nouveautes")

    expect(filters.categorySlug).toBe(SLUG_SANS_STRUCTURE)
  })
})
