// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it } from "vitest"

import { monterFormulaire } from "@/test/rendu-formulaire"

import { DeleteCityButton } from "@/components/admin/delete-city-button"

const VILLE = "ville-supprimee"

const rendu = monterFormulaire()

function dialogue() {
  return document.querySelector<HTMLElement>(
    '[data-slot="alert-dialog-content"]'
  )
}

function boutonDuDialogue(libelle: string): HTMLButtonElement {
  const bouton = [...(dialogue()?.querySelectorAll("button") ?? [])].find(
    (candidat) => candidat.textContent === libelle
  )
  if (!bouton) throw new Error(`bouton absent du dialogue : « ${libelle} »`)
  return bouton
}

async function ouvrirDialogue() {
  const declencheur = rendu.container.querySelector<HTMLButtonElement>("button")
  if (!declencheur) throw new Error("déclencheur absent")
  await act(async () => {
    declencheur.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("DeleteCityButton", () => {
  it("nomme la Ville, garde la ligne sur Annuler et ne soumet qu'après confirmation", async () => {
    const soumissions: FormData[] = []
    const action = async (formData: FormData) => {
      soumissions.push(formData)
    }

    rendu.render(
      <DeleteCityButton cityId={VILLE} cityName="Casablanca" action={action} />
    )

    await ouvrirDialogue()

    expect(dialogue()).not.toBeNull()
    expect(dialogue()!.textContent).toContain("Supprimer « Casablanca »")
    expect(document.activeElement).toBe(boutonDuDialogue("Annuler"))
    expect(soumissions).toHaveLength(0)

    await act(async () => {
      boutonDuDialogue("Annuler").click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(dialogue()).toBeNull()
    expect(soumissions).toHaveLength(0)

    await ouvrirDialogue()
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("cityId")).toBe(VILLE)
  })
})
