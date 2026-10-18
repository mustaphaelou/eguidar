import { describe, expect, it } from "vitest"

import {
  MESSAGE_REGISTRE_INDISPONIBLE,
  type CycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { creerCycleVieTest } from "@/test/cycle-vie-image-produit-memoire"

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
})
