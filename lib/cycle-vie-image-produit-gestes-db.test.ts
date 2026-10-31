import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  creerCycleVieImageProduit,
  creerRegistreBrouillonImageProduitPrisma,
  portTransactionRegistreBrouillonImageProduit,
  type CycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type { ContentTypeImageProduit } from "@/lib/r2"
import { draftObjectKey, persistentObjectKey } from "@/lib/r2"
import {
  creerStockageImageProduitMemoire,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"

const ownerId = randomUUID()
const autreOwnerId = randomUUID()
const categoryId = randomUUID()
const categorySlug = `cat-gestes-${categoryId.slice(0, 8)}`
const now = new Date("2026-06-03T10:00:00.000Z")

const MESSAGE_BROUILLON_DEJA_LIBERE =
  "Ce Brouillon d'Image produit a déjà été libéré : il n'existe plus et ne peut plus être revendiqué."

function brouillon(draftId: string): EntreeImageProduit {
  return {
    kind: "brouillon",
    draftId,
    previewUrl: `https://preview.test/${draftId}`,
  }
}

describe("gestes séquentiels du cycle de vie — registre durable", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          name: "Éditeur Gestes",
          email: `gestes-${ownerId}@example.test`,
          role: "admin",
        },
        {
          id: autreOwnerId,
          name: "Autre éditeur Gestes",
          email: `autre-gestes-${autreOwnerId}@example.test`,
          role: "admin",
        },
      ],
    })
    await prisma.category.create({
      data: { id: categoryId, name: "Catégorie gestes", slug: categorySlug },
    })
  })

  beforeEach(async () => {
    await prisma.brouillonImageProduit.deleteMany({
      where: { ownerId: { in: [ownerId, autreOwnerId] } },
    })
    await prisma.product.deleteMany({ where: { categoryId } })
  })

  afterAll(async () => {
    await prisma.brouillonImageProduit.deleteMany({
      where: { ownerId: { in: [ownerId, autreOwnerId] } },
    })
    await prisma.product.deleteMany({ where: { categoryId } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, autreOwnerId] } },
    })
    await prisma.$disconnect()
  })

  function creerCycleVie(stockage = creerStockageImageProduitMemoire()) {
    return {
      cycleVie: creerCycleVieImageProduit({
        stockage,
        registre: creerRegistreBrouillonImageProduitPrisma({
          maintenant: () => new Date(now),
        }),
        horloge: { maintenant: () => new Date(now) },
      }),
      stockage,
    }
  }

  async function creerProduit(nom: string) {
    return prisma.product.create({
      data: {
        name: nom,
        slug: `produit-gestes-${randomUUID().slice(0, 8)}`,
        description: "description",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        category: { connect: { id: categoryId } },
      },
      select: { id: true },
    })
  }

  async function demanderBrouillon(
    cycleVie: CycleVieImageProduit,
    contentType: ContentTypeImageProduit = "image/webp"
  ) {
    const resultat = await cycleVie.demanderBrouillon({
      ownerId,
      contentType,
      size: 1024,
    })
    if (!resultat.ok) throw new Error("La demande devait réussir")
    return resultat
  }

  async function preparer(
    cycleVie: CycleVieImageProduit,
    galerie: readonly EntreeImageProduit[],
    tentativeId = "tentative-durable"
  ) {
    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId,
      ownerId,
      galerie,
    })
    if (!resultat.ok) throw new Error("La préparation devait réussir")
    return resultat
  }

  function etatPersiste(draftId: string) {
    return prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: draftId },
      select: {
        state: true,
        tentativeId: true,
        productId: true,
        promotedPublicUrl: true,
      },
    })
  }

  it("enregistre la ligne durable d'un Brouillon demandé, vivante pour la rétention", async () => {
    const { cycleVie } = creerCycleVie()
    const demande = await demanderBrouillon(cycleVie, "image/webp")

    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: demande.draftId },
    })

    expect(row).toMatchObject({
      id: demande.draftId,
      storageKey: `products/brouillons/${demande.draftId}.webp`,
      mimeType: "image/webp",
      byteSize: 1024,
      ownerId,
      tentativeId: null,
      state: "vivant",
      promotedPublicUrl: null,
      productId: null,
    })
    expect(row.expiresAt).toEqual(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    expect(demande.expiresAt).toEqual(row.expiresAt)
  })

  it("libère un Brouillon vivant du registre durable, que plus personne ne revendique", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const demande = await demanderBrouillon(cycleVie, "image/gif")

    expect(
      await cycleVie.relacherBrouillon({ draftId: demande.draftId, ownerId })
    ).toEqual({ ok: true, draftId: demande.draftId })
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(demande.draftId, "image/gif"),
    ])
    expect(await etatPersiste(demande.draftId)).toEqual({
      state: "libéré",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })

    expect(
      await cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-apres-liberation",
        ownerId,
        galerie: [brouillon(demande.draftId)],
      })
    ).toEqual({
      ok: false,
      code: "brouillon-non-vivant",
      message: MESSAGE_BROUILLON_DEJA_LIBERE,
    })
    expect(stockage.promotions).toEqual([])
    expect(await etatPersiste(demande.draftId)).toEqual({
      state: "libéré",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
  })

  it("refuse une rangée durable au type illisible sans promouvoir ni libérer", async () => {
    const draftId = randomUUID()
    await prisma.brouillonImageProduit.create({
      data: {
        id: draftId,
        storageKey: `products/brouillons/${draftId}.svg`,
        mimeType: "image/svg+xml",
        byteSize: 2048,
        ownerId,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    })
    const { cycleVie, stockage } = creerCycleVie()

    await expect(cycleVie.lireBrouillon(draftId)).rejects.toThrow(
      "image/svg+xml"
    )
    expect(await cycleVie.relacherBrouillon({ draftId, ownerId })).toEqual({
      ok: false,
      code: "registre-indisponible",
      message: "Registre des Brouillons indisponible",
    })

    expect(
      await cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-illisible",
        ownerId,
        galerie: [brouillon(draftId)],
      })
    ).toEqual({
      ok: false,
      code: "registre-indisponible",
      message: "Registre des Brouillons indisponible",
    })
    expect(stockage.promotions).toEqual([])
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(await etatPersiste(draftId)).toEqual({
      state: "revendiqué",
      tentativeId: "tentative-illisible",
      productId: null,
      promotedPublicUrl: null,
    })
  })

  it("prépare contre le registre durable et garde la place d'un Brouillon intercalé", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/png")
    const persisteeAvant = "https://cdn.test/produits/persistee-1.webp"
    const persisteeApres = "https://cdn.test/produits/persistee-2.webp"

    const resultat = await preparer(cycleVie, [
      persistee(persisteeAvant),
      brouillon(premiere.draftId),
      persistee(persisteeApres),
      brouillon(seconde.draftId),
    ])

    expect(resultat).toEqual({
      ok: true,
      galerie: [
        persisteeAvant,
        urlImagePersistee(premiere.draftId, "image/jpeg"),
        persisteeApres,
        urlImagePersistee(seconde.draftId, "image/png"),
      ],
      promotions: [
        {
          draftId: premiere.draftId,
          publicUrl: urlImagePersistee(premiere.draftId, "image/jpeg"),
          contentType: "image/jpeg",
          tentativeId: "tentative-durable",
          faits: {
            mimeType: "image/jpeg",
            byteSize: 1024,
            width: 640,
            height: 480,
          },
        },
        {
          draftId: seconde.draftId,
          publicUrl: urlImagePersistee(seconde.draftId, "image/png"),
          contentType: "image/png",
          tentativeId: "tentative-durable",
          faits: {
            mimeType: "image/png",
            byteSize: 1024,
            width: 640,
            height: 480,
          },
        },
      ],
    })
    expect(stockage.promotions).toHaveLength(2)
    expect(stockage.suppressionsBrouillons).toEqual([])
    for (const demande of [premiere, seconde]) {
      expect(await etatPersiste(demande.draftId)).toEqual({
        state: "revendiqué",
        tentativeId: "tentative-durable",
        productId: null,
        promotedPublicUrl: null,
      })
    }
  })

  it("refuse le Brouillon d'un autre Propriétaire sur le registre durable", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const demande = await demanderBrouillon(cycleVie)

    expect(
      await cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-durable",
        ownerId: autreOwnerId,
        galerie: [brouillon(demande.draftId)],
      })
    ).toEqual({
      ok: false,
      code: "proprietaire-incorrect",
      message: "Ce brouillon ne vous appartient pas",
    })
    expect(stockage.promotions).toEqual([])
    expect(await etatPersiste(demande.draftId)).toEqual({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
  })

  it("compense sur le registre durable quand une promotion échoue en cours de route", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/avif")
    const promouvoir = stockage.promouvoirBrouillon.bind(stockage)
    stockage.promouvoirBrouillon = async (input) => {
      if (input.draftId === seconde.draftId) {
        return {
          ok: false,
          erreur: { code: "erreur-stockage", message: "échec simulé" },
        }
      }
      return promouvoir(input)
    }

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-durable",
      ownerId,
      galerie: [brouillon(premiere.draftId), brouillon(seconde.draftId)],
    })

    expect(resultat).toEqual({
      ok: false,
      code: "stockage-refuse",
      message: "échec simulé",
    })
    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(premiere.draftId, "image/jpeg"),
    ])
    expect(stockage.suppressionsBrouillons).toEqual([])
    for (const demande of [premiere, seconde]) {
      expect(await etatPersiste(demande.draftId)).toEqual({
        state: "vivant",
        tentativeId: null,
        productId: null,
        promotedPublicUrl: null,
      })
    }
  })

  it("confirme les liens dans la transaction de l'appelant, et le commit les garde", async () => {
    const { cycleVie } = creerCycleVie()
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/png")
    const preparation = await preparer(cycleVie, [
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])
    const produit = await creerProduit("Produit confirmé")

    await prisma.$transaction(async (tx) => {
      await cycleVie.confirmerBrouillons(
        produit.id,
        preparation.promotions,
        portTransactionRegistreBrouillonImageProduit(tx)
      )
    })

    for (const preuve of preparation.promotions) {
      expect(await etatPersiste(preuve.draftId)).toEqual({
        state: "revendiqué",
        tentativeId: "tentative-durable",
        productId: produit.id,
        promotedPublicUrl: preuve.publicUrl,
      })
    }
  })

  it("n'écrit aucun lien quand la transaction de l'appelant est annulée", async () => {
    const { cycleVie } = creerCycleVie()
    const demande = await demanderBrouillon(cycleVie, "image/webp")
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    const produit = await creerProduit("Produit annulé")

    await expect(
      prisma.$transaction(async (tx) => {
        await cycleVie.confirmerBrouillons(
          produit.id,
          preparation.promotions,
          portTransactionRegistreBrouillonImageProduit(tx)
        )
        throw new Error("transaction annulée")
      })
    ).rejects.toThrow("transaction annulée")

    expect(await etatPersiste(demande.draftId)).toEqual({
      state: "revendiqué",
      tentativeId: "tentative-durable",
      productId: null,
      promotedPublicUrl: null,
    })
  })

  it("lit par tentative sur le registre durable, de quoi reconnaître une resoumission", async () => {
    const { cycleVie } = creerCycleVie()
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/png")
    const rivale = await demanderBrouillon(cycleVie, "image/gif")
    const preparation = await preparer(cycleVie, [
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])
    await preparer(cycleVie, [brouillon(rivale.draftId)], "tentative-rivale")
    const produit = await creerProduit("Produit resoumis")
    await cycleVie.confirmerBrouillons(produit.id, preparation.promotions)

    const lus = await cycleVie.lireBrouillonsDeLaTentative("tentative-durable")

    expect(lus.map((brouillon) => brouillon.id)).toEqual([
      premiere.draftId,
      seconde.draftId,
    ])
    expect(lus.map((brouillon) => brouillon.productId)).toEqual([
      produit.id,
      produit.id,
    ])
    expect(lus.map((brouillon) => brouillon.promotedPublicUrl)).toEqual([
      urlImagePersistee(premiere.draftId, "image/jpeg"),
      urlImagePersistee(seconde.draftId, "image/png"),
    ])
    expect(
      await cycleVie.lireBrouillonsDeLaTentative("tentative-inconnue")
    ).toEqual([])
  })

  it("supprime les sources d'un registre durable sans toucher aux liens", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const demande = await demanderBrouillon(cycleVie, "image/avif")
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    const produit = await creerProduit("Produit sourcé")
    await cycleVie.confirmerBrouillons(produit.id, preparation.promotions)

    await cycleVie.supprimerSources(preparation.promotions)

    expect(stockage.suppressionsBrouillons).toHaveLength(1)
    expect(stockage.suppressionsImagesPromues).toEqual([])
    expect(await etatPersiste(demande.draftId)).toEqual({
      state: "revendiqué",
      tentativeId: "tentative-durable",
      productId: produit.id,
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/avif"),
    })
  })
})
