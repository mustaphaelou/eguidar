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
import type { SearchFilters, SearchSort } from "@/lib/search-params"

import {
  ActiveFilters,
  FilterSidebar,
  MobileFilterDrawer,
  SearchNavigationProvider,
} from "./search-filters"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const OPTIONS_DE_FILTRE: OptionsDeFiltre = {
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

const OPTIONS_DE_FILTRE_DIX_MARQUES: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  brands: NOMS_MARQUES.map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: false,
  })),
}

const OPTIONS_DE_FILTRE_DIX_MARQUES_RETENUE: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  brands: NOMS_MARQUES.map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: nom === "Juliett",
  })),
}

const OPTIONS_DE_FILTRE_DIX_CATEGORIES: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  categories: NOMS_MARQUES.map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: false,
  })),
}

const OPTIONS_DE_FILTRE_DOUZE_CATEGORIES_RETENUE: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  categories: [...NOMS_MARQUES, "Kilo", "Lima"].map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: nom === "Lima",
  })),
}

const FILTRES_ACTIFS: SearchFilters = {
  brand: ["acme", "beta"],
  categorySlug: "mobilier",
  priceBucketId: "0-1000",
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

function rendre(
  filters: SearchFilters,
  facets: OptionsDeFiltre,
  sort: SearchSort = "pertinence",
  page = 1
) {
  resetNavigation(page > 1 ? `/recherche?q=casque&page=${page}` : "/recherche")
  const element: ReactElement = (
    <SearchNavigationProvider
      query="casque"
      filters={filters}
      sort={sort}
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

function barreLaterale(): HTMLElement {
  return container.querySelector("aside")!
}

function enTetesDeGroupe(): HTMLElement[] {
  return [
    ...barreLaterale().querySelectorAll<HTMLElement>(
      '[data-slot="accordion-trigger"]'
    ),
  ]
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

function groupesDeFiltres(): HTMLElement[] {
  return [
    ...barreLaterale().querySelectorAll<HTMLElement>(
      '[data-slot="accordion-item"]'
    ),
  ]
}

function groupePortant(intitule: string): HTMLElement | null {
  return (
    groupesDeFiltres().find((groupe) =>
      groupe
        .querySelector('[data-slot="accordion-trigger"]')
        ?.textContent?.startsWith(intitule)
    ) ?? null
  )
}

function champsDeGroupe(): HTMLElement[] {
  return [
    ...barreLaterale().querySelectorAll<HTMLElement>('[data-slot="field-set"]'),
  ]
}

function controlesDuGroupe(intitule: string): HTMLElement[] {
  return [
    ...(groupePortant(intitule)?.querySelectorAll<HTMLElement>(
      '[role="checkbox"], [role="radio"]'
    ) ?? []),
  ]
}

function rolesDuGroupe(intitule: string): (string | null)[] {
  return controlesDuGroupe(intitule).map((controle) =>
    controle.getAttribute("role")
  )
}

function boutonVoirPlusDe(intitule: string): HTMLButtonElement | null {
  return (
    [...(groupePortant(intitule)?.querySelectorAll("button") ?? [])].find(
      (bouton) => bouton.textContent?.startsWith("Voir ")
    ) ?? null
  )
}

function filetsDeGroupe(): HTMLElement[] {
  return [
    ...barreLaterale().querySelectorAll<HTMLElement>('[data-slot="separator"]'),
  ]
}

function feuilleDeFiltres(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="drawer-content"]')
}

function corpsDefilant(): HTMLElement | null {
  return (
    feuilleDeFiltres()?.querySelector<HTMLElement>(
      '[class~="overflow-y-auto"]'
    ) ?? null
  )
}

async function ouvrirPanneau() {
  await act(async () => {
    declencheur()!.click()
  })
}

describe("FilterSidebar — groupes de contrôle", () => {
  it("rend chaque groupe comme un vrai groupe, sa légende réservée aux lecteurs d'écran", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    expect(
      champsDeGroupe().map(
        (champ) => champ.querySelector("legend")?.textContent
      )
    ).toEqual(["Marque", "Catégorie", "Tranche de prix"])
    for (const champ of champsDeGroupe()) {
      expect(champ.querySelector("legend")?.className.split(/\s+/)).toContain(
        "sr-only"
      )
    }
  })

  it("garde une case à cocher par Marque et un bouton radio par Catégorie et Prix", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    expect(rolesDuGroupe("Marque")).toEqual([
      "checkbox",
      "checkbox",
      "checkbox",
    ])
    expect(rolesDuGroupe("Catégorie")).toEqual(["radio", "radio"])
    expect(rolesDuGroupe("Prix")).toEqual(["radio", "radio"])
  })

  it("masque les contrôles à l'œil sans les retirer du groupe", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    for (const intitule of ["Marque", "Catégorie", "Prix"]) {
      const controles = controlesDuGroupe(intitule)
      expect(controles).not.toHaveLength(0)
      for (const controle of controles) {
        expect(controle.className.split(/\s+/)).toContain("sr-only")
      }
    }
  })
})

