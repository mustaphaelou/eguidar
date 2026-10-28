import { describe, expect, it } from "vitest"

import {
  MEDIAS_LISTING_PATH,
  buildMediasListingUrl,
  parseMediasListingParams,
} from "@/lib/medias-listing"

describe("langage d'URL de la Bibliothèque des médias", () => {
  it("lit une requête complète", () => {
    expect(
      parseMediasListingParams({
        q: "  écran  ",
        inutilisees: "1",
        "sans-alt": "1",
      })
    ).toEqual({ q: "écran", inutilisees: true, sansAlt: true })
  })

  it("ignore une recherche vide et des filtres faux ou inconnus", () => {
    expect(parseMediasListingParams({ q: "   " })).toEqual({})
    expect(
      parseMediasListingParams({ inutilisees: "0", "sans-alt": "non" })
    ).toEqual({})
    expect(parseMediasListingParams({ autre: "valeur" })).toEqual({})
  })

  it("garde la première occurrence d'un paramètre dupliqué", () => {
    expect(
      parseMediasListingParams({
        q: ["premier", "second"],
        inutilisees: ["1", "0"],
      })
    ).toEqual({ q: "premier", inutilisees: true })
  })

  it("accepte les deux graphies vraies", () => {
    expect(parseMediasListingParams({ inutilisees: "true" })).toEqual({
      inutilisees: true,
    })
  })

  it("reconstruit l'URL canonique dans l'ordre q, inutilisees, sans-alt", () => {
    expect(
      buildMediasListingUrl({ q: " écran ", inutilisees: true, sansAlt: true })
    ).toBe(`${MEDIAS_LISTING_PATH}?q=%C3%A9cran&inutilisees=1&sans-alt=1`)
  })

  it("omet les valeurs par défaut", () => {
    expect(buildMediasListingUrl({})).toBe(MEDIAS_LISTING_PATH)
    expect(buildMediasListingUrl({ q: "   " })).toBe(MEDIAS_LISTING_PATH)
  })

  it("fait de l'URL canonique un point fixe", () => {
    for (const params of [
      {},
      { q: "clavier" },
      { inutilisees: true },
      { sansAlt: true },
      { q: "écran", inutilisees: true, sansAlt: true },
    ]) {
      const url = buildMediasListingUrl(params)
      const requete = url.split("?")[1] ?? ""
      const lues = parseMediasListingParams(
        Object.fromEntries(new URLSearchParams(requete))
      )
      expect(buildMediasListingUrl(lues)).toBe(url)
    }
  })
})
