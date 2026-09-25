import { describe, expect, it } from "vitest"

import { creerCycleVieImageProduit } from "@/lib/cycle-vie-image-produit"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-04-01T10:00:00.000Z")

type EntreeFormulaire =
  | { kind: "persistee"; url: string; suppressionEnAttente?: boolean }
  | { kind: "brouillon"; draftId: string; previewUrl: string }

function creerEnvironnement() {
  const horloge = creerHorlogeControllable(DATE_INITIALE)
  const stockageDeBase = creerStockageImageProduitMemoire()
  const objetsPersistants = new Set<string>()
  const stockage = {
    ...stockageDeBase,
    async promouvoirBrouillon(
      input: Parameters<typeof stockageDeBase.promouvoirBrouillon>[0]
    ) {
      const resultat = await stockageDeBase.promouvoirBrouillon(input)
      if (resultat.ok) objetsPersistants.add(resultat.valeur.publicUrl)
      return resultat
    },
    async supprimerImagePersistee(publicUrl: string) {
      const resultat = await stockageDeBase.supprimerImagePersistee(publicUrl)
      if (resultat.ok) objetsPersistants.delete(publicUrl)
      return resultat
    },
  }
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  const cycleVie = creerCycleVieImageProduit({
    stockage,
    registre,
    horloge: horloge.horloge,
  })
  return { cycleVie, stockage, objetsPersistants, registre }
}

describe("abandon d'une édition d'un Produit", () => {
  it("laisse la galerie et l'objet persistés intacts après une suppression non enregistrée", async () => {
    const { cycleVie, stockage, objetsPersistants, registre } =
      creerEnvironnement()
    const premiereDemande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    const secondeDemande = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 1024,
    })
    if (!premiereDemande.ok || !secondeDemande.ok) {
      throw new Error("Les demandes devaient réussir")
    }
    const brouillonAbandonne = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/avif",
      size: 1024,
    })
    if (!brouillonAbandonne.ok) {
      throw new Error("La demande du Brouillon abandonné devait réussir")
    }

    const produit = { id: "produit-1", images: [] as string[] }
    const enregistrement = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [premiereDemande.draftId, secondeDemande.draftId],
      enregistrer: async (images, lier) => {
        await lier(produit.id)
        produit.images = images.map((image) => image.publicUrl)
        return { productId: produit.id, result: null }
      },
    })
    if (!enregistrement.ok) {
      throw new Error("L'enregistrement initial devait réussir")
    }

    const galerieInitiale: EntreeFormulaire[] = [
      ...produit.images.map((url) => ({ kind: "persistee" as const, url })),
      {
        kind: "brouillon",
        draftId: brouillonAbandonne.draftId,
        previewUrl: brouillonAbandonne.previewUrl,
      },
    ]
    const galerieAvecSuppressionEnAttente = galerieInitiale.map(
      (image, index) =>
        index === 0 && image.kind === "persistee"
          ? { ...image, suppressionEnAttente: true }
          : image
    )
    const faitsSoumis = galerieAvecSuppressionEnAttente.filter(
      (image) => image.kind === "brouillon" || !image.suppressionEnAttente
    )
    const urlsPersistees = enregistrement.images.map((image) => image.publicUrl)

    expect(faitsSoumis).toEqual([
      { kind: "persistee", url: urlsPersistees[1] },
      {
        kind: "brouillon",
        draftId: brouillonAbandonne.draftId,
        previewUrl: brouillonAbandonne.previewUrl,
      },
    ])
    expect(produit.images).toEqual(urlsPersistees)
    expect(objetsPersistants).toEqual(new Set(urlsPersistees))
    expect(stockage.deletedPersisted).toEqual([])
    // Le commit a libéré la source des deux Brouillons enregistrés ; celle du
    // Brouillon abandonné, jamais commité, reste intacte.
    expect(stockage.deletedDrafts).toEqual([
      premiereDemande.draftId,
      secondeDemande.draftId,
    ])
    expect(stockage.deletedPromoted).toEqual([])
    for (const [index, demande] of [
      premiereDemande,
      secondeDemande,
    ].entries()) {
      expect(registre.records.get(demande.draftId)).toMatchObject({
        state: "revendiqué",
        productId: produit.id,
        promotedPublicUrl: urlsPersistees[index],
      })
    }
    expect(registre.records.get(brouillonAbandonne.draftId)).toMatchObject({
      state: "vivant",
      productId: null,
      promotedPublicUrl: null,
    })
  })
})
