import { existsSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { brand, site } from "./site"

describe("site", () => {
  it("pins the display identity", () => {
    expect(site.name).toBe("eguidar.com")
    expect(site.legalName).toBe("Eguidar")
    expect(site.contactEmail).toBe("contact@eguidar.com")
  })
})

describe("brand", () => {
  it("pins the lockup contract", () => {
    expect(brand.lockup.src).toBe("/brand/eguidar-logo.svg")
    expect(brand.lockup.width).toBe(1352)
    expect(brand.lockup.height).toBe(442)
    expect(brand.lockup.alt).toBe("eguidar.com")
  })

  it("ships the lockup asset", () => {
    expect(
      existsSync(path.join(process.cwd(), "public", brand.lockup.src))
    ).toBe(true)
  })
})
