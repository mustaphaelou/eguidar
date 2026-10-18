import { describe, expect, expectTypeOf, it } from "vitest"

import {
  type BrouillonImageProduit,
  type DemandeBrouillonImageProduit,
  type EntreeCreationBrouillonImageProduit,
} from "@/lib/cycle-vie-image-produit"
import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  draftObjectKey,
  type ContentTypeImageProduit,
} from "@/lib/r2"
import {
  creerCycleVieTest,
  urlApercuBrouillon,
  urlEnvoiBrouillon,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-01-15T10:00:00.000Z")

describe("demande et relâchement d'un Brouillon d'Image produit", () => {
  it("demande un Brouillon d'Image produit avec un identifiant opaque et des métadonnées durables", async () => {
    const { cycleVie, stockage, horloge } = creerCycleVieTest(DATE_INITIALE)

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
    expect(resultat.uploadUrl).toBe(
      urlEnvoiBrouillon(resultat.draftId, "image/webp")
    )
    expect(resultat.previewUrl).toBe(
      urlApercuBrouillon(resultat.draftId, "image/webp")
    )
    expect(resultat.expiresAt).toEqual(
      new Date(DATE_INITIALE.getTime() + 24 * 60 * 60 * 1000)
    )
    expect(stockage.presignatures).toEqual([
      {
        draftId: resultat.draftId,
        contentType: "image/webp",
        size: 2048,
        cle: draftObjectKey(resultat.draftId, "image/webp"),
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
    expect(horloge.horloge.maintenant()).toEqual(DATE_INITIALE)
  })

  it("refuse un MIME non autorisé sans créer d'enregistrement", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)

    const resultat = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/svg+xml",
      size: 200,
    })

    expect(resultat).toMatchObject({ ok: false, code: "mime-non-autorise" })
    expect(stockage.presignatures).toHaveLength(0)
    expect(registre.records.size).toBe(0)
  })

  it("ne rend au stockage et au registre que le type soumis, et lui seul", async () => {
    for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
      const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)

      const demande = await cycleVie.demanderBrouillon({
        ownerId: "editeur-1",
        contentType,
        size: 2048,
      })
      if (!demande.ok) throw new Error("La demande devait réussir")

      expect(stockage.presignatures[0]?.contentType, contentType).toBe(
        contentType
      )
      expect(registre.records.get(demande.draftId)?.mimeType, contentType).toBe(
        contentType
      )
    }

    expectTypeOf<
      DemandeBrouillonImageProduit["contentType"]
    >().toEqualTypeOf<string>()
    expectTypeOf<
      EntreeCreationBrouillonImageProduit["contentType"]
    >().toEqualTypeOf<ContentTypeImageProduit>()
    expectTypeOf<
      BrouillonImageProduit["mimeType"]
    >().toEqualTypeOf<ContentTypeImageProduit>()
  })

  it("refuse un fichier trop volumineux avant toute interaction R2", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)

    const resultat = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 10 * 1024 * 1024 + 1,
    })

    expect(resultat).toMatchObject({ ok: false, code: "trop-volumineux" })
    expect(stockage.presignatures).toHaveLength(0)
    expect(registre.records.size).toBe(0)
  })

  it("enregistre le propriétaire et refuse une libération par un autre éditeur", async () => {
    const { cycleVie, stockage } = creerCycleVieTest(DATE_INITIALE)
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
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("conserve la date d'expiration et refuse une libération à la frontière", async () => {
    const { cycleVie, horloge } = creerCycleVieTest(DATE_INITIALE)
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
    const { cycleVie, horloge, stockage } = creerCycleVieTest(DATE_INITIALE)
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
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(demande.draftId, "image/avif"),
    ])
  })

  it("laisse l'objet d'un Brouillon expiré à la seule règle de cycle de vie R2", async () => {
    const { cycleVie, horloge, stockage } = creerCycleVieTest(DATE_INITIALE)
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
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(stockage.suppressionsImagesPersistees).toEqual([])
  })
})
