import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { revalidatePath } from "next/cache"

import { CHAMPS_FORMULAIRE_PRODUIT } from "@/lib/formulaire-produit"
import type { RapportLot } from "@/lib/produit-bulk"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type { ProductInput } from "@/lib/use-cases/admin-catalog"
import type { Client } from "@/lib/use-cases/session-courante"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const catalogue = vi.hoisted(creerCatalogueFaux)

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
  createProduct: (champs: ProductInput) => catalogue.creer(champs),
  updateProduct: (produitId: string, champs: ProductInput) =>
    catalogue.mettreAJour(produitId, champs),
  deleteProduct: (produitId: string) => catalogue.supprimer(produitId),
  bulkSetStructure: (ids: string[], structureId: string) =>
    catalogue.enLot("structure", ids, structureId),
  bulkSetFeatured: (ids: string[], valeur: boolean) =>
    catalogue.enLot("mise-en-avant", ids, valeur),
  bulkSetFreeShipping: (ids: string[], valeur: boolean) =>
    catalogue.enLot("livraison-offerte", ids, valeur),
  bulkDelete: (ids: string[]) => catalogue.enLot("suppression", ids),
  duplicateProduct: (produitId: string) => catalogue.dupliquer(produitId),
}))

import {
  bulkDeleteAction,
  bulkSetFeaturedAction,
  bulkSetFreeShippingAction,
  bulkSetStructureAction,
  createProductAction,
  deleteProductAction,
  duplicateProductAction,
  updateProductAction,
} from "@/app/admin/produits/actions"
import {
  CatalogValidationError,
  ProductNotFoundError,
} from "@/lib/use-cases/admin-catalog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const BASE_CDN = "https://cdn.test"
const BASE_CDN_INITIALE = process.env.R2_PUBLIC_URL

const ADMIN: Client = {
  id: "editeur-1",
  name: "Éditeur",
  email: "editeur@example.test",
  role: "admin",
}

interface AppelCatalogue {
  readonly produitId: string
  readonly champs: ProductInput
}

interface AppelLot {
  readonly geste: string
  readonly ids: string[]
  readonly valeur: string | boolean | undefined
}

interface CatalogueFaux {
  readonly appels: AppelCatalogue[]
  readonly suppressions: string[]
  readonly lots: AppelLot[]
  readonly duplications: string[]
  rapport: RapportLot
  refus: Error | null
  creer(champs: ProductInput): Promise<{ id: string }>
  mettreAJour(produitId: string, champs: ProductInput): Promise<{ id: string }>
  supprimer(produitId: string): Promise<void>
  enLot(
    geste: string,
    ids: string[],
    valeur?: string | boolean
  ): Promise<RapportLot>
  dupliquer(produitId: string): Promise<{ id: string }>
  oublier(): void
}

function creerCatalogueFaux(): CatalogueFaux {
  const appels: AppelCatalogue[] = []
  const suppressions: string[] = []
  const lots: AppelLot[] = []
  const duplications: string[] = []
  let compteur = 0

  async function refuser(): Promise<void> {
    if (faux.refus) throw faux.refus
  }

  async function enregistrer(
    produitId: string,
    champs: ProductInput
  ): Promise<{ id: string }> {
    await refuser()
    appels.push({ produitId, champs })
    return { id: produitId }
  }

  const faux: CatalogueFaux = {
    appels,
    suppressions,
    lots,
    duplications,
    rapport: { succes: [], echecs: [] },
    refus: null,
    creer(champs) {
      compteur += 1
      return enregistrer(`produit-${compteur}`, champs)
    },
    mettreAJour(produitId, champs) {
      return enregistrer(produitId, champs)
    },
    async supprimer(produitId) {
      await refuser()
      suppressions.push(produitId)
    },
    async enLot(geste, ids, valeur) {
      await refuser()
      lots.push({ geste, ids, valeur })
      return faux.rapport
    },
    async dupliquer(produitId) {
      await refuser()
      duplications.push(produitId)
      return { id: "produit-copie" }
    },
    oublier() {
      appels.length = 0
      suppressions.length = 0
      lots.length = 0
      duplications.length = 0
      compteur = 0
      faux.refus = null
      faux.rapport = { succes: [], echecs: [] }
    },
  }

  return faux
}

function persistee(url: string): EntreeImageProduit {
  return { kind: "persistee", url }
}

function brouillon(draftId: string): EntreeImageProduit {
  return {
    kind: "brouillon",
    draftId,
    previewUrl: `https://apercu.test/${draftId}`,
  }
}

