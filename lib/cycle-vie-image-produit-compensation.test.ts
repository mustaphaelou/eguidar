import { describe, expect, it } from "vitest"

import type { CycleVieImageProduit } from "@/lib/cycle-vie-image-produit"
import { persistentObjectKey } from "@/lib/r2"
import type { ContentTypeImageProduit } from "@/lib/r2"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import {
  brouillon,
  creerCycleVieTest,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-06-03T10:00:00.000Z")

async function demanderBrouillon(
  cycleVie: CycleVieImageProduit,
  contentType: ContentTypeImageProduit = "image/webp"
) {
  const resultat = await cycleVie.demanderBrouillon({
    ownerId: "editeur-1",
    contentType,
    size: 1024,
  })
  if (!resultat.ok) throw new Error("La demande devait réussir")
  return resultat
}

async function preparer(
  cycleVie: CycleVieImageProduit,
  galerie: readonly EntreeImageProduit[],
  tentativeId = "tentative-1"
) {
  const resultat = await cycleVie.preparerPromotionBrouillons({
    tentativeId,
    ownerId: "editeur-1",
    galerie,
  })
  if (!resultat.ok) throw new Error("La préparation devait réussir")
  return resultat
}

describe("compensation de la promotion des Brouillons d'Image produit", () => {
  it("supprime les objets promus et rend les revendications de la tentative", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/png")
    const preparation = await preparer(cycleVie, [
      persistee("https://cdn.test/produits/persistee.webp"),
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])

    await cycleVie.compenserPromotionBrouillons(preparation.promotions)

    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(premiere.draftId, "image/jpeg"),
      persistentObjectKey(seconde.draftId, "image/png"),
    ])
    expect(stockage.suppressionsBrouillons).toEqual([])
    for (const demande of [premiere, seconde]) {
      expect(registre.records.get(demande.draftId)).toMatchObject({
        state: "vivant",
        tentativeId: null,
        productId: null,
        promotedPublicUrl: null,
      })
    }
  })

  it("laisse la même tentative repartir de zéro après compensation", async () => {
    const { cycleVie } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const premiere = await preparer(cycleVie, [brouillon(demande.draftId)])

    await cycleVie.compenserPromotionBrouillons(premiere.promotions)

    const seconde = await preparer(cycleVie, [brouillon(demande.draftId)])
    expect(seconde.promotions).toEqual([
      {
        draftId: demande.draftId,
        publicUrl: urlImagePersistee(demande.draftId, "image/webp"),
        contentType: "image/webp",
        tentativeId: "tentative-1",
        faits: {
          mimeType: "image/webp",
          byteSize: 1024,
          width: 640,
          height: 480,
        },
      },
    ])
  })

  it("ne défait pas une promotion déjà liée à un Produit", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    await cycleVie.confirmerBrouillons("produit-1", preparation.promotions)

    await cycleVie.compenserPromotionBrouillons(preparation.promotions)

    expect(stockage.suppressionsImagesPromues).toEqual([])
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
    })
  })

  it("reste silencieuse quand le stockage ou le registre tombe", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    stockage.pannes.supprimerImagePromue.add("leve")
    registre.pannes.add("annulerRevendication")

    await expect(
      cycleVie.compenserPromotionBrouillons(preparation.promotions)
    ).resolves.toBeUndefined()
    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(demande.draftId, "image/webp"),
    ])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
    })
  })

  it("ne détruit rien qu'elle ne puisse vérifier auprès du registre", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    registre.pannes.add("lire")

    await expect(
      cycleVie.compenserPromotionBrouillons(preparation.promotions)
    ).resolves.toBeUndefined()
    expect(stockage.suppressionsImagesPromues).toEqual([])
  })
})
