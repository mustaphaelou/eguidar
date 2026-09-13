import { existsSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { logo, site, siteIcon } from "./site"

describe("site", () => {
  it("pins the display identity", () => {
    expect(site.name).toBe("eguidar.com")
    expect(site.legalName).toBe("Eguidar")
    expect(site.contactEmail).toBe("contact@eguidar.com")
  })
})

describe("logo", () => {
  it("pins the logo contract", () => {
    expect(logo.src).toBe("/brand/eguidar-logo.svg")
    expect(logo.width).toBe(1352)
    expect(logo.height).toBe(442.5)
    expect(logo.alt).toBe("eguidar.com")
  })

  it("ships the logo asset", () => {
    expect(existsSync(path.join(process.cwd(), "public", logo.src))).toBe(true)
  })
})

describe("siteIcon", () => {
  it("pins the site icon contract", () => {
    expect(siteIcon.src).toBe("/brand/eguidar-icon-512.png")
    expect(siteIcon.width).toBe(512)
    expect(siteIcon.height).toBe(512)
  })

  it("ships the site icon assets", () => {
    expect(existsSync(path.join(process.cwd(), "public", siteIcon.src))).toBe(
      true
    )
    expect(existsSync(path.join(process.cwd(), "app", "apple-icon.png"))).toBe(
      true
    )
    expect(existsSync(path.join(process.cwd(), "app", "icon.svg"))).toBe(true)
  })
})
