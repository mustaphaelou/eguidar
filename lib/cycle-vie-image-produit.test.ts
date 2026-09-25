import { describe, expect, it, vi } from "vitest"

import {
  creerCycleVieImageProduit,
  type EnregistrerCatalogue,
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

  it("revendique, promeut et lie un Brouillon dans l'enregistrement Catalogue", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer: async (_images, lier) => {
        await lier("produit-1")
        return { productId: "produit-1", result: "enregistré" }
      },
    })

    expect(resultat).toMatchObject({
      ok: true,
      productId: "produit-1",
      result: "enregistré",
      images: [
        {
          draftId: demande.draftId,
          publicUrl: `memoire://image/${demande.draftId}`,
        },
      ],
    })
    expect(stockage.promotions).toEqual([
      {
        draftId: demande.draftId,
        publicUrl: `memoire://image/${demande.draftId}`,
      },
    ])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
    })
  })

  it("refuse un Brouillon absent ou appartenant à un autre éditeur", async () => {
    const { cycleVie, registre } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/jpeg",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-2",
      draftIds: [demande.draftId, "brouillon-inconnu"],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })

    expect(resultat).toMatchObject({
      ok: false,
      code: "proprietaire-incorrect",
    })
    expect(registre.records.get(demande.draftId)?.state).toBe("vivant")
  })

  it("refuse un identifiant de Brouillon inconnu", async () => {
    const { cycleVie } = creerCycleVieTest()

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: ["brouillon-inconnu"],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })

    expect(resultat).toMatchObject({
      ok: false,
      code: "brouillon-introuvable",
    })
  })

  it("laisse le Brouillon revendicable après un échec de promotion", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")
    stockage.failPromotion = true

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })

    expect(resultat).toMatchObject({ ok: false, code: "stockage-refuse" })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
  })

  it("compense un échec Catalogue et permet le retry avec la même URL", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/gif",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const echec = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer: async () => {
        throw new Error("échec transactionnel")
      },
    })
    expect(echec).toMatchObject({ ok: false, code: "catalogue-refuse" })
    expect(stockage.deletedPromoted).toEqual([demande.draftId])
    expect(registre.records.get(demande.draftId)?.state).toBe("vivant")

    const retry = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer: async (_images, lier) => {
        await lier("produit-1")
        return { productId: "produit-1", result: "retry" }
      },
    })
    expect(retry).toMatchObject({
      ok: true,
      productId: "produit-1",
      images: [
        {
          draftId: demande.draftId,
          publicUrl: `memoire://image/${demande.draftId}`,
        },
      ],
    })
    expect(stockage.deletedPromoted).toEqual([demande.draftId])
  })

  it("rend idempotent un retry de la même tentative", async () => {
    const { cycleVie, stockage, horloge } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/avif",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    let appels = 0
    const enregistrer: EnregistrerCatalogue<string> = async (_images, lier) => {
      appels += 1
      await lier("produit-1")
      return { productId: "produit-1", result: "même opération" }
    }
    const premier = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer,
    })
    if (!premier.ok) throw new Error("La première tentative devait réussir")

    const second = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      resultatDejaPersiste: async () => "même opération",
      enregistrer: async () => {
        appels += 1
        throw new Error("Le Catalogue ne doit pas créer un second Produit")
      },
    })

    expect(second).toMatchObject({
      ok: true,
      productId: "produit-1",
      result: "même opération",
      images: premier.images,
    })
    expect(appels).toBe(1)
    expect(stockage.promotions).toHaveLength(1)

    const autre = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-2",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer,
    })
    expect(autre).toEqual({
      ok: false,
      code: "brouillon-non-vivant",
      message:
        "Ce Brouillon d'Image produit est déjà utilisé par une autre tentative d'enregistrement. Rechargez le formulaire ou retirez-le de la galerie.",
    })

    horloge.avancer(48 * 60 * 60)
    const apresExpiration = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      resultatDejaPersiste: async () => "même opération",
      enregistrer: async () => {
        appels += 1
        throw new Error("Le Catalogue ne doit pas créer un second Produit")
      },
    })
    expect(apresExpiration).toMatchObject({
      ok: true,
      productId: "produit-1",
      result: "même opération",
      images: premier.images,
    })
    expect(appels).toBe(1)
    expect(stockage.promotions).toHaveLength(1)
  })

  it("résout en expiré une revendication dont la compensation n'a pas été écrite", async () => {
    const { cycleVie, horloge, registre } = creerCycleVieTest()
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 2048,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    // Revendication écrite, compensation non : c'est l'état qu'un échec de
    // restauration laisse, et le registre doit le résoudre en expiré à la
    // rétention dépassée plutôt que de le laisser en revendication.
    expect(
      await registre.revendiquer({
        id: demande.draftId,
        ownerId: "editeur-1",
        tentativeId: "tentative-1",
        now: horloge.horloge.maintenant(),
      })
    ).toMatchObject({ ok: true })

    horloge.avancer(25 * 60 * 60)
    expect((await cycleVie.lireBrouillon(demande.draftId))?.state).toBe(
      "expiré"
    )
    expect(
      await cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-2",
        ownerId: "editeur-1",
        draftIds: [demande.draftId],
        enregistrer: async () => ({ productId: "produit-1", result: null }),
      })
    ).toMatchObject({ ok: false, code: "brouillon-expire" })
    expect(registre.records.get(demande.draftId)?.state).toBe("expiré")
  })
})
