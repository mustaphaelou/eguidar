// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import { actionQuiCapture, monterFormulaire } from "@/test/rendu-formulaire"

import {
  DeleteCategoryButton,
  type DeleteCategoryState,
} from "@/components/admin/delete-category-button"

const SUPPRIMEE = "cat-supprimee"
const CIBLE = "cat-cible"
const ENFANT = "cat-enfant"

const rendu = monterFormulaire()

/** La boîte est montée dans un portail : elle vit dans le document, pas dans la ligne. */
function dialogue() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
}

function declencheur() {
  return rendu.container.querySelector<HTMLElement>(
    '[data-slot="dialog-trigger"]'
  )
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

/** Le `Select` est piloté comme dans `city-picker.test.tsx` : on ouvre, on clique une option. */
async function choisirOption(
  libelleDuSelect: string,
  libelleDeLOption: string
) {
  await act(async () => {
    declencheurDontLeLibelleEst(libelleDuSelect).click()
  })
  await rendu.cliquerOption(libelleDeLOption)
}

/** Le bouton de confirmation de la boîte, reconnu à son libellé. */
function boutonDeConfirmation() {
  const trouve = [
    ...dialogue()!.querySelectorAll<HTMLButtonElement>('[data-slot="button"]'),
  ].find((bouton) => bouton.textContent === "Supprimer définitivement")
  if (!trouve) throw new Error("bouton de confirmation absent de la boîte")
  return trouve
}

const CATEGORIES = [
  { id: SUPPRIMEE, name: "Structure à supprimer", parentId: null },
  { id: CIBLE, name: "Structure cible", parentId: null },
  { id: ENFANT, name: "Structure enfant", parentId: SUPPRIMEE },
]

describe("DeleteCategoryButton", () => {
  it("annonce sur sa propre ligne qu'une Structure qui a des sous-catégories ne se supprime pas", () => {
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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
    expect(rendu.container.textContent).toContain("2 sous-catégories")
    expect(rendu.boutonDontLeLibelleEst("Supprimer").disabled).toBe(true)
  })

  it("ouvre, pour une Structure qui a des Produits, une boîte de dialogue qui nomme les comptes et la cible", async () => {
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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

  it("confirme une feuille vide, sans quitter la page ni passer par une boîte", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    // happy-dom ne fournit pas `confirm` : c'est la suite qui en fait l'original
    // de la suppression, et qui le decline d'abord.
    const confirme = vi.fn(() => false)
    vi.stubGlobal("confirm", confirme)
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={0}
        categories={CATEGORIES}
        action={action}
      />
    )

    // Rien à choisir, donc rien à montrer dans une boîte — mais la suppression
    // reste définitive, et elle se demande. Un `confirm()` ne quitte pas la page.
    expect(declencheur()).toBeNull()
    expect(rendu.boutonDontLeLibelleEst("Supprimer").disabled).toBe(false)

    await rendu.soumettre(
      rendu.container.querySelector<HTMLFormElement>("form")!
    )

    // Refusé : rien n'est écrit, et l'éditeur peut encore revenir en arrière.
    expect(confirme).toHaveBeenCalledWith(
      "Supprimer « Structure à supprimer » ? Cette action est définitive."
    )
    expect(soumissions).toHaveLength(0)

    confirme.mockReturnValue(true)
    await rendu.soumettre(
      rendu.container.querySelector<HTMLFormElement>("form")!
    )

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("categoryId")).toBe(SUPPRIMEE)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("n'écrit rien tant que l'éditeur n'a pas confirmé dans la boîte", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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

    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
  })

  it("refuse de confirmer une Structure à sous-catégories tant qu'aucune Structure d'accueil n'est choisie", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("reparentChildrenToCategoryId")).toBe(CIBLE)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("n'offre pas comme Structure d'accueil une Structure qui descend de celle qu'on supprime", async () => {
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("soumet la Structure cible que l'éditeur a choisie pour les Produits", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("reassignToCategoryId")).toBe(CIBLE)
  })

  it("retire la cible soumise quand l'éditeur choisit « Bloquer — produits rattachés »", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.has("reassignToCategoryId")).toBe(false)
  })

  it("annonce quand aucune Structure cible n'est choisie", async () => {
    // « Bloquer — produits rattachés » reste lisible tant qu'aucune cible n'est
    // choisie : l'absence de cible ne doit pas laisser le sélecteur vide.
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
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
