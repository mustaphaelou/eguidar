import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  ORIGINES_ADMINISTRATION,
  artefactCorsR2,
  corsAutorise,
} from "@/infra/cors-r2"

const CHEMIN_ARTEFACT = path.join(import.meta.dirname, "cors-r2.json")

function lireArtefact(): ReturnType<typeof artefactCorsR2> {
  return JSON.parse(readFileSync(CHEMIN_ARTEFACT, "utf8")) as ReturnType<
    typeof artefactCorsR2
  >
}

const ADMINISTRATION = ORIGINES_ADMINISTRATION[0]!

describe("CORS R2 du téléversement depuis l'Administration", () => {
  it("décrit exactement l'artefact applicable", () => {
    expect(lireArtefact()).toEqual(artefactCorsR2())
  })

  it("n'ouvre qu'un PUT, pour les origines de l'Administration, avec content-type et ETag", () => {
    const artefact = lireArtefact()

    expect(artefact.rules).toHaveLength(1)
    const [regle, ...autres] = artefact.rules
    expect(autres).toEqual([])
    expect(regle!.id).toBe("televersement-administration")
    expect(regle!.allowed.methods).toEqual(["PUT"])
    expect(regle!.allowed.headers).toEqual(["content-type"])
    expect(regle!.exposeHeaders).toEqual(["ETag"])
    expect(regle!.maxAgeSeconds).toBeGreaterThan(0)
    expect(regle!.allowed.origins).toEqual(
      expect.arrayContaining([...ORIGINES_ADMINISTRATION])
    )
  })

  it("accepte la pré-vol d'un PUT depuis l'origine de l'Administration", () => {
    const artefact = lireArtefact()

    expect(
      corsAutorise(artefact, {
        origine: ADMINISTRATION,
        methode: "PUT",
        entetes: ["content-type"],
      })
    ).toBe(true)
    expect(
      corsAutorise(artefact, {
        origine: "http://localhost:3000",
        methode: "PUT",
        entetes: ["Content-Type"],
      })
    ).toBe(true)
  })

  it("refuse une origine étrangère, une méthode ou un en-tête non décrits", () => {
    const artefact = lireArtefact()

    expect(
      corsAutorise(artefact, {
        origine: "https://ailleurs.example",
        methode: "PUT",
        entetes: ["content-type"],
      })
    ).toBe(false)
    expect(
      corsAutorise(artefact, {
        origine: ADMINISTRATION,
        methode: "GET",
        entetes: ["content-type"],
      })
    ).toBe(false)
    expect(
      corsAutorise(artefact, {
        origine: ADMINISTRATION,
        methode: "PUT",
        entetes: ["x-jeton"],
      })
    ).toBe(false)
  })

  it("n'accepte jamais une origine joker ni une origine avec un chemin", () => {
    for (const regle of lireArtefact().rules) {
      for (const origine of regle.allowed.origins) {
        expect(origine).not.toBe("*")
        expect(origine).not.toMatch(/\/$/)
        expect(new URL(origine).pathname).toBe("/")
      }
    }
  })
})
