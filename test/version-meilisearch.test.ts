import { readFileSync } from "node:fs"
import path from "node:path"

import { load } from "js-yaml"
import { describe, expect, it } from "vitest"

const RACINE = path.join(import.meta.dirname, "..")
const PREFIXE = "getmeili/meilisearch:"

function lire(chemin: string): string {
  return readFileSync(path.join(RACINE, chemin), "utf8")
}

const compose = load(lire("docker-compose.yml")) as {
  services: Record<string, { image?: string }>
}
const ci = load(lire(".github/workflows/ci.yml")) as {
  jobs: Record<string, { services?: Record<string, { image?: string }> }>
}

const image = compose.services.meilisearch?.image ?? ""
const etiquette = image.slice(PREFIXE.length)
const version = etiquette.replace(/^v/, "")

function servicesCi(): Array<{ job: string; image: string }> {
  return Object.entries(ci.jobs).flatMap(([job, definition]) =>
    Object.entries(definition.services ?? {})
      .filter(([, service]) => service.image?.startsWith(PREFIXE))
      .map(([, service]) => ({ job, image: service.image ?? "" }))
  )
}

function versionsCites(texte: string): string[] {
  return [...texte.matchAll(/Meilisearch\s+(v?\d+(?:\.\d+)+)/g)].map(
    ([, citee]) => citee.replace(/^v/, "")
  )
}

describe("Le Moteur de recherche a une seule version déclarée", () => {
  it("épingle une version exacte dans le compose, jamais un alias", () => {
    expect(image.startsWith(PREFIXE)).toBe(true)
    expect(etiquette).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it("sert la même version dans les deux postes de la CI", () => {
    const services = servicesCi()

    expect(services.map(({ job }) => job).sort()).toEqual(["build", "test"])
    expect(services.map(({ image: servie }) => servie)).toEqual([image, image])
  })

  it("cite cette version deux fois dans le README et une fois dans la carte", () => {
    expect(versionsCites(lire("README.md"))).toEqual([version, version])
    expect(versionsCites(lire("docs/ARCHITECTURE.md"))).toEqual([version])
  })
})
