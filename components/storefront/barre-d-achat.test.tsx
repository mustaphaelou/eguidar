// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BarreDAchat } from "./barre-d-achat"

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

  it("masque la barre (aria-hidden + pointer-events-none) quand visible est faux", () => {
    render(
      <BarreDAchat visible={false} prix="1 050,00 MAD" onAjouter={onAjouterMock} />
    )

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.getAttribute("aria-hidden")).toBe("true")
    expect(barreEl.className).toContain("pointer-events-none")
  })

  it("reste montée dans le DOM quand elle est masquée", () => {
    render(
      <BarreDAchat visible={false} prix="1 050,00 MAD" onAjouter={onAjouterMock} />
    )

    const barreEl = container.querySelector("[data-slot='barre-d-achat']")!
    expect(barreEl.textContent).toContain("1 050,00 MAD")
    expect(barreEl.textContent).toContain("Ajouter au panier")
  })
})
