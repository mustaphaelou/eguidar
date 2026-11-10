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
  it("enchaîne les appels avec le curseur rendu et affiche la progression x / y", async () => {
    const appels: FormData[] = []
    const action = vi.fn(
      async (_etat: ApplicationState, formData: FormData) => {
        appels.push(formData)
        if (appels.length === 1) {
          return resultat({
            traites: 25,
            reste: 25,
            curseurSuivant: 25,
            ecrits: 25,
            indexes: 25,
          })
        }
        return resultat({
          traites: 25,
          reste: 0,
          curseurSuivant: 50,
          ecrits: 50,
          indexes: 50,
          statut: "termine",
        })
      }
    )

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

    expect(appels).toHaveLength(2)
    expect(appels.map((formData) => formData.get("curseur"))).toEqual([
      "0",
      "25",
    ])
    expect(appels.every((formData) => formData.get("lotId") === "lot-1")).toBe(
      true
    )
    expect(rendu.container.textContent).toContain("50 / 50")
    expect(rendu.container.textContent).toContain("Produits écrits")
    expect(rendu.container.textContent).toContain("Produits indexés")
    expect(navigation.refresh).toHaveBeenCalledTimes(1)
  })

  it("montre l'indexation en attente et ne dit jamais terminé tant qu'elle n'a pas rattrapé", async () => {
    const action = vi.fn(async () =>
      resultat({
        traites: 0,
        reste: 0,
        curseurSuivant: 2,
        ecrits: 2,
        indexes: 1,
        indexationEnAttente: true,
        statut: "en_cours",
      })
    )

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

    expect(action.mock.calls.length).toBeGreaterThan(1)
    expect(action.mock.calls.length).toBeLessThanOrEqual(4)
    expect(rendu.container.textContent).toContain(MESSAGE_INDEXATION_EN_ATTENTE)
    expect(rendu.container.textContent).not.toContain("Terminé")
    expect(navigation.refresh).toHaveBeenCalledTimes(1)
  })

  it("affiche le message français d'un refus sans boucler", async () => {
    const action = vi.fn(async () => ({
      error:
        "Ce Lot est déjà appliqué : il ne peut pas l'être une seconde fois.",
    }))

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

    expect(action).toHaveBeenCalledTimes(1)
    expect(rendu.container.textContent).toContain("Ce Lot est déjà appliqué")
    expect(navigation.refresh).toHaveBeenCalledTimes(1)
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
