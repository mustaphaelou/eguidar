import { describe, expect, it } from "vitest"

import { sourcesDeProduction } from "@/lib/use-cases/outils-frontiere"

const SOURCES_ADMINISTRATION = sourcesDeProduction(
  import.meta.url,
  "../../app/admin",
  "../../components/admin"
)

const CONFIRM_NATIF = /\b(?:window\.)?confirm\s*\(/

describe("l'Administration ne demande plus confirmation au navigateur", () => {
  it("aucune source de l'Administration n'appelle le confirm() natif", () => {
    const appels = SOURCES_ADMINISTRATION.filter(({ source }) =>
      CONFIRM_NATIF.test(source)
    ).map(({ chemin }) => chemin)

    expect(appels).toEqual([])
  })
})
