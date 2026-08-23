import { describe, expect, it } from "vitest"

import { logoBrand, site } from "./site"

describe("site", () => {
  it("pins the display identity", () => {
    expect(site.name).toBe("eguidar.ma")
    expect(site.legalName).toBe("Eguidar")
    expect(site.contactEmail).toBe("contact@eguidar.ma")
  })
})

describe("logoBrand", () => {
  it("splits the display name into the two-tone parts", () => {
    expect(logoBrand.base).toBe("eguidar")
    expect(logoBrand.accent).toBe(".ma")
  })

  it("recombines into the display name", () => {
    expect(`${logoBrand.base}${logoBrand.accent}`).toBe(site.name)
  })
})
