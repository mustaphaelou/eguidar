import { describe, expect, it } from "vitest"

import { creerCycleVieImageProduit } from "@/lib/cycle-vie-image-produit"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-05-02T10:00:00.000Z")

/**
 * Les quatre chemins par lesquels le module propriétaire rend le refus
 * « registre indisponible ». Un registre qui ne peut pas échouer ne prouve pas
 * le chemin qui le rattrape : sans l'injection de panne de l'adaptateur en
 * mémoire, aucun de ces quatre refus n'a de cas dans aucune suite.
 *
 * Ce sont des refus de dépendance, pas des refus métier : le Brouillon existe
 * côté éditeur et aucun octet n'est écrit dans le stockage. Chaque cas vérifie
 * donc que l'échec du registre ne laisse aucune trace de suppression.
 */
function creerCycleVie() {
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
  cycleVie: ReturnType<typeof creerCycleVie>["cycleVie"]
) {
  const resultat = await cycleVie.demanderBrouillon({
    ownerId: "editeur-1",
    contentType: "image/png",
    size: 1024,
  })
  if (!resultat.ok) throw new Error("La demande devait réussir")
  return resultat
}

/** Le message est unique : un registre hors service ne promet aucune reprise. */
const MESSAGE_REGISTRE_INDISPONIBLE = "Registre des Brouillons indisponible"

describe("refus « registre indisponible »", () => {
  it("refuse une demande de Brouillon quand la création du registre échoue", async () => {
    const { cycleVie, registre, stockage } = creerCycleVie()
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
    // La pré-signature a eu lieu, mais aucun enregistrement n'existe : l'éditeur
    // ne reçoit pas d'identifiant qui ne serait pas dans le registre.
    expect(registre.records.size).toBe(0)
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("refuse un relâchement quand la lecture du registre échoue", async () => {
    const { cycleVie, registre, stockage } = creerCycleVie()
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
    // La libération n'a pas pu être marquée, donc l'objet reste : le supprimer
    // laisserait un Brouillon que le registre croira encore vivant.
    expect(stockage.suppressionsBrouillons).toEqual([])
  })

  it("refuse un relâchement quand le marquage de libération échoue", async () => {
    const { cycleVie, registre, stockage } = creerCycleVie()
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
    // L'ordre est « marquer avant de supprimer » : la panne du registre laisse
    // l'objet en place, jamais un Brouillon libéré dont l'image a disparu.
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(registre.records.get(demande.draftId)?.state).toBe("vivant")
  })

  it("refuse une revendication quand le registre échoue, et restaure ce qu'il avait pris", async () => {
    const { cycleVie, registre, stockage } = creerCycleVie()
    const premier = await demanderBrouillon(cycleVie)
    const second = await cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!second.ok) throw new Error("La demande devait réussir")

    // Seul le second Brouillon tombe en panne : le premier a été revendiqué, la
    // compensation doit le rendre à l'éditeur pour qu'un nouvel essai passe.
    const revendiquer = registre.revendiquer.bind(registre)
    registre.revendiquer = async (input) => {
      if (input.id === second.draftId) throw new Error("registre indisponible")
      return revendiquer(input)
    }

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [premier.draftId, second.draftId],
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
    const { cycleVie, registre, stockage } = creerCycleVie()
    const demande = await demanderBrouillon(cycleVie)
    registre.pannes.add("revendiquer")

    const echec = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })
    expect(echec).toMatchObject({ code: "registre-indisponible" })

    // Un registre qui revient ne doit pas trouver le Brouillon dans un état
    // intermédiaire : l'éditeur réessaie et cela passe.
    registre.pannes.delete("revendiquer")
    const retry = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      draftIds: [demande.draftId],
      enregistrer: async (images, lier) => {
        await lier("produit-1")
        return { productId: "produit-1", result: null }
      },
    })
    expect(retry).toMatchObject({ ok: true, productId: "produit-1" })
    expect(stockage.promotions.map((promotion) => promotion.draftId)).toEqual([
      demande.draftId,
    ])
  })
})
