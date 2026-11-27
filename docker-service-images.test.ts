import { readFileSync } from "node:fs"
import path from "node:path"

import { load } from "js-yaml"
import { describe, expect, it } from "vitest"

const RACINE = import.meta.dirname
const COMPOSE = path.join(RACINE, "docker-compose.yml")

type Build = { context?: string; dockerfile?: string }

type Service = { image?: string; build?: Build }

const compose = load(readFileSync(COMPOSE, "utf8")) as {
  services: Record<string, Service>
}

const SERVICES_DURCIS = ["meilisearch", "postgres", "redis"]

function dockerfileDe(nom: string): string {
  const chemin = compose.services[nom]?.build?.dockerfile
  if (chemin === undefined) {
    throw new Error(`le service « ${nom} » ne déclare aucun Dockerfile`)
  }
  return chemin
}

function imageDeBase(chemin: string): string {
  const lignes = readFileSync(path.join(RACINE, chemin), "utf8")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.startsWith("FROM "))

  const derniere = lignes.at(-1)
  if (derniere === undefined) {
    throw new Error(`« ${chemin} » ne déclare aucun FROM`)
  }
  return derniere.replace(/^FROM\s+/, "").split(/\s+/)[0] ?? ""
}

describe("les images de service sont durcies depuis leur version épinglée", () => {
  it("ne durcit que les trois services dont l'image amont porte les avis", () => {
    const durcis = Object.entries(compose.services)
      .filter(([, service]) => service.build?.dockerfile !== undefined)
      .filter(([nom]) => !["app", "migrate", "purge-edge"].includes(nom))
      .map(([nom]) => nom)
      .sort()

    expect(durcis).toEqual(SERVICES_DURCIS)
  })

  it("part de l'image exacte que la composition sert", () => {
    for (const nom of SERVICES_DURCIS) {
      expect(imageDeBase(dockerfileDe(nom)), nom).toBe(
        compose.services[nom]?.image
      )
    }
  })

  it("met les paquets Alpine de chaque service à niveau", () => {
    for (const nom of SERVICES_DURCIS) {
      expect(
        readFileSync(path.join(RACINE, dockerfileDe(nom)), "utf8"),
        nom
      ).toContain("apk upgrade --no-cache")
    }
  })
})
