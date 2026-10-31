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

function dialogue() {
  return document.querySelector<HTMLElement>(
    '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]'
  )
}

function declencheur() {
  return rendu.container.querySelector<HTMLElement>(
    '[data-slot="dialog-trigger"], [data-slot="alert-dialog-trigger"]'
  )
}

async function ouvrirDialogue() {
  const bouton = declencheur()
  if (!bouton) throw new Error("déclencheur de boîte de dialogue absent")
  await act(async () => {
    bouton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function declencheurDontLeLibelleEst(libelle: string): HTMLElement {
  const etiquette = [...dialogue()!.querySelectorAll("label")].find(
    (element) => element.textContent === libelle
  )
  if (!etiquette) throw new Error(`sélecteur absent de la boîte : ${libelle}`)
  const cible = document.getElementById(etiquette.getAttribute("for") ?? "")
  if (!cible) throw new Error(`déclencheur absent de la boîte : ${libelle}`)
  return cible
}

async function optionsDe(libelleDuSelect: string): Promise<string[]> {
  await act(async () => {
    declencheurDontLeLibelleEst(libelleDuSelect).click()
  })
  return [
    ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ].map((element) => element.textContent ?? "")
}

async function choisirOption(
  libelleDuSelect: string,
  libelleDeLOption: string
) {
  await act(async () => {
    declencheurDontLeLibelleEst(libelleDuSelect).click()
  })
  await rendu.cliquerOption(libelleDeLOption)
}

function boutonDeConfirmation() {
  const trouve = [
    ...dialogue()!.querySelectorAll<HTMLButtonElement>('[data-slot="button"]'),
  ].find((bouton) => bouton.textContent === "Supprimer définitivement")
  if (!trouve) throw new Error("bouton de confirmation absent de la boîte")
  return trouve
}

const CIBLES_SAINES = {
  ciblesProduits: [CIBLE, ENFANT],
  ciblesSousCategories: [CIBLE],
  nomsStructures: {
    [SUPPRIMEE]: "Structure à supprimer",
    [CIBLE]: "Structure cible",
    [ENFANT]: "Structure enfant",
  },
} as const

const CYCLIQUE_A = "cat-cyclique-a"
const CYCLIQUE_B = "cat-cyclique-b"

const CIBLES_CYCLIQUES = {
  ciblesProduits: [CIBLE, CYCLIQUE_A, CYCLIQUE_B],
  ciblesSousCategories: [CIBLE, CYCLIQUE_A, CYCLIQUE_B],
  nomsStructures: {
    [SUPPRIMEE]: "Structure à supprimer",
    [ENFANT]: "Structure enfant",
    [CIBLE]: "Structure cible",
    [CYCLIQUE_A]: "Structure cyclique A",
    [CYCLIQUE_B]: "Structure cyclique B",
  },
} as const

describe("DeleteCategoryButton", () => {
  it("annonce sur sa propre ligne qu'une Structure qui a des sous-catégories ne se supprime pas", () => {
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={2}
        productCount={0}
        {...CIBLES_SAINES}
        action={action}
      />
    )

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
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()

    expect(dialogue()).not.toBeNull()
    expect(dialogue()!.textContent).toContain("0 sous-catégorie")
    expect(dialogue()!.textContent).toContain("2 Produit")
    expect(
      dialogue()!.querySelector('[data-slot="select-trigger"]')
    ).not.toBeNull()
  })

  it("confirme une feuille vide dans une boîte qui nomme la Structure, sans quitter la page", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={0}
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()

    expect(dialogue()).not.toBeNull()
    expect(dialogue()!.textContent).toContain(
      "Supprimer « Structure à supprimer »"
    )
    expect(dialogue()!.textContent).toContain("définitive")
    expect(document.activeElement).toBe(
      [...dialogue()!.querySelectorAll("button")].find(
        (bouton) => bouton.textContent === "Annuler"
      )
    )
    expect(soumissions).toHaveLength(0)

    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

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
        {...CIBLES_SAINES}
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
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()

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
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()
    const optionsSousCategories = await optionsDe(
      "Déplacer les sous-catégories vers"
    )

    expect(optionsSousCategories).toContain(
      "Déplacer les sous-catégories vers Structure cible"
    )
    expect(optionsSousCategories).not.toContain(
      "Déplacer les sous-catégories vers Structure enfant"
    )
    expect(CIBLES_SAINES.ciblesProduits).toContain(ENFANT)
    expect(CIBLES_SAINES.ciblesSousCategories).not.toContain(ENFANT)
  })

  it("ne soumet aucune cible de réaffectation quand aucune Structure n'est choisie", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        {...CIBLES_SAINES}
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
        {...CIBLES_SAINES}
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

  it("soumet l'orphelinat quand l'éditeur coche la case", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await act(async () => {
      dialogue()!
        .querySelector<HTMLInputElement>('[data-slot="checkbox"]')!
        .click()
    })
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("orphanProducts")).toBe("on")
    expect(soumissions[0]!.get("reassignToCategoryId")).toBeNull()
  })

  it("n'envoie pas l'orphelinat quand la case est décochée", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions[0]!.get("orphanProducts")).toBeNull()
    expect(soumissions[0]!.get("reassignToCategoryId")).toBeNull()
  })

  it("efface la cible choisie dès que l'éditeur coche l'orphelinat", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await choisirOption(
      "Déplacer les produits vers",
      "Déplacer les produits vers Structure cible"
    )
    await act(async () => {
      dialogue()!
        .querySelector<HTMLInputElement>('[data-slot="checkbox"]')!
        .click()
    })
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions[0]!.get("orphanProducts")).toBe("on")
    expect(soumissions[0]!.get("reassignToCategoryId")).toBeNull()
  })

  it("retire la cible soumise quand l'éditeur choisit « Bloquer — produits rattachés »", async () => {
    const { soumissions, action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        {...CIBLES_SAINES}
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
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={0}
        productCount={2}
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()

    expect(
      declencheurDontLeLibelleEst("Déplacer les produits vers").textContent
    ).toContain("Bloquer — produits rattachés")
  })

  it("reste propositionnelle sur une Structure cyclique, et ne journalise plus", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { action } = actionQuiCapture<DeleteCategoryState>()
      rendu.render(
        <DeleteCategoryButton
          categoryId={SUPPRIMEE}
          categoryName="Structure à supprimer"
          childCount={1}
          productCount={1}
          {...CIBLES_CYCLIQUES}
          action={action}
        />
      )

      await ouvrirDialogue()
      const optionsSousCategories = await optionsDe(
        "Déplacer les sous-catégories vers"
      )

      expect(optionsSousCategories).not.toContain(
        "Déplacer les sous-catégories vers Structure enfant"
      )
      expect(optionsSousCategories).toEqual(
        expect.arrayContaining([
          "Déplacer les sous-catégories vers Structure cible",
          "Déplacer les sous-catégories vers Structure cyclique A",
          "Déplacer les sous-catégories vers Structure cyclique B",
        ])
      )

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("DeleteCategoryButton — ce qui franchit la couture", () => {
  it("n'offre qu'une cible reçue, et la nomme par la table des noms", async () => {
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={1}
        productCount={1}
        {...CIBLES_CYCLIQUES}
        ciblesSousCategories={[CIBLE, CYCLIQUE_A, CYCLIQUE_B, ENFANT]}
        action={action}
      />
    )

    await ouvrirDialogue()
    const options = await optionsDe("Déplacer les sous-catégories vers")

    expect(options).toEqual([
      "Déplacer les sous-catégories vers Structure cible",
      "Déplacer les sous-catégories vers Structure cyclique A",
      "Déplacer les sous-catégories vers Structure cyclique B",
      "Déplacer les sous-catégories vers Structure enfant",
    ])
  })

  it("se rabat sur l'identifiant quand la table des noms ne porte pas la cible", async () => {
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={1}
        productCount={0}
        {...CIBLES_SAINES}
        ciblesSousCategories={[CIBLE, "cat-inconnue"]}
        action={action}
      />
    )

    await ouvrirDialogue()

    expect(await optionsDe("Déplacer les sous-catégories vers")).toEqual([
      "Déplacer les sous-catégories vers Structure cible",
      "Déplacer les sous-catégories vers cat-inconnue",
    ])
  })

  it("garde les deux listes distinctes : la descendance reste une cible de Produit", async () => {
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={1}
        productCount={1}
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()

    expect(await optionsDe("Déplacer les produits vers")).toContain(
      "Déplacer les produits vers Structure enfant"
    )
    expect(await optionsDe("Déplacer les sous-catégories vers")).not.toContain(
      "Déplacer les sous-catégories vers Structure enfant"
    )
  })
})
