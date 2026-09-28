import { describe, expect, it, vi } from "vitest"

import {
  type EnregistrerCatalogue,
  type RevendicationImagesProduit,
} from "@/lib/cycle-vie-image-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import { SlugConflictError } from "@/lib/use-cases/admin-catalog"
import {
  brouillon,
  creerCycleVieTest,
  persistee,
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
    expect(resultat.uploadUrl).toBe(`memoire://upload/${resultat.draftId}`)
    expect(resultat.previewUrl).toBe(`memoire://preview/${resultat.draftId}`)
    expect(resultat.expiresAt).toEqual(
      new Date(DATE_INITIALE.getTime() + 24 * 60 * 60 * 1000)
    )
    expect(stockage.presignatures).toEqual([
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
    expect(stockage.suppressionsBrouillons).toEqual([demande.draftId])
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
    // Le Catalogue ne reçoit que la clé persistée issue de la promotion,
    // jamais l'URL du Brouillon.
    expect(galerieEnregistree).toEqual([`memoire://image/${demande.draftId}`])
    expect(galerieEnregistree).not.toContain(
      `memoire://preview/${demande.draftId}`
    )
    // La source de `products/brouillons/` est libérée après le commit : copiée,
    // elle n'est plus nécessaire à personne (spec #406, décisions de test).
    expect(stockage.suppressionsBrouillons).toEqual([demande.draftId])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      productId: "produit-1",
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
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

    // Ce que le transport rend désormais d'un champ `tentativeId` absent ou
    // seulement blanc : une chaîne vide, plutôt qu'une identité fabriquée. Le
    // refus est celui que le cycle de vie définit déjà pour une identité de
    // tentative ou de propriétaire vide — aucun code, aucun message ajouté — et
    // il tombe avant le registre, donc avant qu'un Brouillon soit revendiqué.
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
    // Le Brouillon reste vivant et sans tentative : l'éditeur n'a rien perdu de
    // ce qu'il a téléversé, il n'a qu'à corriger le formulaire et réessayer.
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })

    // La même soumission, porteuse de l'identité que le formulaire transporte,
    // s'enregistre exactement comme aujourd'hui.
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
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
    })
  })

  it("garde l'ordre de l'éditeur : un Brouillon intercalé atterrit entre les Images produit persistées", async () => {
    // Le fait est énoncé à l'interface du cycle de vie, parce que c'est là
    // qu'il vit désormais : la Galerie produit est un fait ordonné de
    // l'Administration, et l'opération en possède l'ordre. Il n'est plus
    // énoncé dans une action serveur, qui n'a plus rien à composer.
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
    const urlPremiere = `memoire://image/${premiereDemande.draftId}`
    const urlSeconde = `memoire://image/${secondeDemande.draftId}`

    // La galerie est soumise telle que l'éditeur l'a arrangée : persistée,
    // Brouillon, persistée, Brouillon.
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

    // Le fait : l'ordre soumis est l'ordre écrit, et un Brouillon intercalé
    // n'est ni repoussé à la fin de la galerie, ni écrit dans l'ordre des
    // seuls Brouillons.
    expect(galerieEcrits).toEqual([
      premierePersistee,
      urlPremiere,
      secondePersistee,
      urlSeconde,
    ])
    // Le sous-ensemble promu, lui, ne porte que ce que cette opération a
    // promu — jamais une Image produit déjà persistée.
    expect(sousEnsemblePromu).toEqual([urlPremiere, urlSeconde])
    expect(stockage.promotions).toEqual([
      { draftId: premiereDemande.draftId, publicUrl: urlPremiere },
      { draftId: secondeDemande.draftId, publicUrl: urlSeconde },
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
    // Une galerie sans Brouillon n'est plus un cas que l'appelant doit traiter
    // à part : elle entre par la même opération. Il n'y a rien à revendiquer,
    // donc rien à promouvoir et rien à lier — la galerie part telle quelle, le
    // sous-ensemble promu est vide, et ce que le Catalogue en fait reste sa
    // décision. Le refus d'une liste de Brouillons vide a disparu : il n'était
    // atteignable que parce qu'un appelant court-circuitait avant d'appeler.
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
        // La liaison est appelée par le Catalogue dans sa transaction, même
        // sans Brouillon : elle ne lie rien, et ne refuse pas non plus.
        await revendication.lier("produit-1")
        return { productId: "produit-1", result: revendication.galerie }
      },
    })

    expect(resultat).toMatchObject({ ok: true, productId: "produit-1" })
    // Le Catalogue est écrit, et il ne l'est qu'une fois.
    expect(appels).toBe(1)
    expect(vues).toHaveLength(1)
    // La galerie est celle de l'éditeur, dans son ordre ; le sous-ensemble promu
    // ne porte que ce que cette opération a promu, donc rien.
    expect(vues[0].galerie).toEqual(urls)
    expect(vues[0].promues).toEqual([])
    // Ni promotion, ni suppression, ni ligne de registre : il n'y avait rien à
    // prendre, et donc rien à rendre ni à nettoyer.
    expect(stockage.promotions).toEqual([])
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(registre.records.size).toBe(0)
  })

  it("traite une galerie vide comme une galerie sans Brouillon", async () => {
    // Le cas dégénéré du précédent : un Produit que l'Administration crée avant
    // de lui téléverser la moindre image. Rien à revendiquer, rien à promouvoir,
    // et l'opération écrit quand même le Catalogue — ce qui rend possible de créer
    // un Produit maintenant et de lui donner des images par une mise à jour.
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

    // La soumission rejouée — celle d'un client qui ne rend pas le champ, ou
    // d'une requête forgée à la main — arrive sans identité. Elle est refusée
    // avant le registre : elle ne peut donc pas même tenter de reprendre le
    // Brouillon que la première tentative tient déjà. Le transport, qui
    // fabricait autrefois une identité neuve, laissait cette soumission
    // concourir sous un nom qu'elle s'était donné.
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
    expect(stockage.suppressionsImagesPromues).toEqual([demande.draftId])
    // La compensation défait la promotion mais laisse la source du Brouillon :
    // le retry en a encore besoin.
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
    // Le retry promeut de nouveau et lie le Brouillon au même Produit : l'état
    // du registre est la preuve, l'URL rendue par le résultat ne l'est plus.
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
    })
    expect(stockage.suppressionsImagesPromues).toEqual([demande.draftId])
    // Le retry a fini ce que la première tentative n'avait pas le droit de
    // faire : libérer la source une fois le commit écrit.
    expect(stockage.suppressionsBrouillons).toEqual([demande.draftId])
  })

  it("remonte le message d'une erreur du Catalogue orientée utilisateur, compensation faite", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 100,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    // Slug en conflit, SKU dupliqué, galerie invalide : ces erreurs portent
    // leur message jusqu'à l'éditeur sur le chemin sans Brouillon
    // (`app/admin/produits/actions.test.ts`). Levées ici, avec des
    // Brouillons, elles doivent faire de même : `SlugConflictError`
    // représente les trois, toutes `UserFacingError`
    // (`lib/use-cases/catalog-user-facing.test.ts`).
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
    // La compensation n'a pas bougé pour autant : la promotion est défaite et
    // le Brouillon redevient revendicable pour un nouvel essai.
    expect(stockage.suppressionsImagesPromues).toEqual([demande.draftId])
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
    // Le retry ne promeut rien et ne lie rien : le Brouillon reste celui de la
    // première tentative, et c'est l'état du registre qui le dit — le résultat
    // rendu ne porte que l'identifiant du Produit.
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: premier.productId,
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
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
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
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
        galerie: [brouillon(demande.draftId)],
        enregistrer: async () => ({ productId: "produit-1" }),
      })
    ).toMatchObject({ ok: false, code: "brouillon-expire" })
    // L'état `expiré` que le registre a écrit ne se ré-affirme pas ici : le
    // contrat de `test/contrat-registre-brouillon.ts` le rejoue sur les deux
    // adaptateurs. L'invariant propre de cette suite est le refus que le
    // module en tire, ci-dessus.
  })

  it("ne rend qu'un identifiant de Produit, et le verrou de compilation le dit", async () => {
    // Le résultat de l'opération est un fait et un refus. Ni la valeur que le
    // Catalogue a écrite, ni la liste des Images produit promues n'y figurent :
    // elles se lisent à leur source, la rangée et le registre. Les deux
    // directives ci-dessous sont le verrou : si l'interface réannonçait un
    // `result` ou une liste `images`, ces lectures compileraient, les
    // directives deviendraient inutiles et `tsc --noEmit` échouerait.
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
    // Verrou de compilation : aucune valeur du Catalogue n'est rendue.
    // @ts-expect-error — le résultat ne porte pas la valeur du Catalogue
    expect(resultat.result).toBeUndefined()
    // Verrou de compilation : aucune liste d'Images promues n'est rendue.
    // @ts-expect-error — le résultat ne porte pas la liste des Images promues
    expect(resultat.images).toBeUndefined()
    // Ce que l'appelant ne lit pas, l'opération ne le rend pas — mais ce qu'elle
    // a fait, le registre le sait : le Brouillon est lié à ce Produit.
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      productId: "produit-1",
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
    })
  })
})
