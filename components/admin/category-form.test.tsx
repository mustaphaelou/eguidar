// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import { actionQuiCapture, monterFormulaire } from "@/test/rendu-formulaire"

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

import {
  CategoryForm,
  type CategoryFormState,
} from "@/components/admin/category-form"

const PARENTE = "cat-parente"
const AUTRE = "cat-autre"

const rendu = monterFormulaire()

/** Le seul `Select` du formulaire, et son unique déclencheur. */
function declencheur() {
  return rendu.container.querySelector<HTMLElement>(
    '[data-slot="select-trigger"]'
  )!
}

async function choisirOption(libelle: string) {
  await act(async () => {
    declencheur().click()
  })
  await rendu.cliquerOption(libelle)
}

function formulaire() {
  return rendu.container.querySelector<HTMLFormElement>("form")!
}

const CATEGORIES = [
  { id: PARENTE, name: "Structure parente" },
  { id: AUTRE, name: "Autre Structure" },
]

describe("CategoryForm", () => {
  it("soumet l'absence de parente, et non une valeur à comparer", async () => {
    const { soumissions, action } = actionQuiCapture<CategoryFormState>()
    rendu.render(<CategoryForm categories={CATEGORIES} action={action} />)

    await rendu.soumettre(formulaire())

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("parentId")).toBe(false)
  })

  it("annonce qu'une Structure racine n'a pas de parente", () => {
    const { action } = actionQuiCapture<CategoryFormState>()
    rendu.render(<CategoryForm categories={CATEGORIES} action={action} />)

    expect(declencheur().textContent).toBe("Aucune (catégorie racine)")
  })

  it("soumet la parente que l'éditeur a choisie", async () => {
    const { soumissions, action } = actionQuiCapture<CategoryFormState>()
    rendu.render(<CategoryForm categories={CATEGORIES} action={action} />)

    await choisirOption("Autre Structure")
    await rendu.soumettre(formulaire())

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("parentId")).toBe(AUTRE)
  })

  it("revient à l'absence quand l'éditeur choisit « Aucune (catégorie racine) »", async () => {
    // Une Structure déjà sous une parente : l'éditeur doit pouvoir la ramener
    // en racine sans recharger l'écran.
    const { soumissions, action } = actionQuiCapture<CategoryFormState>()
    rendu.render(
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
    await rendu.soumettre(formulaire())

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("parentId")).toBe(false)
  })

  it("soumet la parente enregistrée d'une Structure qui en a une", async () => {
    const { soumissions, action } = actionQuiCapture<CategoryFormState>()
    rendu.render(
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

    await rendu.soumettre(formulaire())

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("parentId")).toBe(PARENTE)
  })
})
