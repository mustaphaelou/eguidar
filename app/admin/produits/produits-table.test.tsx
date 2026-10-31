// @vitest-environment happy-dom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import {
  ProduitsTable,
  type ProduitLotAction,
  type ProduitsTableActions,
} from "./produits-table"
import type {
  AdminProductsPage,
  FaitsProduitListe,
} from "@/lib/use-cases/admin-catalog"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function fait(
  id: string,
  nom: string,
  overrides: Partial<FaitsProduitListe> = {}
): FaitsProduitListe {
  return {
    id,
    name: nom,
    brand: "Marque",
    categoryName: "Structure",
    price: 10000,
    isFeatured: false,
    freeShipping: false,
    image: null,
    totalStock: 2,
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  }
}

function pageDe(
  produits: FaitsProduitListe[],
  pageCount = 2
): AdminProductsPage {
  return { produits, totalCount: 4, pageCount }
}

const PAGE_1 = pageDe([
  fait("produit-1", "Produit un"),
  fait("produit-2", "Produit deux"),
])
const PAGE_2 = pageDe([
  fait("produit-3", "Produit trois"),
  fait("produit-4", "Produit quatre"),
])

const ACTIONS_VIDES: ProduitsTableActions = {
  setStructure: async () => ({}),
  setFeatured: async () => ({}),
  setFreeShipping: async () => ({}),
  delete: async () => ({}),
  duplicate: async () => ({}),
}

const STRUCTURES = [{ id: "structure-1", chemin: "Racine › Structure" }]

let container: HTMLDivElement
let root: ReturnType<typeof createRoot> | null = null

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = null
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container.remove()
})

function rendre(
  page: AdminProductsPage,
  actions: ProduitsTableActions = ACTIONS_VIDES,
  params = {}
) {
  if (!root) {
    root = createRoot(container)
  }
  act(() => {
    root!.render(
      <ProduitsTable
        params={params}
        page={page}
        structures={STRUCTURES}
        sansStructureLabel="Sans Structure"
        actions={actions}
      />
    )
  })
}

async function cliquer(element: HTMLElement) {
  await act(async () => {
    element.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function casesACocher(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>('[data-slot="checkbox"]'),
  ]
}

function barreDeSelection(): HTMLElement {
  const texte = [...container.querySelectorAll<HTMLElement>("span")].find(
    (element) => element.textContent?.includes("sélectionné")
  )
  if (!texte?.parentElement) throw new Error("barre de sélection absente")
  return texte.parentElement
}

describe("ProduitsTable — la sélection et les gestes en lot", () => {
  it("garde la sélection par identifiant à travers un changement de page", async () => {
    rendre(PAGE_1)
    const coche = casesACocher()[1]!
    await cliquer(coche)

    expect(container.textContent).toContain("1 produit sélectionné")

    rendre(PAGE_2, ACTIONS_VIDES, { page: 2 })

    expect(container.textContent).toContain("1 produit sélectionné")
  })

  it("n'envoie que les identifiants sélectionnés, jamais les lignes rendues", async () => {
    const soumissions: FormData[] = []
    const capturer: ProduitLotAction = async (_state, formData) => {
      soumissions.push(formData)
      return { rapport: { succes: ["produit-1"], echecs: [] } }
    }
    const actions: ProduitsTableActions = {
      ...ACTIONS_VIDES,
      setFeatured: capturer,
    }

    rendre(PAGE_1, actions)
    await cliquer(casesACocher()[1]!)
    rendre(PAGE_2, actions, { page: 2 })

    const bouton = [
      ...barreDeSelection().querySelectorAll<HTMLButtonElement>("button"),
    ].find((candidat) => candidat.textContent === "Mettre en avant")
    if (!bouton) throw new Error("bouton « Mettre en avant » absent")
    await cliquer(bouton)

    expect(soumissions).toHaveLength(1)
    expect(JSON.parse(String(soumissions[0]!.get("ids")))).toEqual([
      "produit-1",
    ])
    expect(soumissions[0]!.get("valeur")).toBe("1")
  })

  it("affiche et annonce le rapport d'un échec partiel", async () => {
    const partiel: ProduitLotAction = async () => ({
      rapport: {
        succes: ["produit-1"],
        echecs: [{ id: "produit-absent", raison: "Produit introuvable" }],
      },
    })

    rendre(PAGE_1, { ...ACTIONS_VIDES, setFreeShipping: partiel })
    await cliquer(casesACocher()[1]!)

    const bouton = [
      ...barreDeSelection().querySelectorAll<HTMLButtonElement>("button"),
    ].find((candidat) => candidat.textContent === "Livraison offerte")
    if (!bouton) throw new Error("bouton « Livraison offerte » absent")
    await cliquer(bouton)

    const annonce = [
      ...container.querySelectorAll<HTMLElement>('[role="status"]'),
    ]
      .map((element) => element.textContent ?? "")
      .join(" ")
    expect(annonce).toContain("1 produit")
    expect(annonce).toContain("1 échec")
    expect(annonce).toContain("Produit introuvable")
  })

  it("n'offre ni prix ni stock en lot : seuls les quatre gestes et la désélection", async () => {
    rendre(PAGE_1)
    await cliquer(casesACocher()[1]!)

    const libelles = [
      ...barreDeSelection().querySelectorAll<HTMLButtonElement>("button"),
    ].map((bouton) => bouton.textContent)

    expect(libelles).toEqual([
      "Mettre en avant",
      "Livraison offerte",
      "Définir la Structure",
      "Supprimer",
      "Tout désélectionner",
    ])
    expect(libelles.some((libelle) => /prix|stock/i.test(libelle ?? ""))).toBe(
      false
    )
  })
})
