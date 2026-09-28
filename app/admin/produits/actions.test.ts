import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const {
  createProductMock,
  getAdminProductMock,
  updateProductMock,
  revendiquerEtEnregistrerMock,
} = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  getAdminProductMock: vi.fn(),
  updateProductMock: vi.fn(),
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
  getAdminProduct: getAdminProductMock,
  updateProduct: updateProductMock,
}))

vi.mock("@/lib/cycle-vie-image-produit", () => ({
  default: {
    revendiquerEtEnregistrer: revendiquerEtEnregistrerMock,
  },
}))

import {
  createProductAction,
  updateProductAction,
} from "@/app/admin/produits/actions"
import { CatalogValidationError } from "@/lib/use-cases/admin-catalog"

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

function updateFormData(
  gallery: unknown[],
  tentativeId = "tentative-update-1"
): FormData {
  const data = formData(gallery, tentativeId)
  data.append("productId", "produit-1")
  return data
}

beforeEach(() => {
  sessionCouranteMock.mockResolvedValue(ADMIN)
  createProductMock.mockReset()
  getAdminProductMock.mockReset()
  updateProductMock.mockReset()
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
      {
        lier: expect.any(Function),
        promues: ["https://cdn.test/p/1.webp", "https://cdn.test/p/2.webp"],
      }
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

describe("updateProductAction", () => {
  it("revendique les nouveaux Brouillons et conserve l'ordre de la galerie", async () => {
    getAdminProductMock.mockResolvedValue({
      id: "produit-1",
      images: ["https://cdn.test/p/existing.webp"],
    })
    updateProductMock.mockResolvedValue({ id: "produit-1" })
    revendiquerEtEnregistrerMock.mockImplementation(
      async ({ enregistrer, draftIds, ownerId, tentativeId }) => {
        expect(draftIds).toEqual(["draft-1", "draft-2"])
        expect(ownerId).toBe("editeur-1")
        expect(tentativeId).toBe("tentative-update-1")
        const resultat = await enregistrer(
          [
            {
              draftId: "draft-1",
              publicUrl: "https://cdn.test/p/draft-1.webp",
            },
            {
              draftId: "draft-2",
              publicUrl: "https://cdn.test/p/draft-2.webp",
            },
          ],
          async () => {}
        )
        return { ok: true, ...resultat, images: [] }
      }
    )

    await expect(
      updateProductAction(
        {},
        updateFormData([
          {
            kind: "brouillon",
            draftId: "draft-1",
            previewUrl: "https://cdn.test/brouillons/draft-1.webp",
          },
          {
            kind: "persistee",
            url: "https://cdn.test/p/existing.webp",
          },
          {
            kind: "brouillon",
            draftId: "draft-2",
            previewUrl: "https://cdn.test/brouillons/draft-2.webp",
          },
        ])
      )
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(updateProductMock).toHaveBeenCalledWith(
      "produit-1",
      expect.objectContaining({
        images: [
          "https://cdn.test/p/draft-1.webp",
          "https://cdn.test/p/existing.webp",
          "https://cdn.test/p/draft-2.webp",
        ],
      }),
      undefined,
      {
        lier: expect.any(Function),
        promues: [
          "https://cdn.test/p/draft-1.webp",
          "https://cdn.test/p/draft-2.webp",
        ],
      }
    )
  })

  it("laisse le Catalogue refuser une Image produit persistée absente du stock réel", async () => {
    // Un seul point d'application de la propriété d'une Image produit
    // persistée, dans la mutation du Catalogue. L'action lui transmet la
    // galerie telle quelle et ne pré-empêche rien.
    updateProductMock.mockRejectedValue(
      new CatalogValidationError([
        "une Image produit persistée n'appartient pas à ce Produit",
      ])
    )

    const resultat = await updateProductAction(
      {},
      updateFormData([
        {
          kind: "persistee",
          url: "https://cdn.test/p/arbitraire.webp",
        },
      ])
    )

    expect(resultat).toEqual({
      error:
        "Données invalides : une Image produit persistée n'appartient pas à ce Produit",
    })
    expect(updateProductMock).toHaveBeenCalledWith("produit-1", {
      name: "Produit",
      slug: "produit-de-test",
      brand: "Marque",
      categoryId: "categorie-1",
      description: "Description",
      price: 10000,
      specs: {},
      isFeatured: false,
      featuredOrder: 0,
      freeShipping: false,
      variants: [{ name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 2 }],
      images: ["https://cdn.test/p/arbitraire.webp"],
    })
    // Une seule lecture du Produit : celle de la mutation du Catalogue.
    expect(getAdminProductMock).not.toHaveBeenCalled()
    expect(revendiquerEtEnregistrerMock).not.toHaveBeenCalled()
  })

  it("utilise le résultat déjà persisté lors d'un retry de la même tentative", async () => {
    const product = {
      id: "produit-1",
      images: ["https://cdn.test/p/draft-1.webp"],
    }
    getAdminProductMock.mockResolvedValue(product)
    revendiquerEtEnregistrerMock.mockImplementation(
      async ({ resultatDejaPersiste }) => {
        if (!resultatDejaPersiste) throw new Error("callback absent")
        return {
          ok: true,
          productId: "produit-1",
          result: await resultatDejaPersiste("produit-1"),
          images: [],
        }
      }
    )

    await expect(
      updateProductAction(
        {},
        updateFormData([
          {
            kind: "brouillon",
            draftId: "draft-1",
            previewUrl: "https://cdn.test/brouillons/draft-1.webp",
          },
        ])
      )
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(updateProductMock).not.toHaveBeenCalled()
  })

  it("remet un refus du cycle de vie au formulaire de mise à jour", async () => {
    getAdminProductMock.mockResolvedValue({ id: "produit-1", images: [] })
    revendiquerEtEnregistrerMock.mockResolvedValue({
      ok: false,
      code: "catalogue-refuse",
      message: "L'enregistrement du Catalogue a échoué",
    })

    const resultat = await updateProductAction(
      {},
      updateFormData([
        {
          kind: "brouillon",
          draftId: "draft-1",
          previewUrl: "https://cdn.test/brouillons/draft-1.webp",
        },
      ])
    )

    expect(resultat).toEqual({
      error: "L'enregistrement du Catalogue a échoué",
    })
    expect(updateProductMock).not.toHaveBeenCalled()
  })

  it("remonte le refus de la limite d'Images produit comme un refus de champ", async () => {
    // La lecture de la soumission ne refuse pas une galerie trop grande : elle
    // rend une galerie valide, et la limite est une règle du Catalogue. Donc
    // l'action atteint la mutation, qui refuse — et ce refus est rendu à
    // l'éditeur comme n'importe quel refus de validation d'un champ.
    const galerieAuDelaDeLaLimite = Array.from({ length: 9 }, (_vide, i) => ({
      kind: "persistee" as const,
      url: `https://cdn.test/p/${i + 1}.webp`,
    }))
    updateProductMock.mockRejectedValue(
      new CatalogValidationError(["au maximum 8 images par produit"])
    )

    const resultat = await updateProductAction(
      {},
      updateFormData(galerieAuDelaDeLaLimite)
    )

    expect(updateProductMock).toHaveBeenCalledWith(
      "produit-1",
      expect.objectContaining({
        images: galerieAuDelaDeLaLimite.map((image) => image.url),
      })
    )
    expect(resultat).toEqual({
      error: "Données invalides : au maximum 8 images par produit",
    })

    // Comparaison, pas littéral : un refus de lecture de soumission et un refus
    // du Catalogue rendent le même état de formulaire, et c'est ce chemin-là
    // que l'éditeur voit dans les deux cas.
    const soumissionIllisible = updateFormData([])
    soumissionIllisible.set("price", "abc")
    const refusDeChamp = await updateProductAction({}, soumissionIllisible)
    expect(Object.keys(refusDeChamp)).toEqual(Object.keys(resultat))
    expect(refusDeChamp).toEqual({ error: "Formulaire invalide" })
  })
})
