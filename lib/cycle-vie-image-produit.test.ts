import { describe, expect, expectTypeOf, it, vi } from "vitest"

import {
  type BrouillonImageProduit,
  type DemandeBrouillonImageProduit,
  type EnregistrerCatalogue,
  type EntreeCreationBrouillonImageProduit,
  type RevendicationImagesProduit,
} from "@/lib/cycle-vie-image-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  draftObjectKey,
  persistentObjectKey,
  type ContentTypeImageProduit,
} from "@/lib/r2"
import { SlugConflictError } from "@/lib/use-cases/admin-catalog"
import {
  brouillon,
  creerCycleVieTest,
  persistee,
  urlApercuBrouillon,
  urlEnvoiBrouillon,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-01-15T10:00:00.000Z")

describe("CycleVieImageProduit", () => {
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

  it("revendique un Brouillon jusqu'à la frontière et refuse à l'instant exact de l'expiration", async () => {
    const { cycleVie, horloge, stockage } = creerCycleVieTest(DATE_INITIALE)
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
    const enregistrer = vi.fn(async () => ({ productId: "produit-1" }))

    horloge.fixer(new Date(premier.expiresAt.getTime() - 1))
    expect(
      await cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(premier.draftId)],
        enregistrer,
      })
    ).toMatchObject({ ok: true, productId: "produit-1" })

    horloge.fixer(new Date(premier.expiresAt))
    expect(
      await cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-2",
        ownerId: "editeur-1",
        galerie: [brouillon(second.draftId)],
        enregistrer,
      })
    ).toMatchObject({ ok: false, code: "brouillon-expire" })

    horloge.avancer(1)
    expect(
      await cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-3",
        ownerId: "editeur-1",
        galerie: [brouillon(second.draftId)],
        enregistrer,
      })
    ).toMatchObject({ ok: false, code: "brouillon-expire" })

    expect(stockage.promotions.map((promotion) => promotion.draftId)).toEqual([
      premier.draftId,
    ])
    expect(enregistrer).toHaveBeenCalledTimes(1)
  })

  it("revendique, promeut et lie un Brouillon dans l'enregistrement Catalogue", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async (revendication) => {
        await revendication.lier("produit-1")
        return { productId: "produit-1" }
      },
    })

    expect(resultat).toEqual({ ok: true, productId: "produit-1" })
    expect(stockage.promotions).toEqual([
      {
        draftId: demande.draftId,
        cleSource: draftObjectKey(demande.draftId, "image/webp"),
        cle: persistentObjectKey(demande.draftId, "image/webp"),
        publicUrl: urlImagePersistee(demande.draftId, "image/webp"),
      },
    ])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/webp"),
    })
  })

  it("à l'enregistrement réussi, ne confie que l'URL publique persistée et libère la source du Brouillon", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 2048,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    let galerieEnregistree: readonly string[] = []
    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async (revendication) => {
        await revendication.lier("produit-1")
        galerieEnregistree = revendication.galerie
        return { productId: "produit-1" }
      },
    })

    expect(resultat.ok).toBe(true)
    expect(galerieEnregistree).toEqual([
      urlImagePersistee(demande.draftId, "image/webp"),
    ])
    expect(galerieEnregistree).not.toContain(
      urlApercuBrouillon(demande.draftId, "image/webp")
    )
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(demande.draftId, "image/webp"),
    ])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/webp"),
    })
  })

  it("refuse une soumission sans identité de tentative, sans rien revendiquer", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")
    const enregistrer = vi.fn(async () => ({ productId: "produit-1" }))

    const refus = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "   ",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer,
    })

    expect(refus).toEqual({
      ok: false,
      code: "identifiant-proprietaire-invalide",
      message: "Tentative d'édition ou propriétaire invalide",
    })
    expect(enregistrer).not.toHaveBeenCalled()
    expect(stockage.promotions).toEqual([])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async (revendication) => {
        await revendication.lier("produit-1")
        return { productId: "produit-1" }
      },
    })

    expect(resultat).toMatchObject({ ok: true, productId: "produit-1" })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/webp"),
    })
  })

  it("garde l'ordre de l'éditeur : un Brouillon intercalé atterrit entre les Images produit persistées", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const premiereDemande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/jpeg",
      size: 2048,
    })
    const secondeDemande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 2048,
    })
    if (!premiereDemande.ok || !secondeDemande.ok) {
      throw new Error("Les demandes devaient réussir")
    }
    const premierePersistee = "https://cdn.test/produits/persistee-1.webp"
    const secondePersistee = "https://cdn.test/produits/persistee-2.webp"
    const urlPremiere = urlImagePersistee(premiereDemande.draftId, "image/jpeg")
    const urlSeconde = urlImagePersistee(secondeDemande.draftId, "image/png")

    const galerieSoumise: EntreeImageProduit[] = [
      persistee(premierePersistee),
      brouillon(premiereDemande.draftId),
      persistee(secondePersistee),
      brouillon(secondeDemande.draftId),
    ]
    const galerieEcrits: string[] = []
    let sousEnsemblePromu: readonly string[] = []

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: galerieSoumise,
      enregistrer: async (revendication) => {
        await revendication.lier("produit-1")
        galerieEcrits.push(...revendication.galerie)
        sousEnsemblePromu = revendication.promues
        return { productId: "produit-1" }
      },
    })

    expect(resultat).toMatchObject({ ok: true, productId: "produit-1" })

    expect(galerieEcrits).toEqual([
      premierePersistee,
      urlPremiere,
      secondePersistee,
      urlSeconde,
    ])
    expect(sousEnsemblePromu).toEqual([urlPremiere, urlSeconde])
    expect(stockage.promotions).toEqual([
      {
        draftId: premiereDemande.draftId,
        cleSource: draftObjectKey(premiereDemande.draftId, "image/jpeg"),
        cle: persistentObjectKey(premiereDemande.draftId, "image/jpeg"),
        publicUrl: urlPremiere,
      },
      {
        draftId: secondeDemande.draftId,
        cleSource: draftObjectKey(secondeDemande.draftId, "image/png"),
        cle: persistentObjectKey(secondeDemande.draftId, "image/png"),
        publicUrl: urlSeconde,
      },
    ])
    for (const [index, demande] of [
      premiereDemande,
      secondeDemande,
    ].entries()) {
      expect(registre.records.get(demande.draftId)).toMatchObject({
        state: "revendiqué",
        tentativeId: "tentative-1",
        productId: "produit-1",
        promotedPublicUrl: [urlPremiere, urlSeconde][index],
      })
    }
  })

  it("une galerie sans Brouillon prend le même chemin qu'une galerie qui en contient", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const urls = [
      "https://cdn.test/produits/une.webp",
      "https://cdn.test/produits/deux.webp",
    ]
    const vues: RevendicationImagesProduit[] = []
    let appels = 0

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: urls.map(persistee),
      enregistrer: async (revendication) => {
        appels += 1
        vues.push(revendication)
        await revendication.lier("produit-1")
        return { productId: "produit-1", result: revendication.galerie }
      },
    })

    expect(resultat).toMatchObject({ ok: true, productId: "produit-1" })
    expect(appels).toBe(1)
    expect(vues).toHaveLength(1)
    expect(vues[0].galerie).toEqual(urls)
    expect(vues[0].promues).toEqual([])
    expect(stockage.promotions).toEqual([])
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(registre.records.size).toBe(0)
  })

  it("traite une galerie vide comme une galerie sans Brouillon", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const vues: RevendicationImagesProduit[] = []
    let appels = 0

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [],
      enregistrer: async (revendication) => {
        appels += 1
        vues.push(revendication)
        await revendication.lier("produit-1")
        return { productId: "produit-1", result: null }
      },
    })

    expect(resultat).toMatchObject({ ok: true, productId: "produit-1" })
    expect(appels).toBe(1)
    expect(vues[0].galerie).toEqual([])
    expect(vues[0].promues).toEqual([])
    expect(stockage.promotions).toEqual([])
    expect(registre.records.size).toBe(0)
  })

  it("une soumission rejouée sans identité ne prend pas un Brouillon qu'une tentative tient", async () => {
    const { cycleVie, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/avif",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    let appels = 0
    const enregistrer: EnregistrerCatalogue = async (revendication) => {
      appels += 1
      await revendication.lier("produit-1")
      return { productId: "produit-1" }
    }
    const premier = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer,
    })
    expect(premier).toMatchObject({ ok: true, productId: "produit-1" })

    const rejete = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer,
    })

    expect(rejete).toEqual({
      ok: false,
      code: "identifiant-proprietaire-invalide",
      message: "Tentative d'édition ou propriétaire invalide",
    })
    expect(appels).toBe(1)
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
    })
  })

  it("refuse un Brouillon absent ou appartenant à un autre éditeur", async () => {
    const { cycleVie } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/jpeg",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-2",
      galerie: [brouillon(demande.draftId), brouillon("brouillon-inconnu")],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })

    expect(resultat).toMatchObject({
      ok: false,
      code: "proprietaire-incorrect",
    })
  })

  it("refuse un identifiant de Brouillon inconnu", async () => {
    const { cycleVie } = creerCycleVieTest(DATE_INITIALE)

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon("brouillon-inconnu")],
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
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
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
      galerie: [brouillon(demande.draftId)],
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
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/gif",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const echec = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async () => {
        throw new Error("échec transactionnel")
      },
    })
    expect(echec).toMatchObject({
      ok: false,
      code: "catalogue-refuse",
      message: "L'enregistrement du Catalogue a échoué",
    })
    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(demande.draftId, "image/gif"),
    ])
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(registre.records.get(demande.draftId)?.state).toBe("vivant")

    const retry = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async (revendication) => {
        await revendication.lier("produit-1")
        return { productId: "produit-1" }
      },
    })
    expect(retry).toEqual({ ok: true, productId: "produit-1" })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/gif"),
    })
    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(demande.draftId, "image/gif"),
    ])
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(demande.draftId, "image/gif"),
    ])
  })

  it("remonte le message d'une erreur du Catalogue orientée utilisateur, compensation faite", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const echec = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async () => {
        throw new SlugConflictError()
      },
    })

    expect(echec).toMatchObject({
      ok: false,
      code: "catalogue-refuse",
      message: "Un produit avec ce slug existe déjà",
    })
    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(demande.draftId, "image/png"),
    ])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
  })

  it("rend idempotent un retry de la même tentative", async () => {
    const { cycleVie, stockage, horloge, registre } =
      creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/avif",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    let appels = 0
    const enregistrer: EnregistrerCatalogue = async (revendication) => {
      appels += 1
      await revendication.lier("produit-1")
      return { productId: "produit-1" }
    }
    const premier = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer,
    })
    if (!premier.ok) throw new Error("La première tentative devait réussir")

    const second = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      resultatDejaPersiste: async () => undefined,
      enregistrer: async () => {
        appels += 1
        throw new Error("Le Catalogue ne doit pas créer un second Produit")
      },
    })

    expect(second).toEqual({ ok: true, productId: premier.productId })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: premier.productId,
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/avif"),
    })
    expect(appels).toBe(1)
    expect(stockage.promotions).toHaveLength(1)

    const autre = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-2",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
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
      galerie: [brouillon(demande.draftId)],
      resultatDejaPersiste: async () => undefined,
      enregistrer: async () => {
        appels += 1
        throw new Error("Le Catalogue ne doit pas créer un second Produit")
      },
    })
    expect(apresExpiration).toEqual({ ok: true, productId: premier.productId })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: premier.productId,
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/avif"),
    })
    expect(appels).toBe(1)
    expect(stockage.promotions).toHaveLength(1)
  })

  it("résout en expiré une revendication dont la compensation n'a pas été écrite", async () => {
    const { cycleVie, horloge, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 2048,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

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
        galerie: [brouillon(demande.draftId)],
        enregistrer: async () => ({ productId: "produit-1" }),
      })
    ).toMatchObject({ ok: false, code: "brouillon-expire" })
  })

  it("ne rend qu'un identifiant de Produit, et le verrou de compilation le dit", async () => {
    const { cycleVie, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async (revendication) => {
        await revendication.lier("produit-1")
        return { productId: "produit-1" }
      },
    })

    if (!resultat.ok) throw new Error("L'enregistrement devait réussir")
    expect(Object.keys(resultat)).toEqual(["ok", "productId"])
    // @ts-expect-error — le résultat ne porte pas la valeur du Catalogue
    expect(resultat.result).toBeUndefined()
    // @ts-expect-error — le résultat ne porte pas la liste des Images promues
    expect(resultat.images).toBeUndefined()
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(demande.draftId, "image/webp"),
    })
  })
})
