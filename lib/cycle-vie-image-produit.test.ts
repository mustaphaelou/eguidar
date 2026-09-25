import { describe, expect, it, vi } from "vitest"

import {
  creerCycleVieImageProduit,
  type ImageProduitPromue,
} from "@/lib/cycle-vie-image-produit"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-01-15T10:00:00.000Z")

function creerCycleVieTest() {
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
  return { cycleVie, horloge, stockage, registre }
}

describe("CycleVieImageProduit", () => {
  it("demande un Brouillon d'Image produit avec un identifiant opaque et des métadonnées durables", async () => {
    const { cycleVie, stockage, registre, horloge } = creerCycleVieTest()

    const resultat = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 2048,
    })

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.draftId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(resultat.uploadUrl).toBe(`memoire://upload/${resultat.draftId}`)
    expect(resultat.previewUrl).toBe(`memoire://preview/${resultat.draftId}`)
    expect(resultat.expiresAt).toEqual(
      new Date(DATE_INITIALE.getTime() + 24 * 60 * 60 * 1000)
    )
    expect(stockage.presigns).toEqual([
      {
        draftId: resultat.draftId,
        contentType: "image/webp",
        size: 2048,
      },
    ])

    const brouillon = await cycleVie.lireBrouillon(resultat.draftId)
    expect(brouillon).toMatchObject({
      id: resultat.draftId,
      mimeType: "image/webp",
      byteSize: 2048,
      ownerId: "editeur-1",
      state: "vivant",
      tentativeId: null,
      promotedPublicUrl: null,
      productId: null,
      createdAt: DATE_INITIALE,
    })
    expect(brouillon?.expiresAt).toEqual(resultat.expiresAt)
    expect(registre.records.get(resultat.draftId)?.ownerId).toBe("editeur-1")
    expect(horloge.horloge.maintenant()).toEqual(DATE_INITIALE)
  })

  it("refuse un MIME non autorisé sans créer d'enregistrement", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest()

    const resultat = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/svg+xml",
      size: 200,
    })

    expect(resultat).toMatchObject({ ok: false, code: "mime-non-autorise" })
    expect(stockage.presigns).toHaveLength(0)
    expect(registre.records.size).toBe(0)
  })

  it("refuse un fichier trop volumineux avant toute interaction R2", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest()

    const resultat = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 10 * 1024 * 1024 + 1,
    })

    expect(resultat).toMatchObject({ ok: false, code: "trop-volumineux" })
    expect(stockage.presigns).toHaveLength(0)
    expect(registre.records.size).toBe(0)
  })

  it("enregistre le propriétaire et refuse une libération par un autre éditeur", async () => {
    const { cycleVie, stockage } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/jpeg",
      size: 10,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-2",
    })

    expect(resultat).toMatchObject({
      ok: false,
      code: "proprietaire-incorrect",
    })
    expect(stockage.deletedDrafts).toEqual([])
  })

  it("conserve la date d'expiration et refuse une libération à la frontière", async () => {
    const { cycleVie, horloge } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/avif",
      size: 10,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    expect((await cycleVie.lireBrouillon(demande.draftId))?.expiresAt).toEqual(
      demande.expiresAt
    )
    horloge.fixer(new Date(demande.expiresAt))

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toMatchObject({ ok: false, code: "brouillon-expire" })
  })

  it("libère un Brouillon tant qu'il est vivant, jusqu'à la dernière milliseconde", async () => {
    const { cycleVie, horloge, stockage } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/avif",
      size: 10,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    horloge.fixer(new Date(demande.expiresAt.getTime() - 1))

    expect(
      await cycleVie.relacherBrouillon({
        draftId: demande.draftId,
        ownerId: "editeur-1",
      })
    ).toEqual({ ok: true, draftId: demande.draftId })
    expect(stockage.deletedDrafts).toEqual([demande.draftId])
  })

  it("laisse l'objet d'un Brouillon expiré à la seule règle de cycle de vie R2", async () => {
    const { cycleVie, horloge, stockage } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/avif",
      size: 10,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    horloge.fixer(new Date(demande.expiresAt))

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toMatchObject({ ok: false, code: "brouillon-expire" })
    expect(resultat).toMatchObject({
      message: expect.stringContaining("Téléversez à nouveau"),
    })
    expect(stockage.deletedDrafts).toEqual([])
    expect(stockage.deletedPersisted).toEqual([])
  })

  it("revendique un Brouillon jusqu'à la frontière et refuse à l'instant exact de l'expiration", async () => {
    const { cycleVie, horloge, stockage } = creerCycleVieTest()
    const premier = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 10,
    })
    const second = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 10,
    })
    if (!premier.ok || !second.ok) {
      throw new Error("La demande devait réussir")
    }
    expect(second.expiresAt).toEqual(premier.expiresAt)
    const enregistrer = vi.fn(
      async (images: readonly ImageProduitPromue[]) => ({
        productId: "produit-1",
        result: images.length,
      })
    )

    horloge.fixer(new Date(premier.expiresAt.getTime() - 1))
    expect(
      await cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        draftIds: [premier.draftId],
        enregistrer,
      })
    ).toMatchObject({ ok: true, productId: "produit-1" })

    horloge.fixer(new Date(premier.expiresAt))
    expect(
      await cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-2",
        ownerId: "editeur-1",
        draftIds: [second.draftId],
        enregistrer,
      })
    ).toMatchObject({ ok: false, code: "brouillon-expire" })

    horloge.avancer(1)
    expect(
      await cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-3",
        ownerId: "editeur-1",
        draftIds: [second.draftId],
        enregistrer,
      })
    ).toMatchObject({ ok: false, code: "brouillon-expire" })

    expect(stockage.promotions.map((promotion) => promotion.draftId)).toEqual([
      premier.draftId,
    ])
    expect(enregistrer).toHaveBeenCalledTimes(1)
  })
})
