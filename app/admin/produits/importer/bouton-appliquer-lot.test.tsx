// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import { MESSAGE_INDEXATION_EN_ATTENTE } from "@/lib/import-produits"
import { monterFormulaire } from "@/test/rendu-formulaire"

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh, push: vi.fn() }),
}))

import { BoutonAppliquerLot } from "@/app/admin/produits/importer/bouton-appliquer-lot"
import type { ApplicationState } from "@/app/admin/produits/importer/actions"

const rendu = monterFormulaire()

function resultat(
  valeurs: Partial<ApplicationState> & Pick<ApplicationState, "curseurSuivant">
): ApplicationState {
  return {
    lotId: "lot-1",
    traites: 0,
    reste: 0,
    ecrits: 0,
    indexes: 0,
    echecs: [],
    indexationEnAttente: false,
    statut: "en_cours",
    ...valeurs,
  }
}

describe("BoutonAppliquerLot", () => {
  it("enchaîne les appels et affiche la progression x / y jusqu'au bout", async () => {
    let appels = 0
    const action = vi.fn(async () => {
      appels += 1
      if (appels === 1) {
        return resultat({
          traites: 25,
          reste: 25,
          curseurSuivant: 25,
          ecrits: 25,
          indexes: 25,
        })
      }
      if (appels === 2) {
        return resultat({
          traites: 25,
          reste: 0,
          curseurSuivant: 50,
          ecrits: 50,
          indexes: 50,
          statut: "termine",
        })
      }
      throw new Error("appel inattendu au-delà du dernier Produit")
    })

    rendu.render(
      <BoutonAppliquerLot
        lotId="lot-1"
        curseurInitial={0}
        ecritsInitiaux={0}
        indexesInitiaux={0}
        total={50}
        action={action}
      />
    )

    await act(async () => {
      rendu.boutonDontLeLibelleEst("Appliquer le Lot").click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const texte = rendu.container.textContent
    expect(texte).toContain("50 / 50")
    expect(texte).toContain("Produits écrits : 50")
    expect(texte).toContain("Produits indexés : 50")
    expect(texte).not.toContain("appel inattendu")
  })

  it("montre l'indexation en attente et arrête ses reprises quand elle n'a pas rattrapé", async () => {
    let appels = 0
    const action = vi.fn(async () => {
      appels += 1
      if (appels > 3) {
        throw new Error("reprise inattendue au-delà de la borne")
      }
      return resultat({
        traites: 0,
        reste: 0,
        curseurSuivant: 2,
        ecrits: 2,
        indexes: 1,
        indexationEnAttente: true,
        statut: "en_cours",
      })
    })

    rendu.render(
      <BoutonAppliquerLot
        lotId="lot-1"
        curseurInitial={0}
        ecritsInitiaux={0}
        indexesInitiaux={0}
        total={2}
        action={action}
      />
    )

    await act(async () => {
      rendu.boutonDontLeLibelleEst("Appliquer le Lot").click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(rendu.container.textContent).toContain(MESSAGE_INDEXATION_EN_ATTENTE)
    expect(rendu.container.textContent).not.toContain("Terminé")
    expect(rendu.container.textContent).not.toContain("reprise inattendue")
    expect(rendu.boutonDontLeLibelleEst("Appliquer le Lot")).toBeTruthy()
  })

  it("affiche le message français d'un refus et s'arrête", async () => {
    let appels = 0
    const action = vi.fn(async () => {
      appels += 1
      if (appels > 1) throw new Error("appel après le refus")
      return {
        error:
          "Ce Lot est déjà appliqué : il ne peut pas l'être une seconde fois.",
      }
    })

    rendu.render(
      <BoutonAppliquerLot
        lotId="lot-1"
        curseurInitial={0}
        ecritsInitiaux={0}
        indexesInitiaux={0}
        total={1}
        action={action}
      />
    )

    await act(async () => {
      rendu.boutonDontLeLibelleEst("Appliquer le Lot").click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(rendu.container.textContent).toContain("Ce Lot est déjà appliqué")
    expect(rendu.container.textContent).not.toContain("appel après le refus")
    expect(rendu.boutonDontLeLibelleEst("Appliquer le Lot")).toBeTruthy()
  })

  it("nomme la reprise d'un Lot en cours même avant tout Produit traité", () => {
    rendu.render(
      <BoutonAppliquerLot
        lotId="lot-1"
        curseurInitial={0}
        ecritsInitiaux={0}
        indexesInitiaux={0}
        total={50}
        reprise
        action={vi.fn()}
      />
    )

    expect(rendu.boutonDontLeLibelleEst("Reprendre l'application")).toBeTruthy()
  })
})
