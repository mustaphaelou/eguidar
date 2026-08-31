// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BarreDAchat } from "./barre-d-achat"
import { MESSAGE_CAP_ATTEINTE } from "@/lib/panier-visiteur"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
const onAjouterMock = vi.fn()

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  onAjouterMock.mockReset()
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

function barre() {
  return <BarreDAchat visible prix="1 050,00 MAD" onAjouter={onAjouterMock} />
}

describe("BarreDAchat", () => {
  it("affiche le prix courant et le libellé « Ajouter au panier »", () => {
    render(barre())

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.textContent).toContain("1 050,00 MAD")
    expect(barreEl.textContent).toContain("Ajouter au panier")
    expect(barreEl.getAttribute("aria-hidden")).toBe("false")
    expect(barreEl.hasAttribute("inert")).toBe(false)
  })

  it("appelle onAjouter quand on clique sur le bouton", () => {
    render(barre())

    const bouton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Ajouter au panier")
    )!
    act(() => {
      bouton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })

    expect(onAjouterMock).toHaveBeenCalledTimes(1)
  })

  it("masque la barre (aria-hidden + pointer-events-none + inert) quand visible est faux", () => {
    render(
      <BarreDAchat visible={false} prix="1 050,00 MAD" onAjouter={onAjouterMock} />
    )

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.getAttribute("aria-hidden")).toBe("true")
    expect(barreEl.className).toContain("pointer-events-none")
    expect(barreEl.hasAttribute("inert")).toBe(true)
    expect((barreEl as HTMLElement).inert).toBe(true)
  })

  it("reste montée dans le DOM quand elle est masquée", () => {
    render(
      <BarreDAchat visible={false} prix="1 050,00 MAD" onAjouter={onAjouterMock} />
    )

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.textContent).toContain("1 050,00 MAD")
    expect(barreEl.textContent).toContain("Ajouter au panier")
  })

  it("affiche « Ajout… » dans le bouton pendant l'ajout", () => {
    render(
      <BarreDAchat
        visible
        prix="1 050,00 MAD"
        onAjouter={onAjouterMock}
        enAttente
      />
    )

    const bouton = container.querySelector("[data-slot='barre-d-achat'] button")!
    expect(bouton.textContent).toContain("Ajout…")
    expect(bouton.textContent).not.toContain("Ajouter au panier")
    expect(container.textContent).toContain("1 050,00 MAD")
  })

  it("affiche « Ajouté au panier » sous le bouton après un ajout réussi", () => {
    render(
      <BarreDAchat
        visible
        prix="1 050,00 MAD"
        onAjouter={onAjouterMock}
        ajoute
      />
    )

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.textContent).toContain("Ajouté au panier")
    expect(barreEl.textContent).toContain("1 050,00 MAD")
    expect(barreEl.querySelector("[role='alert']")).toBeNull()
  })

  it("affiche le message de cap dans role='alert' sous le bouton", () => {
    render(
      <BarreDAchat
        visible
        prix="1 050,00 MAD"
        onAjouter={onAjouterMock}
        capAtteint
      />
    )

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_CAP_ATTEINTE
    )
    expect(barreEl.textContent).toContain("20 articles maximum")
    expect(barreEl.textContent).toContain("1 050,00 MAD")
    expect(barreEl.textContent).not.toContain("Ajouté au panier")
  })

  it("désactive le bouton quand la variante sélectionnée est en rupture", () => {
    render(
      <BarreDAchat
        visible
        prix="1 050,00 MAD"
        onAjouter={onAjouterMock}
        desactive
      />
    )

    const bouton = container.querySelector(
      "[data-slot='barre-d-achat'] button"
    ) as HTMLButtonElement
    expect(bouton.disabled).toBe(true)
    expect(bouton.textContent).toContain("Ajouter au panier")
    expect(container.textContent).toContain("1 050,00 MAD")
  })

  it("porte un aria-label contextuel nommant la variante sélectionnée", () => {
    render(
      <BarreDAchat
        visible
        prix="1 050,00 MAD"
        onAjouter={onAjouterMock}
        variantNom="Premium"
      />
    )

    const bouton = container.querySelector("[data-slot='barre-d-achat'] button")!
    expect(bouton.getAttribute("aria-label")).toContain("Ajouter au panier")
    expect(bouton.getAttribute("aria-label")).toContain("Premium")
  })

  it("garde le libellé simple sans aria-label pour une variante unique", () => {
    render(
      <BarreDAchat visible prix="1 050,00 MAD" onAjouter={onAjouterMock} />
    )

    const bouton = container.querySelector("[data-slot='barre-d-achat'] button")!
    expect(bouton.getAttribute("aria-label")).toBeNull()
  })

  it("reste silencieuse quand aucun état de retour n'est fourni", () => {
    render(
      <BarreDAchat visible prix="1 050,00 MAD" onAjouter={onAjouterMock} />
    )

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.textContent).not.toContain("Ajouté au panier")
    expect(barreEl.textContent).not.toContain(MESSAGE_CAP_ATTEINTE)
  })
})
