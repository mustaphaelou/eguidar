import { describe, expect, it } from "vitest"

import cycleVieImageProduitParDefaut, {
  type CycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { indexProductDocuments } from "@/lib/meili"
import { defaultCatalogEffects } from "@/lib/use-cases/admin-catalog"
import { avecSurcharges } from "@/lib/use-cases/mutation-squelette"

describe("couture d'effets du Catalogue et cycle de vie des Brouillons", () => {
  it("branche le cycle de vie de production comme dépendance et les cinq effets par défaut", () => {
    const effets = defaultCatalogEffects("produit-1")

    expect(effets.cycleVie).toBe(cycleVieImageProduitParDefaut)
    expect(effets.reindexProducts).toBe(indexProductDocuments)
    expect(effets.removeProductFromIndex).toBeTypeOf("function")
    expect(effets.revalidateCatalog).toBeTypeOf("function")
    expect(effets.deleteImages).toBeTypeOf("function")
    expect(effets.enregistrerImages).toBeTypeOf("function")
  })

  it("remplace la dépendance entière sans perdre les cinq effets par défaut", () => {
    const defauts = defaultCatalogEffects("produit-1")
    const cycleVieSurcharge: CycleVieImageProduit = {
      ...defauts.cycleVie,
      confirmerBrouillons: async () => {},
    }

    const effets = avecSurcharges(defauts, { cycleVie: cycleVieSurcharge })

    expect(effets.cycleVie).toBe(cycleVieSurcharge)
    expect(effets.deleteImages).toBe(defauts.deleteImages)
    expect(effets.reindexProducts).toBe(defauts.reindexProducts)
    expect(effets.revalidateCatalog).toBe(defauts.revalidateCatalog)
    expect(effets.removeProductFromIndex).toBe(defauts.removeProductFromIndex)
    expect(effets.enregistrerImages).toBe(defauts.enregistrerImages)
  })
})
