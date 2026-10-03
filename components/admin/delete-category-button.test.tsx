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
const ENFANT = "cat-enfant"

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
  vi.unstubAllGlobals()
})

/** La boîte est montée dans un portail : elle vit dans le document, pas dans la ligne. */
function dialogue() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
}

function declencheur() {
  return container.querySelector<HTMLElement>('[data-slot="dialog-trigger"]')
}

/** On ouvre la boîte par un vrai clic sur son déclencheur : sinon rien ne se monte. */
async function ouvrirDialogue() {
  const bouton = declencheur()
  if (!bouton) throw new Error("déclencheur de boîte de dialogue absent")
  await act(async () => {
    bouton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Le `Select` est piloté comme dans `city-picker.test.tsx` : on ouvre, on clique une option. */
async function choisirOption(
  libelleDuSelect: string,
  libelleDeLOption: string
) {
  const declencheurDuSelect = declencheurDontLeLibelleEst(libelleDuSelect)
  await act(async () => {
    declencheurDuSelect.click()
  })
  const option = [
    ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ].find((element) => element.textContent === libelleDeLOption)
  if (!option) throw new Error(`option absente du menu : ${libelleDeLOption}`)
  await act(async () => {
    option.click()
  })
}

/**
 * On trouve le sélecteur par son étiquette — ce que l'éditeur lit — et non par
 * sa position : la boîte peut porter deux sélecteurs, l'un pour les
 * sous-catégories, l'autre pour les Produits.
 */
function declencheurDontLeLibelleEst(libelle: string): HTMLElement {
  const etiquette = [...dialogue()!.querySelectorAll("label")].find(
    (element) => element.textContent === libelle
  )
  if (!etiquette) throw new Error(`sélecteur absent de la boîte : ${libelle}`)
  const cible = document.getElementById(etiquette.getAttribute("for") ?? "")
  if (!cible) throw new Error(`déclencheur absent de la boîte : ${libelle}`)
  return cible
}

/** Le bouton de confirmation de la boîte, reconnu à son libellé. */
function boutonDeConfirmation() {
  const trouve = [
    ...dialogue()!.querySelectorAll<HTMLButtonElement>('[data-slot="button"]'),
  ].find((bouton) => bouton.textContent === "Supprimer définitivement")
  if (!trouve) throw new Error("bouton de confirmation absent de la boîte")
  return trouve
}

/** Le bouton dont le libellé est exactement celui qu'on cherche, ligne d'abord. */
function boutonDontLeLibelleEst(libelle: string): HTMLButtonElement {
  const trouve = [
    ...container.querySelectorAll<HTMLButtonElement>('[data-slot="button"]'),
  ].find((bouton) => bouton.textContent === libelle)
  if (!trouve) throw new Error(`bouton absent de la ligne : « ${libelle} »`)
  return trouve
}

async function soumettre(form: HTMLFormElement) {
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
  { id: SUPPRIMEE, name: "Structure à supprimer", parentId: null },
  { id: CIBLE, name: "Structure cible", parentId: null },
  { id: ENFANT, name: "Structure enfant", parentId: SUPPRIMEE },
]

describe("DeleteCategoryButton", () => {
  it("annonce sur sa propre ligne qu'une Structure qui a des sous-catégories ne se supprime pas", () => {
    const { action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={2}
        productCount={0}
        categories={CATEGORIES}
        action={action}
      />
    )

    // L'éditeur qui balaie la liste doit lire la contrainte sans cliquer : elle
    // est écrite sur la ligne, en toutes lettres.
    expect(container.textContent).toContain("2 sous-catégories")
    expect(boutonDontLeLibelleEst("Supprimer").disabled).toBe(true)
  })

  it("ouvre, pour une Structure qui a des Produits, une boîte de dialogue qui nomme les comptes et la cible", async () => {
    const { action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()

    // La confirmation n'est plus un `confirm()` qui annonce une action
    // définitive : c'est une boîte qui dit ce qu'elle va emporter.
    expect(dialogue()).not.toBeNull()
    expect(dialogue()!.textContent).toContain("0 sous-catégorie")
    expect(dialogue()!.textContent).toContain("2 Produit")
    expect(
      dialogue()!.querySelector('[data-slot="select-trigger"]')
    ).not.toBeNull()
  })

  it("supprime une feuille vide sans quitter la page ni passer par une boîte", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={0}
        categories={CATEGORIES}
        action={action}
      />
    )

    // Rien à confirmer : une feuille vide ne emporte personne.
    expect(declencheur()).toBeNull()
    expect(boutonDontLeLibelleEst("Supprimer").disabled).toBe(false)

    await soumettre(container.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("categoryId")).toBe(SUPPRIMEE)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("n'écrit rien tant que l'éditeur n'a pas confirmé dans la boîte", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await choisirOption(
      "Déplacer les produits vers",
      "Bloquer — produits rattachés"
    )
    expect(soumissions).toHaveLength(0)

    await soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
  })

  it("refuse de confirmer une Structure à sous-catégories tant qu'aucun Recueil n'est choisi", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={2}
        productCount={0}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()

    // La boîte nomme la contrainte, et elle nomme aussi la sortie.
    expect(dialogue()!.textContent).toContain("2 sous-catégories")
    expect(boutonDeConfirmation().disabled).toBe(true)

    await choisirOption(
      "Déplacer les sous-catégories vers",
      "Déplacer les sous-catégories vers Structure cible"
    )
    await soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("reparentChildrenToCategoryId")).toBe(CIBLE)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("n'offre pas comme Recueil une Structure qui descend de celle qu'on supprime", async () => {
    const { action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={2}
        productCount={0}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await act(async () => {
      declencheurDontLeLibelleEst("Déplacer les sous-catégories vers").click()
    })

    // Rattacher une Structure à l'une de ses descendantes refermerait la boucle
    // sur elle-même : la boîte ne propose donc pas ce qui produirait le refus.
    const options = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
    ].map((element) => element.textContent)
    expect(options).toContain(
      "Déplacer les sous-catégories vers Structure cible"
    )
    expect(options).not.toContain(
      "Déplacer les sous-catégories vers Structure enfant"
    )
  })

  it("ne soumet aucune cible de réaffectation quand aucune Structure n'est choisie", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("soumet la Structure cible que l'éditeur a choisie pour les Produits", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await choisirOption(
      "Déplacer les produits vers",
      "Déplacer les produits vers Structure cible"
    )
    await soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("reassignToCategoryId")).toBe(CIBLE)
  })

  it("retire la cible soumise quand l'éditeur choisit « Bloquer — produits rattachés »", async () => {
    const { soumissions, action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await choisirOption(
      "Déplacer les produits vers",
      "Déplacer les produits vers Structure cible"
    )
    await choisirOption(
      "Déplacer les produits vers",
      "Bloquer — produits rattachés"
    )
    await soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("annonce quand aucune Structure cible n'est choisie", async () => {
    // « Bloquer — produits rattachés » reste lisible tant qu'aucune cible n'est
    // choisie : l'absence de cible ne doit pas laisser le sélecteur vide.
    const { action } = actionQuiCapture()
    render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()

    expect(
      declencheurDontLeLibelleEst("Déplacer les produits vers").textContent
    ).toContain("Bloquer — produits rattachés")
  })
})
