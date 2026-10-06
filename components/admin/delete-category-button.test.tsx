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

/**
 * La Structure **déjà cyclique** (#551) : un cycle qu'une Tierce partie a
 * refermé en base, et la Structure à supprimer accrochée à l'un de ses
 * maillons. La boîte est un rendu client — la seule surface qui n'a aucun
 * verdict à rendre —, donc elle traverse le cycle, reste bornée, et propose
 * quand même ses cibles (ADR-0030).
 */
const CYCLIQUE_A = "cat-cyclique-a"
const CYCLIQUE_B = "cat-cyclique-b"

const CATEGORIES_CYCLIQUES = [
  { id: SUPPRIMEE, name: "Structure à supprimer", parentId: CYCLIQUE_A },
  { id: ENFANT, name: "Structure enfant", parentId: SUPPRIMEE },
  { id: CIBLE, name: "Structure cible", parentId: null },
  { id: CYCLIQUE_A, name: "Structure cyclique A", parentId: CYCLIQUE_B },
  { id: CYCLIQUE_B, name: "Structure cyclique B", parentId: CYCLIQUE_A },
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

  // Le Produit sans Structure (ADR-0029) : la troisième issue, et la seule
  // des trois qui ne soit pas une cible.
  it("soumet l'orphelinat quand l'éditeur coche la case", async () => {
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
    await act(async () => {
      dialogue()!
        .querySelector<HTMLInputElement>('[data-slot="checkbox"]')!
        .click()
    })
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("orphanProducts")).toBe("on")
    // Aucune cible : l'orphelinat **est** l'absence de cible, et le formulaire
    // ne doit pas en porter une pour que le serveur ait quelque chose à lire.
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
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    // Le champ n'existe pas du tout : c'est le chemin du refus, et le serveur
    // n'a rien à reconnaître.
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
        categories={CATEGORIES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await choisirOption(
      "Déplacer les produits vers",
      "Déplacer les produits vers Structure cible"
    )
    // **Un seul choix à la fois.** Le serveur départagerait, mais une boîte qui
    // proposerait les deux à la fois laisserait croire qu'ils s'appliquent
    // ensemble.
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

  // La Structure déjà cyclique (#551). La boîte descendait l'arbre à la main ;
  // elle traverse désormais la Marche de la Structure, qui s'arrête sur toute
  // revisite. Elle garde ce qu'elle faisait : elle ne refuse rien.
  it("reste bornée sur une Structure cyclique, et propose quand même ses cibles", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { action } = actionQuiCapture<DeleteCategoryState>()
    rendu.render(
      <DeleteCategoryButton
        categoryId={SUPPRIMEE}
        categoryName="Structure à supprimer"
        childCount={1}
        productCount={1}
        categories={CATEGORIES_CYCLIQUES}
        action={action}
      />
    )

    await ouvrirDialogue()
    await act(async () => {
      declencheurDontLeLibelleEst("Déplacer les sous-catégories vers").click()
    })

    const options = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
    ].map((element) => element.textContent)

    // La coupe est la même qu'avant : ce qui descend de la Structure supprimée
    // ne peut pas l'accueillir — ici sa seule enfant.
    expect(options).not.toContain(
      "Déplacer les sous-catégories vers Structure enfant"
    )
    // Et la boîte **propose** : la cible saine, et jusqu'aux maillons du cycle.
    // Elle ne refuse rien — sur une chaîne cyclique, le refus n'appartient
    // qu'au serveur, et la cible reste donc offerte (ADR-0030).
    expect(options).toContain(
      "Déplacer les sous-catégories vers Structure cible"
    )
    expect(options).toContain(
      "Déplacer les sous-catégories vers Structure cyclique A"
    )

    // Une seule ligne pour tout le rendu : la marche est construite **une
    // fois**, non une fois par candidate — sinon le journal compterait les
    // cibles et le filtre coûterait un parcours par candidate (#551).
    expect(warn).toHaveBeenCalledTimes(1)
    const ligne = warn.mock.calls[0]!.join(" ")
    expect(ligne).toContain("Structure cyclique A")
    expect(ligne).toContain("Structure cyclique B")
  })
})
