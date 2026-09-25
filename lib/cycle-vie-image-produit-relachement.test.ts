import { describe, expect, it } from "vitest"

import { creerCycleVieImageProduit } from "@/lib/cycle-vie-image-produit"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
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
    expect(stockage.deletedDrafts).toEqual([demande.draftId])
    expect(stockage.deletedPromoted).toEqual([])
    expect(stockage.deletedPersisted).toEqual([])
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
      message: "Ce Brouillon d'Image produit n'est pas vivant",
    })
    expect(stockage.deletedDrafts).toEqual([demande.draftId])
  })

  it("refuse un éditeur qui ne possède pas le Brouillon", async () => {
    const { cycleVie, stockage, registre } = creerCycleVieRelachement()
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
    expect(registre.records.get(demande.draftId)?.state).toBe("vivant")
    expect(stockage.deletedDrafts).toEqual([])
  })

  it("ne supprime aucune Image produit déjà persistée", async () => {
    const { cycleVie, stockage } = creerCycleVieRelachement()
    const demande = await demanderBrouillon(cycleVie)
    const revendication = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer: async (_images, lier) => {
        await lier("produit-1")
        return { productId: "produit-1", result: null }
      },
    })
    expect(revendication.ok).toBe(true)

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toMatchObject({
      ok: false,
      code: "brouillon-non-vivant",
    })
    expect(stockage.deletedDrafts).toEqual([])
    expect(stockage.deletedPromoted).toEqual([])
    expect(stockage.deletedPersisted).toEqual([])
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
