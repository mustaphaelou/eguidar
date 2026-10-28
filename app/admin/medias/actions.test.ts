import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const { supprimerImagesMock, mettreAJourAltMock } = vi.hoisted(() => ({
  supprimerImagesMock: vi.fn(),
  mettreAJourAltMock: vi.fn(),
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

vi.mock("@/lib/use-cases/images-produit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/images-produit")>()),
  supprimerImagesProduit: supprimerImagesMock,
  mettreAJourTexteAlternatif: mettreAJourAltMock,
}))

import {
  mettreAJourAltImageAction,
  supprimerImagesAction,
} from "@/app/admin/medias/actions"
import { revalidatePath } from "next/cache"
import { ImageProduitUtiliseeError } from "@/lib/use-cases/images-produit"

const ADMIN: Client = {
  id: "editeur-1",
  name: "Éditeur",
  email: "editeur@example.test",
  role: "admin",
}

function formDataSuppression(urls: string[]): FormData {
  const donnees = new FormData()
  for (const url of urls) donnees.append("publicUrl", url)
  return donnees
}

function formDataAlt(url: string, alt: string): FormData {
  const donnees = new FormData()
  donnees.append("publicUrl", url)
  donnees.append("alt", alt)
  return donnees
}

beforeEach(() => {
  sessionCouranteMock.mockReset()
  redirectMock.mockClear()
  supprimerImagesMock.mockReset()
  mettreAJourAltMock.mockReset()
  vi.mocked(revalidatePath).mockClear()
})

describe("actions de la Bibliothèque des médias", () => {
  it("redirige une session absente avant de toucher au registre", async () => {
    sessionCouranteMock.mockResolvedValue(null)

    await expect(
      supprimerImagesAction({}, formDataSuppression(["https://cdn/x.webp"]))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/?open=login&next=%2Fadmin%2Fmedias",
    })
    expect(supprimerImagesMock).not.toHaveBeenCalled()
  })

  it("déduplique et rogne les URL sélectionnées puis révalide", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    supprimerImagesMock.mockResolvedValue({ supprimees: [] })

    await expect(
      supprimerImagesAction(
        {},
        formDataSuppression([
          "  https://cdn.example.test/products/a.webp  ",
          "https://cdn.example.test/products/a.webp",
          "   ",
          "https://cdn.example.test/products/b.jpg",
        ])
      )
    ).resolves.toEqual({})

    expect(supprimerImagesMock).toHaveBeenCalledWith([
      "https://cdn.example.test/products/a.webp",
      "https://cdn.example.test/products/b.jpg",
    ])
    expect(revalidatePath).toHaveBeenCalledWith("/admin/medias")
  })

  it("rend le refus qui nomme les Produits sans masquer le message", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    supprimerImagesMock.mockRejectedValue(
      new ImageProduitUtiliseeError(["Produit Alpha"])
    )

    await expect(
      supprimerImagesAction(
        {},
        formDataSuppression(["https://cdn.example.test/products/a.webp"])
      )
    ).resolves.toEqual({
      error:
        "Refus de suppression : Image produit utilisée par « Produit Alpha »",
    })
  })

  it("met à jour le Texte alternatif et révalide", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN)
    mettreAJourAltMock.mockResolvedValue("Nouveau texte")

    await expect(
      mettreAJourAltImageAction(
        {},
        formDataAlt(
          " https://cdn.example.test/products/a.webp ",
          "  Nouveau texte  "
        )
      )
    ).resolves.toEqual({})

    expect(mettreAJourAltMock).toHaveBeenCalledWith(
      "https://cdn.example.test/products/a.webp",
      "  Nouveau texte  "
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/medias")
  })
})
