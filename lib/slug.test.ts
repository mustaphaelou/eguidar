import { describe, expect, it } from "vitest"

import { slugify } from "@/lib/slug"

describe("slugify", () => {
  it("folds accents and lowercases a French city name", () => {
    expect(slugify("Kénitra")).toBe("kenitra")
    expect(slugify("Fès")).toBe("fes")
    expect(slugify("Tétouan")).toBe("tetouan")
    expect(slugify("Meknès")).toBe("meknes")
  })

  it("folds uppercase accents", () => {
    expect(slugify("ÉTÉ")).toBe("ete")
  })

  it("turns spaces and punctuation into single hyphens", () => {
    expect(slugify("L'Oasis & Région")).toBe("l-oasis-region")
    expect(slugify("Aïn  Sebaâ")).toBe("ain-sebaa")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  Fès  ")).toBe("fes")
    expect(slugify("--Fès--")).toBe("fes")
  })

  it("returns an empty string when nothing alphanumeric remains", () => {
    expect(slugify("")).toBe("")
  })
})