describe("FilterSidebar — liste de texte", () => {
  it("affiche le libellé et le compteur de chaque Option de filtre", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    expect(ligne("Acme")?.textContent).toContain("12")
    expect(ligne("Mobilier")?.textContent).toContain("9")
    expect(ligne("Moins de 1 000 MAD")?.textContent).toContain("5")
  })

  it("marque l'Option de filtre retenue et la garde visible malgré la troncature", () => {
    rendre({ brand: ["juliett"] }, OPTIONS_DE_FILTRE_DIX_MARQUES_RETENUE)

    const retenue = ligne("Juliett")
    expect(retenue).not.toBeNull()
    expect(
      retenue?.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("true")
  })

  it("tronque les Marques avec « Voir plus (n) » puis « Voir moins »", async () => {
    rendre({}, OPTIONS_DE_FILTRE_DIX_MARQUES)

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
    rendre({}, OPTIONS_DE_FILTRE_DIX_CATEGORIES)

    expect(ligne("India")).toBeNull()
    const bouton = boutonVoirPlus()
    expect(bouton?.textContent).toBe("Voir plus (2)")

    await act(async () => {
      bouton!.click()
    })

    expect(ligne("Juliett")).not.toBeNull()
  })

  it("garde visible une Catégorie retenue au-delà des huit premières", () => {
    rendre({ categorySlug: "lima" }, OPTIONS_DE_FILTRE_DOUZE_CATEGORIES_RETENUE)

    expect(ligne("India")).toBeNull()
    const retenue = ligne("Lima")
    expect(retenue).not.toBeNull()
    expect(
      retenue?.querySelector('[role="radio"]')?.getAttribute("aria-checked")
    ).toBe("true")
  })

  it("annonce le compte caché des Catégories et bascule aria-expanded", async () => {
    rendre({ categorySlug: "lima" }, OPTIONS_DE_FILTRE_DOUZE_CATEGORIES_RETENUE)

    expect(boutonVoirPlusDe("Catégorie")?.textContent).toBe("Voir plus (3)")
    expect(boutonVoirPlusDe("Catégorie")?.getAttribute("aria-expanded")).toBe(
      "false"
    )

    await act(async () => {
      boutonVoirPlusDe("Catégorie")!.click()
    })

    expect(ligne("India")).not.toBeNull()
    expect(ligne("Juliett")).not.toBeNull()
    expect(ligne("Kilo")).not.toBeNull()
    expect(boutonVoirPlusDe("Catégorie")?.textContent).toBe("Voir moins")
    expect(boutonVoirPlusDe("Catégorie")?.getAttribute("aria-expanded")).toBe(
      "true"
    )
  })

  it("n'affiche pas un groupe sans option", () => {
    rendre({}, { ...OPTIONS_DE_FILTRE, categories: [] })

    expect(container.textContent).toContain("Marque")
    expect(container.textContent).not.toContain("Catégorie")
  })

  it("écrit l'URL attendue au clic sur la ligne d'une Option de filtre", async () => {
    rendre({}, OPTIONS_DE_FILTRE)

    await act(async () => {
      ligne("Acme")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&marque=acme",
      undefined
    )
  })

  it("ramène à la page 1 et garde le tri au clic sur la ligne d'une Option de filtre", async () => {
    rendre({ brand: ["acme"] }, OPTIONS_DE_FILTRE, "prix-asc", 3)

    await act(async () => {
      ligne("Beta")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&marque=acme&marque=beta&tri=prix-asc",
      undefined
    )
  })
})

describe("FilterSidebar — groupes rendus et filets", () => {
  it("ne pose qu'un filet de moins que de groupes rendus", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    expect(enTetesDeGroupe()).toHaveLength(3)
    expect(filetsDeGroupe()).toHaveLength(enTetesDeGroupe().length - 1)
  })

  it("n'ajoute aucun filet pour un groupe disparu", () => {
    rendre({}, { ...OPTIONS_DE_FILTRE, categories: [] })

    expect(enTetesDeGroupe()).toHaveLength(2)
    expect(filetsDeGroupe()).toHaveLength(1)
  })
})

describe("FilterSidebar — en-têtes de groupe", () => {
  it("expose les trois en-têtes de groupe : Marque, Catégorie, Prix", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    expect(enTetesDeGroupe().map((enTete) => enTete.textContent)).toEqual([
      "Marque",
      "Catégorie",
      "Prix",
    ])
  })

  it("donne aux en-têtes de groupe le traitement petit et demi-gras de la page", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    for (const enTete of enTetesDeGroupe()) {
      const classes = enTete.className.split(/\s+/)
      expect(classes).toContain("text-xs")
      expect(classes).toContain("font-semibold")
    }
  })
})

