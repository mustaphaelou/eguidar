import { describe, expect, it } from "vitest"

import {
  importeDe,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const SOURCES = sourcesDeProduction(import.meta.url, "../../lib/automations")

const MODULES_DE_MUTATION = [
  "lib/use-cases/admin-catalog",
  "lib/use-cases/admin-structure",
  "lib/use-cases/livraison",
  "lib/use-cases/orders",
]

/**
 * La frontière du travailleur : il lit, il projette et il envoie, mais il
 * n'écrit jamais par un module de mutation — sinon une règle pourrait nourrir
 * le déclencheur qu'elle observe. Et il ne nomme ni Redis ni une seconde
 * plateforme de file.
 */
describe("la frontière des automatisations durables", () => {
  it("n'importe aucun client Redis", () => {
    const coupables = SOURCES.filter(
      ({ source }) => importeDe(source, "redis") || importeDe(source, "ioredis")
    ).map(({ chemin }) => chemin)

    expect(coupables).toEqual([])
  })

  it("ne nomme pg-boss que dans le démarrage du travailleur", () => {
    const coupables = SOURCES.filter(
      ({ chemin, source }) =>
        chemin !== "lib/automations/file.ts" && importeDe(source, "pg-boss")
    ).map(({ chemin }) => chemin)

    expect(coupables).toEqual([])
  })

  it("n'écrit jamais par un module de mutation", () => {
    const coupables = SOURCES.filter(({ source }) =>
      MODULES_DE_MUTATION.some((module) => importeDe(source, module))
    ).map(({ chemin }) => chemin)

    expect(coupables).toEqual([])
  })
})
