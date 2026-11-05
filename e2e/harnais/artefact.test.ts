import { describe, expect, it } from "vitest"

import { buildNecessaire } from "./artefact"

describe("le build de la sonde", () => {
  it("est nécessaire quand aucun artefact n'existe", () => {
    expect(buildNecessaire(null, [])).toBe(true)
  })

  it("est nécessaire quand une source est plus récente que l'artefact", () => {
    expect(
      buildNecessaire(new Date("2026-11-05T10:00:00Z"), [
        new Date("2026-11-05T09:00:00Z"),
        new Date("2026-11-05T10:00:01Z"),
      ])
    ).toBe(true)
  })

  it("n'est pas nécessaire quand l'artefact est au moins aussi récent que ses sources", () => {
    expect(
      buildNecessaire(new Date("2026-11-05T10:00:00Z"), [
        new Date("2026-11-05T09:00:00Z"),
        new Date("2026-11-05T10:00:00Z"),
      ])
    ).toBe(false)
  })
})
