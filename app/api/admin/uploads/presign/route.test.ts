import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { demanderBrouillonMock, lireSessionMock } = vi.hoisted(() => ({
  demanderBrouillonMock: vi.fn(),
  lireSessionMock: vi.fn(),
}))

vi.mock("@/lib/use-cases/session-courante", () => ({
  lireSession: lireSessionMock,
  estAdmin: (client: { role?: string } | null) => client?.role === "admin",
}))

vi.mock("@/lib/cycle-vie-image-produit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cycle-vie-image-produit")>()),
  default: { demanderBrouillon: demanderBrouillonMock },
}))

import { POST } from "./route"

function request(body: unknown): Request {
  return new Request("http://localhost/api/admin/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  lireSessionMock.mockResolvedValue({
    id: "editeur-1",
    name: "Éditeur",
    email: "editeur@example.test",
    role: "admin",
  })
  demanderBrouillonMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /api/admin/uploads/presign", () => {
  it("valide le corps avant de joindre le cycle de vie", async () => {
    const reponse = await POST(
      request({ contentType: "image/svg+xml", size: 10 })
    )

    expect(reponse.status).toBe(400)
    await expect(reponse.json()).resolves.toEqual({ error: "Requête invalide" })
    expect(demanderBrouillonMock).not.toHaveBeenCalled()
  })

  it("traduit une demande réussie sans exposer de clé de stockage", async () => {
    const expiresAt = new Date("2026-01-16T10:00:00.000Z")
    demanderBrouillonMock.mockResolvedValue({
      ok: true,
      draftId: "draft-1",
      uploadUrl: "https://upload.example.test/signed",
      previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
      expiresAt,
    })

    const reponse = await POST(request({ contentType: "image/png", size: 10 }))

    expect(reponse.status).toBe(200)
    await expect(reponse.json()).resolves.toEqual({
      draftId: "draft-1",
      uploadUrl: "https://upload.example.test/signed",
      previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
      expiresAt: expiresAt.toISOString(),
    })
    expect(demanderBrouillonMock).toHaveBeenCalledWith({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 10,
    })
  })

  it("répond 500 avec sa copie et journalise une fois quand le cycle de vie lève", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {})
    demanderBrouillonMock.mockRejectedValue(new Error("panne de stockage"))

    const reponse = await POST(request({ contentType: "image/png", size: 10 }))

    expect(reponse.status).toBe(500)
    await expect(reponse.json()).resolves.toEqual({
      error: "Échec de la préparation du téléversement",
    })
    expect(journal).toHaveBeenCalledTimes(1)
    expect(journal.mock.calls[0]?.[0]).toBe("[uploads] presign")
  })

  it("laisse passer un Refus du cycle de vie jusqu'à la réponse HTTP", async () => {
    demanderBrouillonMock.mockResolvedValue({
      ok: false,
      code: "stockage-indisponible",
      message: "Stockage Cloudflare R2 non configuré",
    })

    const reponse = await POST(request({ contentType: "image/png", size: 10 }))

    expect(reponse.status).toBe(503)
    await expect(reponse.json()).resolves.toEqual({
      error: "Stockage Cloudflare R2 non configuré",
    })
  })
})
