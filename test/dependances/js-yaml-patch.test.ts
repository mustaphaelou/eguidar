import { load } from "js-yaml"
import { describe, expect, it } from "vitest"

declare module "js-yaml" {
  interface LoadOptions {
    maxTotalMergeKeys?: number | undefined
  }
}

function emptyMergeSources(n: number, k: number): string {
  return (
    "arr: &arr [" +
    "{}, ".repeat(n).slice(0, -2) +
    "]\n" +
    "targets:\n" +
    "  - <<: *arr\n".repeat(k)
  )
}

describe("empty merge sources are budgeted", () => {
  it("throws when repeated empty merge sources exhaust the budget", () => {
    expect(() =>
      load(emptyMergeSources(20, 20), { maxTotalMergeKeys: 10 })
    ).toThrow(/maxTotalMergeKeys/)
  })

  it("throws for a single empty merge source when the budget is zero", () => {
    expect(() =>
      load("arr: &a [{}]\nt: {<<: *a}", { maxTotalMergeKeys: 0 })
    ).toThrow(/maxTotalMergeKeys/)
  })

  it("still throws for non-empty merge sources at the same budget", () => {
    expect(() =>
      load("base: &b {a: 1}\nt: {<<: *b}", { maxTotalMergeKeys: 0 })
    ).toThrow(/maxTotalMergeKeys/)
  })

  it("rejects abnormal merge sequences outright", () => {
    expect(() => load(emptyMergeSources(5000, 1), {})).toThrow(
      /abnormal merge sequence size/
    )
  })

  it("keeps ordinary merges working", () => {
    expect(load("defaults: &d {a: 1}\nx: {<<: *d, b: 2}", {})).toEqual({
      defaults: { a: 1 },
      x: { a: 1, b: 2 },
    })
  })
})