describe("Filtres actifs", () => {
  it("retire une pastille et ramène à l'URL attendue", async () => {
    rendre({ brand: ["acme", "beta"] }, OPTIONS_DE_FILTRE)

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
      OPTIONS_DE_FILTRE
    )

    await act(async () => {
      boutonPortant("Tout effacer")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque",
      undefined
    )
  })

  it("retire la pastille d'une marque et garde les autres Filtres, page 1 et tri conservé", async () => {
    rendre(FILTRES_ACTIFS, OPTIONS_DE_FILTRE, "prix-asc", 3)

    await act(async () => {
      boutonNomme("Retirer la marque acme")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&marque=beta&categorie=mobilier&prix=0-1000&tri=prix-asc",
      undefined
    )
  })

  it("retire la pastille d'une Catégorie et garde les autres Filtres, page 1 et tri conservé", async () => {
    rendre(FILTRES_ACTIFS, OPTIONS_DE_FILTRE, "prix-asc", 3)

    await act(async () => {
      boutonNomme("Retirer la catégorie Mobilier")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&marque=acme&marque=beta&prix=0-1000&tri=prix-asc",
      undefined
    )
  })

  it("retire la pastille d'une Tranche de prix et garde les autres Filtres, page 1 et tri conservé", async () => {
    rendre(FILTRES_ACTIFS, OPTIONS_DE_FILTRE, "prix-asc", 3)

    await act(async () => {
      boutonNomme("Retirer la tranche de prix Moins de 1 000 MAD")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&marque=acme&marque=beta&categorie=mobilier&tri=prix-asc",
      undefined
    )
  })

  it("ramène à l'URL nue avec « Tout effacer », page 1 et tri conservé", async () => {
    rendre(FILTRES_ACTIFS, OPTIONS_DE_FILTRE, "prix-asc", 3)

    await act(async () => {
      boutonPortant("Tout effacer")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&tri=prix-asc",
      undefined
    )
  })
})

describe("Panneau mobile", () => {
  it("porte le nombre de Filtres de recherche actifs sur le déclencheur « Filtrer »", () => {
    rendre(
      { brand: ["acme", "beta"], categorySlug: "mobilier" },
      OPTIONS_DE_FILTRE
    )

    expect(declencheur()?.textContent).toContain("Filtrer")
    expect(declencheur()?.textContent).toContain("3")
  })

  it("annonce « Afficher les résultats (n) » dans le pied de la feuille", async () => {
    rendre({}, OPTIONS_DE_FILTRE)

    await act(async () => {
      declencheur()!.click()
    })

    const pied = document.querySelector('[data-slot="drawer-footer"]')
    expect(pied?.textContent).toContain("Afficher les résultats (42)")
  })

  it("range l'en-tête, le corps défilant et le pied dans cet ordre", async () => {
    rendre({}, OPTIONS_DE_FILTRE)
    await ouvrirPanneau()

    const feuille = feuilleDeFiltres()!
    const enfants = [...feuille.children]
    const enTete = feuille.querySelector<HTMLElement>(
      '[data-slot="drawer-header"]'
    )!
    const corps = corpsDefilant()!
    const pied = feuille.querySelector<HTMLElement>(
      '[data-slot="drawer-footer"]'
    )!

    expect(enTete.textContent).toContain("Filtrer")
    expect(enTete.querySelector('[data-slot="drawer-close"]')).not.toBeNull()
    expect(enfants).toContain(enTete)
    expect(enfants).toContain(corps)
    expect(enfants).toContain(pied)
    expect(enfants.indexOf(enTete)).toBeLessThan(enfants.indexOf(corps))
    expect(enfants.indexOf(corps)).toBeLessThan(enfants.indexOf(pied))
  })

  it("borne le corps dans une boîte défilante et tient le pied hors d'elle", async () => {
    rendre({}, OPTIONS_DE_FILTRE)
    await ouvrirPanneau()

    const corps = corpsDefilant()!
    const classes = corps.className.split(/\s+/)
    expect(classes).toContain("overflow-y-auto")
    expect(classes).toContain("min-h-0")
    expect(classes).toContain("flex-1")
    expect(
      corps.contains(
        feuilleDeFiltres()!.querySelector('[data-slot="drawer-header"]')
      )
    ).toBe(false)
    expect(
      corps.contains(
        feuilleDeFiltres()!.querySelector('[data-slot="drawer-footer"]')
      )
    ).toBe(false)
  })
})
