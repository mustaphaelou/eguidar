import { beforeEach, describe, expect, it, vi } from "vitest"

import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type {
  CatalogEffects,
  ProductInput,
} from "@/lib/use-cases/admin-catalog"
import type { Client } from "@/lib/use-cases/session-courante"
import {
  brouillon,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const { cycleVie, horloge, instant, registre, stockage } = await vi.hoisted(
  async () => {
    const [module, adaptateurs] = await Promise.all([
      import("@/lib/cycle-vie-image-produit"),
      import("@/test/cycle-vie-image-produit-memoire"),
    ])
    const instant = new Date("2026-01-15T10:00:00.000Z")
    const horloge = adaptateurs.creerHorlogeControllable(instant)
    const stockage = adaptateurs.creerStockageImageProduitMemoire()
    const registre = adaptateurs.creerRegistreImageProduitMemoire(() =>
      horloge.horloge.maintenant()
    )
    return {
      instant,
      horloge,
      stockage,
      registre,
      cycleVie: module.creerCycleVieImageProduit({
        stockage,
        registre,
        horloge: horloge.horloge,
      }),
    }
  }
)

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
  createProduct: (
    champs: ProductInput,
    _effets: Partial<CatalogEffects> | undefined
  ) => catalogue.creer(champs),
  updateProduct: (
    produitId: string,
    champs: ProductInput,
    _effets: Partial<CatalogEffects> | undefined
  ) => catalogue.mettreAJour(produitId, champs),
  getAdminProduct: (produitId: string) =>
    Promise.resolve(catalogue.relire(produitId)),
}))

vi.mock("@/lib/cycle-vie-image-produit", async (importOriginal) => {
  const reel =
    await importOriginal<typeof import("@/lib/cycle-vie-image-produit")>()
  return { ...reel, default: cycleVie }
})

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

interface EcritureCatalogue {
  readonly produitId: string
  readonly galerie: readonly (string | EntreeImageProduit)[]
}

interface ProduitRelu {
  readonly id: string
  readonly images: readonly (string | EntreeImageProduit)[]
}

interface CatalogueFaux {
  readonly ecritures: EcritureCatalogue[]
  refus: Error | null
  creer(champs: ProductInput): Promise<{ id: string }>
  mettreAJour(produitId: string, champs: ProductInput): Promise<{ id: string }>
  relire(produitId: string): ProduitRelu | null
  oublier(): void
}

function creerCatalogueFaux(): CatalogueFaux {
  const ecritures: EcritureCatalogue[] = []
  let compteur = 0

  async function ecrire(
    produitId: string,
    champs: ProductInput
  ): Promise<{ id: string }> {
    if (faux.refus) throw faux.refus
    ecritures.push({ produitId, galerie: [...champs.images] })
    return { id: produitId }
  }

  const faux: CatalogueFaux = {
    ecritures,
    refus: null,
    creer(champs) {
      compteur += 1
      return ecrire(`produit-${compteur}`, champs)
    },
    mettreAJour(produitId, champs) {
      return ecrire(produitId, champs)
    },
    relire(produitId) {
      const ecriture = ecritures.find(
        ({ produitId: ecrit }) => ecrit === produitId
      )
      if (!ecriture) return null
      return { id: produitId, images: [...ecriture.galerie] }
    },
    oublier() {
      ecritures.length = 0
      compteur = 0
      faux.refus = null
    },
  }

  return faux
}

beforeEach(() => {
  sessionCouranteMock.mockResolvedValue(ADMIN)
  redirectMock.mockClear()
  catalogue.oublier()
  registre.records.clear()
  stockage.presignatures.length = 0
  stockage.promotions.length = 0
  stockage.suppressionsBrouillons.length = 0
  stockage.suppressionsImagesPromues.length = 0
  stockage.failPresign = false
  stockage.failPromotion = false
  stockage.failDelete = false
  for (const pannes of Object.values(stockage.pannes)) pannes.clear()
  horloge.fixer(instant)
})

async function televerser(ownerId = ADMIN.id): Promise<string> {
  const demande = await cycleVie.demanderBrouillon({
    ownerId,
    contentType: "image/webp",
    size: 2048,
  })
  if (!demande.ok) throw new Error("La demande de Brouillon devait réussir")
  return demande.draftId
}

function formData(
  galerie: EntreeImageProduit[],
  tentativeId = "tentative-1"
): FormData {
  const data = new FormData()
  data.append("name", "Produit")
  data.append("slug", "produit-de-test")
  data.append("brand", "Marque")
  data.append("categoryId", "categorie-1")
  data.append("description", "Description")
  data.append("price", "100")
  data.append("images", JSON.stringify(galerie))
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
  galerie: EntreeImageProduit[],
  tentativeId = "tentative-update-1"
): FormData {
  const data = formData(galerie, tentativeId)
  data.append("productId", "produit-1")
  return data
}

