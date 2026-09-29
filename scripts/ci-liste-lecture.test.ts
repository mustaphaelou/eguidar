import { describe, expect, it } from "vitest"

import { exigerDesJobsLus } from "./ci-liste"

/**
 * Le nom du flux que ce test fabrique. Il n'existe pas dans le dépôt, et il ne
 * doit pas ressembler à `ci.yml` : c'est le seul moyen de prouver que le
 * message d'erreur nomme le flux que l'appelant a réellement lu, et non la
 * constante que le module connaît par cœur.
 */
const FLUX_FABRIQUE = "un-flux-que-ce-depot-na-pas.yml"

/**
 * L'erreur que la lecture rend, ou `null` quand elle se tait. Rendre le
 * message, plutôt que relever l'erreur par `toThrow`, permet d'ancrer chaque
 * forme à la phrase exacte qu'elle mérite : deux conditions différentes ne se
 * lisent pas de la même façon, et une condition sans phrase n'en est pas une.
 */
function erreurDe(flux: unknown): string | null {
  try {
    exigerDesJobsLus(flux, FLUX_FABRIQUE)
    return null
  } catch (erreur) {
    return (erreur as Error).message
  }
}

/**
 * Aucune des formes que cette suite vérifie n'existe dans le flux de ce dépôt —
 * un job `uses:`, un job sans commande, et le tableau d'étapes vide n'y ont pas
 * leur place, et le flux est écrit à la main. Les fabriquer ici est donc la
 * seule façon de les couvrir, et c'est ce qui les couvre vraiment : le module
 * décide sur la valeur que `js-yaml` rend, jamais sur le fichier.
 */
describe("la lecture d'un flux", () => {
  it("rend les jobs d'un flux qu'il sait lire, et se tait", () => {
    // Témoin de non-vacuité, dans les deux sens : une garde qui refusait tout
    // passerait ces assertions aussi facilement qu'une garde absente. Le job
    // fabriqué est la forme que le flux du dépôt déclare en cinq exemplaires.
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
    // Un job qui appelle un flux réutilisable porte `uses` et rien d'autre :
    // c'est la seule forme que la garde attrapait déjà, et elle doit continuer à
    // mordre, mot pour mot. C'est elle qui fait qu'une liste vide signifie
    // « ce flux n'a aucun job » plutôt que « ce job n'a pas été lu ».
    expect(
      erreurDe({ jobs: { reutilise: { uses: "./reutilisable.yml" } } })
    ).toBe(`${FLUX_FABRIQUE} : le job \`reutilise\` n'a pas d'étapes`)
  })

  it("refuse un job dont aucune étape ne porte de commande, et le nomme", () => {
    // La forme que la garde d'avant laissait passer : le tableau `steps` est
    // bien là, il n'est fait que d'actions, et le job rendait donc une liste
    // vide sans avoir jamais rien dit. Le tableau vide est la forme dégénérée
    // de la même condition.
    expect(
      erreurDe({
        jobs: { actions: { steps: [{ uses: "actions/checkout@v7" }] } },
      })
    ).toBe(
      `${FLUX_FABRIQUE} : le job \`actions\` n'a aucune étape qui porte une commande`
    )
    expect(erreurDe({ jobs: { vide: { steps: [] } } })).toBe(
      `${FLUX_FABRIQUE} : le job \`vide\` n'a aucune étape qui porte une commande`
    )
  })
})
