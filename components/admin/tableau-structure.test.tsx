// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import { intentionsDeDeplacement } from "@/app/admin/categories/intentions-de-deplacement"
import {
  TableauStructure,
  type CibleSuppressionVue,
} from "@/components/admin/tableau-structure"
import type {
  DeplacementState,
  DestinationStructure,
  LigneStructureVue,
} from "@/components/admin/deplacement-structure"
import { monterFormulaire } from "@/test/rendu-formulaire"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

vi.mock("@/components/admin/delete-category-button", () => ({
  DeleteCategoryButton: ({ categoryId }: { categoryId: string }) => (
    <span data-testid="bouton-suppression" data-structure={categoryId} />
  ),
}))

const LIGNES: LigneStructureVue[] = [
  {
    id: "chaussures",
    name: "Chaussures",
    slug: "chaussures",
    image: null,
    parentId: null,
    profondeur: 0,
    position: 1,
    nombreFreres: 2,
    nombreProduits: 0,
    nombreProduitsCumules: 3,
    nombreEnfants: 3,
    horsArbre: false,
    chemin: [{ name: "Chaussures", slug: "chaussures" }],
  },
  {
    id: "bottes",
    name: "Bottes",
    slug: "bottes",
    image: null,
    parentId: "chaussures",
    profondeur: 1,
    position: 1,
    nombreFreres: 3,
    nombreProduits: 0,
    nombreProduitsCumules: 1,
    nombreEnfants: 1,
    horsArbre: false,
    chemin: [
      { name: "Chaussures", slug: "chaussures" },
      { name: "Bottes", slug: "bottes" },
    ],
  },
  {
    id: "cuir",
    name: "Cuir",
    slug: "cuir",
    image: null,
    parentId: "bottes",
    profondeur: 2,
    position: 1,
    nombreFreres: 1,
    nombreProduits: 1,
    nombreProduitsCumules: 1,
    nombreEnfants: 0,
    horsArbre: false,
    chemin: [
      { name: "Chaussures", slug: "chaussures" },
      { name: "Bottes", slug: "bottes" },
      { name: "Cuir", slug: "cuir" },
    ],
  },
  {
    id: "sandales",
    name: "Sandales",
    slug: "sandales",
    image: null,
    parentId: "chaussures",
    profondeur: 1,
    position: 2,
    nombreFreres: 3,
    nombreProduits: 1,
    nombreProduitsCumules: 1,
    nombreEnfants: 0,
    horsArbre: false,
    chemin: [
      { name: "Chaussures", slug: "chaussures" },
      { name: "Sandales", slug: "sandales" },
    ],
  },
  {
    id: "baskets",
    name: "Baskets",
    slug: "baskets",
    image: null,
    parentId: "chaussures",
    profondeur: 1,
    position: 3,
    nombreFreres: 3,
    nombreProduits: 1,
    nombreProduitsCumules: 1,
    nombreEnfants: 0,
    horsArbre: false,
    chemin: [
      { name: "Chaussures", slug: "chaussures" },
      { name: "Baskets", slug: "baskets" },
    ],
  },
  {
    id: "accessoires",
    name: "Accessoires",
    slug: "accessoires",
    image: null,
    parentId: null,
    profondeur: 0,
    position: 2,
    nombreFreres: 2,
    nombreProduits: 0,
    nombreProduitsCumules: 0,
    nombreEnfants: 0,
    horsArbre: false,
    chemin: [{ name: "Accessoires", slug: "accessoires" }],
  },
  {
    id: "ancienne",
    name: "Ancienne",
    slug: "ancienne",
    image: null,
    parentId: "fantome",
    profondeur: 0,
    position: 1,
    nombreFreres: 1,
    nombreProduits: 0,
    nombreProduitsCumules: 0,
    nombreEnfants: 0,
    horsArbre: true,
    chemin: [{ name: "Ancienne", slug: "ancienne" }],
  },
]

const INTENTIONS = Object.fromEntries(intentionsDeDeplacement(LIGNES))
const DESTINATIONS: DestinationStructure[] = LIGNES.map((ligne) => ({
  id: ligne.id,
  libelle: ligne.chemin.map((maillon) => maillon.name).join(" / "),
}))
const CIBLES: Record<string, CibleSuppressionVue> = Object.fromEntries(
  LIGNES.map((ligne) => [ligne.id, { produits: [], sousCategories: [] }])
)
const NOMS = Object.fromEntries(LIGNES.map((ligne) => [ligne.id, ligne.name]))

