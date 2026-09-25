import { beforeEach, describe, expect, it, vi } from "vitest"

const { lireSessionMock, relacherBrouillonMock } = vi.hoisted(() => ({
  lireSessionMock: vi.fn(),
  relacherBrouillonMock: vi.fn(),
}))

vi.mock("@/lib/use-cases/session-courante", () => ({
  lireSession: lireSessionMock,
  estAdmin: (client: { role?: string } | null) => client?.role === "admin",
}))

// Seul le cycle de vie est doublée : la traduction HTTP reste celle du module
// propriétaire, sinon la route=testerait sa propre copie du vocabulaire.
vi.mock("@/lib/cycle-vie-image-produit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cycle-vie-image-produit")>()),
  default: { relacherBrouillon: relacherBrouillonMock },
}))

import { DELETE } from "./route"

function request(body: unknown): Request {
  return new Request("http://localhost/api/admin/uploads/delete", {
    method: "DELETE",
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
  relacherBrouillonMock.mockReset()
})

describe("DELETE /api/admin/uploads/delete", () => {
  it("refuse une session non administrative", async () => {
    lireSessionMock.mockResolvedValue(null)

    const reponse = await DELETE(request({ draftId: "draft-1" }))

    expect(reponse.status).toBe(401)
    await expect(reponse.json()).resolves.toEqual({ error: "Non autorisé" })
    expect(relacherBrouillonMock).not.toHaveBeenCalled()
  })

  it("refuse une URL et exige un identifiant de Brouillon strict", async () => {
    const reponse = await DELETE(
      request({
        draftId: "draft-1",
        url: "https://cdn.example.test/products/existing.png",
      })
    )

    expect(reponse.status).toBe(400)
    await expect(reponse.json()).resolves.toEqual({ error: "Requête invalide" })
    expect(relacherBrouillonMock).not.toHaveBeenCalled()
  })

  it("traduit une libération réussie avec l'éditeur de la session", async () => {
    relacherBrouillonMock.mockResolvedValue({
      ok: true,
      draftId: "draft-1",
    })

    const reponse = await DELETE(request({ draftId: "draft-1" }))

    expect(reponse.status).toBe(200)
    await expect(reponse.json()).resolves.toEqual({
      released: true,
      draftId: "draft-1",
    })
    expect(relacherBrouillonMock).toHaveBeenCalledWith({
      draftId: "draft-1",
      ownerId: "editeur-1",
    })
  })

  it.each([
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
  ] as const)(
    "traduit le refus %s en réponse HTTP %i",
    async (code, status) => {
      const message = `Refus éditorial : ${code}`
      relacherBrouillonMock.mockResolvedValue({ ok: false, code, message })

      const reponse = await DELETE(request({ draftId: "draft-1" }))

      expect(reponse.status).toBe(status)
      await expect(reponse.json()).resolves.toEqual({ error: message })
    }
  )
})
