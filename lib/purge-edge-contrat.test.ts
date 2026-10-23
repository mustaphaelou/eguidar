import { describe, expect, it } from "vitest"

import { creerPurgeEdgeCloudflare } from "@/lib/purge-edge-cloudflare"
import type { DemandePurge } from "@/lib/purge-edge"
import {
  exigerAccordPurge,
  SCENARIOS_PURGE,
  type AdaptateurPurge,
  type ContextePurge,
} from "@/test/contrat-purge-edge"
import { creerPurgeEdgeMemoire } from "@/test/purge-edge-memoire"

const LIMITE_CONTRAT = 100

function transportEnregistreur(
  lots: DemandePurge[],
  panne: boolean
): (url: string, init: RequestInit) => Promise<Response> {
  return async (_url, init) => {
    const corps = JSON.parse(String(init.body)) as {
      files?: string[]
      purge_everything?: boolean
    }
    lots.push(
      corps.purge_everything
        ? { kind: "tout" }
        : { kind: "urls", urls: corps.files ?? [] }
    )
    if (panne) throw new Error("réseau indisponible")
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        messages: [],
        result: { id: "purge-1" },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  }
}

const adaptateurCloudflare: AdaptateurPurge = (etat, contexte) => {
  const lots: DemandePurge[] = []
  const port = creerPurgeEdgeCloudflare({
    env:
      etat === "non-configure"
        ? {}
        : {
            CLOUDFLARE_ZONE_ID: "zone-eguidar",
            CLOUDFLARE_API_TOKEN: "jeton-purge",
          },
    limiteUrlsParAppel: contexte.limiteUrlsParAppel,
    transport: transportEnregistreur(lots, etat === "mort"),
  })
  return { port, lots: () => lots }
}

const adaptateurMemoire: AdaptateurPurge = (etat, contexte) => {
  const port = creerPurgeEdgeMemoire({
    limiteUrlsParAppel: contexte.limiteUrlsParAppel,
    configure: etat !== "non-configure",
    panne: etat === "mort",
  })
  return { port, lots: () => port.lots }
}

const adaptateurs: readonly AdaptateurPurge[] = [
  adaptateurCloudflare,
  adaptateurMemoire,
]

const CONTEXTE: ContextePurge = { limiteUrlsParAppel: LIMITE_CONTRAT }

describe("Purge de l'edge — contrat des deux adaptateurs", () => {
  for (const scenario of SCENARIOS_PURGE) {
    it(`les deux adaptateurs s'accordent : ${scenario.nom}`, async () => {
      await exigerAccordPurge(scenario, adaptateurs, CONTEXTE)
    })
  }
})

describe("Purge de l'edge — le contrat aperçoit les divergences", () => {
  it("le contrat aperçoit un adaptateur qui ne purge rien", async () => {
    const faux: AdaptateurPurge = () => ({
      port: {
        async purger() {
          return { ok: true, urls: [] }
        },
      },
      lots: () => [],
    })
    const scenario = SCENARIOS_PURGE[0]
    if (!scenario)
      throw new Error("Le premier scénario du contrat doit exister")

    await expect(
      exigerAccordPurge(scenario, [adaptateurMemoire, faux], CONTEXTE)
    ).rejects.toThrow()
  })
})
