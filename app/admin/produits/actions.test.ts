import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const { createProductMock, revendiquerEtEnregistrerMock } = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  revendiquerEtEnregistrerMock: vi.fn(),
}))

vi.mock("next/navigation", async () => {
  const mocks = await import("@/test/navigation-mocks")
  return { redirect: mocks.redirectMock }
})

vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/use-cases/session-courante")
  >()),
  lireSession: sessionCouranteMock,
}))

vi.mock("@/lib/use-cases/admin-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/admin-catalog")>()),
  createProduct: createProductMock,
}))

vi.mock("@/lib/cycle-vie-image-produit", () => ({
  default: {
    revendiquerEtEnregistrer: revendiquerEtEnregistrerMock,
  },
}))

import { createProductAction } from "@/app/admin/produits/actions"

const ADMIN: Client = {
  id: "editeur-1",
  name: "Éditeur",
  email: "editeur@example.test",
  role: "admin",
}

function formData(gallery: unknown[], tentativeId = "tentative-1"): FormData {
  const data = new FormData()
  data.append("name", "Produit")
  data.append("slug", "produit-de-test")
  data.append("brand", "Marque")
  data.append("categoryId", "categorie-1")
  data.append("description", "Description")
  data.append("price", "100")
  data.append("images", JSON.stringify(gallery))
  data.append(
    "variants",
    JSON.stringify([
      { name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 2 },
    ])
  )
  data.append("tentativeId", tentativeId)
  return data
}

beforeEach(() => {
  sessionCouranteMock.mockResolvedValue(ADMIN)
  createProductMock.mockReset()
  revendiquerEtEnregistrerMock.mockReset()
  redirectMock.mockClear()
})

describe("createProductAction", () => {
  it("revendique les identifiants et transmet les URLs promues dans l'ordre", async () => {
    createProductMock.mockResolvedValue({ id: "produit-1" })
    revendiquerEtEnregistrerMock.mockImplementation(
      async ({ enregistrer, draftIds, ownerId, tentativeId }) => {
        expect(draftIds).toEqual(["draft-1", "draft-2"])
        expect(ownerId).toBe("editeur-1")
        expect(tentativeId).toBe("tentative-1")
        const resultat = await enregistrer(
          [
            { draftId: "draft-1", publicUrl: "https://cdn.test/p/1.webp" },
            { draftId: "draft-2", publicUrl: "https://cdn.test/p/2.webp" },
          ],
          async () => {}
        )
        return { ok: true, ...resultat, images: [] }
      }
    )

    await expect(
      createProductAction(
        {},
        formData([
          {
            kind: "brouillon",
            draftId: "draft-1",
            previewUrl: "https://cdn.test/brouillons/1.webp",
          },
          {
            kind: "brouillon",
            draftId: "draft-2",
            previewUrl: "https://cdn.test/brouillons/2.webp",
          },
        ])
      )
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(createProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ["https://cdn.test/p/1.webp", "https://cdn.test/p/2.webp"],
      }),
      undefined,
      expect.any(Function)
    )
  })

  it("refuse une URL persistée dans un formulaire de création", async () => {
    const resultat = await createProductAction(
      {},
      formData([
        {
          kind: "persistee",
          url: "https://cdn.test/produits/arbitraire.webp",
        },
      ])
    )

    expect(resultat).toEqual({
      error:
        "Une création de Produit ne peut contenir que des Brouillons d'Image produit",
    })
    expect(revendiquerEtEnregistrerMock).not.toHaveBeenCalled()
    expect(createProductMock).not.toHaveBeenCalled()
  })

  it("remet un refus du cycle de vie au formulaire", async () => {
    revendiquerEtEnregistrerMock.mockResolvedValue({
      ok: false,
      code: "proprietaire-incorrect",
      message: "Ce brouillon ne vous appartient pas",
    })

    const resultat = await createProductAction(
      {},
      formData([
        {
          kind: "brouillon",
          draftId: "draft-1",
          previewUrl: "https://cdn.test/brouillons/1.webp",
        },
      ])
    )

    expect(resultat).toEqual({
      error: "Ce brouillon ne vous appartient pas",
    })
    expect(createProductMock).not.toHaveBeenCalled()
  })
})
