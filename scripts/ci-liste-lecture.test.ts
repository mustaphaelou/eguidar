import { describe, expect, it } from "vitest"

import { exigerDesJobsLus } from "./ci-liste"

const FLUX_FABRIQUE = "un-flux-que-ce-depot-na-pas.yml"

function erreurDe(flux: unknown): string | null {
  try {
    exigerDesJobsLus(flux, FLUX_FABRIQUE)
    return null
  } catch (erreur) {
    return (erreur as Error).message
  }
}

describe("la lecture d'un flux", () => {
  it("rend les jobs d'un flux qu'il sait lire, et se tait", () => {
    const flux = {
      jobs: {
        verifie: {
          steps: [{ uses: "actions/checkout@v7" }, { run: "npm run lint" }],
        },
      },
    }

    expect(erreurDe(flux)).toBeNull()
    expect([...exigerDesJobsLus(flux, FLUX_FABRIQUE)]).toEqual([
      ["verifie", flux.jobs.verifie],
    ])
  })

  it("refuse un job qui n'a pas d'étapes, et le nomme", () => {
    expect(
      erreurDe({ jobs: { reutilise: { uses: "./reutilisable.yml" } } })
    ).toBe(`${FLUX_FABRIQUE} : le job \`reutilise\` n'a pas d'étapes`)
  })

  it("lit un job fait d'actions, et le rend tel quel", () => {
    const flux = {
      jobs: {
        portes: {
          steps: [
            { uses: "actions/checkout@v7" },
            { uses: "actions/dependency-review-action@v5" },
          ],
        },
      },
    }

    expect(erreurDe(flux)).toBeNull()
    expect([...exigerDesJobsLus(flux, FLUX_FABRIQUE)]).toEqual([
      ["portes", flux.jobs.portes],
    ])
  })

  it("refuse un job dont aucune étape ne porte de commande ni d'action, et le nomme", () => {
    expect(
      erreurDe({
        jobs: { muet: { steps: [{ name: "une étape sans effet" }] } },
      })
    ).toBe(
      `${FLUX_FABRIQUE} : le job \`muet\` n'a aucune étape qui porte une commande ou une action`
    )
    expect(erreurDe({ jobs: { vide: { steps: [] } } })).toBe(
      `${FLUX_FABRIQUE} : le job \`vide\` n'a aucune étape qui porte une commande ou une action`
    )
  })
})
