import { describe, expect, it } from "vitest"

import {
  lireFiltres,
  parametresDeFiltre,
  type CleDeFiltre,
} from "@/lib/filtre-de-recherche"
import type { SearchFilters } from "@/lib/search-params"

function paramsDepuis(
  paires: readonly (readonly [CleDeFiltre, string])[]
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}
  for (const [cle, valeur] of paires) {
    const existantes = params[cle]
    params[cle] =
      existantes === undefined
        ? valeur
        : [...(Array.isArray(existantes) ? existantes : [existantes]), valeur]
  }
  return params
}

describe("lireFiltres", () => {
  it("relit ce que parametresDeFiltre a écrit", () => {
    const filtres: SearchFilters = {
      brand: ["Sony", "LG"],
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    }

    const parametres = parametresDeFiltre(filtres)

    expect(parametres).toEqual([
      ["marque", "Sony"],
      ["marque", "LG"],
      ["categorie", "audio-hifi"],
      ["prix", "2500-5000"],
    ])
    expect(lireFiltres(paramsDepuis(parametres))).toEqual(filtres)
  })

  it("lit une marque unique héritée comme une liste d'un élément", () => {
    expect(lireFiltres({ marque: "Sony" })).toEqual({ brand: ["Sony"] })
  })

  it("rogne les marques, écarte les vides et déduplique dans l'ordre d'apparition", () => {
    expect(
      lireFiltres({ marque: [" Sony ", "", "   ", "LG", "Sony", "LG "] })
    ).toEqual({ brand: ["Sony", "LG"] })
  })

  it("retient la première valeur d'une clé unique répétée, la rogne et écarte le vide", () => {
    expect(
      lireFiltres({
        categorie: [" audio-hifi ", "enceintes"],
        prix: [" 2500-5000 ", "0-1000"],
      })
    ).toEqual({
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
    expect(lireFiltres({ categorie: "   ", prix: "  " })).toEqual({})
  })

  it("ignore une tranche de prix inconnue", () => {
    expect(lireFiltres({ marque: "Sony", prix: "tranche-imaginaire" })).toEqual(
      { brand: ["Sony"] }
    )
  })
})
