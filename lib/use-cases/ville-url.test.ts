import { describe, expect, it } from "vitest"

import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"
import { resoudreVilleUrl, villeVersParam } from "@/lib/use-cases/ville-url"

const city = (
  id: string,
  name: string,
  fee: number,
  slug = `slug-${id}`
): DeliveryCityOption => ({
  id,
  slug,
  name,
  fee,
})

const cities = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

describe("villeVersParam (langage d'URL de la Ville : le slug seul)", () => {
  it("writes the slug, never the internal identifier", () => {
    const ville = city(
      "cmsp6pvbu000052p6o2m9o8zw",
      "Casablanca",
      2500,
      "casablanca"
    )

    expect(villeVersParam(ville)).toBe("?ville=casablanca")
    expect(villeVersParam(ville)).not.toContain(ville.id)
  })

  it("percent-encodes a slug that needs encoding", () => {
    expect(villeVersParam({ slug: "kénitra" })).toBe("?ville=k%C3%A9nitra")
    expect(villeVersParam({ slug: "a b" })).toBe("?ville=a%20b")
  })

  it("returns the exact ?ville= fragment, nothing else", () => {
    expect(villeVersParam({ slug: "rabat" })).toBe("?ville=rabat")
  })
})

describe("resoudreVilleUrl (langage d'URL de la Ville : slug puis alias)", () => {
  it("resolves the slug first", () => {
    expect(resoudreVilleUrl(cities, "slug-c1")).toStrictEqual({
      urlVilleId: "c1",
      urlVilleFournie: true,
    })
  })

  it("resolves the legacy internal identifier as a read-only alias", () => {
    expect(resoudreVilleUrl(cities, "c2")).toStrictEqual({
      urlVilleId: "c2",
      urlVilleFournie: true,
    })
  })

  it("prefers a slug over another city's id alias", () => {
    const collision = [
      city("c1", "Casablanca", 3500, "c2"),
      city("c2", "Rabat", 5000),
    ]

    expect(resoudreVilleUrl(collision, "c2")).toStrictEqual({
      urlVilleId: "c1",
      urlVilleFournie: true,
    })
  })

  it("yields no lien for absent or blank values", () => {
    for (const villeParam of [undefined, null, "", "   "] as const) {
      expect(resoudreVilleUrl(cities, villeParam)).toStrictEqual({
        urlVilleId: null,
        urlVilleFournie: false,
      })
    }
  })

  it("keeps an unknown lien explicit: fourni true, aucune ville", () => {
    expect(resoudreVilleUrl(cities, "ville-inconnue")).toStrictEqual({
      urlVilleId: null,
      urlVilleFournie: true,
    })
  })

  it("trims the requested value", () => {
    expect(resoudreVilleUrl(cities, "  slug-c1  ")).toStrictEqual({
      urlVilleId: "c1",
      urlVilleFournie: true,
    })
    expect(resoudreVilleUrl(cities, "  c2  ")).toStrictEqual({
      urlVilleId: "c2",
      urlVilleFournie: true,
    })
  })
})
