import { describe, expect, it } from "vitest"

import { validateNextPath } from "./validate-next-path"

describe("validateNextPath", () => {
  it("accepts a path starting with a single slash", () => {
    expect(validateNextPath("/panier")).toBe("/panier")
    expect(validateNextPath("/profil/commandes?page=2")).toBe(
      "/profil/commandes?page=2"
    )
  })

  it("rejects protocol-relative URLs", () => {
    expect(validateNextPath("//evil.example")).toBeNull()
    expect(validateNextPath("//evil.example/panier")).toBeNull()
  })

  it("rejects absolute URLs", () => {
    expect(validateNextPath("https://evil.example")).toBeNull()
    expect(validateNextPath("http://evil.example/panier")).toBeNull()
    expect(validateNextPath("javascript:alert(1)")).toBeNull()
  })

  it("rejects null and empty", () => {
    expect(validateNextPath(null)).toBeNull()
    expect(validateNextPath("")).toBeNull()
  })
})
