// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ResultatPanier } from "@/lib/panier"
import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

import { BarreDAchat, type FaitsAffichageBarre } from "./barre-d-achat"

const MESSAGE_CAP_ATTEINTE = "Votre panier est plein : 20 articles maximum."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

type FaitsAffichageTest = {
  visible?: boolean
} & Partial<FaitsAffichageBarre>

function rendreBarre(
  port = creerPortPanierEnMemoire(),
  faits: FaitsAffichageTest = {}
) {
  render(
    <BarreDAchat
      visible={faits.visible ?? true}
      faits={{
        varianteId: faits.varianteId ?? "variante-a",
        prix: faits.prix ?? "1 050,00 MAD",
        variantNom: faits.variantNom,
        indisponible: faits.indisponible,
      }}
      port={port}
    />
  )
  return port
}

function barre() {
  return container.querySelector<HTMLElement>("[data-slot='barre-d-achat']")!
}

function boutonBarre() {
  return barre().querySelector<HTMLButtonElement>("button")!
}

function cliquer() {
  act(() => {
    boutonBarre().dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
  })
}

async function rejouerTransition() {
  await act(async () => {})
  await act(async () => {})
}

describe("BarreDAchat", () => {
  it("affiche le prix courant et le libellé « Ajouter au panier »", () => {
    rendreBarre()

    expect(barre().textContent).toContain("1 050,00 MAD")
    expect(barre().textContent).toContain("Ajouter au panier")
    expect(barre().getAttribute("aria-hidden")).toBe("false")
    expect(barre().hasAttribute("inert")).toBe(false)
  })

  it("ajoute la variante sélectionnée via sa propre instance de la couture", async () => {
    const port = rendreBarre()

    cliquer()
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "ajouter", variantId: "variante-a", quantity: 1 },
    ])
  })

  it("affiche « Ajout… » et verrouille le bouton pendant l'ajout", async () => {
    let resoudre!: (resultat: ResultatPanier) => void
    const port = creerPortPanierEnMemoire(
      () =>
        new Promise<ResultatPanier>((resolve) => {
          resoudre = resolve
        })
    )
    rendreBarre(port)

    cliquer()

    expect(boutonBarre().textContent).toContain("Ajout…")
    expect(boutonBarre().textContent).not.toContain("Ajouter au panier")
    expect(boutonBarre().disabled).toBe(true)

    await act(async () => {
      resoudre({ ok: true })
    })
    await rejouerTransition()

    expect(boutonBarre().textContent).toContain("Ajouter au panier")
    expect(boutonBarre().disabled).toBe(false)
  })

  it("affiche « Ajouté au panier » sous le bouton après un ajout réussi", async () => {
    rendreBarre()

    cliquer()
    await rejouerTransition()

    expect(barre().textContent).toContain("Ajouté au panier")
    expect(barre().querySelector("[role='alert']")).toBeNull()
  })

  it("affiche le message de cap dans role='alert' sous le bouton", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "cap-atteinte",
      message: MESSAGE_CAP_ATTEINTE,
    }))
    rendreBarre(port)

    cliquer()
    await rejouerTransition()

    expect(barre().querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_CAP_ATTEINTE
    )
    expect(barre().textContent).toContain("20 articles maximum")
    expect(barre().textContent).not.toContain("Ajouté au panier")
  })

  it("relaie tout autre refus verbatim", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    }))
    rendreBarre(port)

    cliquer()
    await rejouerTransition()

    expect(barre().querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_VARIANTE_INCONNUE
    )
    expect(barre().textContent).not.toContain("Ajouté au panier")
  })

  it("désactive le bouton et n'appelle pas la couture quand la variante est indisponible", async () => {
    const port = rendreBarre(undefined, { indisponible: true })

    expect(boutonBarre().disabled).toBe(true)
    expect(boutonBarre().textContent).toContain("Ajouter au panier")

    cliquer()
    await rejouerTransition()

    expect(port.appels).toEqual([])
  })

  it("masque la barre (aria-hidden + pointer-events-none + inert) quand visible est faux", () => {
    rendreBarre(undefined, { visible: false })

    expect(barre().getAttribute("aria-hidden")).toBe("true")
    expect(barre().className).toContain("pointer-events-none")
    expect(barre().hasAttribute("inert")).toBe(true)
    expect(barre().inert).toBe(true)
  })

  it("reste montée dans le DOM quand elle est masquée", () => {
    rendreBarre(undefined, { visible: false })

    expect(barre().textContent).toContain("1 050,00 MAD")
    expect(barre().textContent).toContain("Ajouter au panier")
  })

  it("porte un aria-label contextuel nommant la variante sélectionnée", () => {
    rendreBarre(undefined, { variantNom: "Premium" })

    expect(boutonBarre().getAttribute("aria-label")).toContain(
      "Ajouter au panier"
    )
    expect(boutonBarre().getAttribute("aria-label")).toContain("Premium")
  })

  it("garde le libellé simple sans aria-label pour une variante unique", () => {
    rendreBarre()

    expect(boutonBarre().getAttribute("aria-label")).toBeNull()
  })

  it("reste silencieuse tant qu'aucun retour n'est arrivé", () => {
    rendreBarre()

    expect(barre().textContent).not.toContain("Ajouté au panier")
    expect(barre().querySelector("[role='alert']")).toBeNull()
  })
})
