import { describe, expect, it } from "vitest"

import type {
  ConfirmationPromotionBrouillonImageProduit,
  CycleVieImageProduit,
  PortTransactionRegistreBrouillonImageProduit,
  ResultatPreparationPromotionBrouillons,
} from "@/lib/cycle-vie-image-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import { draftObjectKey } from "@/lib/r2"
import type { ContentTypeImageProduit } from "@/lib/r2"
import {
  brouillon,
  creerCycleVieTest,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-06-02T10:00:00.000Z")

const MESSAGE_LIEN_IMPOSSIBLE =
  "Le Brouillon n'a pas pu être associé au Produit"

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
): Promise<Extract<ResultatPreparationPromotionBrouillons, { ok: true }>> {
  const resultat = await cycleVie.preparerPromotionBrouillons({
    tentativeId,
    ownerId: "editeur-1",
    galerie,
  })
  if (!resultat.ok) throw new Error("La préparation devait réussir")
  return resultat
}

function transactionEspionne(
  reponses: readonly boolean[],
  vues: ConfirmationPromotionBrouillonImageProduit[] = []
): PortTransactionRegistreBrouillonImageProduit {
  let appels = 0
  return {
    async confirmerPromotion(input) {
      vues.push(input)
      const reponse = reponses[appels] ?? true
      appels += 1
      return reponse
    },
  }
}

describe("confirmation de la promotion des Brouillons d'Image produit", () => {
  it("lie chaque Brouillon promu au Produit par le registre", async () => {
    const { cycleVie, registre } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/png")
    const preparation = await preparer(cycleVie, [
      persistee("https://cdn.test/produits/persistee.webp"),
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])

    await cycleVie.confirmerBrouillons("produit-1", preparation.promotions)

    expect(registre.records.get(premiere.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: preparation.promotions[0].publicUrl,
    })
    expect(registre.records.get(seconde.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: preparation.promotions[1].publicUrl,
    })
  })

  it("lie dans la transaction de l'appelant quand elle est fournie", async () => {
    const { cycleVie, registre } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/webp")
    const preparation = await preparer(cycleVie, [
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])
    const vues: ConfirmationPromotionBrouillonImageProduit[] = []

    await cycleVie.confirmerBrouillons(
      "produit-transactionnel",
      preparation.promotions,
      transactionEspionne([true, true], vues)
    )

    expect(vues).toEqual([
      {
        id: premiere.draftId,
        tentativeId: "tentative-1",
        productId: "produit-transactionnel",
        publicUrl: urlImagePersistee(premiere.draftId, "image/jpeg"),
      },
      {
        id: seconde.draftId,
        tentativeId: "tentative-1",
        productId: "produit-transactionnel",
        publicUrl: urlImagePersistee(seconde.draftId, "image/webp"),
      },
    ])
    expect(registre.records.get(premiere.draftId)).toMatchObject({
      productId: null,
      promotedPublicUrl: null,
    })
    expect(registre.records.get(seconde.draftId)).toMatchObject({
      productId: null,
      promotedPublicUrl: null,
    })
  })

  it("jette quand la transaction ne peut pas poser le lien", async () => {
    const { cycleVie, registre } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/png")
    const seconde = await demanderBrouillon(cycleVie, "image/gif")
    const preparation = await preparer(cycleVie, [
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])
    const vues: ConfirmationPromotionBrouillonImageProduit[] = []

    await expect(
      cycleVie.confirmerBrouillons(
        "produit-1",
        preparation.promotions,
        transactionEspionne([true, false], vues)
      )
    ).rejects.toThrow(MESSAGE_LIEN_IMPOSSIBLE)
    expect(vues).toHaveLength(2)
    expect(registre.records.get(premiere.draftId)?.productId).toBeNull()
    expect(registre.records.get(seconde.draftId)?.productId).toBeNull()
  })

  it("jette quand le registre ne peut pas poser le lien", async () => {
    const { cycleVie, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    await registre.annulerRevendication({
      id: demande.draftId,
      tentativeId: "tentative-1",
    })

    await expect(
      cycleVie.confirmerBrouillons("produit-1", preparation.promotions)
    ).rejects.toThrow(MESSAGE_LIEN_IMPOSSIBLE)
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("supprime les objets de Brouillon d'origine après l'engagement", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/avif")
    const preparation = await preparer(cycleVie, [
      persistee("https://cdn.test/produits/persistee.webp"),
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])

    await cycleVie.supprimerSources(preparation.promotions)

    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(premiere.draftId, "image/jpeg"),
      draftObjectKey(seconde.draftId, "image/avif"),
    ])
    expect(stockage.suppressionsImagesPromues).toEqual([])
    expect(stockage.suppressionsImagesPersistees).toEqual([])
    expect(registre.records.get(premiere.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
    })
  })

  it("n'échoue pas quand le stockage refuse de supprimer une source", async () => {
    const { cycleVie, stockage } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/png")
    const seconde = await demanderBrouillon(cycleVie, "image/webp")
    const preparation = await preparer(cycleVie, [
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])
    stockage.failDelete = true

    await expect(
      cycleVie.supprimerSources(preparation.promotions)
    ).resolves.toBeUndefined()
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(premiere.draftId, "image/png"),
      draftObjectKey(seconde.draftId, "image/webp"),
    ])
  })

  it("n'échoue pas quand le stockage tombe pendant la suppression des sources", async () => {
    const { cycleVie, stockage } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    stockage.pannes.supprimerBrouillon.add("leve")

    await expect(
      cycleVie.supprimerSources(preparation.promotions)
    ).resolves.toBeUndefined()
  })

  it("ne supprime aucune source quand il n'y a aucune preuve", async () => {
    const { cycleVie, stockage } = creerCycleVieTest(DATE_INITIALE)

    await cycleVie.supprimerSources([])

    expect(stockage.suppressionsBrouillons).toEqual([])
  })
})

