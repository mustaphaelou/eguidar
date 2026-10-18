import { describe, expect, it } from "vitest"

import cycleVieImageProduitParDefaut, {
  horlogeSysteme,
  type Horloge,
} from "@/lib/cycle-vie-image-produit"
import {
  defaultCatalogEffects,
  type CatalogEffects,
} from "@/lib/use-cases/admin-catalog"
import { avecSurcharges } from "@/lib/use-cases/mutation-squelette"

const INSTANT_PARTAGE = new Date("2026-06-01T10:00:00.000Z")

describe("couture d'effets du Catalogue et cycle de vie des Brouillons", () => {
  it("branche les effets par défaut sur le cycle de vie R2 de production", () => {
    const effets = defaultCatalogEffects("produit-1")

    expect(effets.preparerPromotion).toBe(
      cycleVieImageProduitParDefaut.preparerPromotionBrouillons
    )
    expect(effets.confirmerPromotion).toBe(
      cycleVieImageProduitParDefaut.confirmerBrouillons
    )
    expect(effets.compenserPromotion).toBe(
      cycleVieImageProduitParDefaut.compenserPromotionBrouillons
    )
    expect(effets.supprimerSources).toBe(
      cycleVieImageProduitParDefaut.supprimerSources
    )
    expect(effets.lireBrouillonsDeLaTentative).toBe(
      cycleVieImageProduitParDefaut.lireBrouillonsDeLaTentative
    )
  })

  it("rend l'heure système sans qu'aucun appelant n'ait à la passer", () => {
    const avant = Date.now()
    const effets = defaultCatalogEffects("produit-1")

    expect(effets.horloge).toBe(horlogeSysteme)
    const maintenant = effets.horloge.maintenant().getTime()
    expect(maintenant).toBeGreaterThanOrEqual(avant)
    expect(maintenant).toBeLessThanOrEqual(Date.now())
  })

  it("laisse tous les autres membres aux valeurs par défaut quand une surcharge n'en nomme qu'un", () => {
    const defauts = defaultCatalogEffects("produit-1")
    const confirmationSurchargee: CatalogEffects["confirmerPromotion"] =
      async () => {}

    const effets = avecSurcharges(defauts, {
      confirmerPromotion: confirmationSurchargee,
    })

    expect(effets.confirmerPromotion).toBe(confirmationSurchargee)
    expect(effets.preparerPromotion).toBe(defauts.preparerPromotion)
    expect(effets.compenserPromotion).toBe(defauts.compenserPromotion)
    expect(effets.supprimerSources).toBe(defauts.supprimerSources)
    expect(effets.lireBrouillonsDeLaTentative).toBe(
      defauts.lireBrouillonsDeLaTentative
    )
    expect(effets.horloge).toBe(defauts.horloge)
    expect(effets.deleteImages).toBe(defauts.deleteImages)
    expect(effets.reindexProducts).toBe(defauts.reindexProducts)
    expect(effets.revalidateCatalog).toBe(defauts.revalidateCatalog)
    expect(effets.removeProductFromIndex).toBe(defauts.removeProductFromIndex)
  })

  it("accepte en surcharge les gestes du cycle de vie des Brouillons et l'horloge", () => {
    const defauts = defaultCatalogEffects("produit-1")
    const horlogeSurchargee: Horloge = {
      maintenant: () => new Date(INSTANT_PARTAGE),
    }
    const surcharges: Partial<CatalogEffects> = {
      preparerPromotion: async () => ({
        ok: true,
        galerie: [],
        promotions: [],
      }),
      confirmerPromotion: async () => {},
      compenserPromotion: async () => {},
      supprimerSources: async () => {},
      lireBrouillonsDeLaTentative: async () => [],
      horloge: horlogeSurchargee,
    }

    const effets = avecSurcharges(defauts, surcharges)

    expect(effets.preparerPromotion).toBe(surcharges.preparerPromotion)
    expect(effets.confirmerPromotion).toBe(surcharges.confirmerPromotion)
    expect(effets.compenserPromotion).toBe(surcharges.compenserPromotion)
    expect(effets.supprimerSources).toBe(surcharges.supprimerSources)
    expect(effets.lireBrouillonsDeLaTentative).toBe(
      surcharges.lireBrouillonsDeLaTentative
    )
    expect(effets.horloge).toBe(horlogeSurchargee)
    expect(effets.horloge.maintenant()).toEqual(INSTANT_PARTAGE)
    expect(effets.deleteImages).toBe(defauts.deleteImages)
    expect(effets.reindexProducts).toBe(defauts.reindexProducts)
    expect(effets.revalidateCatalog).toBe(defauts.revalidateCatalog)
    expect(effets.removeProductFromIndex).toBe(defauts.removeProductFromIndex)
  })
})
