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

import { formatShippingFee } from "@/lib/money"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"
import { CityPicker } from "./city-picker"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const CASA_ID = "cmsp6pvbu000052p6o2m9o8zw"
const KENITRA_ID = "cmsp6pvbu000152p6o2m9o9bx"

const CITIES: DeliveryCityOption[] = [
  { id: CASA_ID, slug: "casablanca", name: "Casablanca", fee: 2500 },
  { id: KENITRA_ID, slug: "kenitra", name: "Kénitra", fee: 0 },
]

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/panier")
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function trigger() {
  return container.querySelector<HTMLElement>('[data-slot="select-trigger"]')!
}

describe("CityPicker", () => {
  it("affiche le nom de la ville sélectionnée, jamais son identifiant interne", () => {
    render(<CityPicker cities={CITIES} selectedId={CASA_ID} path="/panier" />)

    expect(trigger().textContent).toBe("Casablanca")
    expect(trigger().textContent).not.toContain(CASA_ID)
  })

  it("affiche un nom accentué sans son identifiant", () => {
    render(<CityPicker cities={CITIES} selectedId={KENITRA_ID} path="/panier" />)

    expect(trigger().textContent).toBe("Kénitra")
    expect(trigger().textContent).not.toContain(KENITRA_ID)
  })

  it("affiche le placeholder quand aucune ville n'est sélectionnée", () => {
    render(<CityPicker cities={CITIES} selectedId={null} path="/panier" />)

    expect(trigger().textContent).toBe("Choisir une ville")
  })

  it("garde « nom — frais » dans les options du menu", async () => {
    render(<CityPicker cities={CITIES} selectedId={null} path="/panier" />)

    await act(async () => {
      trigger().click()
    })

    const options = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
    ].map((item) => item.textContent)
    expect(options).toContain(`Casablanca — ${formatShippingFee(2500)}`)
    expect(options).toContain(`Kénitra — ${formatShippingFee(0)}`)
  })

  it("écrit le slug de la ville choisie dans l'URL, jamais son identifiant interne", async () => {
    render(<CityPicker cities={CITIES} selectedId={null} path="/panier" />)

    await act(async () => {
      trigger().click()
    })
    const items = document.querySelectorAll<HTMLElement>(
      '[data-slot="select-item"]',
    )
    await act(async () => {
      items[1]!.click()
    })

    expect(navigationSpies.push).toHaveBeenCalledWith(
      "/panier?ville=kenitra",
      undefined,
    )
    expect(navigationSpies.push.mock.calls[0]?.[0]).not.toContain(KENITRA_ID)
  })
})
