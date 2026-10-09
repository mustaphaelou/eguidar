import { describe, expect, it } from "vitest"

import type { CycleVieImageProduit } from "@/lib/cycle-vie-image-produit"
import {
  brouillon,
  creerCycleVieTest,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-05-02T10:00:00.000Z")

async function demanderBrouillon(cycleVie: CycleVieImageProduit) {
  const resultat = await cycleVie.demanderBrouillon({
    ownerId: "editeur-1",
    contentType: "image/png",
    size: 1024,
  })
  if (!resultat.ok) throw new Error("La demande devait réussir")
  return resultat
}

const MESSAGE_REGISTRE_INDISPONIBLE = "Registre des Brouillons indisponible"

describe("refus « registre indisponible »", () => {
  it("refuse une demande de Brouillon quand la création du registre échoue", async () => {
    const { cycleVie, registre, stockage } = creerCycleVieTest(DATE_INITIALE)
    registre.pannes.add("creer")

    const resultat = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 1024,
    })

    expect(resultat).toEqual({
      ok: false,
      code: "registre-indisponible",
      message: MESSAGE_REGISTRE_INDISPONIBLE,
    })
    expect(registre.records.size).toBe(0)
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("refuse un relâchement quand la lecture du registre échoue", async () => {
    const { cycleVie, registre, stockage } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    registre.pannes.add("lire")

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toEqual({
      ok: false,
      code: "registre-indisponible",
      message: MESSAGE_REGISTRE_INDISPONIBLE,
    })
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("refuse un relâchement quand le marquage de libération échoue", async () => {
    const { cycleVie, registre, stockage } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    registre.pannes.add("marquerLibere")

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: "editeur-1",
    })

    expect(resultat).toEqual({
      ok: false,
      code: "registre-indisponible",
      message: MESSAGE_REGISTRE_INDISPONIBLE,
    })
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(registre.records.get(demande.draftId)?.state).toBe("vivant")
  })

  it("refuse une revendication quand le registre échoue, et restaure ce qu'il avait pris", async () => {
    const { cycleVie, registre, stockage } = creerCycleVieTest(DATE_INITIALE)
    const premier = await demanderBrouillon(cycleVie)
    const second = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!second.ok) throw new Error("La demande devait réussir")

    const revendiquer = registre.revendiquer.bind(registre)
    registre.revendiquer = async (input) => {
      if (input.id === second.draftId) throw new Error("registre indisponible")
      return revendiquer(input)
    }

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(premier.draftId), brouillon(second.draftId)],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
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
    expect(registre.records.get(second.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
    expect(stockage.promotions).toEqual([])
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("laisse le Brouillon revendicable après un registre revenu", async () => {
    const { cycleVie, registre, stockage } = creerCycleVieTest(DATE_INITIALE)
    const demande = await demanderBrouillon(cycleVie)
    registre.pannes.add("revendiquer")

    const echec = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })
    expect(echec).toMatchObject({ code: "registre-indisponible" })

    registre.pannes.delete("revendiquer")
    const retry = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: async (revendication) => {
        await revendication.lier("produit-1")
        return { productId: "produit-1" }
      },
    })
    expect(retry).toMatchObject({ ok: true, productId: "produit-1" })
    expect(stockage.promotions.map((promotion) => promotion.draftId)).toEqual([
      demande.draftId,
    ])
  })
})
