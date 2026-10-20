import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { creerLimiteurRechercheRedis } from "@/lib/limiteur-recherche-redis"
import { getRedis } from "@/lib/redis"
import {
  exigerAccordLimiteur,
  SCENARIOS_LIMITEUR,
  type AdaptateurLimiteur,
  type ContexteLimiteur,
} from "@/test/contrat-limiteur-recherche"
import { creerLimiteurRechercheMemoire } from "@/test/limiteur-recherche-memoire"

const FENETRE_MS = 200
const BUDGET = 3

const adaptateurRedis: AdaptateurLimiteur = (etat, options) =>
  creerLimiteurRechercheRedis(
    etat === "en-panne" ? () => null : getRedis,
    options
  )

const adaptateurMemoire: AdaptateurLimiteur = (etat, options) => {
  const limiteur = creerLimiteurRechercheMemoire(options)
  if (etat === "en-panne") limiteur.pannes.add("consommer")
  return limiteur
}

const adaptateurs: readonly AdaptateurLimiteur[] = [
  adaptateurRedis,
  adaptateurMemoire,
]

function contexte(): ContexteLimiteur {
  return {
    cle: randomUUID(),
    autreCle: randomUUID(),
    fenetreMs: FENETRE_MS,
    budget: BUDGET,
  }
}

// Le contrat compare l'adaptateur Redis à l'adaptateur mémoire : sans Redis, il n'y a rien à comparer.
const redisDisponible = Boolean(process.env.REDIS_URL)

describe.runIf(redisDisponible)(
  "Limiteur de Recherche — contrat des deux adaptateurs",
  () => {
    for (const scenario of SCENARIOS_LIMITEUR) {
      it(`les deux adaptateurs s'accordent : ${scenario.nom}`, async () => {
        await exigerAccordLimiteur(scenario, adaptateurs, contexte())
      })
    }
  }
)

describe("Limiteur de Recherche — le contrat aperçoit les divergences", () => {
  it("le contrat aperçoit une divergence que deux suites d'adaptateur laisseraient passer", async () => {
    const faux: AdaptateurLimiteur = () => ({
      async consommer() {
        return "autorise"
      },
    })
    const scenario = SCENARIOS_LIMITEUR.find((candidat) =>
      candidat.nom.includes("budget")
    )
    if (!scenario) throw new Error("Le scénario du budget doit exister")

    await expect(
      exigerAccordLimiteur(scenario, [adaptateurMemoire, faux], contexte())
    ).rejects.toThrow()
  })
})