function formData(
  galerie: EntreeImageProduit[],
  tentativeId = "tentative-1"
): FormData {
  const data = new FormData()
  data.append(CHAMPS_FORMULAIRE_PRODUIT.nom, "Produit")
  data.append(CHAMPS_FORMULAIRE_PRODUIT.slug, "produit-de-test")
  data.append(CHAMPS_FORMULAIRE_PRODUIT.marque, "Marque")
  data.append(CHAMPS_FORMULAIRE_PRODUIT.structure, "categorie-1")
  data.append(CHAMPS_FORMULAIRE_PRODUIT.description, "Description")
  data.append(CHAMPS_FORMULAIRE_PRODUIT.prix, "100")
  data.append(CHAMPS_FORMULAIRE_PRODUIT.galerie, JSON.stringify(galerie))
  data.append(
    CHAMPS_FORMULAIRE_PRODUIT.variantes,
    JSON.stringify([
      { name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 2 },
    ])
  )
  data.append(CHAMPS_FORMULAIRE_PRODUIT.tentative, tentativeId)
  return data
}

function updateFormData(
  galerie: EntreeImageProduit[],
  tentativeId = "tentative-update-1"
): FormData {
  const data = formData(galerie, tentativeId)
  data.append(CHAMPS_FORMULAIRE_PRODUIT.produit, "produit-1")
  return data
}

function formulaireSuppression(): FormData {
  const data = new FormData()
  data.append(CHAMPS_FORMULAIRE_PRODUIT.produit, "produit-1")
  return data
}

afterAll(() => {
  if (BASE_CDN_INITIALE === undefined) delete process.env.R2_PUBLIC_URL
  else process.env.R2_PUBLIC_URL = BASE_CDN_INITIALE
})

beforeEach(() => {
  process.env.R2_PUBLIC_URL = BASE_CDN
  sessionCouranteMock.mockResolvedValue(ADMIN)
  redirectMock.mockClear()
  catalogue.oublier()
})

describe("createProductAction", () => {
  it("décode le formulaire et confie au Catalogue la galerie brute, la Tentative et le Propriétaire", async () => {
    const galerie = [
      persistee("https://cdn.test/products/existante.webp"),
      brouillon("brouillon-1"),
    ]

    await expect(
      createProductAction({}, formData(galerie))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.appels).toEqual([
      {
        produitId: "produit-1",
        champs: {
          name: "Produit",
          slug: "produit-de-test",
          description: "Description",
          brand: "Marque",
          categoryId: "categorie-1",
          price: 10000,
          specs: {},
          images: galerie,
          tentativeId: "tentative-1",
          ownerId: ADMIN.id,
          isFeatured: false,
          featuredOrder: 0,
          freeShipping: false,
          variants: [
            { name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 2 },
          ],
        },
      },
    ])
  })

  it("crée un Produit sans image, et lui en donnera par une mise à jour", async () => {
    await expect(createProductAction({}, formData([]))).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.appels).toHaveLength(1)
    expect(catalogue.appels[0]?.champs.images).toEqual([])
  })

  it("remet un refus du domaine à l'éditeur tel quel, sans rien enregistrer", async () => {
    catalogue.refus = new UserFacingError("Ce brouillon ne vous appartient pas")

    const resultat = await createProductAction(
      {},
      formData([brouillon("brouillon-1")])
    )

    expect(resultat).toEqual({ error: "Ce brouillon ne vous appartient pas" })
    expect(catalogue.appels).toEqual([])
  })

  it("met en forme un refus de validation du Catalogue sans le réécrire", async () => {
    const messageRegle =
      "une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit"
    catalogue.refus = new CatalogValidationError([messageRegle])

    const resultat = await createProductAction({}, formData([]))

    expect(resultat).toEqual({ error: `Données invalides : ${messageRegle}` })
    expect(catalogue.appels).toEqual([])
  })

  it("n'invente pas de message pour une panne du Catalogue : l'erreur remonte", async () => {
    catalogue.refus = new Error("échec transactionnel")

    await expect(createProductAction({}, formData([]))).rejects.toThrow(
      "échec transactionnel"
    )
    expect(catalogue.appels).toEqual([])
  })

  it("refuse un formulaire illisible sans appeler le Catalogue", async () => {
    const illisible = formData([])
    illisible.set(CHAMPS_FORMULAIRE_PRODUIT.prix, "abc")

    const resultat = await createProductAction({}, illisible)

    expect(resultat).toEqual({ error: "Formulaire invalide" })
    expect(catalogue.appels).toEqual([])
  })
})

