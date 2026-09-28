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
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

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

/** Ce que l'action transmet à l'opération, tel que le formulaire l'a écrit. */
interface SoumissionCycleVie {
  galerie: { kind: string; url?: string; draftId?: string }[]
  enregistrer: (revendication: unknown) => Promise<unknown>
}

/**
 * Le module du cycle de vie, réduit à ce que cette suite observe de lui : il
 * reçoit la galerie du formulaire, forward au Catalogue la valeur qu'il a
 * composée, et rend un refus `catalogue-refuse` portant le message qu'une
 * erreur du Catalogue lui a laissée. C'est tout le contrat que l'action connaît ;
 * le reste du module — le découpage, la promotion, l'ordre — est prouvé à son
 * interface, dans `lib/cycle-vie-image-produit.test.ts`.
 *
 * **Une galerie sans Brouillon est le cas le plus simple de ce stand-in** : il
 * n'y a rien à promouvoir, donc la galerie est celle des URL déjà persistées,
 * le sous-ensemble promu est vide, et la liaison ne lie rien. C'est aussi ce que
 * fait le vrai module pour elle, et c'est ce que l'action transmet à la
 * mutation.
 */
function cycleVieSansBrouillon() {
  revendiquerEtEnregistrerMock.mockImplementation(
    async ({ enregistrer, galerie }: SoumissionCycleVie) => {
      const revendication = {
        galerie: galerie.flatMap((entree) =>
          entree.kind === "persistee" && entree.url ? [entree.url] : []
        ),
        promues: [] as string[],
        lier: vi.fn(async () => {}),
      }
      try {
        return { ok: true, ...((await enregistrer(revendication)) as object) }
      } catch (error) {
        return {
          ok: false,
          code: "catalogue-refuse",
          message:
            error instanceof UserFacingError
              ? error.message
              : "L'enregistrement du Catalogue a échoué",
        }
      }
    }
  )
}

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
    // `createProduct`. L'action ne la connaît pas : elle transmet la galerie
    // telle quelle, et c'est l'opération qui décide que cette galerie ne porte
    // aucun Brouillon — donc qu'elle n'a rien promu — avant de la donner à la
    // mutation. Le Catalogue refuse alors, et l'éditeur reçoit ce refus rendu
    // comme n'importe quel refus de validation d'un champ.
    //
    // C'est le chemin que prend désormais la création d'un Produit dont la
    // galerie ne porte que des Images produit persistées : plus de
    // court-circuit dans l'action, et c'est la règle du Catalogue qui le dit,
    // donc impossible à contourner par un appelant qui assemblerait les
    // arguments autrement. Le message est celui de la règle, écrite et prouvée
    // dans `lib/use-cases/admin-catalog.test.ts`.
    const messageRegle =
      "une création ne peut écrire que des Images produit téléversées dans sa galerie ; une Image produit déjà enregistrée appartient à un autre Produit"
    const galerieSoumise = [
      {
        kind: "persistee" as const,
        url: "https://cdn.test/produits/arbitraire.webp",
      },
    ]
    cycleVieSansBrouillon()
    createProductMock.mockRejectedValue(
      new CatalogValidationError([messageRegle])
    )

    const resultat = await createProductAction({}, formData(galerieSoumise))

    // L'opération a été atteinte, et la galerie lui est arrivée entière.
    expect(revendiquerEtEnregistrerMock).toHaveBeenCalledWith(
      expect.objectContaining({ galerie: galerieSoumise })
    )
    expect(createProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ["https://cdn.test/produits/arbitraire.webp"],
      }),
      undefined,
      expect.objectContaining({ promues: [] })
    )
    expect(resultat).toEqual({
      error: `Données invalides : ${messageRegle}`,
    })
  })

  it("crée un Produit sans image, par le chemin de l'opération", async () => {
    // Une galerie sans Brouillon n'a rien de spécial : elle atteint l'opération
    // comme une autre, et c'est elle qui décide de ce qui est écrit. Le
    // sous-ensemble promu est donc vide, et la règle de création — qui refuse
    // une image écrite sans promotion, pas l'absence d'image — laisse passer
    // une galerie vide. L'éditeur crée son Produit maintenant, et lui donnera
    // des images par une mise à jour.
    cycleVieSansBrouillon()
    createProductMock.mockResolvedValue({ id: "produit-1" })

    await expect(createProductAction({}, formData([]))).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    // Une seule écriture du Catalogue, et rien d'autre à écrire : la liaison
    // n'a rien à lier, donc l'action ne l'appelle pas.
    expect(createProductMock).toHaveBeenCalledTimes(1)
    const revendication = createProductMock.mock.calls[0][2] as {
      galerie: readonly string[]
      promues: readonly string[]
      lier: ReturnType<typeof vi.fn>
    }
    expect(revendication).toMatchObject({ galerie: [], promues: [] })
    expect(revendication.lier).not.toHaveBeenCalled()
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
    // galerie telle quelle et ne pré-empêche rien — ici il n'y a même pas de
    // Brouillon, et la galerie atteint l'opération avant d'atteindre le
    // Catalogue.
    const galerieSoumise = [
      {
        kind: "persistee" as const,
        url: "https://cdn.test/p/arbitraire.webp",
      },
    ]
    cycleVieSansBrouillon()
    updateProductMock.mockRejectedValue(
      new CatalogValidationError([
        "une Image produit persistée n'appartient pas à ce Produit",
      ])
    )

    const resultat = await updateProductAction(
      {},
      updateFormData(galerieSoumise)
    )

    expect(resultat).toEqual({
      error:
        "Données invalides : une Image produit persistée n'appartient pas à ce Produit",
    })
    expect(revendiquerEtEnregistrerMock).toHaveBeenCalledWith(
      expect.objectContaining({ galerie: galerieSoumise })
    )
    expect(updateProductMock).toHaveBeenCalledWith(
      "produit-1",
      {
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
      },
      undefined,
      expect.objectContaining({ promues: [] })
    )
    // Une seule lecture du Produit : celle de la mutation du Catalogue. La
    // relecture d'un commit déjà durable n'a rien à relire ici, puisqu'aucun
    // Brouillon ne tient la tentative.
    expect(getAdminProductMock).not.toHaveBeenCalled()
  })

  it("édite une galerie de seules Images produit persistées, par le chemin de l'opération", async () => {
    // Le cas le plus ordinaire de l'Administration : un Produit déjà porteur
    // d'images que l'éditeur réordonne ou renomme. Il prend le chemin de
    // l'opération comme une galerie qui contient un Brouillon, et ce qui est
    // écrit reste la galerie soumise.
    const galerieSoumise = [
      {
        kind: "persistee" as const,
        url: "https://cdn.test/p/deux.webp",
      },
      {
        kind: "persistee" as const,
        url: "https://cdn.test/p/une.webp",
      },
    ]
    cycleVieSansBrouillon()
    updateProductMock.mockResolvedValue({ id: "produit-1" })

    await expect(
      updateProductAction({}, updateFormData(galerieSoumise))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    // Une seule écriture du Catalogue, dans l'ordre soumis, et une liaison à
    // qui il n'y a rien à lier.
    expect(updateProductMock).toHaveBeenCalledTimes(1)
    const revendication = updateProductMock.mock.calls[0][3] as {
      galerie: readonly string[]
      promues: readonly string[]
      lier: ReturnType<typeof vi.fn>
    }
    expect(revendication.galerie).toEqual([
      "https://cdn.test/p/deux.webp",
      "https://cdn.test/p/une.webp",
    ])
    expect(revendication.promues).toEqual([])
    expect(revendication.lier).not.toHaveBeenCalled()
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
    // l'éditeur comme n'importe quel refus de validation d'un champ. Une galerie
    // de neuf Images produit déjà persistées est aussi une galerie sans
    // Brouillon : elle n'a donc plus de chemin particulier dans l'action.
    const galerieAuDelaDeLaLimite = Array.from({ length: 9 }, (_vide, i) => ({
      kind: "persistee" as const,
      url: `https://cdn.test/p/${i + 1}.webp`,
    }))
    cycleVieSansBrouillon()
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
      }),
      undefined,
      expect.objectContaining({ promues: [] })
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
