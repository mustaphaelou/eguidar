// @vitest-environment happy-dom

import { act } from "react"
import type { ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const navigation = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigation.push,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}))

import {
  ProductForm,
  type ProductFormState,
} from "@/components/admin/product-form"
import {
  CHAMPS_FORMULAIRE_PRODUIT,
  type FaitsFormulaireProduit,
} from "@/lib/formulaire-produit"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

const CHAMPS_LUS_PAR_LE_TRANSPORT_HORS_IDENTIFICATION = Object.values(
  CHAMPS_FORMULAIRE_PRODUIT
).filter((nom) => nom !== CHAMPS_FORMULAIRE_PRODUIT.produit)

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
  return root
}

function unmount(root: ReturnType<typeof createRoot>) {
  act(() => root.unmount())
  const index = roots.indexOf(root)
  if (index >= 0) roots.splice(index, 1)
}

function initialProduct(): FaitsFormulaireProduit {
  return {
    id: "produit-1",
    name: "Produit",
    slug: "produit",
    brand: "Marque",
    categoryId: "categorie-1",
    description: "Description",
    price: 1000,
    isFeatured: false,
    featuredOrder: 0,
    freeShipping: false,
    specs: {},
    images: [
      {
        kind: "persistee",
        url: "https://cdn.example.test/products/existing.png",
      },
    ],
    variants: [
      {
        name: "Standard",
        sku: "SKU-1",
        priceDelta: 0,
        stock: 1,
      },
    ],
  }
}

function nomsRendus(): string[] {
  return [...container.querySelectorAll("input, select, textarea, button")]
    .map((controle) => controle.getAttribute("name"))
    .filter((nom): nom is string => nom !== null)
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
  navigation.push.mockClear()
})

describe("ProductForm", () => {
  it("signale la suppression en attente sans appeler le stockage", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const action = vi.fn(
      async (
        _previous: ProductFormState,
        _formData: FormData
      ): Promise<ProductFormState> => ({})
    )
    const product = initialProduct()
    const secondImage = {
      kind: "persistee" as const,
      url: "https://cdn.example.test/products/second.png",
    }
    product.images.push(secondImage)
    const root = render(
      <ProductForm product={product} structures={[]} action={action} />
    )

    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.click())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-image-state="suppression-en-attente"]')
    ).not.toBeNull()

    unmount(root)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("conserve la suppression en attente après un refus et permet un nouvel essai", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const action = vi.fn(
      async (
        _previous: ProductFormState,
        _formData: FormData
      ): Promise<ProductFormState> => ({ error: "Refus de validation" })
    )
    render(
      <ProductForm product={initialProduct()} structures={[]} action={action} />
    )

    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Supprimer l\'image"]'
    )!
    act(() => remove.click())
    const form = container.querySelector<HTMLFormElement>("form")!
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(action).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("Refus de validation")
    expect(
      container.querySelector('[data-image-state="suppression-en-attente"]')
    ).not.toBeNull()

    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(action).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("porte la même identité de tentative d'une soumission à l'autre", async () => {
    const identites: string[] = []
    const action = vi.fn(
      async (
        _previous: ProductFormState,
        formData: FormData
      ): Promise<ProductFormState> => {
        identites.push(
          String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.tentative))
        )
        return { error: "Refus de validation" }
      }
    )
    render(
      <ProductForm product={initialProduct()} structures={[]} action={action} />
    )

    const champ = container.querySelector<HTMLInputElement>(
      `input[name="${CHAMPS_FORMULAIRE_PRODUIT.tentative}"]`
    )!
    const identite = champ.value
    expect(identite).not.toBe("")

    const form = container.querySelector<HTMLFormElement>("form")!
    for (let essai = 0; essai < 2; essai += 1) {
      await act(async () => {
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    expect(action).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("Refus de validation")
    expect(identites).toEqual([identite, identite])
    expect(
      container.querySelector<HTMLInputElement>(
        `input[name="${CHAMPS_FORMULAIRE_PRODUIT.tentative}"]`
      )!.value
    ).toBe(identite)
  })
})

describe("les noms de champs rendus", () => {
  it("rend exactement les champs du vocabulaire, et rend tous les champs que le transport lit", () => {
    render(
      <ProductForm
        product={initialProduct()}
        structures={[]}
        action={async () => ({})}
      />
    )

    const rendus = nomsRendus()

    expect([...rendus].sort()).toEqual(
      [...Object.values(CHAMPS_FORMULAIRE_PRODUIT)].sort()
    )
    expect(
      CHAMPS_LUS_PAR_LE_TRANSPORT_HORS_IDENTIFICATION.filter(
        (nom) => !rendus.includes(nom)
      )
    ).toEqual([])
  })
})

function champNom(): HTMLInputElement {
  const champ = container.querySelector<HTMLInputElement>('input[name="name"]')
  if (!champ) throw new Error("champ Nom absent")
  return champ
}

