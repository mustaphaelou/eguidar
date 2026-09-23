import { describe, expect, it } from "vitest"

import { retirerFacette } from "@/lib/moteur-recherche"

describe("retirerFacette", () => {
  const filters = {
    brand: ["Sony"],
    categorySlug: "audio-hifi",
    priceBucketId: "2500-5000",
  }

  it("removes the targeted facet clause and keeps the other filters", () => {
    expect(retirerFacette(filters, "brand")).toEqual({
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
    expect(retirerFacette(filters, "categorySlug")).toEqual({
      brand: ["Sony"],
      priceBucketId: "2500-5000",
    })
    expect(retirerFacette(filters, "priceBucket")).toEqual({
      brand: ["Sony"],
      categorySlug: "audio-hifi",
    })
  })

  it("leaves empty filters empty", () => {
    expect(retirerFacette({}, "brand")).toEqual({})
  })

  it("removes the key instead of blanking it and never mutates its argument", () => {
    const restants = retirerFacette(filters, "brand")

    expect(restants).not.toBe(filters)
    expect("brand" in restants).toBe(false)
    expect(filters).toEqual({
      brand: ["Sony"],
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
  })
})
