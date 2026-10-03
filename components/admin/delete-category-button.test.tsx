// @vitest-environment happy-dom

import { act } from "react"
import type { ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  DeleteCategoryButton,
  type DeleteCategoryState,
} from "@/components/admin/delete-category-button"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const SUPPRIMEE = "cat-supprimee"
const CIBLE = "cat-cible"

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
  return root
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  // La confirmation est un `confirm()` du navigateur : la suite décide.
  vi.stubGlobal("confirm", () => true)
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function declencheur() {
  return container.querySelector<HTMLElement>('[data-slot="select-trigger"]')
}

/** Le `Select` est piloté comme dans `city-picker.test.tsx` : on ouvre, on clique une option. */
async function choisirOption(libelle: string) {
  await act(async () => {
    declencheur()!.click()
  })
  const option = [
    ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ].find((element) => element.textContent === libelle)
  if (!option) throw new Error(`option absente du menu : ${libelle}`)
  await act(async () => {
    option.click()
  })
}

async function soumettre() {
  const form = container.querySelector<HTMLFormElement>("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function actionQuiCapture() {
  const soumissions: FormData[] = []
  const action = vi.fn(
    async (
      _previous: DeleteCategoryState,
      formData: FormData
    ): Promise<DeleteCategoryState> => {
      soumissions.push(formData)
      return {}
    }
  )
  return { soumissions, action }
}

const CATEGORIES = [
  { id: SUPPRIMEE, name: "Structure à supprimer" },
  { id: CIBLE, name: "Structure cible" },
]

describe("DeleteCategoryButton", () => {
  it("ne soumet aucune cible de réaffectation quand aucune Structure n'est choisie", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("ne soumet aucune cible de réaffectation sur une Structure vide", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        productCount={0}
        categories={CATEGORIES}
        action={action}
      />
    )

    expect(declencheur()).toBeNull()

    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
    expect(soumissions[0]!.get("categoryId")).toBe(SUPPRIMEE)
  })

  it("annonce quand aucune Structure cible n'est choisie", () => {
    // « Bloquer — produits rattachés » reste lisible tant qu'aucune cible n'est
    // choisie : l'absence de cible ne doit pas laisser le sélecteur vide.
    const { action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    expect(declencheur()!.textContent).toBe("Bloquer — produits rattachés")
  })

  it("soumet la Structure cible que l'éditeur a choisie", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await choisirOption("Déplacer les produits vers Structure cible")
    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("reassignToCategoryId")).toBe(CIBLE)
  })

  it("retire la cible soumise quand l'éditeur choisit « Bloquer — produits rattachés »", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await choisirOption("Déplacer les produits vers Structure cible")
    await choisirOption("Bloquer — produits rattachés")
    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })
})
