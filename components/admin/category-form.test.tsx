// @vitest-environment happy-dom

import { act } from "react"
import type { ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

import {
  CategoryForm,
  type CategoryFormState,
} from "@/components/admin/category-form"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const PARENTE = "cat-parente"
const AUTRE = "cat-autre"

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
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

function declencheur() {
  return container.querySelector<HTMLElement>('[data-slot="select-trigger"]')!
}

/** Le `Select` est piloté comme dans `city-picker.test.tsx` : on ouvre, on clique une option. */
async function choisirOption(libelle: string) {
  await act(async () => {
    declencheur().click()
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
      _previous: CategoryFormState,
      formData: FormData
    ): Promise<CategoryFormState> => {
      soumissions.push(formData)
      return {}
    }
  )
  return { soumissions, action }
}

const CATEGORIES = [
  { id: PARENTE, name: "Structure parente" },
  { id: AUTRE, name: "Autre Structure" },
]

describe("CategoryForm", () => {
  it("soumet l'absence de parente, et non une valeur à comparer", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(<CategoryForm categories={CATEGORIES} action={action} />)

    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("parentId")).toBe(false)
  })

  it("annonce qu'une Structure racine n'a pas de parente", () => {
    const { action } = actionQuiCapture()
    render(<CategoryForm categories={CATEGORIES} action={action} />)

    expect(declencheur().textContent).toBe("Aucune (catégorie racine)")
  })

  it("soumet la parente que l'éditeur a choisie", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(<CategoryForm categories={CATEGORIES} action={action} />)

    await choisirOption("Autre Structure")
    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("parentId")).toBe(AUTRE)
  })

  it("revient à l'absence quand l'éditeur choisit « Aucune (catégorie racine) »", async () => {
    // Une Structure déjà sous une parente : l'éditeur doit pouvoir la ramener
    // en racine sans recharger l'écran.
    const { soumissions, action } = actionQuiCapture()
    render(
      <CategoryForm
        category={{
          id: "cat-editee",
          name: "Structure",
          slug: "structure",
          parentId: PARENTE,
          image: null,
        }}
        categories={CATEGORIES}
        action={action}
      />
    )

    await choisirOption("Aucune (catégorie racine)")
    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("parentId")).toBe(false)
  })

  it("soumet la parente enregistrée d'une Structure qui en a une", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <CategoryForm
        category={{
          id: "cat-editee",
          name: "Structure",
          slug: "structure",
          parentId: PARENTE,
          image: null,
        }}
        categories={CATEGORIES}
        action={action}
      />
    )

    await soumettre()

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("parentId")).toBe(PARENTE)
  })
})
