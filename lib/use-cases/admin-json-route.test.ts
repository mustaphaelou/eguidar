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

const SCHEMA = z.object({ nom: z.string().trim().min(1) })
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

const LOG_LABEL = "[test] route"
const MESSAGE_ECHEC = "Échec de l’opération"

// La table de Refus est épinglée en dur : un statut modifié dans le cycle de vie,
// ou un code perdu ou ajouté, doit faire échouer la suite.
const REFUS: [CodeRefusCycleVieImageProduit, number][] = [
  ["identifiant-proprietaire-invalide", 400],
  ["metadata-invalide", 400],
  ["mime-non-autorise", 400],
  ["taille-invalide", 400],
  ["trop-volumineux", 400],
  ["stockage-indisponible", 503],
  ["stockage-refuse", 502],
  ["registre-indisponible", 500],
  ["brouillon-introuvable", 404],
  ["proprietaire-incorrect", 403],
  ["brouillon-non-vivant", 409],
  ["brouillon-expire", 410],
  ["revendication-refusee", 409],
  ["catalogue-refuse", 409],
]

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
    logLabel: LOG_LABEL,
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
  it("épingle les quatorze codes de Refus du cycle de vie et leurs statuts", () => {
    expect(REFUS).toHaveLength(14)
    expect(Object.entries(STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT)).toEqual(REFUS)
  })

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

  it("transmet à l'opération l'entrée analysée et transformée, jamais le corps brut", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    const run = vi.fn(async (entree: Entree) => ({
      ok: true as const,
      body: { echo: entree.nom },
    }))

    const reponse = await routeAvec(run)(requete({ nom: " Rabat " }))

    expect(reponse.status).toBe(200)
    await expect(reponse.json()).resolves.toEqual({ echo: "Rabat" })
    expect(run).toHaveBeenCalledWith({ nom: "Rabat" }, ADMIN)
    expect(run).not.toHaveBeenCalledWith({ nom: " Rabat " }, ADMIN)
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

  it("répond 500 journalisé quand le Refus n'a pas de statut dans la table de la route", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    const journal = vi.spyOn(console, "error").mockImplementation(() => {})
    const statuts: Record<string, number> = {
      ...STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
    }
    delete statuts["catalogue-refuse"]
    const run = vi.fn(async () => ({
      ok: false as const,
      code: "catalogue-refuse" as CodeRefusCycleVieImageProduit,
      message: "Refus sans statut",
    }))

    const reponse = await adminJsonRoute({
      schema: SCHEMA,
      logLabel: LOG_LABEL,
      failureMessage: MESSAGE_ECHEC,
      statuses: statuts,
      run,
    })(requete({ nom: "Rabat" }))

    expect(reponse.status).toBe(500)
    await expect(reponse.json()).resolves.toEqual({ error: MESSAGE_ECHEC })
    expect(journal).toHaveBeenCalledTimes(1)
    expect(journal).toHaveBeenCalledWith(LOG_LABEL, expect.any(Error))
  })

  it("répond 500 journalisé quand le schéma lève, sans divulguer la panne", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    const erreur = new Error("schéma cassé")
    const journal = vi.spyOn(console, "error").mockImplementation(() => {})
    const schemaQuiLeve = {
      safeParse: (): never => {
        throw erreur
      },
    }
    const run = vi.fn(async () => ({ ok: true as const, body: { echo: "" } }))

    const reponse = await adminJsonRoute<
      Entree,
      { echo: string },
      CodeRefusCycleVieImageProduit
    >({
      schema: schemaQuiLeve,
      logLabel: LOG_LABEL,
      failureMessage: MESSAGE_ECHEC,
      statuses: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
      run,
    })(requete({ nom: "Rabat" }))

    expect(reponse.status).toBe(500)
    await expect(reponse.json()).resolves.toEqual({ error: MESSAGE_ECHEC })
    expect(journal).toHaveBeenCalledTimes(1)
    expect(journal).toHaveBeenCalledWith(LOG_LABEL, erreur)
    expect(run).not.toHaveBeenCalled()
  })

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
    expect(journal).toHaveBeenCalledWith(LOG_LABEL, erreur)
  })
})
