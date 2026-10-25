import { beforeEach, describe, expect, it, vi } from "vitest"

const { lireSessionMock, relacherBrouillonMock } = vi.hoisted(() => ({
  lireSessionMock: vi.fn(),
  relacherBrouillonMock: vi.fn(),
}))

vi.mock("@/lib/use-cases/session-courante", () => ({
  lireSession: lireSessionMock,
  estAdmin: (client: { role?: string } | null) => client?.role === "admin",
}))

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
  lireSessionMock.mockReset()
  lireSessionMock.mockResolvedValue({
    id: "editeur-1",
    name: "Éditeur",
    email: "editeur@example.test",
    role: "admin",
  })
  relacherBrouillonMock.mockReset()
})

describe("DELETE /api/admin/uploads/delete", () => {
  it("refuse une clé étrangère et exige un identifiant de Brouillon strict", async () => {
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

  it.each([
    ["sans identifiant de Brouillon", {}],
    ["avec un identifiant de Brouillon vide", { draftId: "" }],
  ])("refuse un corps %s", async (_cas, corps) => {
    const reponse = await DELETE(request(corps))

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

  it("laisse passer un Refus du cycle de vie jusqu'à la réponse HTTP", async () => {
    relacherBrouillonMock.mockResolvedValue({
      ok: false,
      code: "proprietaire-incorrect",
      message: "Ce Brouillon d'Image produit ne vous appartient pas",
    })

    const reponse = await DELETE(request({ draftId: "draft-1" }))

    expect(reponse.status).toBe(403)
    await expect(reponse.json()).resolves.toEqual({
      error: "Ce Brouillon d'Image produit ne vous appartient pas",
    })
  })
})