describe("updateProductAction", () => {
  it("décode le formulaire et confie au Catalogue la galerie brute dans l'ordre de l'éditeur", async () => {
    const galerie = [
      persistee("https://cdn.test/products/premiere.webp"),
      brouillon("brouillon-1"),
      persistee("https://cdn.test/products/seconde.webp"),
      brouillon("brouillon-2"),
    ]

    await expect(
      updateProductAction({}, updateFormData(galerie))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(catalogue.appels).toEqual([
      {
        produitId: "produit-1",
        champs: {
          name: "Produit",
          slug: "produit-de-test",
          description: "Description",
          brand: "Marque",
          categoryId: "categorie-1",
          price: 10000,
          specs: {},
          images: galerie,
          tentativeId: "tentative-update-1",
          ownerId: ADMIN.id,
          isFeatured: false,
          featuredOrder: 0,
          freeShipping: false,
          variants: [
            { name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 2 },
          ],
        },
      },
    ])
  })

  it("laisse le refus du Catalogue remonter tel quel, sans rien enregistrer", async () => {
    catalogue.refus = new CatalogValidationError([
      "une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit",
    ])

    const resultat = await updateProductAction(
      {},
      updateFormData([persistee("https://cdn.test/products/dun-autre.webp")])
    )

    expect(resultat).toEqual({
      error:
        "Données invalides : une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit",
    })
    expect(catalogue.appels).toEqual([])
  })

  it("refuse une mise à jour sans identifiant de Produit sans appeler le Catalogue", async () => {
    const resultat = await updateProductAction({}, formData([]))

    expect(resultat).toEqual({ error: "Formulaire invalide" })
    expect(catalogue.appels).toEqual([])
  })

  it("rend un refus formaté quand le Produit a disparu entre-temps, pas une page d'erreur", async () => {
    catalogue.refus = new ProductNotFoundError()

    const resultat = await updateProductAction({}, updateFormData([]))

    expect(resultat).toEqual({ error: "Produit introuvable" })
    expect(catalogue.appels).toEqual([])
  })
})

describe("deleteProductAction", () => {
  it("redirige vers la liste quand le Produit a déjà disparu, sans page d'erreur", async () => {
    catalogue.refus = new ProductNotFoundError()

    await expect(
      deleteProductAction(formulaireSuppression())
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })
    expect(catalogue.suppressions).toEqual([])
  })

  it("refuse une suppression sans identifiant de Produit sans appeler le Catalogue", async () => {
    await expect(deleteProductAction(new FormData())).resolves.toBeUndefined()

    expect(catalogue.suppressions).toEqual([])
  })
})

function formulaireLot(
  ids: string[],
  champs: Record<string, string> = {}
): FormData {
  const data = new FormData()
  data.append("ids", JSON.stringify(ids))
  for (const [cle, valeur] of Object.entries(champs)) data.append(cle, valeur)
  return data
}

describe("les gestes en lot de la Liste des Produits", () => {
  it("n'envoie que les identifiants, dédupliqués, au geste de mise en avant", async () => {
    catalogue.rapport = {
      succes: ["produit-1"],
      echecs: [{ id: "produit-absent", raison: "Produit introuvable" }],
    }

    const resultat = await bulkSetFeaturedAction(
      {},
      formulaireLot(["produit-1", "produit-1", "produit-absent"], {
        valeur: "1",
      })
    )

    expect(catalogue.lots).toEqual([
      {
        geste: "mise-en-avant",
        ids: ["produit-1", "produit-absent"],
        valeur: true,
      },
    ])
    expect(resultat).toEqual({
      rapport: {
        succes: ["produit-1"],
        echecs: [{ id: "produit-absent", raison: "Produit introuvable" }],
      },
    })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/admin/produits")
  })

  it("règle la livraison offerte avec la valeur demandée", async () => {
    await bulkSetFreeShippingAction(
      {},
      formulaireLot(["produit-1"], { valeur: "0" })
    )

    expect(catalogue.lots).toEqual([
      { geste: "livraison-offerte", ids: ["produit-1"], valeur: false },
    ])
  })

  it("définit la Structure choisie pour les seuls identifiants reçus", async () => {
    await bulkSetStructureAction(
      {},
      formulaireLot(["produit-1", "produit-2"], {
        structureId: "categorie-1",
      })
    )

    expect(catalogue.lots).toEqual([
      {
        geste: "structure",
        ids: ["produit-1", "produit-2"],
        valeur: "categorie-1",
      },
    ])
  })

  it("supprime le lot par ses identifiants", async () => {
    await bulkDeleteAction({}, formulaireLot(["produit-1", "produit-2"]))

    expect(catalogue.lots).toEqual([
      {
        geste: "suppression",
        ids: ["produit-1", "produit-2"],
        valeur: undefined,
      },
    ])
  })

  it("duplique une seule ligne et la rapporte comme un succès", async () => {
    const resultat = await duplicateProductAction(
      {},
      formulaireLot(["produit-1", "produit-2"])
    )

    expect(catalogue.duplications).toEqual(["produit-1"])
    expect(resultat).toEqual({
      rapport: { succes: ["produit-copie"], echecs: [] },
    })
  })

  it("refuse un lot illisible sans appeler le Catalogue", async () => {
    const data = new FormData()
    data.append("ids", "pas du json")

    const resultat = await bulkDeleteAction({}, data)

    expect(resultat).toEqual({ error: "Formulaire invalide" })
    expect(catalogue.lots).toEqual([])
    expect(catalogue.duplications).toEqual([])
  })

  it("refuse un geste de Structure sans Structure sans appeler le Catalogue", async () => {
    const resultat = await bulkSetStructureAction(
      {},
      formulaireLot(["produit-1"])
    )

    expect(resultat).toEqual({ error: "Formulaire invalide" })
    expect(catalogue.lots).toEqual([])
  })
})