const rendu = monterFormulaire()

function boutonParEtiquette(etiquette: string): HTMLButtonElement {
  const bouton = [
    ...rendu.container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((candidate) => candidate.getAttribute("aria-label") === etiquette)
  if (!bouton) throw new Error(`bouton absent : « ${etiquette} »`)
  return bouton
}

async function cliquer(bouton: HTMLElement): Promise<void> {
  await act(async () => {
    bouton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function dialogue(): HTMLElement {
  const boite = document.querySelector<HTMLElement>(
    '[data-slot="dialog-content"]'
  )
  if (!boite) throw new Error("boîte de dialogue absente")
  return boite
}

async function rechercher(valeur: string): Promise<void> {
  const champ = rendu.container.querySelector<HTMLInputElement>(
    'input[type="search"]'
  )
  if (!champ) throw new Error("champ de recherche absent")
  const ecrire = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!
  await act(async () => {
    ecrire.call(champ, valeur)
    champ.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function actionQuiRend(etat: DeplacementState) {
  const soumissions: FormData[] = []
  const action = vi.fn(
    async (_precedent: DeplacementState, formData: FormData) => {
      soumissions.push(formData)
      return etat
    }
  )
  return { action, soumissions }
}

function rendre(etat: DeplacementState = {}) {
  const { action, soumissions } = actionQuiRend(etat)
  const { action: actionSuppression } = actionQuiRend({})
  rendu.render(
    <TableauStructure
      lignes={LIGNES}
      intentions={INTENTIONS}
      destinations={DESTINATIONS}
      cibles={CIBLES}
      nomsStructures={NOMS}
      actionSuppression={actionSuppression}
      actionDeplacement={action}
    />
  )
  return soumissions
}

describe("TableauStructure — replier, chercher, déplacer sans jamais calculer l'ordre", () => {
  it("replie une branche et la déplie sans perdre la ligne de la parente", async () => {
    rendre()

    expect(rendu.container.textContent).toContain("Cuir")
    await cliquer(boutonParEtiquette("Réduire Chaussures"))
    expect(rendu.container.textContent).not.toContain("Cuir")
    expect(rendu.container.textContent).not.toContain("Bottes")
    expect(rendu.container.textContent).toContain("Chaussures")

    await cliquer(boutonParEtiquette("Développer Chaussures"))
    expect(rendu.container.textContent).toContain("Cuir")
    expect(rendu.container.textContent).toContain("Bottes")
  })

  it("cherche en gardant visibles les ancêtres de la ligne trouvée, même repliés", async () => {
    rendre()
    await cliquer(boutonParEtiquette("Réduire Chaussures"))

    await rechercher("cuir")

    expect(rendu.container.textContent).toContain("Cuir")
    expect(rendu.container.textContent).toContain("Bottes")
    expect(rendu.container.textContent).toContain("Chaussures")
    expect(rendu.container.textContent).not.toContain("Sandales")

    await rechercher("")
    expect(rendu.container.textContent).not.toContain("Cuir")
  })

  it("ne montre aucun arbre ARIA de grille ni de glisser-déposer", () => {
    rendre()

    expect(rendu.container.querySelector('[role="treegrid"]')).toBeNull()
    expect(rendu.container.querySelector('[draggable="true"]')).toBeNull()
  })

  it("donne à chaque geste un bouton natif de 24 px, nommé par la ligne", () => {
    rendre()

    const gestes = ["Monter", "Descendre", "Indenter", "Désindenter"]
    for (const geste of gestes) {
      const bouton = boutonParEtiquette(`${geste} Sandales`)
      expect(bouton.tagName).toBe("BUTTON")
      expect(bouton.className).toContain("size-6")
      expect(bouton.getAttribute("aria-label")).toBe(`${geste} Sandales`)
      bouton.focus()
      expect(document.activeElement).toBe(bouton)
    }
  })

  it("n'envoie qu'une intention : jamais de position, jamais une fratrie", async () => {
    const soumissions = rendre()
    const bouton = boutonParEtiquette("Monter Sandales")
    bouton.focus()
    const formulaire = bouton.closest("form")
    if (!formulaire) throw new Error("formulaire du geste absent")

    await rendu.soumettre(formulaire)

    expect(soumissions).toHaveLength(1)
    const envoye = soumissions[0]!
    expect([...envoye.keys()].sort()).toEqual([
      "avantId",
      "categoryId",
      "nouvelleParenteId",
    ])
    expect(envoye.get("categoryId")).toBe("sandales")
    expect(envoye.get("nouvelleParenteId")).toBe("chaussures")
    expect(envoye.get("avantId")).toBe("bottes")
    expect(envoye.get("position")).toBeNull()
  })

  it("annonce le résultat dans une seule région polie, sans voler le focus", async () => {
    const soumissions = rendre({
      message: "Déplacée sous Chaussures, position 1 sur 3",
    })
    const bouton = boutonParEtiquette("Monter Sandales")
    bouton.focus()

    await rendu.soumettre(bouton.closest("form")!)

    const regions = rendu.container.querySelectorAll<HTMLElement>(
      '[role="status"][aria-live="polite"]'
    )
    expect(regions).toHaveLength(1)
    expect(regions[0]!.textContent).toContain(
      "Déplacée sous Chaussures, position 1 sur 3"
    )
    expect(document.activeElement).toBe(bouton)
    expect(soumissions).toHaveLength(1)
  })

  it("propose les destinations par leur chemin complet, et pas la ligne elle-même", async () => {
    rendre()
    await cliquer(
      boutonParEtiquette("Déplacer Sandales sous une autre Structure")
    )
    await cliquer(
      dialogue().querySelector<HTMLElement>(
        'button[aria-label="Ouvrir la liste des destinations"]'
      )!
    )

    const libelles = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].map((element) => element.textContent)
    expect(libelles).toContain("Chaussures / Bottes / Cuir")
    expect(libelles).toContain("Chaussures / Baskets")
    expect(libelles).not.toContain("Sandales")
    expect(libelles).not.toContain("Chaussures / Sandales")
  })

  it("offre « Rattacher… » à une Structure hors arbre, et rend le refus qui nomme l'arête", async () => {
    const refus =
      "Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle (Cycle A → Cycle B → Cycle A) ; l'arête « Cycle B → Cycle A » le ferme"
    const soumissions = rendre({ error: refus })

    const bouton = boutonParEtiquette("Rattacher Ancienne")
    expect(bouton.textContent).toContain("Rattacher…")
    await cliquer(bouton)
    await cliquer(
      dialogue().querySelector<HTMLElement>(
        'button[aria-label="Ouvrir la liste des destinations"]'
      )!
    )
    await cliquer(
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-slot="combobox-item"]'
        ),
      ].find((element) => element.textContent === "Chaussures")!
    )
    await rendu.soumettre(dialogue().querySelector("form")!)

    expect(soumissions[0]!.get("categoryId")).toBe("ancienne")
    expect(soumissions[0]!.get("nouvelleParenteId")).toBe("chaussures")
    expect(soumissions[0]!.get("avantId")).toBe("")
    expect(rendu.container.textContent).toContain("l'arête")
    expect(rendu.container.textContent).toContain("Cycle B → Cycle A")
    expect(
      rendu.container.querySelectorAll('[role="status"][aria-live="polite"]')
    ).toHaveLength(1)
  })

  it("montre la position et le niveau dans la ligne, et les produits directs et cumulés", () => {
    rendre()

    const ligneCuir = rendu.container.querySelector<HTMLElement>(
      '[data-structure="cuir"]'
    )!
    expect(ligneCuir.dataset.position).toBe("1")
    expect(ligneCuir.dataset.niveau).toBe("2")
    expect(ligneCuir.textContent).toContain("Niveau 3, position 1 sur 1")
    expect(ligneCuir.textContent).toContain("1 direct")
    expect(ligneCuir.textContent).toContain("1 au total")

    const ligneChaussures = rendu.container.querySelector<HTMLElement>(
      '[data-structure="chaussures"]'
    )!
    expect(ligneChaussures.textContent).toContain("0 direct")
    expect(ligneChaussures.textContent).toContain("3 au total")
    expect(ligneChaussures.textContent).toContain("1 sur 2")
  })
})
