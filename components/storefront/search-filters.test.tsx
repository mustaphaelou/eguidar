// @vitest-environment happy-dom
import {
  mockNextNavigation,
  navigationSpies,
  resetNavigation,
} from "@/components/auth/test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => mockNextNavigation())

import type { OptionsDeFiltre } from "@/lib/options-de-filtre"
import type { SearchFilters } from "@/lib/search-params"

import {
  ActiveFilters,
  FilterSidebar,
  MobileFilterDrawer,
  SearchNavigationProvider,
} from "./search-filters"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const FACETTES: OptionsDeFiltre = {
  brands: [
    { value: "acme", label: "Acme", count: 12, selected: false },
    { value: "beta", label: "Beta", count: 7, selected: false },
    { value: "gamma", label: "Gamma", count: 3, selected: false },
  ],
  categories: [
    { value: "mobilier", label: "Mobilier", count: 9, selected: false },
    { value: "luminaires", label: "Luminaires", count: 4, selected: false },
  ],
  priceBuckets: [
    { value: "0-1000", label: "Moins de 1 000 MAD", count: 5, selected: false },
    {
      value: "1000-2500",
      label: "1 000 – 2 500 MAD",
      count: 2,
      selected: false,
    },
  ],
}

const NOMS_MARQUES = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliett",
]

const FACETTES_DIX_MARQUES: OptionsDeFiltre = {
  ...FACETTES,
  brands: NOMS_MARQUES.map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: false,
  })),
}

const FACETTES_DIX_MARQUES_RETENUE: OptionsDeFiltre = {
  ...FACETTES,
  brands: NOMS_MARQUES.map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: nom === "Juliett",
  })),
}

const FACETTES_DIX_CATEGORIES: OptionsDeFiltre = {
  ...FACETTES,
  categories: NOMS_MARQUES.map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: false,
  })),
}

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/recherche")
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function rendre(filters: SearchFilters, facets: OptionsDeFiltre) {
  const element: ReactElement = (
    <SearchNavigationProvider
      query="casque"
      filters={filters}
      sort="pertinence"
      hrefBase="/recherche"
    >
      <FilterSidebar facets={facets} />
      <ActiveFilters facets={facets} />
      <MobileFilterDrawer facets={facets} totalHits={42} />
    </SearchNavigationProvider>
  )
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function ligne(libelle: string): HTMLElement | null {
  return (
    [...container.querySelectorAll("label")].find((element) =>
      element.textContent?.includes(libelle)
    ) ?? null
  )
}

function boutonVoirPlus(): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll("button")].find((bouton) =>
      bouton.textContent?.startsWith("Voir ")
    ) ?? null
  )
}

function declencheur(): HTMLElement | null {
  return container.querySelector('[data-slot="drawer-trigger"]')
}

function boutonNomme(nom: string): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll("button")].find(
      (bouton) => bouton.getAttribute("aria-label") === nom
    ) ?? null
  )
}

function boutonPortant(texte: string): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll("button")].find((bouton) =>
      bouton.textContent?.includes(texte)
    ) ?? null
  )
}

describe("FilterSidebar — liste de texte", () => {
  it("affiche le libellé et le compteur de chaque Option de filtre", () => {
    rendre({}, FACETTES)

    expect(ligne("Acme")?.textContent).toContain("12")
    expect(ligne("Mobilier")?.textContent).toContain("9")
    expect(ligne("Moins de 1 000 MAD")?.textContent).toContain("5")
  })

  it("marque l'Option de filtre retenue et la garde visible malgré la troncature", () => {
    rendre({ brand: ["juliett"] }, FACETTES_DIX_MARQUES_RETENUE)

    const retenue = ligne("Juliett")
    expect(retenue).not.toBeNull()
    expect(
      retenue?.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("true")
  })

  it("tronque les Marques avec « Voir plus (n) » puis « Voir moins »", async () => {
    rendre({}, FACETTES_DIX_MARQUES)

    expect(ligne("India")).toBeNull()
    const bouton = boutonVoirPlus()
    expect(bouton?.textContent).toBe("Voir plus (2)")
    expect(bouton?.getAttribute("aria-expanded")).toBe("false")

    await act(async () => {
      bouton!.click()
    })

    expect(ligne("India")).not.toBeNull()
    expect(ligne("Juliett")).not.toBeNull()
    expect(boutonVoirPlus()?.textContent).toBe("Voir moins")
    expect(boutonVoirPlus()?.getAttribute("aria-expanded")).toBe("true")
  })

  it("tronque les Catégories comme les Marques", async () => {
    rendre({}, FACETTES_DIX_CATEGORIES)

    expect(ligne("India")).toBeNull()
    const bouton = boutonVoirPlus()
    expect(bouton?.textContent).toBe("Voir plus (2)")

    await act(async () => {
      bouton!.click()
    })

    expect(ligne("Juliett")).not.toBeNull()
  })

  it("n'affiche pas un groupe sans option", () => {
    rendre({}, { ...FACETTES, categories: [] })

    expect(container.textContent).toContain("Marque")
    expect(container.textContent).not.toContain("Catégorie")
  })

  it("écrit l'URL attendue au clic sur la ligne d'une Option de filtre", async () => {
    rendre({}, FACETTES)

    await act(async () => {
      ligne("Acme")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&marque=acme",
      undefined
    )
  })
})

describe("Filtres actifs", () => {
  it("retire une pastille et ramène à l'URL attendue", async () => {
    rendre({ brand: ["acme", "beta"] }, FACETTES)

    await act(async () => {
      boutonNomme("Retirer la marque acme")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&marque=beta",
      undefined
    )
  })

  it("ramène à l'URL nue avec « Tout effacer »", async () => {
    rendre(
      { brand: ["acme"], categorySlug: "mobilier", priceBucketId: "0-1000" },
      FACETTES
    )

    await act(async () => {
      boutonPortant("Tout effacer")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque",
      undefined
    )
  })
})

describe("Panneau mobile", () => {
  it("porte le nombre de Filtres de recherche actifs sur le déclencheur « Filtrer »", () => {
    rendre({ brand: ["acme", "beta"], categorySlug: "mobilier" }, FACETTES)

    expect(declencheur()?.textContent).toContain("Filtrer")
    expect(declencheur()?.textContent).toContain("3")
  })

  it("annonce « Afficher les résultats (n) » dans le pied de la feuille", async () => {
    rendre({}, FACETTES)

    await act(async () => {
      declencheur()!.click()
    })

    const pied = document.querySelector('[data-slot="drawer-footer"]')
    expect(pied?.textContent).toContain("Afficher les résultats (42)")
  })
})