describe("lecture des Brouillons d'une tentative", () => {
  it("rend les Brouillons revendiqués sous cet identifiant de tentative", async () => {
    const { cycleVie, horloge } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    horloge.avancer(1)
    const seconde = await demanderBrouillon(cycleVie, "image/webp")
    horloge.avancer(1)
    const rivale = await demanderBrouillon(cycleVie, "image/png")
    await preparer(cycleVie, [
      brouillon(premiere.draftId),
      brouillon(seconde.draftId),
    ])
    await preparer(cycleVie, [brouillon(rivale.draftId)], "tentative-2")

    const lus = await cycleVie.lireBrouillonsDeLaTentative(" tentative-1 ")

    expect(lus.map((brouillon) => brouillon.id)).toEqual([
      premiere.draftId,
      seconde.draftId,
    ])
    expect(lus.map((brouillon) => brouillon.tentativeId)).toEqual([
      "tentative-1",
      "tentative-1",
    ])
  })

  it("ne rend rien pour une tentative inconnue ou vide", async () => {
    const { cycleVie } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    await preparer(cycleVie, [brouillon(demande.draftId)])

    expect(
      await cycleVie.lireBrouillonsDeLaTentative("tentative-inconnue")
    ).toEqual([])
    expect(await cycleVie.lireBrouillonsDeLaTentative("   ")).toEqual([])
  })

  it("rend les Brouillons liés, de quoi reconnaître une resoumission", async () => {
    const { cycleVie } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await preparer(cycleVie, [brouillon(demande.draftId)])
    await cycleVie.confirmerBrouillons("produit-1", preparation.promotions)

    const lus = await cycleVie.lireBrouillonsDeLaTentative("tentative-1")

    expect(lus).toHaveLength(1)
    expect(lus[0]).toMatchObject({
      id: demande.draftId,
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: preparation.promotions[0].publicUrl,
    })
  })
})
