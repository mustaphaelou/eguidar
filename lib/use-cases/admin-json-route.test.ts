import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
  type CodeRefusCycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import type { Client } from "@/lib/use-cases/session-courante"
import { sessionCouranteMock } from "@/test/navigation-mocks"

vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => {
  const h = await import("@/test/navigation-mocks")
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: h.sessionCouranteMock,
  }
})

import { adminJsonRoute } from "@/lib/use-cases/admin-json-route"

const SCHEMA = z.object({ nom: z.string().min(1) })
type Entree = z.infer<typeof SCHEMA>

const ADMIN: Client = {
  id: "admin-1",
  name: "Administrateur",
  email: "admin@example.test",
  role: "admin",
}
const UTILISATEUR: Client = {
  id: "client-1",
  name: "Client",
  email: "client@example.test",
  role: "user",
}

const LABEL = "[test] route"
const MESSAGE_ECHEC = "Échec de l’opération"

const REFUS: [CodeRefusCycleVieImageProduit, number][] = Object.entries(
  STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT
) as [CodeRefusCycleVieImageProduit, number][]

type ResultatTest =
  | { ok: true; body: { echo: string } }
  | {
      ok: false
      code: CodeRefusCycleVieImageProduit
      message: string
    }

function routeAvec(
  run: (entree: Entree, client: Client) => ResultatTest | Promise<ResultatTest>
) {
  return adminJsonRoute({
    schema: SCHEMA,
    label: LABEL,
    failureMessage: MESSAGE_ECHEC,
    statuses: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
    run,
  })
}

function requete(corps: unknown): Request {
  return new Request("http://localhost/api/admin/exemple", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  })
}

function requeteIllisible(): Request {
  return new Request("http://localhost/api/admin/exemple", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ pas du JSON",
  })
}

beforeEach(() => {
  sessionCouranteMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("adminJsonRoute", () => {
  it.each([
    ["absente", null],
    ["non administrative", UTILISATEUR],
  ])(
    "refuse une Session courante %s avant même de lire le corps",
    async (_cas, session) => {
      sessionCouranteMock.mockResolvedValue(session)
      const run = vi.fn(async () => ({ ok: true as const, body: { echo: "" } }))

      const reponse = await routeAvec(run)(requeteIllisible())

      expect(reponse.status).toBe(401)
      await expect(reponse.json()).resolves.toEqual({ error: "Non autorisé" })
      expect(run).not.toHaveBeenCalled()
    }
  )

  it("répond 400 quand le corps n'est pas du JSON, sans appeler l'opération", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    const run = vi.fn(async () => ({ ok: true as const, body: { echo: "" } }))

    const reponse = await routeAvec(run)(requeteIllisible())

    expect(reponse.status).toBe(400)
    await expect(reponse.json()).resolves.toEqual({
      error: "Corps de requête invalide",
    })
    expect(run).not.toHaveBeenCalled()
  })

  it("répond 400 à un corps invalide sans divulguer les griefs du schéma", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    const run = vi.fn(async () => ({ ok: true as const, body: { echo: "" } }))

    const reponse = await routeAvec(run)(requete({ nom: "" }))

    expect(reponse.status).toBe(400)
    await expect(reponse.json()).resolves.toEqual({
      error: "Requête invalide",
    })
    expect(run).not.toHaveBeenCalled()
  })

  it("répond 200 avec le corps de l'opération, à laquelle il transmet l'entrée analysée et le Client", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    const run = vi.fn(async (entree: Entree) => ({
      ok: true as const,
      body: { echo: entree.nom },
    }))

    const reponse = await routeAvec(run)(requete({ nom: "Rabat" }))

    expect(reponse.status).toBe(200)
    await expect(reponse.json()).resolves.toEqual({ echo: "Rabat" })
    expect(run).toHaveBeenCalledWith({ nom: "Rabat" }, ADMIN)
  })

  it.each(REFUS)(
    "traduit le Refus %s en réponse HTTP %i avec son message",
    async (code, statut) => {
      sessionCouranteMock.mockResolvedValue(ADMIN)
      const message = `Refus éditorial : ${code}`
      const run = vi.fn(async () => ({ ok: false as const, code, message }))

      const reponse = await routeAvec(run)(requete({ nom: "Rabat" }))

      expect(reponse.status).toBe(statut)
      await expect(reponse.json()).resolves.toEqual({ error: message })
    }
  )

  it("répond 500 avec la copie de la route et journalise une fois quand l'opération lève", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    const erreur = new Error("panne")
    const journal = vi.spyOn(console, "error").mockImplementation(() => {})
    const run = vi.fn(async () => {
      throw erreur
    })

    const reponse = await routeAvec(run)(requete({ nom: "Rabat" }))

    expect(reponse.status).toBe(500)
    await expect(reponse.json()).resolves.toEqual({ error: MESSAGE_ECHEC })
    expect(journal).toHaveBeenCalledTimes(1)
    expect(journal).toHaveBeenCalledWith(LABEL, erreur)
  })
})
