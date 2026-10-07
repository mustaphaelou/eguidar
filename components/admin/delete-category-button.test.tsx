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

/**
 * **Ce que la boîte reçoit désormais, et ce qu'elle ne calcule plus** (#573,
 * ADR-0030). Avant, elle prenait les rangées de la table et bâtissait sa marche à
 * chaque rendu pour décider quelles Structures pouvaient accueillir ses
 * sous-catégories — une règle de domaine dans un composant `"use client"`, que la
 * prochaine surface qui en aurait besoin réécrirait (US 39). Elle prend donc les
 * deux listes de cibles et la table des noms, en données ordinaires, et rend.
 *
 * **Les fixtures sont des faits, pas une table à parcourir.** Elles disent ce que
 * le serveur a calculé — y compris l'écart entre les deux listes, qui est le fait
 * que la boîte affichera — et jamais comment il l'a calculé : la règle elle-même
 * se prouve dans `lib/marche-structure-partition.test.ts`, sur les mêmes
 * littéraux, sans rendu et sans base. Cette suite dit donc deux choses seulement,
 * et elles ne se recouvrent pas : que la boîte **rend les props qu'elle a
 * reçues**, et qu'elle rend **les deux causes que le glossaire nomme** avant
 * tout clic (US 41).
 */

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

/**
 * Les libellés des options d'un sélecteur, une fois ouvert. On choisit le
 * sélecteur par son étiquette — ce que l'éditeur lit — et non par sa position : la
 * boîte en porte deux, et leurs libellés ne se distinguent qu'à la fin de la
 * phrase (« … sous-catégories », « … produits »).
 */
