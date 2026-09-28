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
  // La porte scelle les trois faits en une valeur. Ce qui intéresse cette suite,
  // c'est ce que l'action **transmet**, pas la façon dont la valeur est scellée :
  // la porte est donc l'identité, et les assertions portent sur le fait que
  // l'action forward la valeur qu'elle reçoit, telle quelle.
  creerRevendicationImagesProduit: (input: unknown) => input,
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
  it("transmet la galerie entière et forward la valeur qu'il reçoit", async () => {
    // Ce qui est affirme ici n'est plus la composition : c'est le contrat de
    // l'action. Elle reçoit la galerie du formulaire telle quelle, et elle
    // donne au Catalogue la valeur qu'elle a reçue — sans la relire, la
    // compléter ni la refaire. L'ordre intercalé est un fait du cycle de vie,
    // et il est prouvé à son interface (`lib/cycle-vie-image-produit.test.ts`).
    const galerieSoumise = [
      {
        kind: "brouillon" as const,
        draftId: "draft-1",
        previewUrl: "https://cdn.test/brouillons/1.webp",
      },
      {
        kind: "brouillon" as const,
        draftId: "draft-2",
        previewUrl: "https://cdn.test/brouillons/2.webp",
      },
    ]
    const revendication = {
      galerie: ["https://cdn.test/p/1.webp", "https://cdn.test/p/2.webp"],
      promues: ["https://cdn.test/p/1.webp", "https://cdn.test/p/2.webp"],
      lier: vi.fn(async () => {}),
    }
    createProductMock.mockResolvedValue({ id: "produit-1" })
    revendiquerEtEnregistrerMock.mockImplementation(
      async ({ enregistrer, galerie, ownerId, tentativeId }) => {
        // La galerie atteint l'opération entière, dans l'ordre de l'éditeur.
        expect(galerie).toEqual(galerieSoumise)
        expect(ownerId).toBe("editeur-1")
        expect(tentativeId).toBe("tentative-1")
        return { ok: true, ...(await enregistrer(revendication)) }
      }
    )

    await expect(
      createProductAction({}, formData(galerieSoumise))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    // La galerie écrite est celle que la valeur porte, et la valeur est
    // transmise comme le Catalogue la reçoit : la même, pas une copie. Et la
    // liaison n'est pas exécutée ici : elle appartient à la transaction du
    // Catalogue, qui l'appelle lui-même.
    expect(createProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ["https://cdn.test/p/1.webp", "https://cdn.test/p/2.webp"],
      }),
      undefined,
      revendication
    )
    expect(revendication.lier).not.toHaveBeenCalled()
  })

  it("laisse le Catalogue refuser une Image produit persistée glissée dans une création", async () => {
    // La règle de création appartient au Catalogue, appliquée une seule fois dans
    // `createProduct`. L'action ne la connaît plus : elle transmet la galerie
    // telle quelle — ici l'URL persistée qu'un client a glissée, et sans aucune
    // revendication — et l'éditeur reçoit le refus du Catalogue, rendu comme
    // n'importe quel refus de validation d'un champ. Que ce refus laisse le
    // Produit intact est prouvé dans `lib/use-cases/admin-catalog.test.ts`, où la
    // règle est écrite une fois.
    const messageRegle =
      "une création n'écrit que des Images produit promues par cette opération ; téléversez l'image dans la galerie du Produit"
    createProductMock.mockRejectedValue(
      new CatalogValidationError([messageRegle])
    )

    const resultat = await createProductAction(
      {},
      formData([
        {
          kind: "persistee",
          url: "https://cdn.test/produits/arbitraire.webp",
        },
      ])
    )

    expect(createProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ["https://cdn.test/produits/arbitraire.webp"],
      })
    )
    expect(resultat).toEqual({
      error: `Données invalides : ${messageRegle}`,
    })
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
  it("transmet la galerie entière et forward la valeur qu'il reçoit", async () => {
    // Même contrat que dans l'action de création, sur le chemin d'une mise à
    // jour : l'action choisit la mutation à écrire, elle n'assemble rien. Un
    // Brouillon intercalé entre deux Images produit persistées est ici sans
    // aucune incidence sur ce que l'action fait — l'ordre est déjà dans la
    // valeur qu'elle reçoit.
    const galerieSoumise = [
      {
        kind: "brouillon" as const,
        draftId: "draft-1",
        previewUrl: "https://cdn.test/brouillons/draft-1.webp",
      },
      {
        kind: "persistee" as const,
        url: "https://cdn.test/p/existing.webp",
      },
      {
        kind: "brouillon" as const,
        draftId: "draft-2",
        previewUrl: "https://cdn.test/brouillons/draft-2.webp",
      },
    ]
    const revendication = {
      galerie: [
        "https://cdn.test/p/draft-1.webp",
        "https://cdn.test/p/existing.webp",
        "https://cdn.test/p/draft-2.webp",
      ],
      promues: [
        "https://cdn.test/p/draft-1.webp",
        "https://cdn.test/p/draft-2.webp",
      ],
      lier: vi.fn(async () => {}),
    }
    updateProductMock.mockResolvedValue({ id: "produit-1" })
    revendiquerEtEnregistrerMock.mockImplementation(
      async ({ enregistrer, galerie, ownerId, tentativeId }) => {
        expect(galerie).toEqual(galerieSoumise)
        expect(ownerId).toBe("editeur-1")
        expect(tentativeId).toBe("tentative-update-1")
        return { ok: true, ...(await enregistrer(revendication)) }
      }
    )

    await expect(
      updateProductAction({}, updateFormData(galerieSoumise))
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
      revendication
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
    // Le résultat déjà persisté ne rend rien : ce qu'il apporte est d'avoir
    // relu le Produit, et l'opération rend à son tour l'identifiant seul.
    revendiquerEtEnregistrerMock.mockImplementation(
      async ({ resultatDejaPersiste }) => {
        if (!resultatDejaPersiste) throw new Error("callback absent")
        await resultatDejaPersiste("produit-1")
        return { ok: true, productId: "produit-1" }
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

    expect(getAdminProductMock).toHaveBeenCalledWith("produit-1")
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
