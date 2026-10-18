import { describe, expect, it } from "vitest"

import { creerCycleVieImageProduit } from "@/lib/cycle-vie-image-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import { draftObjectKey } from "@/lib/r2"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
  urlApercuBrouillon,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-03-01T10:00:00.000Z")

function creerCycleVieRelachement() {
  const horloge = creerHorlogeControllable(DATE_INITIALE)
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  const cycleVie = creerCycleVieImageProduit({
    stockage,
    registre,
    horloge: horloge.horloge,
  })
  return { cycleVie, stockage, registre }
}

async function demanderBrouillon(
  cycleVie: ReturnType<typeof creerCycleVieRelachement>["cycleVie"]
) {
  const resultat = await cycleVie.demanderBrouillon({
    ownerId: "editeur-1",
    contentType: "image/png",
    size: 1024,
  })
  if (!resultat.ok) throw new Error("La demande devait réussir")
  return resultat
}

function galerieDuBrouillon(demande: {
  draftId: string
}): EntreeImageProduit[] {
  return [
    {
      kind: "brouillon",
      draftId: demande.draftId,
      previewUrl: urlApercuBrouillon(demande.draftId, "image/png"),
    },
  ]
}

describe("relâchement d'un Brouillon d'Image produit", () => {
  it("marque le Brouillon d'Image produit libéré avant de supprimer son seul objet de brouillon", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieRelachement()
    const demande = await demanderBrouillon(cycleVie)

    expect(
      await cycleVie.relacherBrouillon({
        draftId: demande.draftId,
        ownerId: "editeur-1",
      })
    ).toEqual({ ok: true, draftId: demande.draftId })

    expect(registre.records.get(demande.draftId)?.state).toBe("libéré")
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(demande.draftId, "image/png"),
    ])
    expect(stockage.suppressionsImagesPromues).toEqual([])
    expect(stockage.suppressionsImagesPersistees).toEqual([])
  })

  it("refuse explicitement une seconde libération du même Brouillon d'Image produit", async () => {
    const { cycleVie, stockage } = creerCycleVieRelachement()
    const demande = await demanderBrouillon(cycleVie)
    await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toEqual({
      ok: false,
      code: "brouillon-non-vivant",
      message: "Ce Brouillon d'Image produit a déjà été libéré",
    })
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(demande.draftId, "image/png"),
    ])
  })

  it("refuse de libérer un Brouillon déjà revendiqué", async () => {
    const { cycleVie } = creerCycleVieRelachement()
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: galerieDuBrouillon(demande),
    })
    expect(preparation.ok).toBe(true)

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toEqual({
      ok: false,
      code: "brouillon-non-vivant",
      message:
        "Ce Brouillon d'Image produit a déjà été revendiqué : il appartient maintenant à un Produit et ne peut plus être libéré",
    })
  })

  it("refuse un éditeur qui ne possède pas le Brouillon", async () => {
    const { cycleVie, stockage } = creerCycleVieRelachement()
    const demande = await demanderBrouillon(cycleVie)

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-2",
    })

    expect(resultat).toEqual({
      ok: false,
      code: "proprietaire-incorrect",
      message: "Ce Brouillon d'Image produit ne vous appartient pas",
    })
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("ne supprime aucune Image produit déjà persistée", async () => {
    const { cycleVie, stockage } = creerCycleVieRelachement()
    const demande = await demanderBrouillon(cycleVie)
    const preparation = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: galerieDuBrouillon(demande),
    })
    if (!preparation.ok) throw new Error("La préparation devait réussir")
    await cycleVie.confirmerBrouillons("produit-1", preparation.promotions)

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toMatchObject({
      ok: false,
      code: "brouillon-non-vivant",
    })
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(stockage.suppressionsImagesPromues).toEqual([])
    expect(stockage.suppressionsImagesPersistees).toEqual([])
  })

  it("garde la libération acquise quand la suppression de l'objet échoue", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieRelachement()
    const demande = await demanderBrouillon(cycleVie)
    stockage.failDelete = true

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toMatchObject({ ok: false, code: "stockage-refuse" })
    expect(resultat).toMatchObject({
      message: expect.stringContaining("récupéré automatiquement"),
    })
    expect(registre.records.get(demande.draftId)?.state).toBe("libéré")
    expect(
      await cycleVie.relacherBrouillon({
        draftId: demande.draftId,
        ownerId: "editeur-1",
      })
    ).toMatchObject({ ok: false, code: "brouillon-non-vivant" })
  })
})