function modifierLeNom(valeur = "Produit modifié") {
  act(() => {
    const champ = champNom()
    champ.value = valeur
    champ.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function carteDontLeTitreContient(titre: string): HTMLElement {
  const carte = [
    ...container.querySelectorAll<HTMLElement>('[data-slot="card"]'),
  ].find((element) => element.textContent?.includes(titre))
  if (!carte) throw new Error(`carte « ${titre} » absente`)
  return carte
}

describe("ProductForm — les erreurs par section", () => {
  it("nomme chaque section invalide au lieu d'un seul message global", async () => {
    const action = vi.fn(async (): Promise<ProductFormState> => ({
      error: "Données invalides : catégorie requise ; nom de variante requis",
      sections: {
        structure: "catégorie requise",
        variantes: "nom de variante requis",
      },
    }))
    render(
      <ProductForm product={initialProduct()} structures={[]} action={action} />
    )

    const form = container.querySelector<HTMLFormElement>("form")!
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(carteDontLeTitreContient("Informations").textContent).toContain(
      "catégorie requise"
    )
    expect(carteDontLeTitreContient("Variantes").textContent).toContain(
      "nom de variante requis"
    )
    expect(container.textContent).toContain("Certaines sections sont invalides")
    expect(container.textContent).not.toContain("Données invalides")
    const alertes = container.querySelectorAll('[role="alert"]')
    expect(alertes.length).toBeGreaterThanOrEqual(3)
  })

  it("garde le message global quand le refus ne nomme aucune section", async () => {
    const action = vi.fn(async (): Promise<ProductFormState> => ({
      error: "L'enregistrement du Catalogue a échoué",
      sections: {},
    }))
    render(
      <ProductForm product={initialProduct()} structures={[]} action={action} />
    )

    const form = container.querySelector<HTMLFormElement>("form")!
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain(
      "L'enregistrement du Catalogue a échoué"
    )
  })
})

describe("ProductForm — la barre d'enregistrement collante", () => {
  it("reste dans le flux, après le dernier champ, et ne le recouvre pas", () => {
    render(
      <ProductForm
        product={initialProduct()}
        structures={[]}
        action={async () => ({})}
      />
    )

    const form = container.querySelector<HTMLFormElement>("form")!
    const barre = form.querySelector<HTMLElement>(".sticky")

    expect(barre).not.toBeNull()
    expect(barre!.className).toContain("bottom-0")
    expect(barre!.className).not.toContain("fixed")
    expect(barre!.previousElementSibling?.getAttribute("data-slot")).toBe(
      "card"
    )
    expect(form.lastElementChild?.className).toContain("sticky")
  })
})

describe("ProductForm — la garde des modifications non enregistrées", () => {
  it("ne retient pas le déchargement tant que rien n'a changé", () => {
    render(
      <ProductForm
        product={initialProduct()}
        structures={[]}
        action={async () => ({})}
      />
    )

    const evenement = new Event("beforeunload", { cancelable: true })
    act(() => {
      window.dispatchEvent(evenement)
    })

    expect(evenement.defaultPrevented).toBe(false)
  })

  it("retient le déchargement après une modification", () => {
    render(
      <ProductForm
        product={initialProduct()}
        structures={[]}
        action={async () => ({})}
      />
    )

    modifierLeNom()

    const evenement = new Event("beforeunload", { cancelable: true })
    act(() => {
      window.dispatchEvent(evenement)
    })

    expect(evenement.defaultPrevented).toBe(true)
  })

  it("demande confirmation avant un lien interne, et laisse rester sur la page", async () => {
    render(
      <ProductForm
        product={initialProduct()}
        structures={[]}
        action={async () => ({})}
      />
    )
    modifierLeNom()

    const lien = document.createElement("a")
    lien.href = "/admin/produits"
    lien.textContent = "Retour à la liste"
    document.body.appendChild(lien)

    await act(async () => {
      lien.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const dialogue = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-content"]'
    )
    expect(dialogue).not.toBeNull()
    expect(dialogue!.textContent).toContain("Quitter sans enregistrer ?")

    const rester = [
      ...dialogue!.querySelectorAll<HTMLButtonElement>("button"),
    ].find((bouton) => bouton.textContent === "Rester sur la page")
    if (!rester) throw new Error("bouton « Rester sur la page » absent")
    await act(async () => {
      rester.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(navigation.push).not.toHaveBeenCalled()
    lien.remove()
  })

  it("navigue quand l'éditeur confirme quitter sans enregistrer", async () => {
    render(
      <ProductForm
        product={initialProduct()}
        structures={[]}
        action={async () => ({})}
      />
    )
    modifierLeNom()

    const lien = document.createElement("a")
    lien.href = "/admin/produits"
    lien.textContent = "Retour à la liste"
    document.body.appendChild(lien)

    await act(async () => {
      lien.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const dialogue = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-content"]'
    )!
    const quitter = [
      ...dialogue.querySelectorAll<HTMLButtonElement>("button"),
    ].find((bouton) => bouton.textContent === "Quitter sans enregistrer")
    if (!quitter) throw new Error("bouton « Quitter sans enregistrer » absent")
    await act(async () => {
      quitter.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(navigation.push).toHaveBeenCalledWith("/admin/produits")
    lien.remove()
  })
})

describe("ProductForm — le Produit sans Structure et le chemin du sélecteur", () => {
  it("explique l'absence des pages de catégorie quand la Structure est nulle", () => {
    const produit = { ...initialProduct(), categoryId: null }
    render(
      <ProductForm
        product={produit}
        structures={[]}
        action={async () => ({})}
      />
    )

    expect(container.textContent).toContain(
      "il n'apparaît donc sur aucune page de catégorie"
    )
  })

  it("affiche le chemin entier de la Structure choisie", () => {
    render(
      <ProductForm
        product={initialProduct()}
        structures={[
          {
            id: "categorie-1",
            nom: "Enfant",
            chemin: "Racine A › Enfant",
          },
          {
            id: "categorie-2",
            nom: "Enfant",
            chemin: "Racine B › Enfant",
          },
        ]}
        action={async () => ({})}
      />
    )

    const champ = container.querySelector<HTMLInputElement>(
      '[data-slot="combobox-input"]'
    )
    expect(champ?.value).toBe("Racine A › Enfant")
  })
})