describe("createProductAction", () => {
  it("enregistre la galerie soumise dans l'ordre de l'éditeur, et lie le Produit au Brouillon promu", async () => {
    const draftId = await televerser()
    const existante = "https://cdn.test/produits/existante.webp"

    await expect(
      createProductAction(
        {},
        formData([persistee(existante), brouillon(draftId)])
      )
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [existante, urlImagePersistee(draftId, "image/webp")],
      },
    ])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(draftId, "image/webp"),
    })
  })

  it("crée un Produit sans image, et lui en donnera par une mise à jour", async () => {
    await expect(createProductAction({}, formData([]))).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.ecritures).toEqual([
      { produitId: "produit-1", galerie: [] },
    ])
    expect(registre.records.size).toBe(0)
  })

  it("refuse une création qui nomme une Image produit d'un autre Produit, sans rien écrire", async () => {
    const messageRegle =
      "une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit"
    const draftId = await televerser()
    catalogue.refus = new CatalogValidationError([messageRegle])

    const resultat = await createProductAction(
      {},
      formData([
        persistee("https://cdn.test/produits/dun-autre-produit.webp"),
        brouillon(draftId),
      ])
    )

    expect(resultat).toEqual({ error: `Données invalides : ${messageRegle}` })
    expect(catalogue.ecritures).toEqual([])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("remet un refus du cycle de vie à l'éditeur comme le sien, sans laisser de trace", async () => {
    const mien = await televerser()
    const autre = await televerser("editeur-2")

    const resultat = await createProductAction(
      {},
      formData([brouillon(mien), brouillon(autre)])
    )

    expect(resultat).toEqual({ error: "Ce brouillon ne vous appartient pas" })
    expect(catalogue.ecritures).toEqual([])
    expect(stockage.promotions).toEqual([])
    expect(registre.records.get(mien)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
    expect(registre.records.get(autre)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("soumettre deux fois le même formulaire résout au même Produit, sans réécrire le Catalogue", async () => {
    const draftId = await televerser()
    const soumission = formData([brouillon(draftId)])

    await expect(createProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })
    await expect(createProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [urlImagePersistee(draftId, "image/webp")],
      },
    ])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
    })
  })
})

describe("updateProductAction", () => {
  it("enregistre la galerie soumise : un Brouillon intercalé atterrit entre les Images produit persistées", async () => {
    const premier = await televerser()
    const second = await televerser()
    const premierePersistee = "https://cdn.test/produits/premiere.webp"
    const secondePersistee = "https://cdn.test/produits/seconde.webp"

    await expect(
      updateProductAction(
        {},
        updateFormData([
          persistee(premierePersistee),
          brouillon(premier),
          persistee(secondePersistee),
          brouillon(second),
        ])
      )
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [
          premierePersistee,
          urlImagePersistee(premier, "image/webp"),
          secondePersistee,
          urlImagePersistee(second, "image/webp"),
        ],
      },
    ])
    expect(registre.records.get(premier)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-update-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(premier, "image/webp"),
    })
    expect(registre.records.get(second)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-update-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(second, "image/webp"),
    })
  })

  it("laisse le Catalogue refuser une Image produit d'un autre Produit, sans rien écrire", async () => {
    const draftId = await televerser()
    catalogue.refus = new CatalogValidationError([
      "une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit",
    ])

    const resultat = await updateProductAction(
      {},
      updateFormData([
        persistee("https://cdn.test/produits/dun-autre-produit.webp"),
        brouillon(draftId),
      ])
    )

    expect(resultat).toEqual({
      error:
        "Données invalides : une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit",
    })
    expect(catalogue.ecritures).toEqual([])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("laisse chaque Brouillon revendicable après un échec de l'écriture, et le retry le promeut à nouveau", async () => {
    const draftId = await televerser()
    const soumission = updateFormData([brouillon(draftId)])
    catalogue.refus = new Error("échec transactionnel")

    const echec = await updateProductAction({}, soumission)

    expect(echec).toEqual({ error: "L'enregistrement du Catalogue a échoué" })
    expect(catalogue.ecritures).toEqual([])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
    expect(stockage.suppressionsBrouillons).toEqual([])

    catalogue.refus = null
    await expect(updateProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [urlImagePersistee(draftId, "image/webp")],
      },
    ])
    expect(stockage.promotions.map((promotion) => promotion.draftId)).toEqual([
      draftId,
      draftId,
    ])
  })

  it("un retry de la même tentative relit le commit et ne réécrit pas le Catalogue", async () => {
    const draftId = await televerser()
    const soumission = updateFormData([brouillon(draftId)])

    await expect(updateProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })
    await expect(updateProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [urlImagePersistee(draftId, "image/webp")],
      },
    ])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-update-1",
      productId: "produit-1",
    })
  })

  it("remonte le refus de la limite d'Images produit comme un refus de champ", async () => {
    const galerieAuDelaDeLaLimite = Array.from({ length: 9 }, (_vide, i) =>
      persistee(`https://cdn.test/produits/${i + 1}.webp`)
    )
    catalogue.refus = new CatalogValidationError([
      "au maximum 8 images par produit",
    ])

    const resultat = await updateProductAction(
      {},
      updateFormData(galerieAuDelaDeLaLimite)
    )

    expect(resultat).toEqual({
      error: "Données invalides : au maximum 8 images par produit",
    })
    expect(catalogue.ecritures).toEqual([])

    const soumissionIllisible = updateFormData([])
    soumissionIllisible.set("price", "abc")
    const refusDeChamp = await updateProductAction({}, soumissionIllisible)
    expect(Object.keys(refusDeChamp)).toEqual(Object.keys(resultat))
    expect(refusDeChamp).toEqual({ error: "Formulaire invalide" })
  })
})