async function optionsDe(libelleDuSelect: string): Promise<string[]> {
  await act(async () => {
    declencheurDontLeLibelleEst(libelleDuSelect).click()
  })
  return [
    ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
  ].map((element) => element.textContent ?? "")
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

/**
 * Les cibles de la Structure à supprimer, telles que le serveur les calcule pour
 * un arbre sain où `ENFANT` est sa seule descendante. **Les deux listes ne se
 * ressemblent pas, et c'est le fait central** : un Produit part vers n'importe
 * quelle Structure, descendantes comprises (US 16) ; une sous-catégorie ne peut
 * partir que vers ce qui ne descend pas de la Structure supprimée, sous peine de
 * refermer la boucle sur elle-même (US 15).
 */
const CIBLES_SAINES = {
  ciblesProduits: [CIBLE, ENFANT],
  ciblesSousCategories: [CIBLE],
  nomsStructures: {
    [SUPPRIMEE]: "Structure à supprimer",
    [CIBLE]: "Structure cible",
    [ENFANT]: "Structure enfant",
  },
} as const

/**
 * Les mêmes cibles, pour la Structure **déjà cyclique** que #551 a rendue
 * concevable : un cycle qu'une Tierce partie a refermé en base, et la Structure à
 * supprimer accrochée à l'un de ses maillons. Les deux listes y contiennent les
 * maillons du cycle — **c'est le serveur seul qui refuse**, et la boîte propose
 * donc quand même (ADR-0030, US 17). Le fait qu'elle ne doive plus traverser le
 * cycle pour le dire se prouve autrement : sa suite n'a plus de marche à boredom.
 */
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
        {...CIBLES_SAINES}
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
        {...CIBLES_SAINES}
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
        {...CIBLES_SAINES}
        action={action}
      />
    )

    await ouvrirDialogue()
    const optionsSousCategories = await optionsDe(
      "Déplacer les sous-catégories vers"
    )

    // Rattacher une Structure à l'une de ses descendantes refermerait la boucle
    // sur elle-même : la liste des sous-catégories ne contient donc pas `ENFANT`,
    // et la boîte ne l'offre pas. **La règle n'est pas ici** — la liste reçue ne
    // la porte pas, elle ne fait que la rendre — mais l'absence se voit, et c'est
    // ce qu'un éditeur voit : la cible qui manquait doit manquer.
    expect(optionsSousCategories).toContain(
      "Déplacer les sous-catégories vers Structure cible"
    )
    expect(optionsSousCategories).not.toContain(
      "Déplacer les sous-catégories vers Structure enfant"
    )
    // Et la liste des Produits, elle, garde la descendante : les deux listes ne se
    // ressemblent pas, et c'est le seul endroit du dépôt où la différence se voit
    // sans calcul (US 16).
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
        {...CIBLES_SAINES}
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
        {...CIBLES_SAINES}
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
    // « Bloquer — produits rattachés » reste lisible tant qu'aucune cible n'est
    // choisie : l'absence de cible ne doit pas laisser le sélecteur vide.
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

  // La Structure déjà cyclique (#551, ADR-0030). La boîte rend ce qu'elle a reçu,
  // et les listes reçues ici contiennent les maillons du cycle : elle ne refuse
  // rien, parce que le refus n'appartient qu'au serveur.
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

      // La liste des sous-catégories ne propose pas la descendante — ici sa seule
      // enfant, qui est aussi la seule chose que l'exclusion retire.
      expect(optionsSousCategories).not.toContain(
        "Déplacer les sous-catégories vers Structure enfant"
      )
      // Et la boîte **propose** : la cible saine, et jusqu'aux maillons du cycle.
      // Elle ne refuse rien — sur une chaîne cyclique, le refus n'appartient qu'au
      // serveur, et la cible reste donc offerte (ADR-0030, US 17).
      expect(optionsSousCategories).toEqual(
        expect.arrayContaining([
          "Déplacer les sous-catégories vers Structure cible",
          "Déplacer les sous-catégories vers Structure cyclique A",
          "Déplacer les sous-catégories vers Structure cyclique B",
        ])
      )

      // **Plus aucune ligne de journal, et c'est la preuve que la règle a quitté la
      // boîte** (#573). Avant, elle bâtissait une marche par rendu et le cycle se
      // nommait ici — une fois, mais ici, dans le navigateur d'un éditeur qui n'a
      // aucun écran de réparation à faire. Le cycle se nomme sur la liste
      // d'Administration, qui le rend visible d'un être humain (ADR-0030), et la
      // boîte n'a plus de quoi le voir : elle ne rend plus que des listes reçues.
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("DeleteCategoryButton — ce qui franchit la couture", () => {
  it("n'offre qu'une cible reçue, et la nomme par la table des noms", async () => {
    // **Ce que la suite peut prouver, et où s'arrête.** La règle « ce qui descend
    // ne peut pas accueillir une sous-catégorie » n'est plus ici : elle est dans le
    // cœur pur, sur des littéraux et sans rendu
    // (`lib/marche-structure-partition.test.ts`). Ce qui reste à prouver ici est
    // que la boîte rend **exactement** les listes qu'elle reçoit, dans l'ordre
    // reçu, et qu'elle nomme chaque cible par la table qu'on lui a donnée (US 18).
    // Une fixture qui contiene elle-même la descendante le montre : la boîte ne la
    // retirerait pas.
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

    // La descendante est là, parce qu'elle est dans la liste reçue : la boîte ne
    // filtre rien, elle rend. Et l'ordre reçu est l'ordre rendu — le tri est la
    // promesse du module qui a produit les listes, pas de la boîte.
    expect(options).toEqual([
      "Déplacer les sous-catégories vers Structure cible",
      "Déplacer les sous-catégories vers Structure cyclique A",
      "Déplacer les sous-catégories vers Structure cyclique B",
      "Déplacer les sous-catégories vers Structure enfant",
    ])
  })

  it("se rabat sur l'identifiant quand la table des noms ne porte pas la cible", async () => {
    // Un `cuid` se lit mal, mais il est vrai : la boîte n'a pas à inventer un nom
    // qu'aucune lecture ne lui a donné. Le repli est celui du journal de la marche,
    // et il est dit ici pour qu'un nom vide ne s'affiche jamais.
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
    // La différence entre les deux listes est le fait que la spec énonce par deux
    // histoires d'éditeur (US 15, US 16) : un Produit n'a pas d'accusé de réception,
    // une sous-catégorie en a un. Les voir côte à côte dans le même rendu est ce
    // qui les empêche de se confondre.
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
