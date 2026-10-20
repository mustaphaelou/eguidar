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

import type {
  FiltreActif,
  OptionDeFiltre,
  OptionsDeFiltre,
} from "@/lib/use-cases/search"
import {
  buildSearchHref,
  SEARCH_SORT_DEFAULT,
  type SearchFilters,
  type SearchView,
} from "@/lib/search-params"

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

const NOMS_D_OPTIONS = [
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

function optionsNommees(noms: string[], retenue?: string): OptionDeFiltre[] {
  return noms.map((nom) => ({
    value: nom.toLowerCase(),
    label: nom,
    count: 2,
    selected: nom === retenue,
  }))
}

const OPTIONS_DE_FILTRE_DIX_MARQUES: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  brands: optionsNommees(NOMS_D_OPTIONS),
}

const OPTIONS_DE_FILTRE_DIX_MARQUES_RETENUE: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  brands: optionsNommees(NOMS_D_OPTIONS, "Juliett"),
}

const OPTIONS_DE_FILTRE_DIX_CATEGORIES: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  categories: optionsNommees(NOMS_D_OPTIONS),
}

const OPTIONS_DE_FILTRE_DOUZE_CATEGORIES_RETENUE: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  categories: optionsNommees([...NOMS_D_OPTIONS, "Kilo", "Lima"], "Lima"),
}

const OPTIONS_DE_FILTRE_CATEGORIES_A_ZERO: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  categories: [
    { value: "mobilier", label: "Mobilier", count: 0, selected: false },
    { value: "luminaires", label: "Luminaires", count: 0, selected: false },
  ],
}

const OPTIONS_DE_FILTRE_CATEGORIE_RETENUE_A_ZERO: OptionsDeFiltre = {
  ...OPTIONS_DE_FILTRE,
  categories: [
    { value: "mobilier", label: "Mobilier", count: 0, selected: true },
    { value: "luminaires", label: "Luminaires", count: 0, selected: false },
  ],
}

const FILTRES_ACTIFS: SearchFilters = {
  brand: ["acme", "beta"],
  categorySlug: "mobilier",
  priceBucketId: "0-1000",
}

const PUCES_ACTIVES: readonly FiltreActif[] = [
  {
    cle: "brand",
    valeur: "acme",
    label: "Acme",
    ariaLabel: "Retirer la marque acme",
  },
  {
    cle: "brand",
    valeur: "beta",
    label: "Beta",
    ariaLabel: "Retirer la marque beta",
  },
  {
    cle: "categorySlug",
    valeur: "mobilier",
    label: "Mobilier",
    ariaLabel: "Retirer la catégorie Mobilier",
  },
  {
    cle: "priceBucketId",
    valeur: "0-1000",
    label: "Moins de 1 000 MAD",
    ariaLabel: "Retirer la tranche de prix Moins de 1 000 MAD",
  },
]

const VUE_EN_PAGE_TROIS: SearchView = { sort: "prix-asc", page: 3 }

