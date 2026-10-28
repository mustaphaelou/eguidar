// @vitest-environment happy-dom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StructurePicker } from "./structure-picker"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const STRUCTURES = [
  { id: "structure-a", nom: "Enfant", chemin: "Racine A › Enfant" },
  { id: "structure-b", nom: "Enfant", chemin: "Racine B › Enfant" },
]

let container: HTMLDivElement
let root: ReturnType<typeof createRoot> | null = null
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => {
    for (const monte of roots) monte.unmount()
  })
  roots.length = 0
  container.remove()
})

function rendre(valeur: string, onChange = vi.fn()) {
  root = createRoot(container)
  roots.push(root)
  act(() => {
    root!.render(
      <StructurePicker
        id="categoryId"
        valeur={valeur}
        structures={STRUCTURES}
        onChange={onChange}
      />
    )
  })
  return onChange
}

function champ(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>("input")
  if (!input) throw new Error("champ du sélecteur absent")
  return input
}

describe("StructurePicker — le chemin, pas seulement la feuille", () => {
  it("donne au champ le nom accessible de sa section et le chemin de la Structure choisie", () => {
    rendre("structure-a")

    const input = champ()
    const etiquette = document.querySelector<HTMLLabelElement>(
      `label[for="${input.id}"]`
    )

    expect(etiquette?.textContent).toBe("Structure")
    expect(input.value).toBe("Racine A › Enfant")
  })

  it("distingue deux branches dont la feuille porte le même nom", async () => {
    rendre("structure-a")

    const declencheur = container.querySelector<HTMLButtonElement>(
      '[data-slot="combobox-trigger"]'
    )
    if (!declencheur) throw new Error("déclencheur du sélecteur absent")
    await act(async () => {
      declencheur.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const options = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].map((option) => option.textContent?.trim())

    expect(options).toEqual(["Racine A › Enfant", "Racine B › Enfant"])
  })

  it("remonte l'identifiant de la Structure choisie", async () => {
    const onChange = rendre("structure-a")

    const declencheur = container.querySelector<HTMLButtonElement>(
      '[data-slot="combobox-trigger"]'
    )!
    await act(async () => {
      declencheur.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const seconde = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].find((option) => option.textContent?.includes("Racine B"))
    if (!seconde) throw new Error("option de la deuxième branche absente")
    await act(async () => {
      seconde.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).toHaveBeenCalledWith("structure-b")
  })

  it("montre le chemin entier dans la liste, pas la feuille seule", async () => {
    rendre("")

    const declencheur = container.querySelector<HTMLButtonElement>(
      '[data-slot="combobox-trigger"]'
    )!
    await act(async () => {
      declencheur.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const popup = document.querySelector<HTMLElement>(
      '[data-slot="combobox-popup"]'
    )
    expect(popup?.textContent).toContain("Racine A › Enfant")
    expect(popup?.textContent).toContain("Racine B › Enfant")
  })
})
