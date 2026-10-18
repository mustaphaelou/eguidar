import { describe, expect, it } from "vitest"

import {
  MESSAGE_REGISTRE_INDISPONIBLE,
  type CycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { draftObjectKey, persistentObjectKey } from "@/lib/r2"
import type { ContentTypeImageProduit } from "@/lib/r2"
import {
  brouillon,
  creerCycleVieTest,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-06-01T10:00:00.000Z")

const MESSAGE_IDENTIFIANTS_INVALIDES =
  "Tentative d'édition ou propriétaire invalide"

const MESSAGE_BROUILLON_EXPIRE =
  "Ce Brouillon d'Image produit a expiré et son fichier peut déjà avoir été supprimé du stockage. Téléversez à nouveau l'image."

const MESSAGE_BROUILLON_DEJA_LIBERE =
  "Ce Brouillon d'Image produit a déjà été libéré : il n'existe plus et ne peut plus être revendiqué."

const MESSAGE_CONFLIT_REVENDICATION =
  "Ce Brouillon d'Image produit est déjà utilisé par une autre tentative d'enregistrement. Rechargez le formulaire ou retirez-le de la galerie."

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

describe("préparation de la promotion des Brouillons d'Image produit", () => {
  it("rend la Galerie ordonnée soumise et la preuve de chaque Brouillon promu", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const premiere = await demanderBrouillon(cycleVie, "image/jpeg")
    const seconde = await demanderBrouillon(cycleVie, "image/png")
    const urlPremiere = urlImagePersistee(premiere.draftId, "image/jpeg")
    const urlSeconde = urlImagePersistee(seconde.draftId, "image/png")
    const avant = "https://cdn.test/produits/persistee-1.webp"
    const apres = "https://cdn.test/produits/persistee-2.webp"

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [
        persistee(avant),
        brouillon(premiere.draftId),
        persistee(apres),
        brouillon(seconde.draftId),
      ],
    })

    expect(resultat).toEqual({
      ok: true,
      galerie: [avant, urlPremiere, apres, urlSeconde],
      promotions: [
        {
          draftId: premiere.draftId,
          publicUrl: urlPremiere,
          contentType: "image/jpeg",
          tentativeId: "tentative-1",
        },
        {
          draftId: seconde.draftId,
          publicUrl: urlSeconde,
          contentType: "image/png",
          tentativeId: "tentative-1",
        },
      ],
    })
    expect(stockage.promotions).toEqual([
      {
        draftId: premiere.draftId,
        cleSource: draftObjectKey(premiere.draftId, "image/jpeg"),
        cle: persistentObjectKey(premiere.draftId, "image/jpeg"),
        publicUrl: urlPremiere,
      },
      {
        draftId: seconde.draftId,
        cleSource: draftObjectKey(seconde.draftId, "image/png"),
        cle: persistentObjectKey(seconde.draftId, "image/png"),
        publicUrl: urlSeconde,
      },
    ])
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(stockage.suppressionsImagesPromues).toEqual([])
    for (const demande of [premiere, seconde]) {
      expect(registre.records.get(demande.draftId)).toMatchObject({
        state: "revendiqué",
        tentativeId: "tentative-1",
        productId: null,
        promotedPublicUrl: null,
      })
    }
  })

  it("rend la Galerie des seules Images produit sans toucher au stockage ni au registre", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const urls = [
      "https://cdn.test/produits/une.webp",
      "https://cdn.test/produits/deux.webp",
    ]

    expect(
      await cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: urls.map(persistee),
      })
    ).toEqual({ ok: true, galerie: urls, promotions: [] })
    expect(
      await cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [],
      })
    ).toEqual({ ok: true, galerie: [], promotions: [] })
    expect(stockage.promotions).toEqual([])
    expect(registre.records.size).toBe(0)
  })

  it("ne revendique et ne promeut qu'une fois un Brouillon cité deux fois", async () => {
    const { cycleVie, stockage } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const url = urlImagePersistee(demande.draftId, "image/webp")

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId), brouillon(demande.draftId)],
    })

    expect(resultat).toEqual({
      ok: true,
      galerie: [url, url],
      promotions: [
        {
          draftId: demande.draftId,
          publicUrl: url,
          contentType: "image/webp",
          tentativeId: "tentative-1",
        },
      ],
    })
    expect(stockage.promotions).toHaveLength(1)
  })

  it("réutilise un Brouillon déjà promu sans le promouvoir à nouveau", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    const url = urlImagePersistee(demande.draftId, "image/webp")
    const enregistrement = registre.records.get(demande.draftId)
    if (!enregistrement) throw new Error("Le Brouillon devait être enregistré")
    enregistrement.state = "revendiqué"
    enregistrement.tentativeId = "tentative-1"
    enregistrement.promotedPublicUrl = url

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
    })

    expect(resultat).toEqual({
      ok: true,
      galerie: [url],
      promotions: [
        {
          draftId: demande.draftId,
          publicUrl: url,
          contentType: "image/webp",
          tentativeId: "tentative-1",
        },
      ],
    })
    expect(stockage.promotions).toEqual([])
  })

  it("refuse des identifiants vides après rognage, sans rien revendiquer", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)

    for (const identifiants of [
      { tentativeId: "   ", ownerId: "editeur-1" },
      { tentativeId: "tentative-1", ownerId: " " },
      { tentativeId: "", ownerId: "" },
    ]) {
      expect(
        await cycleVie.preparerPromotionBrouillons({
          ...identifiants,
          galerie: [brouillon(demande.draftId)],
        })
      ).toEqual({
        ok: false,
        code: "identifiant-proprietaire-invalide",
        message: MESSAGE_IDENTIFIANTS_INVALIDES,
      })
    }

    expect(registre.records.get(demande.draftId)?.state).toBe("vivant")
    expect(stockage.promotions).toEqual([])
  })

  it("refuse un Brouillon introuvable et rend les revendications déjà posées", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId), brouillon("brouillon-inconnu")],
    })

    expect(resultat).toEqual({
      ok: false,
      code: "brouillon-introuvable",
      message: "Brouillon introuvable",
    })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
    expect(stockage.promotions).toEqual([])
    expect(stockage.suppressionsImagesPromues).toEqual([])
  })

  it("refuse le Brouillon d'un autre Propriétaire", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-2",
      galerie: [brouillon(demande.draftId)],
    })

    expect(resultat).toEqual({
      ok: false,
      code: "proprietaire-incorrect",
      message: "Ce brouillon ne vous appartient pas",
    })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
    expect(stockage.promotions).toEqual([])
  })

  it("refuse un Brouillon expiré sans le promouvoir", async () => {
    const { cycleVie, stockage, horloge, registre } =
      creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    horloge.avancer(25 * 60 * 60)

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
    })

    expect(resultat).toEqual({
      ok: false,
      code: "brouillon-expire",
      message: MESSAGE_BROUILLON_EXPIRE,
    })
    expect(registre.records.get(demande.draftId)?.state).toBe("expiré")
    expect(stockage.promotions).toEqual([])
  })

  it("distingue un Brouillon déjà revendiqué d'un Brouillon déjà libéré", async () => {
    const tenu = creerCycleVieTest(DATE_INITIALE)
    const premier = await demanderBrouillon(tenu.cycleVie)
    await tenu.registre.revendiquer({
      id: premier.draftId,
      ownerId: "editeur-1",
      tentativeId: "tentative-rivale",
      now: DATE_INITIALE,
    })

    expect(
      await tenu.cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(premier.draftId)],
      })
    ).toEqual({
      ok: false,
      code: "brouillon-non-vivant",
      message: MESSAGE_CONFLIT_REVENDICATION,
    })

    const libere = creerCycleVieTest(DATE_INITIALE)
    const second = await demanderBrouillon(libere.cycleVie)
    await libere.cycleVie.relacherBrouillon({
      draftId: second.draftId,
      ownerId: "editeur-1",
    })

    expect(
      await libere.cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(second.draftId)],
      })
    ).toEqual({
      ok: false,
      code: "brouillon-non-vivant",
      message: MESSAGE_BROUILLON_DEJA_LIBERE,
    })
  })

  it("refuse un stockage indisponible ou refusé, revendications rendues", async () => {
    const indisponible = creerCycleVieTest(DATE_INITIALE)
    const premier = await demanderBrouillon(indisponible.cycleVie)
    indisponible.stockage.pannes.promouvoirBrouillon.add("non-configure")

    expect(
      await indisponible.cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(premier.draftId)],
      })
    ).toEqual({
      ok: false,
      code: "stockage-indisponible",
      message: "Stockage en mémoire non configuré",
    })
    expect(indisponible.registre.records.get(premier.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })

    const refuse = creerCycleVieTest(DATE_INITIALE)
    const second = await demanderBrouillon(refuse.cycleVie)
    refuse.stockage.failPromotion = true

    expect(
      await refuse.cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(second.draftId)],
      })
    ).toEqual({
      ok: false,
      code: "stockage-refuse",
      message: "échec mémoire de promouvoirBrouillon",
    })
    expect(refuse.registre.records.get(second.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
  })

  it("traduit une panne du stockage en refus et rend les revendications", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    stockage.pannes.promouvoirBrouillon.add("leve")

    expect(
      await cycleVie.preparerPromotionBrouillons({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(demande.draftId)],
      })
    ).toEqual({
      ok: false,
      code: "stockage-refuse",
      message: "Échec de la promotion du Brouillon",
    })
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
  })

  it("refuse quand le registre tombe, après avoir rendu ce qu'il avait pris", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const premier = await demanderBrouillon(cycleVie)
    const second = await demanderBrouillon(cycleVie, "image/gif")
    const revendiquer = registre.revendiquer.bind(registre)
    registre.revendiquer = async (input) => {
      if (input.id === second.draftId) throw new Error("registre indisponible")
      return revendiquer(input)
    }

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(premier.draftId), brouillon(second.draftId)],
    })

    expect(resultat).toEqual({
      ok: false,
      code: "registre-indisponible",
      message: MESSAGE_REGISTRE_INDISPONIBLE,
    })
    expect(registre.records.get(premier.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
    expect(stockage.promotions).toEqual([])
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("supprime les objets déjà promus quand une promotion échoue en cours de route", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const premier = await demanderBrouillon(cycleVie, "image/jpeg")
    const second = await demanderBrouillon(cycleVie, "image/png")
    const promouvoir = stockage.promouvoirBrouillon.bind(stockage)
    stockage.promouvoirBrouillon = async (input) => {
      if (input.draftId === second.draftId) {
        return {
          ok: false,
          erreur: { code: "erreur-stockage", message: "échec simulé" },
        }
      }
      return promouvoir(input)
    }

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(premier.draftId), brouillon(second.draftId)],
    })

    expect(resultat).toEqual({
      ok: false,
      code: "stockage-refuse",
      message: "échec simulé",
    })
    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(premier.draftId, "image/jpeg"),
    ])
    expect(stockage.suppressionsBrouillons).toEqual([])
    for (const demande of [premier, second]) {
      expect(registre.records.get(demande.draftId)).toMatchObject({
        state: "vivant",
        tentativeId: null,
        promotedPublicUrl: null,
      })
    }
  })

  it("ne supprime pas l'objet d'un Brouillon promu avant l'appel", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieTest(DATE_INITIALE)
    const dejaPromu = await demanderBrouillon(cycleVie, "image/webp")
    const aPromouvoir = await demanderBrouillon(cycleVie, "image/png")
    const enregistrement = registre.records.get(dejaPromu.draftId)
    if (!enregistrement) throw new Error("Le Brouillon devait être enregistré")
    enregistrement.state = "revendiqué"
    enregistrement.tentativeId = "tentative-1"
    enregistrement.promotedPublicUrl = urlImagePersistee(
      dejaPromu.draftId,
      "image/webp"
    )
    stockage.failPromotion = true

    const resultat = await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(dejaPromu.draftId), brouillon(aPromouvoir.draftId)],
    })

    expect(resultat).toMatchObject({ ok: false, code: "stockage-refuse" })
    expect(stockage.suppressionsImagesPromues).toEqual([])
    expect(registre.records.get(dejaPromu.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
  })

  it("n'efface jamais les sources des Brouillons", async () => {
    const { cycleVie, stockage } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    stockage.failPromotion = true

    await cycleVie.preparerPromotionBrouillons({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
    })

    expect(stockage.suppressionsBrouillons).toEqual([])
  })
})
