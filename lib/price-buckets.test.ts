import { describe, expect, it } from "vitest"

import {
  getPriceBucket,
  PRICE_BUCKETS,
  priceBucketIdFor,
} from "@/lib/price-buckets"

describe("price buckets", () => {
  it("maps every price to a bucket, inclusive of the lower bound and exclusive of the upper bound", () => {
    expect(priceBucketIdFor(0)).toBe("0-1000")
    expect(priceBucketIdFor(99999)).toBe("0-1000")
    expect(priceBucketIdFor(100000)).toBe("1000-2500")
    expect(priceBucketIdFor(250000)).toBe("2500-5000")
    expect(priceBucketIdFor(500000)).toBe("5000-10000")
    expect(priceBucketIdFor(1000000)).toBe("10000-plus")
    expect(priceBucketIdFor(1000001)).toBe("10000-plus")
    expect(priceBucketIdFor(Number.MAX_SAFE_INTEGER)).toBe("10000-plus")
  })

  it("maps the exact lower bound of the top bucket correctly", () => {
    expect(priceBucketIdFor(1000000)).toBe("10000-plus")
    expect(priceBucketIdFor(999999)).toBe("5000-10000")
  })

  it("exposes buckets ordered from cheapest to most expensive with unique ids", () => {
    expect(PRICE_BUCKETS.map((bucket) => bucket.id)).toEqual([
      "0-1000",
      "1000-2500",
      "2500-5000",
      "5000-10000",
      "10000-plus",
    ])
    expect(new Set(PRICE_BUCKETS.map((bucket) => bucket.id)).size).toBe(
      PRICE_BUCKETS.length
    )
    for (const bucket of PRICE_BUCKETS) {
      expect(bucket.label.length).toBeGreaterThan(0)
      expect(bucket.minCents).toBeGreaterThanOrEqual(0)
      if (bucket.maxCents !== null) {
        expect(bucket.maxCents).toBeGreaterThan(bucket.minCents)
      }
    }
  })

  it("looks buckets up by id and rejects unknown ids", () => {
    expect(getPriceBucket("2500-5000")?.label).toBe("2 500 – 5 000 MAD")
    expect(getPriceBucket("inconnu")).toBeUndefined()
    expect(getPriceBucket(undefined)).toBeUndefined()
  })
})