const RETRAITS_DE_PASTILLE = [
  {
    pastille: "la marque acme",
    libelle: "Retirer la marque acme",
    url: "/recherche?q=casque&marque=beta&categorie=mobilier&prix=0-1000&tri=prix-asc",
  },
  {
    pastille: "la catégorie Mobilier",
    libelle: "Retirer la catégorie Mobilier",
    url: "/recherche?q=casque&marque=acme&marque=beta&prix=0-1000&tri=prix-asc",
  },
  {
    pastille: "la tranche de prix Moins de 1 000 MAD",
    libelle: "Retirer la tranche de prix Moins de 1 000 MAD",
    url: "/recherche?q=casque&marque=acme&marque=beta&categorie=mobilier&tri=prix-asc",
  },
]

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
  options: OptionsDeFiltre,
  view: SearchView = {},
  filtresActifs: readonly FiltreActif[] = []
) {
  resetNavigation(buildSearchHref("casque", filters, {}, view))
  const element: ReactElement = (
    <SearchNavigationProvider
      query="casque"
      filters={filters}
      sort={view.sort ?? SEARCH_SORT_DEFAULT}
      hrefBase="/recherche"
    >
      <FilterSidebar facets={options} />
      <ActiveFilters filtresActifs={filtresActifs} />
      <MobileFilterDrawer facets={options} totalHits={42} />
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

function boutonVoirPlus(intitule?: string): HTMLButtonElement | null {
  const racine = intitule ? groupePortant(intitule) : barreLaterale()
  return (
    [...(racine?.querySelectorAll("button") ?? [])].find((bouton) =>
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

function pastilles(): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>('[aria-label^="Retirer "]'),
  ]
}

function controlePortant(texte: string): HTMLElement | null {
  return (
    [...container.querySelectorAll<HTMLElement>("a, button")].find((controle) =>
      controle.textContent?.includes(texte)
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

function filetsDeGroupe(): HTMLElement[] {
  return [
    ...barreLaterale().querySelectorAll<HTMLElement>('[data-slot="separator"]'),
  ]
}

function feuilleDeFiltres(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="drawer-content"]')
}

function boiteDeLaFeuille(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="drawer-popup"]')
}

function corpsDeLaFeuille(): HTMLElement | null {
  const feuille = feuilleDeFiltres()
  const enTete = feuille?.querySelector<HTMLElement>(
    '[data-slot="drawer-header"]'
  )
  const pied = feuille?.querySelector<HTMLElement>(
    '[data-slot="drawer-footer"]'
  )
  if (!feuille || !enTete || !pied) return null
  const enfants = [...feuille.children]
  const entre = enfants.slice(
    enfants.indexOf(enTete) + 1,
    enfants.indexOf(pied)
  )
  return entre.length === 1 ? (entre[0] as HTMLElement) : null
}

function cocheDeLigne(option: HTMLElement): Element | null {
  return (
    [...option.children].find(
      (enfant) => enfant.tagName.toLowerCase() === "svg"
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

    expect(
      controlesDuGroupe("Marque").map((controle) =>
        controle.getAttribute("role")
      )
    ).toEqual(["checkbox", "checkbox", "checkbox"])
    expect(
      controlesDuGroupe("Catégorie").map((controle) =>
        controle.getAttribute("role")
      )
    ).toEqual(["radio", "radio"])
    expect(
      controlesDuGroupe("Prix").map((controle) => controle.getAttribute("role"))
    ).toEqual(["radio", "radio"])
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

  it("n'accorde le demi-gras et la coche qu'à l'Option retenue", () => {
    rendre({ brand: ["juliett"] }, OPTIONS_DE_FILTRE_DIX_MARQUES_RETENUE)

    const retenue = ligne("Juliett")!
    expect(retenue.querySelector("[data-checked]")).not.toBeNull()
    expect(retenue.className.split(/\s+/)).toContain(
      "has-data-checked:font-semibold"
    )

    const coche = cocheDeLigne(retenue)!
    const classesDeLaCoche = (coche.getAttribute("class") ?? "").split(/\s+/)
    expect(classesDeLaCoche).toContain("hidden")
    expect(classesDeLaCoche).toContain("group-has-data-checked/option:block")

    expect(ligne("Alpha")?.querySelector("[data-checked]")).toBeNull()
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

    expect(boutonVoirPlus("Catégorie")?.textContent).toBe("Voir plus (3)")
    expect(boutonVoirPlus("Catégorie")?.getAttribute("aria-expanded")).toBe(
      "false"
    )

    await act(async () => {
      boutonVoirPlus("Catégorie")!.click()
    })

    expect(ligne("India")).not.toBeNull()
    expect(ligne("Juliett")).not.toBeNull()
    expect(ligne("Kilo")).not.toBeNull()
    expect(boutonVoirPlus("Catégorie")?.textContent).toBe("Voir moins")
    expect(boutonVoirPlus("Catégorie")?.getAttribute("aria-expanded")).toBe(
      "true"
    )
  })

  it("n'affiche pas un groupe sans option", () => {
    rendre({}, { ...OPTIONS_DE_FILTRE, categories: [] })

    expect(container.textContent).toContain("Marque")
    expect(container.textContent).not.toContain("Catégorie")
  })

  it("n'affiche pas un groupe dont toutes les Options sont à zéro et non retenues", () => {
    rendre({}, OPTIONS_DE_FILTRE_CATEGORIES_A_ZERO)

    expect(container.textContent).toContain("Marque")
    expect(container.textContent).not.toContain("Catégorie")
    expect(ligne("Mobilier")).toBeNull()
  })

  it("garde le groupe et la ligne d'une Option à zéro retenue", () => {
    rendre(
      { categorySlug: "mobilier" },
      OPTIONS_DE_FILTRE_CATEGORIE_RETENUE_A_ZERO
    )

    expect(groupePortant("Catégorie")).not.toBeNull()
    expect(ligne("Mobilier")?.textContent).toContain("0")
    expect(ligne("Luminaires")).toBeNull()
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
    rendre({ brand: ["acme"] }, OPTIONS_DE_FILTRE, VUE_EN_PAGE_TROIS)

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
  it("rend une pastille par Filtre en force, dans l'ordre marques, catégorie, Tranche", () => {
    rendre(FILTRES_ACTIFS, OPTIONS_DE_FILTRE, {}, PUCES_ACTIVES)

    expect(pastilles().map((pastille) => pastille.textContent)).toEqual([
      "Acme",
      "Beta",
      "Mobilier",
      "Moins de 1 000 MAD",
    ])
    expect(
      pastilles().map((pastille) => pastille.getAttribute("aria-label"))
    ).toEqual([
      "Retirer la marque acme",
      "Retirer la marque beta",
      "Retirer la catégorie Mobilier",
      "Retirer la tranche de prix Moins de 1 000 MAD",
    ])
  })

  it("affiche le libellé et la phrase fournis, sans reconstruire depuis les facettes", () => {
    rendre(
      { brand: ["acme"], categorySlug: "mobilier", priceBucketId: "0-1000" },
      OPTIONS_DE_FILTRE,
      {},
      [
        {
          cle: "brand",
          valeur: "acme",
          label: "Acme SAS",
          ariaLabel: "Retirer la marque Acme SAS",
        },
        {
          cle: "categorySlug",
          valeur: "mobilier",
          label: "Mobilier résolu",
          ariaLabel: "Retirer la catégorie Mobilier résolu",
        },
        {
          cle: "priceBucketId",
          valeur: "0-1000",
          label: "Tranche fournie",
          ariaLabel: "Retirer la tranche de prix Tranche fournie",
        },
      ]
    )

    expect(pastilles().map((pastille) => pastille.textContent)).toEqual([
      "Acme SAS",
      "Mobilier résolu",
      "Tranche fournie",
    ])
  })

  it.each(RETRAITS_DE_PASTILLE)(
    "retire $pastille et garde les autres Filtres, page 1 et tri conservé",
    async ({ libelle, url }) => {
      rendre(
        FILTRES_ACTIFS,
        OPTIONS_DE_FILTRE,
        VUE_EN_PAGE_TROIS,
        PUCES_ACTIVES
      )

      await act(async () => {
        boutonNomme(libelle)!.click()
      })

      expect(navigationSpies.push).toHaveBeenCalledWith(url, undefined)
    }
  )

  it("ramène à l'URL nue avec « Tout effacer », page 1 et tri conservé", async () => {
    rendre(FILTRES_ACTIFS, OPTIONS_DE_FILTRE, VUE_EN_PAGE_TROIS, PUCES_ACTIVES)

    await act(async () => {
      controlePortant("Tout effacer")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque&tri=prix-asc",
      undefined
    )
  })

  it("ramène à l'URL nue avec « Tout effacer », sans tri", async () => {
    rendre(
      { brand: ["acme"], categorySlug: "mobilier", priceBucketId: "0-1000" },
      OPTIONS_DE_FILTRE,
      {},
      PUCES_ACTIVES
    )

    await act(async () => {
      controlePortant("Tout effacer")!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/recherche?q=casque",
      undefined
    )
  })

  it("ne rend aucune pastille ni « Tout effacer » quand aucun Filtre n'est en force", () => {
    rendre({}, OPTIONS_DE_FILTRE)

    expect(pastilles()).toEqual([])
    expect(controlePortant("Tout effacer")).toBeNull()
  })

  it("compte encore une Tranche inconnue dans la pastille mobile, sans rendre de puce", () => {
    rendre({ priceBucketId: "bande-obsolete" }, OPTIONS_DE_FILTRE)

    expect(pastilles()).toEqual([])
    expect(declencheur()?.textContent).toContain("1")
    expect(controlePortant("Tout effacer")).not.toBeNull()
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
    await ouvrirPanneau()

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
    const corps = corpsDeLaFeuille()!
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

    const corps = corpsDeLaFeuille()!
    const classes = corps.className.split(/\s+/)
    expect(classes).toContain("overflow-y-auto")
    expect(classes).toContain("overscroll-contain")
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

  it("donne à la boîte de la feuille une hauteur définie", async () => {
    rendre({}, OPTIONS_DE_FILTRE)
    await ouvrirPanneau()

    const boite = boiteDeLaFeuille()!
    expect(boite.getAttribute("data-swipe-axis")).toBe("y")
    expect(boite.className.split(/\s+/)).toContain(
      "data-[swipe-axis=y]:[--drawer-content-height:100dvh]"
    )
  })
})
