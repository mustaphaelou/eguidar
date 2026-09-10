// @vitest-environment happy-dom
import {
  flush,
  mockNextNavigation,
  resetNavigation,
} from "@/components/auth/test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { useSearchParams } from "next/navigation"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogsProvider } from "@/components/auth/auth-dialogs"

const { placeOrderMock } = vi.hoisted(() => ({
  placeOrderMock: vi.fn(),
}))

vi.mock("@/app/(boutique)/checkout/actions", () => ({
  placeOrderAction: placeOrderMock,
}))

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("@/lib/client", () => ({
  useSession: () => ({ data: null, isPending: false }),
}))

import { CheckoutForm } from "./checkout-form"
import { parseAuthParams } from "@/lib/lien-de-connexion"
import {
  type DevisChargé,
  type SelectionDevis,
} from "@/lib/use-cases/devis-selection"
import type { ShippingQuote } from "@/lib/use-cases/livraison-prix"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/checkout")
  placeOrderMock.mockReset()
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

function rerender(element: ReactElement) {
  act(() => roots[roots.length - 1].render(element))
}

function Probe() {
  const { dialog } = parseAuthParams(useSearchParams())
  return <div data-dialog={dialog ?? "none"} />
}

const CASA_ID = "cmsp6pvbu000052p6o2m9o8zw"
const CASA = {
  id: CASA_ID,
  slug: "casablanca",
  name: "Casablanca",
  fee: 2500,
}
const QUOTE_CASA: ShippingQuote = {
  subtotal: 100000,
  shippingFee: 2500,
  total: 102500,
}

/**
 * Fixture minimale : un Devis chargé déjà résolu, jamais re-dérivé ici —
 * les faits du formulaire uniquement, la re-sélection vit dans
 * `lib/use-cases/devis-selection.test.tsx`.
 */
function devisPourTest({
  selection,
  quotes,
}: {
  selection: SelectionDevis
  quotes: Record<string, ShippingQuote>
}): DevisChargé {
  return {
    cities: [CASA],
    threshold: 100000,
    quotes,
    sousTotal: 100000,
    sources: {
      urlVilleId: selection.cas === "validée" ? selection.ville.id : null,
    },
  }
}

function selectedCityId() {
  return container.querySelector<HTMLInputElement>('input[name="cityId"]')
    ?.value
}

async function choisirDansLeSelect(index = 0) {
  await act(async () => {
    container
      .querySelector<HTMLElement>('[data-slot="select-trigger"]')!
      .click()
  })
  const item = document.querySelectorAll<HTMLElement>(
    '[data-slot="select-item"]',
  )[index]!
  await act(async () => {
    item.click()
  })
  await flush()
}

function checkoutHarness() {
  return (
    <AuthDialogsProvider>
      <Probe />
      <CheckoutForm
        devis={devisPourTest({ selection: { cas: "aucune" }, quotes: {} })}
        initialAddress=""
        initialPhone=""
      />
    </AuthDialogsProvider>
  )
}

function formHarness({
  quotes,
  selection,
}: {
  quotes: Record<string, ShippingQuote>
  selection: SelectionDevis
}) {
  return (
    <AuthDialogsProvider>
      <CheckoutForm
        devis={devisPourTest({ selection, quotes })}
        initialAddress=""
        initialPhone=""
      />
    </AuthDialogsProvider>
  )
}

function dialog() {
  return container.querySelector("[data-dialog]")?.getAttribute("data-dialog")
}

async function submitForm() {
  container
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("CheckoutForm", () => {
  it("exige la ville, l'adresse et le téléphone avant soumission", () => {
    render(checkoutHarness())

    const city = container.querySelector<HTMLInputElement>(
      'input[name="cityId"]'
    )!
    expect(city.required).toBe(true)

    const address = container.querySelector<HTMLInputElement>(
      "#checkout-address"
    )!
    expect(address.required).toBe(true)
    expect(address.getAttribute("minlength")).toBe("5")

    const phone =
      container.querySelector<HTMLInputElement>("#checkout-phone")!
    expect(phone.required).toBe(true)
    expect(phone.getAttribute("minlength")).toBe("8")
  })

  it("opens the Connexion modal over /checkout with ?next=/checkout when the order is refused, leaving the path unchanged", async () => {
    placeOrderMock.mockResolvedValue({ unauthenticated: true })

    render(checkoutHarness())
    await act(async () => submitForm())
    await flush()
    rerender(checkoutHarness())

    expect(placeOrderMock).toHaveBeenCalledTimes(1)
    const url = new URL(window.location.href)
    expect(url.pathname).toBe("/checkout")
    expect(url.searchParams.get("open")).toBe("login")
    expect(url.searchParams.get("next")).toBe("/checkout")
    expect(dialog()).toBe("login")
  })

  it("leaves the URL and dialogs untouched when the order goes through", async () => {
    placeOrderMock.mockResolvedValue({})

    render(checkoutHarness())
    await act(async () => submitForm())
    await flush()

    expect(placeOrderMock).toHaveBeenCalledTimes(1)
    expect(placeOrderMock.mock.calls[0][1]).toBeInstanceOf(FormData)
    expect(new URL(window.location.href).search).toBe("")
    expect(dialog()).toBe("none")
  })

  it("shows the selected city's name in the closed trigger, never its identifier", () => {
    render(
      formHarness({
        quotes: { [CASA_ID]: QUOTE_CASA },
        selection: { cas: "validée", ville: CASA, devis: QUOTE_CASA },
      })
    )

    const trigger = container.querySelector<HTMLElement>(
      '[data-slot="select-trigger"]'
    )!
    expect(trigger.textContent).toBe("Casablanca")
    expect(trigger.textContent).not.toContain(CASA_ID)
  })

  it("posts the currently selected city on submit", async () => {
    placeOrderMock.mockResolvedValue({})

    render(
      formHarness({
        quotes: { [CASA_ID]: QUOTE_CASA },
        selection: { cas: "aucune" },
      })
    )

    await choisirDansLeSelect()
    expect(selectedCityId()).toBe(CASA_ID)
    expect(new URL(window.location.href).search).toBe("")
    await act(async () => submitForm())

    expect(placeOrderMock).toHaveBeenCalledTimes(1)
    const formData = placeOrderMock.mock.calls[0][1] as FormData
    expect(formData.get("cityId")).toBe(CASA_ID)
  })
})
